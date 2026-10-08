import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "blueoffice-settings-"));
  const store = new OfficeStore(join(root, "office.db"));
  const factory = new FixtureRuntime(root);
  const office = new Office(store, factory);
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  const agent = await office.create("Alpha", root, "glm-5.3-flash", {
    soul: "Original persona",
    toolsets: ["clarify"],
    approvalMode: "manual",
  });
  return { root, store, factory, office, agent };
}

test("settings save uses actual readback, detects two stale editors, and survives server reload", async (t) => {
  const { root, office, store, factory, agent } = await setup(t);
  const initial = await office.settings(agent.id);
  assert.equal(initial.values.soul, "Original persona");
  const values = {
    ...initial.values,
    model: "muse-spark-1.3-contributor" as const,
    soul: "New private persona",
  };
  const saved = await office.saveSettings(
    agent.id,
    initial.revision,
    values,
    "Renamed",
  );
  assert.equal(saved.ok, true);
  await assert.rejects(
    office.saveSettings(agent.id, initial.revision, values, "Stale"),
    /another editor/,
  );
  const cfgPath = join(agent.profileHome, "config.yaml");
  const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
  cfg.unknown_future = { preserve: true };
  await writeFile(cfgPath, JSON.stringify(cfg));
  await assert.rejects(
    office.saveSettings(
      agent.id,
      saved.snapshot.revision,
      values,
      "Stale external",
    ),
    /outside this editor/,
  );
  const reloaded = await office.settings(agent.id);
  await office.saveSettings(agent.id, reloaded.revision, values, "Renamed");
  assert.deepEqual(JSON.parse(await readFile(cfgPath, "utf8")).unknown_future, {
    preserve: true,
  });
  assert.doesNotMatch(JSON.stringify(office.snapshot()), /New private persona/);
  await office.shutdown();
  const reopenedStore = new OfficeStore(join(root, "office.db"));
  const reopened = new Office(reopenedStore, factory);
  assert.equal(reopened.snapshot().agents[0].name, "Renamed");
  assert.equal(reopened.snapshot().agents[0].model, values.model);
  assert.equal(reopened.snapshot().agents[0].configHistory!.length, 2);
  assert.equal((await reopened.settings(agent.id)).values.soul, values.soul);
  assert.ok(store.agents()[0].configRevision);
  await reopened.shutdown();
  reopenedStore.close();
});

test("profile leases and lifecycle gates prevent live changes and a start racing a save", async (t) => {
  const { office, factory, agent } = await setup(t);
  const initial = await office.settings(agent.id);
  await office.start(agent.id);
  assert.equal((await office.settings(agent.id)).liveOwner, true);
  await assert.rejects(
    office.saveSettings(
      agent.id,
      initial.revision,
      initial.values,
      "No live edit",
    ),
    /Stop the agent/,
  );
  await office.stop(agent.id);
  const original = factory.profile.bind(factory);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  factory.profile = async (request) => {
    if (request.action === "save") await held;
    return original(request);
  };
  const save = office.saveSettings(
    agent.id,
    initial.revision,
    initial.values,
    "Saved",
  );
  await assert.rejects(office.start(agent.id), /Wait for the settings save/);
  const shutdown = office.shutdown();
  release();
  assert.equal((await save).ok, true);
  await shutdown;
});

test("adoption is explicit, preserves private existing data, and cannot duplicate a canonical owner", async (t) => {
  const { root, office, agent } = await setup(t);
  const home = join(root, "profiles", "existing");
  await mkdir(home);
  await writeFile(
    join(home, "config.yaml"),
    await readFile(join(agent.profileHome, "config.yaml")),
  );
  await writeFile(join(home, ".env"), "PRIVATE_TOKEN=DO_NOT_EXPORT\n");
  await writeFile(join(home, "SOUL.md"), "Adopted persona");
  const candidate = await office.inspectProfile(home);
  assert.doesNotMatch(JSON.stringify(candidate), /DO_NOT_EXPORT/);
  await assert.rejects(
    office.adopt("Beta", home, candidate.revision, candidate.values, false),
    /single-writer/,
  );
  const adopted = await office.adopt(
    "Beta",
    home,
    candidate.revision,
    candidate.values,
    true,
  );
  assert.ok(adopted.agent);
  assert.equal(adopted.result.ok, true);
  assert.match(await readFile(join(home, ".env"), "utf8"), /DO_NOT_EXPORT/);
  await assert.rejects(
    office.adopt("Duplicate", home, candidate.revision, candidate.values, true),
    /already assigned/,
  );
  assert.equal(office.snapshot().agents.length, 2);
});
