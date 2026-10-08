import { createHash } from "node:crypto";
import type { CharacterManifest } from "../shared/assets.js";
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export function setupCharacterPack(
  edit: (gltf: any) => void = () => {},
  external = false,
) {
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
