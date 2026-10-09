import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { officeServer } from "../server/http.js";
import { CharacterRegistry } from "../server/assets.js";
import { setupCharacterPack } from "./setup-fixture.js";
import { LayoutTransferService } from "../server/layout-transfer.js";
const avatar = {
  assetId: "same-avatar",
  version: "v1",
  sha256: "a".repeat(64),
};
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "blueoffice-setup-"));
  const store = new OfficeStore(join(root, "office.db"));
  const factory = new FixtureRuntime(root);
  const office = new Office(store, factory);
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  return { root, store, factory, office };
}
test("setup reserves workstation before profile preparation, rejects stale/occupied desks and releases failures", async (t) => {
  const { root, office, factory } = await setup(t);
  const prepare = factory.prepare.bind(factory);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  factory.prepare = async (...args) => {
    writes++;
    await held;
    return prepare(...args);
  };
  const first = office.create("First", root, undefined, undefined, {
    avatar,
    deskId: "desk-1",
  });
  assert.throws(
    () =>
      office.create("Duplicate", root, undefined, undefined, {
        avatar: null,
        deskId: "desk-1",
      }),
    /reserved/,
  );
  assert.throws(
    () =>
      office.create("Stale", root, undefined, undefined, {
        avatar: null,
        deskId: "missing",
      }),
    /existing complete/,
  );
  assert.throws(() => office.saveLayout({}), /setup to finish/);
  assert.equal(writes, 1);
  const second = office.create("Second", root);
  release();
  assert.equal((await first).deskId, "desk-1");
  assert.equal((await second).deskId, "desk-2");
  factory.prepare = async () => {
    throw new Error("prepare failure");
  };
  await assert.rejects(
    office.create("Failed", root, undefined, undefined, {
      avatar: null,
      deskId: "desk-3",
    }),
    /prepare failure/,
  );
  factory.prepare = prepare;
  assert.equal(
    (
      await office.create("Retry", root, undefined, undefined, {
        avatar: null,
        deskId: "desk-3",
      })
    ).deskId,
    "desk-3",
  );
});
test("duplicate avatar choices have independent profile identities; explicit unassigned survives server restart and settings isolation", async (t) => {
  const { root, office, store, factory } = await setup(t);
  const a = await office.create("Alpha", root, undefined, undefined, {
    avatar,
    deskId: null,
  });
  const b = await office.create("Beta", root, undefined, undefined, {
    avatar,
    deskId: "desk-1",
  });
  assert.notEqual(a.profileHome, b.profileHome);
  const beta = await office.settings(b.id);
  const alpha = await office.settings(a.id);
  await office.saveSettings(
    a.id,
    alpha.revision,
    { ...alpha.values, soul: "Only Alpha" },
    "Alpha renamed",
  );
  assert.deepEqual(await office.settings(b.id), beta);
  const stable = office.snapshot().agents;
  await office.shutdown();
  const restarted = new Office(store, factory);
  assert.deepEqual(restarted.snapshot().agents, stable);
  assert.equal(
    restarted.snapshot().agents.find((agent) => agent.id === a.id)?.deskId,
    null,
  );
  await restarted.shutdown();
});
test("portable reference capacity reserves concurrent setup before profile writes", async (t) => {
  const { root, office, factory, store } = await setup(t);
  const transfer = new LayoutTransferService(store);
  const manifest = transfer.export();
  manifest.agents = Array.from({ length: 63 }, (_, i) => ({
    agentId: `foreign-${i}`,
    deskId: null,
    avatar: null,
  }));
  const preview = transfer.preview(manifest);
  transfer.import({
    manifest,
    baseRevision: preview.baseRevision,
    bindings: preview.bindings,
  });
  const prepare = factory.prepare.bind(factory);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  factory.prepare = async (...args) => {
    writes++;
    await held;
    return prepare(...args);
  };
  const first = office.create("Last available identity", root);
  try {
    assert.throws(
      () => office.create("Too many", root),
      /portable reference slots/,
    );
    assert.equal(writes, 1);
  } finally {
    release();
  }
  const saved = await first;
  const settings = await office.settings(saved.id);
  let profileCalls = 0;
  factory.profile = async () => {
    profileCalls++;
    throw new Error("must not touch profile");
  };
  assert.throws(
    () =>
      office.adopt(
        "Blocked adoption",
        join(root, "profiles", "external"),
        settings.revision,
        settings.values,
        true,
      ),
    /portable reference slots/,
  );
  assert.equal(profileCalls, 0);
  assert.equal(store.adoptions().length, 0);
  assert.equal(transfer.preview(transfer.export()).manifest.agents.length, 64);
});
test("adoption preserves setup assignment through lost helper response and ownership recovery", async (t) => {
  const { root, office, store, factory } = await setup(t);
  const seed = await office.create("Seed", root);
  const home = join(root, "profiles", "existing");
  await mkdir(home);
  await writeFile(
    join(home, "config.yaml"),
    await readFile(join(seed.profileHome, "config.yaml")),
  );
  await writeFile(join(home, "SOUL.md"), "Existing persona");
  const inspected = await office.inspectProfile(home);
  const profile = factory.profile.bind(factory);
  factory.profile = async (request) => {
    const result = await profile(request);
    if (request.action === "adopt") throw new Error("lost response");
    return result;
  };
  await assert.rejects(
    office.adopt("Adopted", home, inspected.revision, inspected.values, true, {
      avatar,
      deskId: null,
    }),
    /lost response/,
  );
  factory.profile = profile;
  await office.shutdown();
  const restarted = new Office(store, factory);
  await restarted.recoverAdoptions();
  const adopted = restarted
    .snapshot()
    .agents.find((agent) => agent.name === "Adopted")!;
  assert.deepEqual(adopted.avatar, avatar);
  assert.equal(adopted.deskId, null);
  assert.ok(adopted.configRevision);
  await restarted.shutdown();
});

test("HTTP rejects unreviewed, mismatched and missing avatars before any profile writes", async (t) => {
  const { root, store, factory, office } = await setup(t);
  const registry = new CharacterRegistry(store, join(root, "characters"));
  const imported = await registry.import(setupCharacterPack());
  const app = officeServer(office, undefined, registry);
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => app.close());
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const auth = await fetch(`${url}/api/session`);
  const cookie = auth.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = await auth.json();
  const headers = {
    Cookie: cookie,
    Origin: url,
    "Content-Type": "application/json",
    "X-BlueOffice-CSRF": csrf,
  };
  const prepare = factory.prepare.bind(factory);
  let writes = 0;
  factory.prepare = async (...args) => {
    writes++;
    return prepare(...args);
  };
  for (const ref of [
    imported.ref,
    { ...imported.ref, sha256: "b".repeat(64) },
    { ...imported.ref, assetId: "missing" },
  ]) {
    const response = await fetch(`${url}/api/agents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Rejected",
        workspace: root,
        placement: { avatar: ref, deskId: "desk-1" },
      }),
    });
    assert.ok([404, 409].includes(response.status));
  }
  assert.equal(writes, 0);
  let profileCalls = 0;
  const profile = factory.profile.bind(factory);
  factory.profile = async (request) => {
    profileCalls++;
    return profile(request);
  };
  const rejectedAdoption = await fetch(`${url}/api/profiles/adopt`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Rejected adoption",
      profileHome: join(root, "profiles", "candidate"),
      expectedRevision: "not-inspected",
      values: {
        model: "glm-5.3-flash",
        workspace: root,
        soul: "",
        toolsets: ["clarify"],
        approvalMode: "manual",
      },
      acknowledgeOwnership: true,
      placement: { avatar: imported.ref, deskId: "desk-1" },
    }),
  });
  assert.equal(rejectedAdoption.status, 409);
  assert.equal(profileCalls, 0);
  assert.equal(store.adoptions().length, 0);
  registry.review({
    ref: imported.ref,
    clips: ["Idle"],
    materials: true,
    coordinates: true,
    limitations: true,
  });
  const response = await fetch(`${url}/api/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Reviewed",
      workspace: root,
      placement: { avatar: imported.ref, deskId: "desk-1" },
    }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).avatar, imported.ref);
  assert.equal(writes, 1);
});
