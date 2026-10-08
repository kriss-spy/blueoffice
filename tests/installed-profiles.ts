/** Native settings verification, only inside the isolated profiles suite. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { HermesRuntime, type Installation } from "../server/runtime.js";
import { routingConfig } from "../server/routes.js";
const installation = JSON.parse(process.argv[2]) as Installation;
const factory = new HermesRuntime(installation, "/tmp/alpha/mock-key");
const store = new OfficeStore("/tmp/office-state/profiles.db");
const office = new Office(store, factory);
const checks: string[] = [];
let failure: string | undefined;
try {
  const a = await office.create("Alpha", "/tmp/alpha/workspace");
  const path = join(a.profileHome, "config.yaml");
  const originalConfig = JSON.parse(await readFile(path, "utf8"));
  originalConfig.blueoffice_future = { keep: true };
  await writeFile(path, JSON.stringify(originalConfig));
  await assert.rejects(access(join(a.profileHome, "state.db")));
  await assert.rejects(access(join(a.profileHome, "auth.json")));
  assert.doesNotMatch(
    await readFile(join(a.profileHome, ".env"), "utf8"),
    /synthetic-office-key/,
  );
  const first = await office.settings(a.id);
  const changed = {
    ...first.values,
    soul: "You are a precise verification assistant.",
    toolsets: ["clarify"] as ["clarify"],
  };
  const saved = await office.saveSettings(
    a.id,
    first.revision,
    changed,
    "Alpha saved",
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.snapshot.values.soul, changed.soul);
  checks.push(
    "native configuration save and effective readback; independent empty credentials/history",
  );
  await assert.rejects(
    office.saveSettings(a.id, first.revision, changed, "Stale"),
    /another editor/,
  );
  await writeFile(join(a.profileHome, "SOUL.md"), "Externally edited persona");
  await assert.rejects(
    office.saveSettings(a.id, saved.snapshot.revision, changed, "Stale"),
    /outside this editor/,
  );
  const fresh = await office.settings(a.id);
  const secondSave = await office.saveSettings(
    a.id,
    fresh.revision,
    changed,
    "Alpha saved",
  );
  assert.equal(secondSave.ok, true);
  assert.match(await readFile(path, "utf8"), /blueoffice_future/);
  checks.push(
    "stale editor and external edits rejected; native YAML preserves unknown section",
  );
  await office.start(a.id);
  assert.equal((await office.settings(a.id)).liveOwner, true);
  await assert.rejects(
    office.saveSettings(
      a.id,
      secondSave.snapshot.revision,
      changed,
      "No live mutation",
    ),
    /Stop the agent/,
  );
  const current = () =>
    office.snapshot().agents.find((agent) => agent.id === a.id)!;
  const target = () => ({
    epoch: current().epoch!,
    sessionId: current().liveSessionId!,
  });
  await office.prompt(a.id, randomUUID(), target(), "Reply exactly ROUTE_OK");
  const deadline = Date.now() + 30_000;
  while (current().busy && Date.now() < deadline) await delay(20);
  assert.equal(current().work, "completed");
  await office.stop(a.id);
  checks.push(
    "saved profile launches real Hermes; live-owner readback and active-runtime mutation rejection",
  );
  const adoptHome = join(installation.profile_root, "profiles", "adopt-me");
  await mkdir(adoptHome);
  const config = {
    ...routingConfig("glm-5.3-flash"),
    terminal: { cwd: "/tmp/alpha/workspace" },
    platform_toolsets: { cli: ["clarify"] },
    approvals: { mode: "manual" },
    future: { keep: true },
  };
  await writeFile(join(adoptHome, "config.yaml"), JSON.stringify(config));
  await writeFile(join(adoptHome, "SOUL.md"), "Adopted persona");
  await writeFile(
    join(adoptHome, ".env"),
    "PRIVATE_EXISTING_TOKEN=profile-private-canary\n",
  );
  const candidate = await office.inspectProfile(adoptHome);
  assert.equal(candidate.managed, false);
  assert.doesNotMatch(JSON.stringify(candidate), /profile-private-canary/);
  const adoption = await office.adopt(
    "Beta",
    adoptHome,
    candidate.revision,
    { ...candidate.values, model: "muse-spark-1.3-contributor" },
    true,
  );
  assert.ok(adoption.agent);
  assert.equal(adoption.result.ok, true);
  const b = adoption.agent;
  assert.equal(b.model, "muse-spark-1.3-contributor");
  assert.equal((await office.settings(a.id)).values.model, "glm-5.3-flash");
  await assert.rejects(
    office.adopt(
      "Duplicate",
      adoptHome,
      candidate.revision,
      candidate.values,
      true,
    ),
    /already assigned/,
  );
  await office.start(b.id);
  await office.stop(b.id);
  assert.match(
    await readFile(join(adoptHome, ".env"), "utf8"),
    /profile-private-canary/,
  );
  assert.equal(
    office.snapshot().agents.find((agent) => agent.id === a.id)!.configHistory!
      .length,
    2,
  );
  checks.push(
    "second native profile adopted explicitly, route switch validated, credentials retained privately and duplicate owner rejected",
  );
  assert.doesNotMatch(
    JSON.stringify(office.snapshot()),
    /profile-private-canary|synthetic-office-key|precise verification assistant/,
  );
} catch (error) {
  failure = error instanceof Error ? error.message : "Unknown probe failure";
} finally {
  await office.shutdown();
  store.close();
  await writeFile(
    "/evidence/report.json",
    JSON.stringify({ passed: !failure, checks, failure }, null, 2),
  );
}
console.log(JSON.stringify({ passed: !failure, checks, failure }));
process.exitCode = failure ? 1 : 0;
