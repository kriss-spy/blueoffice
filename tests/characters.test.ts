import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { CharacterRegistry } from "../server/assets.js";
import { OfficeStore } from "../server/store.js";
import { Office } from "../server/office.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { officeServer } from "../server/http.js";
import type { CharacterManifest } from "../shared/assets.js";
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function pack(edit: (gltf: any) => void = () => {}, external = false) {
  const binary = Buffer.alloc(68);
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0.1, 0].forEach((n, i) =>
    binary.writeFloatLE(n, i * 4),
  );
  const gltf: any = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 68, ...(external ? { uri: "mesh.bin" } : {}) }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 8 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [1],
      },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [
      {
        name: "Idle",
        samplers: [{ input: 1, output: 2 }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ],
  };
  edit(gltf);
  const json = Buffer.from(JSON.stringify(gltf)),
    padding = Buffer.alloc((4 - (json.length % 4)) % 4, 32);
  const header = Buffer.alloc(20),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    20 + json.length + padding.length + (external ? 0 : 8 + binary.length),
    8,
  );
  header.writeUInt32LE(json.length + padding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([
    header,
    json,
    padding,
    ...(external ? [] : [binHeader, binary]),
  ]);
  const files = [
    { path: "avatar.glb", bytes },
    ...(external ? [{ path: "mesh.bin", bytes: binary }] : []),
  ];
  const manifest: CharacterManifest = {
    schemaVersion: 1,
    assetId: "test.triangle",
    version: "v1",
    name: "Original triangle",
    model: "avatar.glb",
    files: files.map((f) => ({
      path: f.path,
      sha256: hash(f.bytes),
      bytes: f.bytes.length,
    })),
    coordinates: {
      unit: "meter",
      up: "Y",
      forward: "+Z",
      scale: 1,
      offset: [0, 0, 0],
    },
    anchors: { feet: [0, 0, 0], nameplate: [0, 1.8, 0] },
    capabilities: { standing: true, seated: false },
    clips: { idle: "Idle" },
    provenance: {
      source: "Original test fixture",
      creator: "BlueOffice",
      rightsOwner: "BlueOffice",
      permissionEvidence: null,
      redistributionAllowed: null,
    },
    knownLimitations: ["Synthetic structural test triangle."],
  };
  return {
    manifest,
    files: files.map((f) => ({
      path: f.path,
      base64: f.bytes.toString("base64"),
    })),
  };
}
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "blueoffice-characters-"));
  const store = new OfficeStore(join(directory, "office.db"));
  return {
    directory,
    store,
    registry: new CharacterRegistry(store, join(directory, "characters")),
  };
}
test("validated immutable packs, complete review, local dependencies and durable registry", async () => {
  const { directory, store, registry } = await setup();
  try {
    const source = pack(),
      first = await registry.import(source);
    assert.equal(first.manifest.provenance.redistributionAllowed, null);
    assert.throws(() => registry.assignable(first.ref), /review/i);
    assert.throws(
      () =>
        registry.review({
          ref: first.ref,
          clips: ["Absent"],
          materials: true,
          coordinates: true,
          limitations: true,
        }),
      /every mapped/,
    );
    registry.review({
      ref: first.ref,
      clips: ["Idle"],
      materials: true,
      coordinates: true,
      limitations: true,
    });
    assert.ok(registry.assignable(first.ref).review);
    assert.deepEqual((await registry.import(source)).ref, first.ref);
    const changed = structuredClone(source);
    changed.manifest.name = "Replacement";
    await assert.rejects(registry.import(changed), /immutable/);
    assert.throws(
      () => registry.get({ ...first.ref, version: "missing" }),
      /version missing/,
    );
    assert.throws(
      () => registry.get({ ...first.ref, sha256: "0".repeat(64) }),
      /version missing/,
    );
    const local = pack(() => {}, true);
    local.manifest.version = "external";
    assert.ok((await registry.import(local)).ref);
    await writeFile(
      join(directory, "characters", source.manifest.files[0].sha256),
      "corrupt",
    );
    assert.match(registry.list()[0].diagnostic!, /hash mismatch/);
    assert.throws(() => registry.assignable(first.ref), /hash mismatch/);
    await registry.import(source);
    assert.ok(
      registry.assignable(first.ref).review,
      "exact reimport restores bytes without removing review",
    );
    store.close();
    const reopened = new OfficeStore(join(directory, "office.db"));
    try {
      assert.ok(
        new CharacterRegistry(
          reopened,
          join(directory, "characters"),
        ).assignable(first.ref).review,
      );
    } finally {
      reopened.close();
    }
  } catch (e) {
    store.close();
    throw e;
  }
});
test("invalid packs cannot enter registry: paths, hashes, GLB, dependencies, scripts, mappings and texture limits", async () => {
  const { store, registry } = await setup();
  try {
    const cases = [
      pack((g) => {
        g.buffers[0].uri = "https://evil.example/mesh.bin";
      }),
      pack((g) => {
        g.buffers[0].uri = "../mesh.bin";
      }),
      pack((g) => {
        g.buffers[0].uri = "%2e%2e/mesh.bin";
      }),
      pack((g) => {
        g.buffers[0].uri = "mesh.bin";
      }),
      pack((g) => {
        g.extensions = { CUSTOM_script: { uri: "script.js" } };
      }),
      pack((g) => {
        g.accessors[0].count = 100000000;
      }),
      pack((g) => {
        g.accessors[0].count = 30;
      }),
      pack((g) => {
        g.animations[0].name = "Wrong";
      }),
      pack((g) => {
        g.images = [{ uri: "picture.png" }];
      }),
      pack((g) => {
        g.meshes = null;
      }),
    ];
    const traversal = pack();
    traversal.manifest.files[0].path = "../../escape.glb";
    cases.push(traversal);
    const mismatch = pack();
    mismatch.files[0].base64 = Buffer.from("bad").toString("base64");
    cases.push(mismatch);
    const malformed = pack();
    const data = Buffer.from(malformed.files[0].base64, "base64");
    data.writeUInt32LE(0, 4);
    malformed.files[0].base64 = data.toString("base64");
    malformed.manifest.files[0].sha256 = hash(data);
    cases.push(malformed);
    const duplicate = pack();
    duplicate.files.push(duplicate.files[0]);
    cases.push(duplicate);
    const script = pack();
    script.files.push({ path: "script.js", base64: "YWJj" });
    script.manifest.files.push({
      path: "script.js",
      bytes: 3,
      sha256: hash(Buffer.from("abc")),
    });
    cases.push(script);
    const image = pack((g) => {
      g.images = [{ uri: "picture.png" }];
    });
    const bomb = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bomb);
    bomb.writeUInt32BE(50000, 16);
    bomb.writeUInt32BE(50000, 20);
    image.files.push({ path: "picture.png", base64: bomb.toString("base64") });
    image.manifest.files.push({
      path: "picture.png",
      bytes: 24,
      sha256: hash(bomb),
    });
    cases.push(image);
    for (const input of cases) {
      await assert.rejects(registry.import(input));
      assert.equal(registry.list().length, 0);
    }
  } finally {
    store.close();
  }
});
test("HTTP character assignments preserve live identity and pending input, reject invalid replacements and survive restart", async () => {
  const { directory, store, registry } = await setup();
  const office = new Office(store, new FixtureRuntime(directory));
  const app = officeServer(office, undefined, registry);
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const auth = await fetch(url + "/api/session"),
    cookie = auth.headers.get("set-cookie")!.split(";")[0],
    { csrf } = await auth.json();
  const headers = {
    Cookie: cookie,
    Origin: url,
    "Content-Type": "application/json",
    "X-BlueOffice-CSRF": csrf,
  };
  const post = (path: string, body: unknown, h = headers) =>
    fetch(url + path, {
      method: "POST",
      headers: h,
      body: JSON.stringify(body),
    });
  const imported = await post("/api/characters/import", pack());
  assert.equal(imported.status, 201);
  const character = await imported.json();
  const agent = await office.create("Test", directory);
  assert.equal(
    (await post(`/api/agents/${agent.id}/avatar`, { ref: character.ref }))
      .status,
    409,
  );
  assert.equal((await fetch(url + "/api/characters")).status, 401);
  assert.equal(
    (
      await post(
        "/api/characters/review",
        {},
        { ...headers, "X-BlueOffice-CSRF": "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/api/characters/review", {
        ref: character.ref,
        clips: ["Idle"],
        materials: true,
        coordinates: true,
        limitations: true,
      })
    ).status,
    200,
  );
  await office.start(agent.id);
  const live = office.snapshot().agents[0];
  await office.prompt(
    agent.id,
    randomUUID(),
    { epoch: live.epoch!, sessionId: live.liveSessionId! },
    "question",
  );
  for (let i = 0; i < 100 && !office.snapshot().agents[0].requests.length; i++)
    await new Promise((r) => setTimeout(r, 20));
  const before = office.snapshot().agents[0];
  assert.ok(before.requests.length);
  const assigned = await post(`/api/agents/${agent.id}/avatar`, {
    ref: character.ref,
  });
  assert.equal(assigned.status, 200);
  const after = office.snapshot().agents[0];
  assert.deepEqual(
    { ...after, avatar: undefined, avatarId: before.avatarId },
    { ...before, avatar: undefined },
  );
  assert.equal(
    (
      await post(`/api/agents/${agent.id}/avatar`, {
        ref: { ...character.ref, version: "absent" },
      })
    ).status,
    404,
  );
  const bad = pack();
  bad.manifest.files[0].sha256 = "0".repeat(64);
  assert.equal((await post("/api/characters/import", bad)).status, 400);
  assert.deepEqual(office.snapshot().agents[0], after);
  const duplicate = await office.create("Duplicate", directory);
  assert.equal(
    (await post(`/api/agents/${duplicate.id}/avatar`, { ref: character.ref }))
      .status,
    200,
  );
  await app.close();
  store.close();
  const reopened = new OfficeStore(join(directory, "office.db"));
  try {
    assert.deepEqual(
      reopened.agents().map((a) => a.avatar),
      [character.ref, character.ref],
    );
  } finally {
    reopened.close();
  }
});
