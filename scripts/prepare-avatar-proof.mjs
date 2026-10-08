import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import validator from "gltf-validator";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath)
  throw new Error(
    "Usage: node scripts/prepare-avatar-proof.mjs SOURCE.glb OUTPUT_DIRECTORY",
  );
const source = await readFile(sourcePath);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHash = hash(source);
if (
  sourceHash !==
  "9986383537011aca594b5ce8129ef87e325f559583ed77d975170127f5fecc64"
)
  throw new Error(
    "This normalization is verified only for the pinned Yuuka source hash.",
  );
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength));
const binaryStart = 20 + jsonLength + 8;
const originalBinary = source.subarray(
  binaryStart,
  binaryStart + gltf.buffers[0].byteLength,
);
let binary = Buffer.from(originalBinary);
const inputs = new Map();
let quaternionSamples = 0;
for (const animation of gltf.animations) {
  for (const sampler of animation.samplers) {
    if (!inputs.has(sampler.input)) {
      inputs.set(sampler.input, gltf.accessors.length);
      gltf.accessors.push(structuredClone(gltf.accessors[sampler.input]));
    }
    sampler.input = inputs.get(sampler.input);
  }
  for (const channel of animation.channels) {
    if (channel.target.path !== "rotation") continue;
    const sampler = animation.samplers[channel.sampler];
    const accessor = gltf.accessors[sampler.output];
    if (
      accessor.componentType !== 5126 ||
      accessor.type !== "VEC4" ||
      accessor.sparse
    )
      throw new Error(
        "Unexpected rotation accessor; normalization requires inspection.",
      );
    const view = gltf.bufferViews[accessor.bufferView];
    const output = Buffer.alloc(accessor.count * 16);
    for (let i = 0; i < accessor.count; i++) {
      const offset =
        (view.byteOffset ?? 0) +
        (accessor.byteOffset ?? 0) +
        i * (view.byteStride ?? 16);
      const values = Array.from({ length: 4 }, (_, k) =>
        originalBinary.readFloatLE(offset + k * 4),
      );
      const valueSample =
        sampler.interpolation !== "CUBICSPLINE" || i % 3 === 1;
      const length = valueSample ? Math.hypot(...values) : 1;
      if (!Number.isFinite(length) || length < 1e-8)
        throw new Error("Invalid quaternion.");
      values.forEach((value, k) =>
        output.writeFloatLE(value / length, i * 16 + k * 4),
      );
      if (valueSample) quaternionSamples++;
    }
    const padding = Buffer.alloc((4 - (binary.length % 4)) % 4);
    const byteOffset = binary.length + padding.length;
    binary = Buffer.concat([binary, padding, output]);
    const bufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: output.length });
    sampler.output = gltf.accessors.length;
    gltf.accessors.push({
      bufferView,
      componentType: 5126,
      count: accessor.count,
      type: "VEC4",
    });
  }
}
gltf.buffers[0].byteLength = binary.length;
gltf.asset.generator += "; BlueOffice avatar-proof normalization v1";
const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
const binPad = Buffer.alloc((4 - (binary.length % 4)) % 4);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(
  28 + json.length + jsonPad.length + binary.length + binPad.length,
  8,
);
header.writeUInt32LE(json.length + jsonPad.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length + binPad.length);
binHeader.writeUInt32LE(0x004e4942, 4);
const normalized = Buffer.concat([
  header,
  json,
  jsonPad,
  binHeader,
  binary,
  binPad,
]);
const report = await validator.validateBytes(new Uint8Array(normalized), {
  uri: "Yuuka.normalized.glb",
  maxIssues: 1000,
});
const directory = resolve(outputPath);
await mkdir(directory, { recursive: true });
await writeFile(
  join(directory, "validator.json"),
  JSON.stringify(report, null, 2),
);
if (report.issues.numErrors)
  throw new Error(
    `Normalization still has ${report.issues.numErrors} validator errors.`,
  );
await writeFile(join(directory, "Yuuka.normalized.glb"), normalized);
const inventory = {
  sourceHash,
  normalizedHash: hash(normalized),
  sourceBytes: source.length,
  normalizedBytes: normalized.length,
  normalization: {
    version: 1,
    separatedAnimationInputs: inputs.size,
    quaternionSamples,
  },
  clips: gltf.animations.map((a) => ({
    name: a.name,
    channels: a.channels.length,
  })),
  materials: gltf.materials.map((m) => ({
    name: m.name,
    alphaMode: m.alphaMode ?? "OPAQUE",
    doubleSided: m.doubleSided ?? false,
  })),
  structuralValidation: {
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    info: report.info,
  },
  provenance: {
    sourceUrl:
      "https://github.com/lihaohong6/BlueArchiveModels/blob/525ae0faeb0a89f54ef4023f3be3692dcb529e51/Yuuka.glb",
    sourceCommit: "525ae0faeb0a89f54ef4023f3be3692dcb529e51",
    redistributionAllowed: null,
    permissionReference: null,
    scope:
      "Local technical inspection; no character bytes in the software repository.",
  },
};
await writeFile(
  join(directory, "inventory.json"),
  JSON.stringify(inventory, null, 2),
);
console.log(
  JSON.stringify({
    normalizedHash: inventory.normalizedHash,
    bytes: normalized.length,
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    quaternionSamples,
  }),
);
