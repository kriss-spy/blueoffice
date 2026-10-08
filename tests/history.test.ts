import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { HistoryService } from "../server/history.js";

async function setup(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "history-test-"));
  const factory = new FixtureRuntime(root);
  const store = new OfficeStore(join(root, "office.db"));
  const office = new Office(store, factory);
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  const agent = await office.create("Hina", root);
  const history = new HistoryService({
    agents: () => office.snapshot().agents,
    profiles: () => factory.historyProfiles(),
    read: (p, r) => factory.historyRead(p, r),
  });
  return { root, factory, office, agent, history };
}

test("source-aware observed history filters and public search retain unknown outcomes and unavailable cost", async (t) => {
  const { history } = await setup(t);
  const all = await history.list();
  assert.equal(all.sessions.length, 2);
  assert.deepEqual(
    new Set(all.sessions.map((s) => s.source)),
    new Set(["cli", "cron"]),
  );
  assert.ok(
    all.sessions.every(
      (s) => s.ownership === "observed" && !s.live && s.agentId === null,
    ),
  );
  const chats = await history.list({ category: "chats" });
  assert.equal(chats.sessions[0].state, "Unknown outcome");
  assert.equal(chats.sessions[0].metrics.costUsd, null);
  const found = await history.list({ search: "cobalt notebook" });
  assert.equal(found.sessions.length, 1);
  const detail = await history.detail(found.sessions[0].id);
  assert.equal(detail.messages[0].text, "Find the cobalt notebook");
  assert.equal(detail.tools[0].outcome, "unknown");
  assert.deepEqual(
    [detail.controls.prompt, detail.controls.stop, detail.controls.interrupt],
    [false, false, false],
  );
  assert.match(detail.controls.reason, /Observed/);
  assert.equal(
    (await history.list({ category: "automation", attention: "error" }))
      .sessions.length,
    1,
  );
  assert.equal(
    (await history.list({ after: "2026-10-02T00:00:00Z" })).sessions.length,
    1,
  );
  assert.equal(
    (await history.list({ before: "2026-10-02T00:00:00Z" })).sessions.length,
    1,
  );
  assert.equal(
    (await history.list({ source: "cli", profileId: all.profiles[0].id }))
      .sessions.length,
    1,
  );
  assert.equal(
    (await history.list({ agentId: "not-this-agent" })).sessions.length,
    0,
  );
  assert.equal(JSON.stringify(all).includes("/tmp/"), false);
});

test("lazy owned persistence preserves office/live/stored identifiers without changing prompt routing", async (t) => {
  const { history, office, agent } = await setup(t);
  await office.start(agent.id);
  const before = office.snapshot().agents[0];
  const listed = (await history.list({ agentId: agent.id })).sessions;
  assert.equal(listed.length, 1);
  const session = listed[0];
  assert.equal(session.persisted, false);
  assert.equal(session.ownership, "owned");
  assert.equal(session.storedSessionId, before.storedSessionId);
  assert.deepEqual(session.liveSessionIds, [before.liveSessionId]);
  assert.notEqual(before.liveSessionId, before.storedSessionId);
  await history.detail(session.id);
  assert.deepEqual(office.snapshot().agents[0], before);
  assert.equal(session.state, "Ready");
});

test("missing malformed history is diagnosed without paths or raw errors; selection keys cannot traverse profiles", async (t) => {
  const { history, factory, office } = await setup(t);
  const profile = (await factory.historyProfiles())[0];
  await writeFile(
    join(profile.home, ".history-fixture.json"),
    "secret=HIDDEN malformed",
  );
  const list = await history.list();
  assert.equal(list.sessions.length, 0);
  assert.equal(list.diagnostics.length, 1);
  assert.match(list.diagnostics[0].message, /Check/);
  assert.equal(JSON.stringify(list).includes("HIDDEN"), false);
  assert.equal(JSON.stringify(list).includes(profile.home), false);
  await assert.rejects(history.detail("../../state.db"), /invalid/);
  await assert.rejects(history.detail("a".repeat(64)), /no longer available/);
  await assert.rejects(history.list({ after: "bad" }), /valid dates/);
  assert.equal(office.snapshot().agents[0].lifecycle, "stopped");
});

test("database appearance retains the stable history selection key", async (t) => {
  const { history, office, factory, agent } = await setup(t);
  await office.start(agent.id);
  const first = (await history.list({ agentId: agent.id })).sessions[0];
  const profile = (await factory.historyProfiles())[0];
  const path = join(profile.home, ".history-fixture.json");
  const fixture = JSON.parse(await readFile(path, "utf8"));
  fixture.records.push({
    ...first,
    title: "Persisted owned session",
    source: "cli",
  });
  fixture.messages[first.storedSessionId] = [
    {
      id: "real-row-1",
      role: "user",
      text: "Synthetic owned message",
      at: first.startedAt,
    },
  ];
  await writeFile(path, JSON.stringify(fixture));
  const next = (await history.list({ agentId: agent.id })).sessions[0];
  assert.equal(first.id, next.id);
  assert.equal(next.persisted, true);
  assert.equal(
    (await history.detail(first.id)).messages[0].text,
    "Synthetic owned message",
  );
});
