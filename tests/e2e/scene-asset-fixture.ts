import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
/** Original engineering triangle with stationary node tracks; never a character/art acceptance fixture. */
export function sceneTestPack(walk = true, react = true) {
  const binary = Buffer.alloc(68);
  [0, 0, 0, 0.3, 0, 0, 0, 1.4, 0, 0, 1, 0, 0, 0, 0, 0, 0].forEach((n, i) =>
    binary.writeFloatLE(n, i * 4),
  );
  const names = [
    "Idle",
    ...(walk ? ["Walk"] : []),
    ...(react ? ["React"] : []),
  ];
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 68 }],
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
        max: [0.3, 1.4, 0],
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
    animations: names.map((name) => ({
      name,
      samplers: [{ input: 1, output: 2 }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    })),
  };
  const json = Buffer.from(JSON.stringify(gltf)),
    padding = Buffer.alloc((4 - (json.length % 4)) % 4, 32),
    header = Buffer.alloc(20),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + padding.length + binary.length, 8);
  header.writeUInt32LE(json.length + padding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([header, json, padding, binHeader, binary]),
    hash = createHash("sha256").update(bytes).digest("hex");
  return {
    manifest: {
      schemaVersion: 1,
      assetId:
        (walk ? "test.scene-motion" : "test.scene-no-walk") +
        (react ? "" : "-no-react"),
      version: "v1",
      name: "Original scene engineering fixture",
      model: "avatar.glb",
      files: [{ path: "avatar.glb", sha256: hash, bytes: bytes.length }],
      coordinates: {
        unit: "meter",
        up: "Y",
        forward: "+Z",
        scale: 1,
        offset: [0, 0, 0],
      },
      anchors: { feet: [0, 0, 0], nameplate: [0, 1.6, 0] },
      capabilities: { standing: true, seated: false },
      clips: {
        idle: "Idle",
        ...(walk ? { walk: "Walk" } : {}),
        ...(react ? { react: "React" } : {}),
      },
      provenance: {
        source: "Original BlueOffice engineering fixture",
        creator: "BlueOffice",
        rightsOwner: "BlueOffice",
        permissionEvidence: null,
        redistributionAllowed: null,
      },
      knownLimitations: [
        "Synthetic triangle for behavior tests. No gait, face, materials or art acceptance.",
      ],
    },
    files: [{ path: "avatar.glb", base64: bytes.toString("base64") }],
  };
}
export async function assignSceneTestPack(
  page: Page,
  agentId: string,
  walk = true,
  react = true,
) {
  return page.evaluate(
    async ({ pack, agentId }) => {
      const { csrf } = await (await fetch("/api/session")).json();
      const post = async (path: string, body: unknown) => {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BlueOffice-CSRF": csrf,
          },
          body: JSON.stringify(body),
        });
        const value = await response.json();
        if (!response.ok) throw Error(value.error);
        return value;
      };
      const imported = await post("/api/characters/import", pack);
      await post("/api/characters/review", {
        ref: imported.ref,
        clips: Object.values(pack.manifest.clips),
        materials: true,
        coordinates: true,
        limitations: true,
      });
      await post(`/api/agents/${agentId}/avatar`, { ref: imported.ref });
      return imported.ref;
    },
    { pack: sceneTestPack(walk, react), agentId },
  );
}
