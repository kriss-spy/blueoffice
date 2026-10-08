import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { OfficeStore } from "../server/store.js";
import { Office } from "../server/office.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { RpcChild } from "../server/rpc.js";
import { attention } from "../shared/office.js";

async function setup(t: TestContext, scenario = "normal") {
  const directory = await mkdtemp(join(tmpdir(), "blueoffice-test-"));
  const store = new OfficeStore(join(directory, "office.db"));
  const factory = new FixtureRuntime(directory, scenario);
  const office = new Office(store, factory);
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  const agent = await office.create("Hoshino", directory);
  const current = () =>
    office.snapshot().agents.find((a) => a.id === agent.id)!;
  const target = () => ({
    epoch: current().epoch!,
    sessionId: current().liveSessionId!,
  });
  return { office, agent, directory, store, factory, current, target };
}
async function until(check: () => boolean, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end)
      throw new Error("Timed out waiting for observable office state");
    await delay(10);
  }
}

test("split credentials never reach streamed snapshots or persisted messages; harmless suffixes survive", async (t) => {
  const { office, agent, current, target, factory, store } = await setup(
    t,
    "split-credential",
  );
  const key = "synthetic-review-key";
  const launch = factory.launch.bind(factory);
  factory.launch = async (agent) => {
    const result = await launch(agent);
    result.options.env!.BLUEOFFICE_PROXY_KEY = key;
    return result;
  };
  const snapshots: string[] = [];
  office.on("change", () => snapshots.push(JSON.stringify(office.snapshot())));
  await office.start(agent.id);
  await office.prompt(
    agent.id,
    randomUUID(),
    target(),
    "stream credential regression",
  );
  await until(() => current().work === "completed" && !current().busy);
  assert.equal(
    current().messages.find((m) => m.role === "assistant")!.text,
    "Safe prefix [redacted] done synt",
  );
  assert.ok(snapshots.length > 0);
  for (const value of [...snapshots, JSON.stringify(store.agents())]) {
    assert.ok(!value.includes(key));
    assert.ok(
      !value.includes("synthetic-"),
      "A possible credential prefix escaped before the next delta",
    );
  }
});

test("owned runtime streams public work, admits one task and persists stable identity", async (t) => {
  const { office, agent, current, target, directory } = await setup(t);
  await office.start(agent.id);
  assert.equal(current().lifecycle, "ready");
  assert.notEqual(current().liveSessionId, current().storedSessionId);
  await assert.rejects(office.start(agent.id), /already has a runtime/);
  const commandId = randomUUID();
  const reply = await office.prompt(
    agent.id,
    commandId,
    target(),
    "check the workspace",
  );
  assert.equal(reply.state, "accepted");
  const duplicate = await office.prompt(
    agent.id,
    commandId,
    target(),
    "check the workspace",
  );
  assert.equal(duplicate.id, reply.id);
  await assert.rejects(
    office.prompt(agent.id, randomUUID(), target(), "second task"),
    /busy/,
  );
  await until(() => current().work === "completed" && !current().busy);
  assert.equal(current().lifecycle, "ready");
  assert.match(
    current().messages.find((m) => m.role === "assistant")!.text,
    /Fixture task complete/,
  );
  assert.equal(
    current().messages.find((m) => m.role === "tool")!.state,
    "complete",
  );
  const snapshot = JSON.stringify(office.snapshot());
  assert.doesNotMatch(
    snapshot,
    /HIDDEN_REASONING_CANARY|TOOL_SECRET_CANARY|PRIVATE_SYSTEM_CANARY/,
  );
  const log = (
    await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(log.filter((f) => f.method === "prompt.submit").length, 1);
  const epoch = current().epoch;
  const firstStoredSession = current().storedSessionId;
  await office.stop(agent.id);
  assert.equal(current().lifecycle, "stopped");
  await office.start(agent.id);
  assert.notEqual(current().epoch, epoch);
  assert.equal(current().name, "Hoshino");
  assert.equal(current().profileHome, agent.profileHome);
  assert.equal(current().avatarId, "unassigned");
  assert.equal(current().conversations.length, 2);
  assert.equal(current().conversations[0].storedSessionId, firstStoredSession);
  assert.notEqual(current().storedSessionId, firstStoredSession);
  assert.ok(current().messages.every((m) => m.epoch === epoch));
  const reader = new OfficeStore(join(directory, "office.db"));
  assert.equal(reader.agents()[0].id, agent.id);
  reader.close();
});

test("interrupt produces interrupted outcome but keeps the runtime ready; stop waits for exit", async (t) => {
  const { office, agent, current, target } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "slow task");
  await until(() => current().work === "tool");
  await office.interrupt(agent.id, target());
  await until(() => current().work === "interrupted" && !current().busy);
  assert.equal(current().lifecycle, "ready");
  assert.equal(
    current().messages.find((m) => m.role === "tool")!.state,
    "interrupted",
  );
  await office.stop(agent.id);
  assert.equal(current().lifecycle, "stopped");
  assert.equal(current().work, "interrupted");
});

test("exact questions survive snapshots, reject cross-agent/stale/duplicate replies and resume once", async (t) => {
  const { office, agent, current, target, directory } = await setup(t);
  const other = await office.create("Shiroko", directory);
  await Promise.all([office.start(agent.id), office.start(other.id)]);
  await office.prompt(agent.id, randomUUID(), target(), "ask a batch question");
  await until(() => attention(current()).length === 1);
  const request = attention(current())[0];
  assert.deepEqual(
    request.questions.map((q) => q.qid),
    ["q0", "q1"],
  );
  assert.equal(attention(office.snapshot().agents[0])[0].id, request.id);
  await assert.rejects(
    office.reply(other.id, request.id, randomUUID(), target(), {
      answers: { q0: "Oak", q1: "Blue" },
    }),
    /no longer open/,
  );
  await assert.rejects(
    office.reply(
      agent.id,
      request.id,
      randomUUID(),
      { ...target(), epoch: randomUUID() },
      { answers: {} },
    ),
    /conversation changed/,
  );
  await assert.rejects(
    office.reply(agent.id, request.id, randomUUID(), target(), {
      answers: { q0: "Oak", alien: "Blue" },
    }),
    /exactly these/,
  );
  const cid = randomUUID();
  const first = office.reply(agent.id, request.id, cid, target(), {
    answers: { q0: "Oak", q1: "Blue" },
  });
  await assert.rejects(
    office.reply(agent.id, request.id, randomUUID(), target(), {
      answers: { q0: "Birch", q1: "White" },
    }),
    /no longer open/,
  );
  await first;
  await office.reply(agent.id, request.id, cid, target(), {
    answers: { q0: "Oak", q1: "Blue" },
  });
  await until(
    () => !attention(current()).length && current().work === "completed",
  );
  const log = (
    await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(
    log.filter((f) => f.id === request.frameId && !f.method).length,
    1,
  );
  assert.equal(current().requests[0].state, "resolved");
});

test("approval is distinct, cannot be answered by chat, and only advertised choices are sent", async (t) => {
  const { office, agent, current, target } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "ask approval");
  await until(() => attention(current()).length === 1);
  const request = attention(current())[0];
  assert.equal(request.kind, "approval");
  assert.equal(request.innerId, "inner-permission");
  await assert.rejects(
    office.prompt(agent.id, randomUUID(), target(), "yes"),
    /busy/,
  );
  await assert.rejects(
    office.reply(agent.id, request.id, randomUUID(), target(), {
      choice: "always",
    }),
    /offered/,
  );
  await office.reply(agent.id, request.id, randomUUID(), target(), {
    choice: "deny",
  });
  await until(
    () => current().work === "completed" && !attention(current()).length,
  );
});

test("unsupported private input stays out of transcripts and diagnostics and can be interrupted", async (t) => {
  const { office, agent, current, target } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "ask secret");
  await until(() => attention(current()).length === 1);
  const request = attention(current())[0];
  assert.equal(request.kind, "unsupported");
  assert.doesNotMatch(JSON.stringify(current()), /PRIVATE_SECRET_CANARY/);
  await assert.rejects(
    office.reply(agent.id, request.id, randomUUID(), target(), {
      value: "secret",
    }),
    /not supported/,
  );
  await office.interrupt(agent.id, target());
  await until(() => current().requests[0].state === "expired");
});

test("startup and unexpected exit stay visible and never imply success", async (t) => {
  const failure = await setup(t, "startup-failure");
  await assert.rejects(failure.office.start(failure.agent.id));
  assert.equal(failure.current().lifecycle, "failed");
  const crash = await setup(t);
  await crash.office.start(crash.agent.id);
  await crash.office.prompt(
    crash.agent.id,
    randomUUID(),
    crash.target(),
    "exit now",
  );
  await until(() => crash.current().lifecycle === "unknown");
  assert.equal(crash.current().work, "unknown");
  assert.equal(crash.current().freshness, "unknown");
});

test("canonical profile lease rejects a second child; unrelated processes are not signaled", async (t) => {
  const { office, agent, current, factory } = await setup(t);
  await office.start(agent.id);
  const duplicate = new RpcChild(await factory.launch(current()));
  await assert.rejects(duplicate.ready);
  await duplicate.exited;
  assert.equal(current().lifecycle, "ready");
  const unrelated = spawn("python3", ["-c", "import time; time.sleep(60)"]);
  t.after(() => {
    unrelated.kill();
  });
  await assert.rejects(office.stop(randomUUID()), /not found/);
  await office.stop(agent.id);
  assert.equal(unrelated.exitCode, null);
  assert.equal(unrelated.signalCode, null);
});

test("lost admission is unknown and a duplicate command never resubmits it", async (t) => {
  const { office, agent, current, target } = await setup(t, "lost-ack");
  await office.start(agent.id);
  const cid = randomUUID(),
    binding = target();
  const receipt = await office.prompt(agent.id, cid, binding, "slow task");
  assert.equal(receipt.state, "unknown");
  assert.equal(current().freshness, "unknown");
  assert.equal(
    (await office.prompt(agent.id, cid, binding, "slow task")).state,
    "unknown",
  );
  await office.reconcileAll();
  assert.equal(current().freshness, "current");
  assert.equal(current().busy, true);
  assert.equal(current().receipts.find((r) => r.id === cid)!.state, "unknown");
  const log = (
    await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(log.filter((f) => f.method === "prompt.submit").length, 1);
});

test("startup deadline and forced stop observe real child exit", async (t) => {
  const never = await setup(t, "never-ready");
  const timeout = new RpcChild(await never.factory.launch(never.current()), 50);
  await assert.rejects(timeout.ready, /startup deadline/);
  await timeout.stop(100);
  assert.ok(timeout.child.signalCode);
  const stubborn = await setup(t, "ignore-stop");
  const child = new RpcChild(await stubborn.factory.launch(stubborn.current()));
  await child.ready;
  const stopped = await child.stop(50);
  assert.equal(stopped.forced, true);
  assert.equal(child.child.signalCode, "SIGKILL");
});

test("recovery marks unresolved work unknown and never signals or adopts a previous runtime", async (t) => {
  const { office, agent, current, target, directory, store, factory } =
    await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "ask question");
  await until(() => attention(current()).length === 1);
  const uncertain = current();
  uncertain.receipts.push({
    id: randomUUID(),
    action: "prompt",
    state: "pending",
    at: new Date().toISOString(),
    message: "pending",
  });
  store.save(uncertain, "test.crash-checkpoint", randomUUID());
  const reopenedStore = new OfficeStore(join(directory, "office.db"));
  const recovered = new Office(reopenedStore, factory);
  t.after(() => reopenedStore.close());
  const record = recovered.snapshot().agents[0];
  assert.equal(record.lifecycle, "unknown");
  assert.equal(record.requests[0].state, "open");
  assert.equal(attention(record)[0].freshness, "unknown");
  assert.equal(record.receipts.at(-1)!.state, "unknown");
  await assert.rejects(recovered.stop(agent.id), /No process was signaled/);
  await assert.rejects(recovered.start(agent.id)); // Live original child retains its lease.
  assert.equal(
    attention(recovered.snapshot().agents[0])[0].id,
    record.requests[0].id,
  );
  assert.equal(recovered.snapshot().agents[0].epoch, record.epoch);
  // The committed checkpoint now reflects the new supervisor. The original
  // child is still owned by its live handle, as a successful interrupt proves.
  await office.interrupt(agent.id, target());
  await office.stop(agent.id);
  await recovered.start(agent.id);
  assert.equal(recovered.snapshot().agents[0].lifecycle, "ready");
  await recovered.shutdown();
});

test("shutdown waits for in-flight discovery before closing persisted state", async (t) => {
  const { office, agent, current, factory } = await setup(t);
  const launch = factory.launch.bind(factory);
  let release!: () => void;
  const discovery = new Promise<void>((resolve) => {
    release = resolve;
  });
  factory.launch = async (agent) => {
    await discovery;
    return launch(agent);
  };
  const started = office.start(agent.id);
  const failedStart = assert.rejects(started, /shutdown interrupted/);
  let drained = false;
  const shutdown = office.shutdown().then(() => {
    drained = true;
  });
  await delay(20);
  assert.equal(drained, false);
  release();
  await failedStart;
  await shutdown;
  assert.equal(current().lifecycle, "failed");
});

test("interim public segments and long final text remain intact after persistence", async (t) => {
  const { office, agent, current, target, store } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "long output");
  await until(() => current().work === "completed" && !current().busy);
  const messages = store
    .agents()[0]
    .messages.filter((m) => m.role === "assistant");
  assert.deepEqual(
    messages.slice(0, 2).map((m) => m.text),
    ["I will inspect the workspace.", "The inspection is complete."],
  );
  assert.equal(messages[2].text, "A".repeat(40000) + "FINAL_TAIL");
  assert.equal(new Set(messages.map((m) => m.id)).size, 3);
  assert.ok(messages.every((m) => m.chunkIds.length > 0));
});

test("a nonzero shutdown exit is visible even without forced termination", async (t) => {
  const { office, agent, current } = await setup(t, "abnormal-stop");
  await office.start(agent.id);
  await office.stop(agent.id);
  assert.equal(current().lifecycle, "stopped");
  assert.match(current().error!, /abnormal exit \(code 17\)/);
});

test("partial batch locks persist, exclude confirmed answers from final reply and resume the same turn", async (t) => {
  const { office, agent, current, target, store, directory } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "multi batch question");
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0],
    turn = current().turnId;
  assert.equal(current().work, "tool");
  assert.equal(r.responseSchema, "hermes.clarify.v1");
  assert.equal(r.questions[1].multiSelect, true);
  await assert.rejects(
    office.lockAnswer(agent.id, r.id, randomUUID(), target(), "alien", "Oak"),
    /does not support/,
  );
  const id = randomUUID();
  const first = office.lockAnswer(agent.id, r.id, id, target(), "q0", "Birch");
  await assert.rejects(
    office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q0", "Oak"),
    /already locked|awaiting/,
  );
  await first;
  await office.lockAnswer(agent.id, r.id, id, target(), "q0", "Birch");
  assert.equal(store.agents()[0].requests[0].questions[0].answer, "Birch");
  assert.equal(current().requests[0].questions[0].state, "locked");
  await assert.rejects(
    office.reply(agent.id, r.id, randomUUID(), target(), {
      answers: { q1: "Blue" },
    }),
    /permitted answer/,
  );
  await office.reply(agent.id, r.id, randomUUID(), target(), {
    answers: { q1: JSON.stringify(["Blue", "White"]) },
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  assert.equal(current().turnId, turn);
  const log = (
    await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(log.filter((f) => f.method === "clarify.lock").length, 1);
  assert.equal(log.filter((f) => f.method === "prompt.submit").length, 1);
  assert.deepEqual(log.find((f) => f.id === r.frameId && !f.method).result, {
    answers: { q1: '["Blue","White"]' },
  });
  assert.ok(directory);
});

test("last batch lock has explicit resolution and refuses a later second answer", async (t) => {
  const { office, agent, current, target } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "batch question");
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  await office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q0", "Oak");
  await office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q1", "Blue");
  assert.equal(current().requests[0].state, "resolved");
  await assert.rejects(
    office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q1", "White"),
    /no longer open/,
  );
});

test("delivered numeric single reply retains attention until authoritative closure", async (t) => {
  const { office, agent, current, target } = await setup(t, "delayed-answer");
  await office.start(agent.id);
  await office.prompt(
    agent.id,
    randomUUID(),
    target(),
    "numeric multi question",
  );
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  assert.equal(typeof r.frameId, "number");
  assert.equal(r.multiSelect, true);
  await assert.rejects(
    office.reply(agent.id, r.id, randomUUID(), target(), { answer: "Oak" }),
    /permitted/,
  );
  await office.reply(agent.id, r.id, randomUUID(), target(), {
    answer: '["Oak","Birch"]',
  });
  assert.equal(attention(current())[0].state, "delivered");
  await until(() => current().requests[0].state === "resolved");
});

test("ordinary prose creates no pending question; malformed schema is unsupported; expiry stays visible", async (t) => {
  const { office, agent, current, target } = await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "prose question");
  await until(() => !current().busy);
  assert.equal(current().requests.length, 0);
  await office.prompt(agent.id, randomUUID(), target(), "malformed question");
  await until(() => attention(current()).length === 1);
  assert.equal(attention(current())[0].kind, "unsupported");
  await office.interrupt(agent.id, target());
  await until(() => !current().busy);
  await office.prompt(agent.id, randomUUID(), target(), "expire question");
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  await until(
    () => current().requests.find((q) => q.id === r.id)?.state === "expired",
  );
  await assert.rejects(
    office.reply(agent.id, r.id, randomUUID(), target(), { answer: "Oak" }),
    /no longer open/,
  );
  assert.equal(
    current().requests.find((q) => q.id === r.id)?.reason,
    "timeout",
  );
});

test("transport loss during a batch lock preserves attention and uncertain answer without retry", async (t) => {
  const { office, agent, current, target, store } = await setup(
    t,
    "lost-lock-ack",
  );
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "batch question");
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  const receipt = await office.lockAnswer(
    agent.id,
    r.id,
    randomUUID(),
    target(),
    "q0",
    "Oak",
  );
  assert.equal(receipt.state, "unknown");
  assert.equal(attention(current())[0].questions[0].answer, "Oak");
  assert.equal(attention(current())[0].questions[0].state, "unknown");
  assert.equal(attention(current())[0].freshness, "unknown");
  assert.equal(store.agents()[0].requests[0].questions[0].state, "unknown");
});

test("one agent's clarification never changes another waiting agent or accepts a foreign session", async (t) => {
  const { office, agent, current, target, directory } = await setup(t);
  const other = await office.create("Sora", directory);
  await Promise.all([office.start(agent.id), office.start(other.id)]);
  const otherCurrent = () =>
    office.snapshot().agents.find((a) => a.id === other.id)!;
  const otherTarget = {
    epoch: otherCurrent().epoch!,
    sessionId: otherCurrent().liveSessionId!,
  };
  await office.prompt(agent.id, randomUUID(), target(), "batch question");
  await office.prompt(other.id, randomUUID(), otherTarget, "batch question");
  await until(
    () =>
      attention(current()).length === 1 &&
      attention(otherCurrent()).length === 1,
  );
  const r = attention(current())[0],
    untouched = otherCurrent();
  await assert.rejects(
    office.lockAnswer(
      agent.id,
      r.id,
      randomUUID(),
      { ...target(), sessionId: otherTarget.sessionId },
      "q0",
      "Oak",
    ),
    /conversation changed/,
  );
  await office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q0", "Oak");
  await office.lockAnswer(agent.id, r.id, randomUUID(), target(), "q1", "Blue");
  await until(() => current().work === "completed");
  assert.deepEqual(otherCurrent(), untouched);
});

test("native-shaped cancellation replay wins over absent delivered request", async (t) => {
  const { office, agent, current, target } = await setup(t, "replay-cancel");
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "ask question");
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  await office.reply(agent.id, r.id, randomUUID(), target(), { answer: "Oak" });
  assert.equal(current().requests[0].state, "expired");
  assert.equal(current().requests[0].reason, "timeout");
  assert.equal(attention(current()).length, 0);
});

test("permission schema preserves long inner IDs, only known choices, private metadata and known-key redaction", async (t) => {
  const { office, agent, current, target, store, factory } = await setup(t);
  const launch = factory.launch.bind(factory);
  factory.launch = async (a) => {
    const options = await launch(a);
    options.options.env!.BLUEOFFICE_PROXY_KEY =
      "synthetic-approval-private-key";
    return options;
  };
  await office.start(agent.id);
  await office.prompt(
    agent.id,
    randomUUID(),
    target(),
    "approval long id private metadata",
  );
  await until(() => attention(current()).length === 1);
  const r = attention(current())[0];
  assert.equal(r.innerId, "inner-" + "x".repeat(300));
  assert.equal(r.responseSchema, "hermes.approval.v1");
  assert.match(r.text, /TOKEN=\[redacted\]/);
  assert.doesNotMatch(
    JSON.stringify(store.agents()),
    /synthetic-approval-private-key|PRIVATE_APPROVAL_METADATA/,
  );
  await office.interrupt(agent.id, target());
  await until(() => !current().busy);
  for (const prompt of [
    "approval unknown choice",
    "approval missing id",
    "approval contradictory",
  ]) {
    await office.prompt(agent.id, randomUUID(), target(), prompt);
    await until(() => attention(current()).length === 1);
    const unsupported = attention(current())[0];
    assert.equal(unsupported.kind, "unsupported");
    assert.deepEqual(unsupported.choices, []);
    await assert.rejects(
      office.reply(agent.id, unsupported.id, randomUUID(), target(), {
        choice: "once",
      }),
      /not supported/,
    );
    await office.interrupt(agent.id, target());
    await until(() => !current().busy);
  }
});

test("every advertised permission choice has a durable exact decision; duplicate and generic commands cannot grant", async (t) => {
  const { office, agent, current, target, store } = await setup(t);
  await office.start(agent.id);
  for (const choice of ["deny", "once", "session", "always"] as const) {
    await office.prompt(
      agent.id,
      randomUUID(),
      target(),
      "approval all choices",
    );
    await until(() => attention(current()).length === 1);
    const r = attention(current())[0],
      id = randomUUID();
    const before = current().turnId;
    await assert.rejects(
      office.prompt(agent.id, randomUUID(), target(), "approve"),
      /busy/,
    );
    await assert.rejects(
      office.reply(agent.id, r.id, randomUUID(), target(), { answer: "yes" }),
      /permissions offered/,
    );
    await assert.rejects(
      office.reply(agent.id, r.id, randomUUID(), target(), {
        choice,
        all: true,
      }),
      /permissions offered/,
    );
    await assert.rejects(
      office.reply(
        agent.id,
        r.id,
        randomUUID(),
        { ...target(), epoch: randomUUID() },
        { choice },
      ),
      /conversation changed/,
    );
    const first = office.reply(agent.id, r.id, id, target(), { choice });
    await assert.rejects(
      office.reply(agent.id, r.id, randomUUID(), target(), { choice }),
      /no longer open/,
    );
    const receipt = await first;
    await office.reply(agent.id, r.id, id, target(), { choice });
    await assert.rejects(
      office.reply(agent.id, r.id, id, target(), {
        choice: choice === "deny" ? "once" : "deny",
      }),
      /different operation/,
    );
    await until(() => !current().busy && !attention(current()).length);
    assert.equal(current().turnId, before);
    const saved = store.agents()[0].requests.at(-1)!;
    assert.equal(saved.state, "resolved");
    assert.deepEqual(saved.decision, {
      choice,
      commandId: id,
      at: saved.decision!.at,
      delivery: "delivered",
    });
    assert.match(receipt.message, /Decision recorded/);
    const log = (
      await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      log.filter((f) => !f.method && f.id === r.frameId).map((f) => f.result),
      [{ choice }],
    );
  }
});

test("approval attention distinguishes delivered, expired, externally resolved and uncertain delivery", async (t) => {
  const delayed = await setup(t, "delayed-answer");
  await delayed.office.start(delayed.agent.id);
  await delayed.office.prompt(
    delayed.agent.id,
    randomUUID(),
    delayed.target(),
    "approval",
  );
  await until(() => attention(delayed.current()).length === 1);
  const r = attention(delayed.current())[0];
  await delayed.office.reply(
    delayed.agent.id,
    r.id,
    randomUUID(),
    delayed.target(),
    { choice: "deny" },
  );
  assert.equal(attention(delayed.current())[0].state, "delivered");
  assert.equal(attention(delayed.current())[0].decision?.choice, "deny");
  await until(
    () => !delayed.current().busy && !attention(delayed.current()).length,
  );
  for (const [prompt, state] of [
    ["expire approval", "expired"],
    ["resolve approval", "resolved"],
  ]) {
    await delayed.office.prompt(
      delayed.agent.id,
      randomUUID(),
      delayed.target(),
      prompt,
    );
    await until(() => attention(delayed.current()).length === 1);
    const request = attention(delayed.current())[0];
    await until(
      () =>
        delayed.current().requests.at(-1)!.state === state &&
        !delayed.current().busy,
    );
    assert.equal(delayed.current().requests.at(-1)!.decision, undefined);
    await assert.rejects(
      delayed.office.reply(
        delayed.agent.id,
        request.id,
        randomUUID(),
        delayed.target(),
        { choice: "once" },
      ),
      /no longer open/,
    );
  }
  const uncertain = await setup(t, "lost-reply-ack");
  await uncertain.office.start(uncertain.agent.id);
  await uncertain.office.prompt(
    uncertain.agent.id,
    randomUUID(),
    uncertain.target(),
    "approval",
  );
  await until(() => attention(uncertain.current()).length === 1);
  const request = attention(uncertain.current())[0];
  const receipt = await uncertain.office.reply(
    uncertain.agent.id,
    request.id,
    randomUUID(),
    uncertain.target(),
    { choice: "deny" },
  );
  assert.equal(receipt.state, "unknown");
  assert.equal(attention(uncertain.current())[0].decision?.delivery, "unknown");
  assert.equal(attention(uncertain.current())[0].decision?.choice, "deny");
  assert.equal(attention(uncertain.current())[0].freshness, "unknown");
});

test("secret, sudo and vault requests have only an unsupported interrupt path and retain no private fields", async (t) => {
  const { office, agent, current, target, store } = await setup(t);
  await office.start(agent.id);
  for (const kind of ["secret", "sudo", "vault"]) {
    await office.prompt(agent.id, randomUUID(), target(), kind);
    await until(() => attention(current()).length === 1);
    const r = attention(current())[0];
    assert.equal(r.kind, "unsupported");
    assert.doesNotMatch(
      JSON.stringify(current()),
      /PRIVATE_SECRET_CANARY|PRIVATE_SUDO_COMMAND|PRIVATE_VAULT_NAME/,
    );
    assert.doesNotMatch(
      JSON.stringify(store.agents()),
      /PRIVATE_SECRET_CANARY|PRIVATE_SUDO_COMMAND|PRIVATE_VAULT_NAME/,
    );
    await assert.rejects(
      office.reply(agent.id, r.id, randomUUID(), target(), {
        value: "anything",
      }),
      /not supported/,
    );
    await office.interrupt(agent.id, target());
    await until(
      () => current().requests.at(-1)!.state === "expired" && !current().busy,
    );
  }
});

test("a permission from one agent cannot grant a concurrent permission to another", async (t) => {
  const { office, agent, current, target, directory } = await setup(t);
  const other = await office.create("Sora", directory);
  await Promise.all([office.start(agent.id), office.start(other.id)]);
  const otherCurrent = () =>
    office.snapshot().agents.find((a) => a.id === other.id)!;
  const otherTarget = {
    epoch: otherCurrent().epoch!,
    sessionId: otherCurrent().liveSessionId!,
  };
  await office.prompt(agent.id, randomUUID(), target(), "approval");
  await office.prompt(other.id, randomUUID(), otherTarget, "approval");
  await until(
    () =>
      attention(current()).length === 1 &&
      attention(otherCurrent()).length === 1,
  );
  const r = attention(current())[0],
    untouched = otherCurrent();
  await assert.rejects(
    office.reply(other.id, r.id, randomUUID(), otherTarget, { choice: "once" }),
    /no longer open/,
  );
  await assert.rejects(
    office.reply(
      agent.id,
      r.id,
      randomUUID(),
      { ...target(), sessionId: otherTarget.sessionId },
      { choice: "once" },
    ),
    /conversation changed/,
  );
  await office.reply(agent.id, r.id, randomUUID(), target(), {
    choice: "deny",
  });
  await until(() => current().work === "completed");
  assert.deepEqual(otherCurrent(), untouched);
});

test("supervisor recovery retains an admitted permission decision with unknown delivery", async (t) => {
  const { office, agent, current, target, store, directory, factory } =
    await setup(t);
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "approval");
  await until(() => attention(current()).length === 1);
  const checkpoint = current(),
    commandId = randomUUID();
  checkpoint.requests[0].state = "delivered";
  checkpoint.requests[0].decision = {
    choice: "deny",
    commandId,
    at: new Date().toISOString(),
    delivery: "pending",
  };
  store.save(checkpoint, "test.admitted-before-write", randomUUID());
  const reopenedStore = new OfficeStore(join(directory, "office.db"));
  t.after(() => reopenedStore.close());
  const recovered = new Office(reopenedStore, factory);
  const pending = attention(recovered.snapshot().agents[0])[0];
  assert.equal(pending.decision?.choice, "deny");
  assert.equal(pending.decision?.delivery, "unknown");
  assert.equal(pending.freshness, "unknown");
  await assert.rejects(
    recovered.reply(agent.id, pending.id, randomUUID(), target(), {
      choice: "once",
    }),
    /no longer open/,
  );
  const log = (
    await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(
    log.filter((f) => f.id === pending.frameId && !f.method).length,
    0,
  );
});

test("native recovery reorders missing chunks before redaction and never duplicates replayed text", async (t) => {
  const { office, agent, current, target, factory } = await setup(
    t,
    "replay-order",
  );
  const launch = factory.launch.bind(factory);
  factory.launch = async (agent) => {
    const result = await launch(agent);
    result.options.env!.BLUEOFFICE_PROXY_KEY = "synthetic-review-key";
    return result;
  };
  const snapshots: string[] = [];
  office.on("change", () => snapshots.push(JSON.stringify(office.snapshot())));
  await office.start(agent.id);
  await office.prompt(agent.id, randomUUID(), target(), "replay chunks");
  await until(() => current().work === "completed" && !current().busy);
  await office.reconcileAll();
  assert.equal(
    current()
      .messages.filter((m) => m.role === "assistant")
      .map((m) => m.text)
      .join(""),
    "Safe prefix [redacted] done synt",
  );
  for (const snapshot of snapshots)
    assert.doesNotMatch(
      snapshot,
      /synthetic-review|synthetic-|HIDDEN_REASONING_CANARY|PRIVATE_SYSTEM_CANARY/,
    );
  assert.equal(current().freshness, "current");
});

for (const scenario of ["missing-request", "truncated", "interim-gap"]) {
  test(`native ${scenario} recovery restores the exact waiting permission without invented completion`, async (t) => {
    const { office, agent, current, target, directory } = await setup(
      t,
      scenario,
    );
    await office.start(agent.id);
    await office.prompt(agent.id, randomUUID(), target(), "ask approval");
    await delay(120);
    const started = performance.now();
    await office.reconcileAll();
    assert.ok(performance.now() - started < 3000);
    const request = attention(current())[0];
    assert.ok(request);
    assert.equal(request.frameId, "srq-1");
    assert.equal(request.innerId, "inner-permission");
    assert.equal(request.freshness, "current");
    assert.equal(current().busy, true);
    assert.notEqual(current().work, "completed");
    assert.equal(current().messages.filter((m) => m.role === "user").length, 1);
    const stable = JSON.stringify(request);
    await office.reconcileAll();
    assert.equal(JSON.stringify(attention(current())[0]), stable);
    assert.notEqual(
      current().work,
      "completed",
      "A complete interim segment is not a terminal turn outcome",
    );
    if (scenario === "interim-gap") {
      assert.equal(
        current().messages.find((m) => m.role === "assistant")!.state,
        "complete",
      );
      assert.equal(current().work, "unknown");
      assert.equal(current().terminal, undefined);
    }
    await office.reply(agent.id, request.id, randomUUID(), target(), {
      choice: "deny",
    });
    await until(() => !attention(current()).length);
    const frames = (
      await readFile(join(agent.profileHome, "commands.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(frames.filter((f) => f.method === "prompt.submit").length, 1);
    assert.equal(
      frames.filter((f) => !f.method && f.id === request.frameId).length,
      1,
    );
    assert.equal(current().workspace, directory);
  });
}

test("truncated streaming checkpoint holds a credential prefix and continues the same assistant segment", async (t) => {
  const { office, agent, current, target, factory, store } = await setup(
    t,
    "checkpoint-stream",
  );
  const launch = factory.launch.bind(factory);
  factory.launch = async (agent) => {
    const result = await launch(agent);
    result.options.env!.BLUEOFFICE_PROXY_KEY = "synthetic-review-key";
    return result;
  };
  const published: string[] = [];
  office.on("change", () => {
    const snapshot = office.snapshot();
    published.push(JSON.stringify(snapshot));
    published.push(
      JSON.stringify(store.since(Math.max(0, snapshot.revision - 1))),
    );
  });
  await office.start(agent.id);
  await office.prompt(
    agent.id,
    randomUUID(),
    target(),
    "stream across checkpoint",
  );
  await until(
    () => current().work === "unknown" && current().freshness === "current",
  );
  assert.equal(
    current().messages.filter((m) => m.role === "assistant").length,
    1,
  );
  const partial = current().messages.find((m) => m.role === "assistant")!;
  assert.equal(partial.text, "Hello ");
  assert.equal(current().activeMessageId, partial.id);
  await writeFile(join(agent.profileHome, "continue-recovery"), "continue");
  await until(() => current().work === "completed" && !current().busy);
  const answers = current().messages.filter((m) => m.role === "assistant");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].id, partial.id);
  assert.equal(answers[0].text, "Hello [redacted] world");
  for (const value of published)
    assert.doesNotMatch(value, /synthetic-|review-key/);
});
