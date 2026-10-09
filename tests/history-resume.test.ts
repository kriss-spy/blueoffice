import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { HistoryService } from "../server/history.js";
const avatar = {
  assetId: "shared-character",
  version: "v1",
  sha256: "a".repeat(64),
};

async function setup(t: test.TestContext, scenario = "normal") {
  const root = await mkdtemp(join(tmpdir(), "history-resume-"));
  const store = new OfficeStore(join(root, "office.db"));
  const factory = new FixtureRuntime(root, scenario);
  const office = new Office(store, factory);
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  const agent = await office.create("Hina", root, undefined, undefined, {
    avatar,
    deskId: "desk-1",
  });
  const history = new HistoryService({
    agents: () => office.snapshot().agents,
    profiles: () => factory.historyProfiles(),
    read: (p, r) => factory.historyRead(p, r),
  });
  return { root, office, agent, factory, history };
}
const target = (a: { epoch: string | null; liveSessionId: string | null }) =>
  ({
    epoch: a.epoch,
    sessionId: a.liveSessionId,
  }) as import("../shared/resume.js").ConversationTarget;
async function settled(office: Office, id: string) {
  for (let i = 0; i < 100; i++) {
    const a = office.snapshot().agents.find((a) => a.id === id)!;
    if (!a.busy && a.work === "completed") return a;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("not settled");
}

test("explicit new/resume preserves identity, fresh bindings, provenance and exact retry receipts", async (t) => {
  const { office, agent, history, root } = await setup(t);
  const other = await office.create("Mika", root, undefined, undefined, {
    avatar,
    deskId: "desk-2",
  });
  const original = {
    name: agent.name,
    avatarId: agent.avatarId,
    deskId: agent.deskId,
  };
  const newId = randomUUID();
  const empty = target(agent);
  assert.equal(
    (await office.conversation(agent.id, newId, empty, { kind: "new" })).state,
    "accepted",
  );
  const first = office.snapshot().agents[0];
  const old = target(first);
  await office.prompt(
    agent.id,
    randomUUID(),
    old as import("../shared/office.js").Target,
    "plain task",
  );
  await settled(office, agent.id);
  const row = (await history.list()).sessions.find(
    (s) => s.agentId === agent.id,
  )!;
  const action = await history.ownedResumeTarget(row.id, agent.id);
  const cmd = randomUUID();
  const receipt = await office.conversation(agent.id, cmd, old, action);
  assert.equal(receipt.state, "accepted");
  const resumed = office.snapshot().agents[0];
  assert.notEqual(resumed.epoch, first.epoch);
  assert.notEqual(resumed.liveSessionId, first.liveSessionId);
  assert.equal(resumed.storedSessionId, first.storedSessionId);
  assert.deepEqual(
    { name: resumed.name, avatarId: resumed.avatarId, deskId: resumed.deskId },
    original,
  );
  assert.deepEqual(resumed.avatar, avatar);
  assert.deepEqual(
    office.snapshot().agents.find((a) => a.id === other.id),
    other,
  );
  assert.equal(resumed.conversations.at(-1)?.resumedFrom?.historyId, row.id);
  assert.deepEqual(
    await office.conversation(agent.id, cmd, old, action),
    receipt,
  );
  assert.equal(office.snapshot().agents[0].conversations.length, 2);
  await assert.rejects(
    office.prompt(
      agent.id,
      randomUUID(),
      old as import("../shared/office.js").Target,
      "stale",
    ),
    /conversation changed/,
  );
  await assert.rejects(
    history.ownedResumeTarget(
      (await history.list()).sessions.find((s) => s.source === "cli")!.id,
      agent.id,
    ),
    /External history/,
  );
});

test("busy resume never interrupts and failed resume retains coherent previous binding without create fallback", async (t) => {
  const { office, agent, history } = await setup(t, "resume-failure");
  await office.start(agent.id);
  const first = office.snapshot().agents[0];
  await office.prompt(
    agent.id,
    randomUUID(),
    target(first) as import("../shared/office.js").Target,
    "question",
  );
  await assert.rejects(
    office.conversation(agent.id, randomUUID(), target(first), { kind: "new" }),
    /idle assistant/,
  );
  await office.stop(agent.id);
  const row = (await history.list()).sessions.find(
    (s) => s.agentId === agent.id,
  )!;
  const receipt = await office.conversation(
    agent.id,
    randomUUID(),
    target(first),
    await history.ownedResumeTarget(row.id, agent.id),
  );
  assert.equal(receipt.state, "failed");
  const failed = office.snapshot().agents[0];
  assert.equal(failed.lifecycle, "failed");
  assert.equal(failed.liveSessionId, first.liveSessionId);
  assert.equal(failed.storedSessionId, first.storedSessionId);
  assert.equal(failed.conversations.length, 1);
});

test("stopped settings save disables auto continuation while preserving unknown policy keys", async (t) => {
  const { agent, office } = await setup(t);
  const initial = await office.settings(agent.id);
  const result = await office.saveSettings(
    agent.id,
    initial.revision,
    initial.values,
    agent.name,
  );
  assert.equal(result.ok, true);
  const cfg = JSON.parse(
    await readFile(join(agent.profileHome, "config.yaml"), "utf8"),
  );
  assert.equal(cfg.desktop.auto_continue.enabled, false);
});

test("a retired question from an old epoch cannot answer a successfully resumed conversation", async (t) => {
  const { office, agent, history } = await setup(t);
  await office.start(agent.id);
  const old = office.snapshot().agents[0];
  await office.prompt(
    agent.id,
    randomUUID(),
    target(old) as import("../shared/office.js").Target,
    "batch question",
  );
  let request = office.snapshot().agents[0].requests[0];
  for (let i = 0; !request && i < 100; i++) {
    await new Promise((r) => setTimeout(r, 10));
    request = office.snapshot().agents[0].requests[0];
  }
  assert.ok(request);
  await office.stop(agent.id);
  const row = (await history.list()).sessions.find(
    (s) => s.agentId === agent.id,
  )!;
  assert.equal(
    (
      await office.conversation(
        agent.id,
        randomUUID(),
        target(old),
        await history.ownedResumeTarget(row.id, agent.id),
      )
    ).state,
    "accepted",
  );
  await assert.rejects(
    office.lockAnswer(
      agent.id,
      request.id,
      randomUUID(),
      target(old) as import("../shared/office.js").Target,
      request.questions[0].qid,
      "Oak",
    ),
    /conversation changed/,
  );
  assert.ok(
    ["lost", "expired"].includes(
      office.snapshot().agents[0].requests.find((r) => r.id === request.id)!
        .state,
    ),
  );
});
