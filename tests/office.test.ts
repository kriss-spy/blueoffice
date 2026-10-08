import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
  assert.equal(record.requests[0].state, "lost");
  assert.equal(record.receipts.at(-1)!.state, "unknown");
  await assert.rejects(recovered.stop(agent.id), /No process was signaled/);
  await assert.rejects(recovered.start(agent.id)); // Live original child retains its lease.
  assert.equal(current().lifecycle, "ready");
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
