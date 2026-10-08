import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Vector3, Quaternion, AnimationMixer, Box3, Triangle } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
const [input, output = "artifacts/seating", manifestPath] =
  process.argv.slice(2);
if (!input)
  throw Error(
    "Usage: node scripts/prepare-seated-work.mjs NORMALIZED.glb OUTPUT",
  );
const bytes = await fs.readFile(input);
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
if (
  hash(bytes) !==
  "a93f46c9f39c5bc51047f7301811e0affafebb8eac966fe30cac6e5e97f255ca"
)
  throw Error("Expected pinned normalized source");
const jsonLength = bytes.readUInt32LE(12),
  json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
let binary = Buffer.from(
  bytes.subarray(28 + jsonLength, 28 + jsonLength + json.buffers[0].byteLength),
);
// Node measurement uses the same geometry and animation with texture fetching omitted.
const measurement = structuredClone(json);
delete measurement.images;
delete measurement.textures;
delete measurement.samplers;
measurement.materials = measurement.materials.map(() => ({}));
measurement.buffers[0].uri =
  "data:application/octet-stream;base64," + binary.toString("base64");
globalThis.ProgressEvent ??= class ProgressEvent {};
const gltf = await new GLTFLoader().parseAsync(JSON.stringify(measurement), "");
const scene = gltf.scene,
  mixer = new AnimationMixer(scene);
mixer.clipAction(gltf.animations.find((a) => a.name === "Cafe_Idle")).play();
mixer.setTime(0);
scene.updateMatrixWorld(true);
const box = new Box3().setFromObject(scene, true),
  scale = 1.5 / (box.max.y - box.min.y),
  offset = new Vector3(
    -(box.max.x + box.min.x) / 2,
    -box.min.y,
    -(box.max.z + box.min.z) / 2,
  );
const get = (name) => {
  const o = scene.getObjectByName(name.replaceAll(" ", "_"));
  if (!o) throw Error("Missing bone " + name);
  return o;
};
const world = (name) => get(name).getWorldPosition(new Vector3());
console.log({
  scale,
  offset: offset.toArray(),
  pelvis: world("Bip001 Pelvis").toArray(),
  Lhand: world("Bip001 L Hand").toArray(),
  foot: world("Bip001 L Foot").toArray(),
});
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "rig.json"),
  JSON.stringify(
    {
      scale,
      offset: offset.toArray(),
      bones: json.nodes
        .filter((n) => n.name?.includes("Bip001"))
        .map((n) => ({ name: n.name, position: world(n.name).toArray() })),
    },
    null,
    2,
  ),
);
const normalized = (name) => world(name).add(offset).multiplyScalar(scale);
const raw = (p) => new Vector3(...p).divideScalar(scale).sub(offset);
const root = get("Bip001");
const footOrientations = Object.fromEntries(
  ["L", "R"].map((side) => [
    side,
    get(`Bip001 ${side} Foot`).getWorldQuaternion(new Quaternion()),
  ]),
);
const desiredPelvis = raw([0, 0.35, 0]);
root.position.add(
  root.parent
    .worldToLocal(desiredPelvis.clone())
    .sub(root.parent.worldToLocal(world("Bip001 Pelvis"))),
);
scene.updateMatrixWorld(true);
function aim(bone, child, target) {
  scene.updateMatrixWorld(true);
  const origin = bone.getWorldPosition(new Vector3());
  const from = child.getWorldPosition(new Vector3()).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const turn = new Quaternion().setFromUnitVectors(from, to);
  const q = turn.multiply(bone.getWorldQuaternion(new Quaternion()));
  bone.quaternion.copy(
    bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q),
  );
  scene.updateMatrixWorld(true);
}
function solve(aName, bName, cName, targetN, poleN) {
  const a = get(aName),
    b = get(bName),
    c = get(cName),
    target = raw(targetN),
    pole = raw(poleN);
  const origin = a.getWorldPosition(new Vector3()),
    ab = origin.distanceTo(b.getWorldPosition(new Vector3())),
    bc = b
      .getWorldPosition(new Vector3())
      .distanceTo(c.getWorldPosition(new Vector3()));
  const delta = target.clone().sub(origin),
    d = delta.length();
  if (d > ab + bc || d < Math.abs(ab - bc))
    throw Error(
      "Unreachable target " + aName + " distance " + d + " length " + (ab + bc),
    );
  const axis = delta.normalize();
  const along = (ab * ab - bc * bc + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, ab * ab - along * along));
  const bend = pole.sub(origin);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  const elbow = origin
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, height);
  aim(a, b, elbow);
  aim(b, c, target);
}
for (const [side, sign] of [
  ["L", 1],
  ["R", -1],
]) {
  solve(
    `Bip001 ${side} Thigh`,
    `Bip001 ${side} Calf`,
    `Bip001 ${side} Foot`,
    [sign * 0.105, 0.06865, 0.24],
    [sign * 0.105, 0.34, 0.4],
  );
  // Preserve the standing ankle orientation: the shoe sole remains horizontal.
  const foot = get(`Bip001 ${side} Foot`);
  foot.quaternion.copy(
    foot.parent
      .getWorldQuaternion(new Quaternion())
      .invert()
      .multiply(footOrientations[side]),
  );
  scene.updateMatrixWorld(true);
  solve(
    `Bip001 ${side} UpperArm`,
    `Bip001 ${side} Forearm`,
    `Bip001 ${side} Hand`,
    [sign * 0.115, 0.65, 0.23],
    [sign * 0.3, 0.53, 0.08],
  );
  const hand = get(`Bip001 ${side} Hand`),
    finger = get(`Bip001 ${side} Finger2`);
  aim(
    hand,
    finger,
    hand.getWorldPosition(new Vector3()).add(new Vector3(0, -0.012, 0.1)),
  );
}
// Rotate the front skirt panels over the thighs instead of allowing them to hang through knees.
for (const name of ["bone_skirtF00", "bone_skirtF_L_00", "bone_skirtF_R_00"]) {
  const bone = get(name),
    child = bone.children[0];
  aim(
    bone,
    child,
    bone.getWorldPosition(new Vector3()).add(new Vector3(0, -0.035, 0.1)),
  );
}
scene.updateMatrixWorld(true);
for (const name of [
  "bone_skirtB00",
  "bone_skirtB_L_00",
  "bone_skirtB_R_00",
  "bone_skirtL00",
  "bone_skirtR00",
]) {
  const bone = get(name);
  const direction = name.includes("skirtB")
    ? new Vector3(0, -0.07, -0.1)
    : new Vector3(name.includes("skirtL") ? 0.1 : -0.1, -0.07, 0);
  aim(
    bone,
    bone.children[0],
    bone.getWorldPosition(new Vector3()).add(direction),
  );
}
for (const name of [
  "bone_hair_b_m_01",
  "bone_hair_b_l_01",
  "bone_hair_b_r_01",
  "bone_hair_b_m_02",
  "bone_hair_b_l_02",
  "bone_hair_b_r_02",
]) {
  const bone = get(name);
  aim(
    bone,
    bone.children[0],
    bone.getWorldPosition(new Vector3()).add(new Vector3(0, -0.2, 0)),
  );
}
scene.updateMatrixWorld(true);
const soleBounds = {};
for (const side of ["L", "R"]) {
  const bounds = new Box3();
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const ids = o.skeleton.bones
      .map((b, i) =>
        b.name === `Bip001_${side}_Foot` || b.name === `Bip001_${side}_Toe0`
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    const joints = o.geometry.attributes.skinIndex,
      weights = o.geometry.attributes.skinWeight;
    for (let v = 0; v < joints.count; v++) {
      let weight = 0;
      for (let c = 0; c < 4; c++)
        if (ids.includes(joints.getComponent(v, c)))
          weight += weights.getComponent(v, c);
      if (weight > 0.5) {
        const p = o
          .getVertexPosition(v, new Vector3())
          .applyMatrix4(o.matrixWorld)
          .add(offset)
          .multiplyScalar(scale);
        bounds.expandByPoint(p);
      }
    }
  });
  soleBounds[side] = [...bounds.min.toArray(), ...bounds.max.toArray()];
}
const clipping = { seat: 0, back: 0 };
const clipMeshes = {};
const triangleIntersections = { seat: 0, back: 0 };
const chairBoxes = {
  seat: new Box3(
    new Vector3(-0.275, 0.173, 0.71),
    new Vector3(0.275, 0.263, 0.91),
  ),
  back: new Box3(
    new Vector3(-0.275, 0.42, 1.125),
    new Vector3(0.275, 0.75, 1.195),
  ),
};
scene.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  const positions = new Map();
  const indices =
    o.geometry.index?.array ??
    Array.from({ length: o.geometry.attributes.position.count }, (_, i) => i);
  for (const v of new Set(indices)) {
    const p = o
      .getVertexPosition(v, new Vector3())
      .applyMatrix4(o.matrixWorld)
      .add(offset)
      .multiplyScalar(scale);
    p.x = -p.x;
    p.z = 0.72 - p.z;
    positions.set(v, p);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const tri = new Triangle(
      positions.get(indices[i]),
      positions.get(indices[i + 1]),
      positions.get(indices[i + 2]),
    );
    for (const [name, box] of Object.entries(chairBoxes))
      if (box.intersectsTriangle(tri)) triangleIntersections[name]++;
  }
});
scene.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  for (const v of new Set(
    o.geometry.index?.array ??
      Array.from({ length: o.geometry.attributes.position.count }, (_, i) => i),
  )) {
    const p = o
      .getVertexPosition(v, new Vector3())
      .applyMatrix4(o.matrixWorld)
      .add(offset)
      .multiplyScalar(scale);
    p.x = -p.x;
    p.z = 0.72 - p.z;
    clipMeshes[o.name] ??= { seat: 0, back: 0 };
    if (
      Math.abs(p.x) < 0.275 &&
      p.z > 0.71 &&
      p.z < 0.91 &&
      p.y > 0.173 &&
      p.y < 0.263
    ) {
      clipping.seat++;
      clipMeshes[o.name].seat++;
    }
    if (
      Math.abs(p.x) < 0.275 &&
      p.z > 1.125 &&
      p.z < 1.195 &&
      p.y > 0.42 &&
      p.y < 0.75
    ) {
      clipping.back++;
      clipMeshes[o.name].back++;
    }
  }
});
console.log({ soleBounds, clipping, clipMeshes, triangleIntersections });
const roomMeasurements = {
  baseVertexIntersections: 0,
  supportTriangleIntersections: 0,
};
const supportBox = new Box3(
  new Vector3(-0.0175, -Math.hypot(0.26, 0.26) / 2, -0.0175),
  new Vector3(0.0175, Math.hypot(0.26, 0.26) / 2, 0.0175),
);
const inverseSupport = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 4,
);
scene.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  const positions = new Map();
  const indices =
    o.geometry.index?.array ??
    Array.from({ length: o.geometry.attributes.position.count }, (_, i) => i);
  for (const v of new Set(indices)) {
    const p = o
      .getVertexPosition(v, new Vector3())
      .applyMatrix4(o.matrixWorld)
      .add(offset)
      .multiplyScalar(scale);
    p.x = -p.x;
    p.z = 0.72 - p.z;
    positions.set(v, p);
    if (p.y > 0.06 && p.y < 0.1 && Math.hypot(p.x, p.z - 0.72) < 0.18)
      roomMeasurements.baseVertexIntersections++;
  }
  for (let i = 0; i < indices.length; i += 3) {
    for (const x of [-0.23, 0.23]) {
      const points = [indices[i], indices[i + 1], indices[i + 2]].map((v) =>
        positions
          .get(v)
          .clone()
          .sub(new Vector3(x, 0.35, 1.03))
          .applyQuaternion(inverseSupport),
      );
      if (supportBox.intersectsTriangle(new Triangle(...points)))
        roomMeasurements.supportTriangleIntersections++;
    }
  }
});
console.log({ roomMeasurements });

const markers = {
  pelvis: normalized("Bip001 Pelvis").toArray(),
  leftHand: normalized("Bip001 L Hand").toArray(),
  rightHand: normalized("Bip001 R Hand").toArray(),
  leftFoot: normalized("Bip001 L Foot").toArray(),
  rightFoot: normalized("Bip001 R Foot").toArray(),
};
function accessor(values, type) {
  const data = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => data.writeFloatLE(v, i * 4));
  const byteOffset = binary.length;
  binary = Buffer.concat([binary, data]);
  const view = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length });
  const index = json.accessors.length;
  const n = type === "SCALAR" ? 1 : type === "VEC3" ? 3 : 4;
  json.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: values.length / n,
    type,
    ...(type === "SCALAR"
      ? { min: [Math.min(...values)], max: [Math.max(...values)] }
      : {}),
  });
  return index;
}
const inputAccessor = accessor([0, 2], "SCALAR");
const animation = { name: "Office_SeatedWork_v1", samplers: [], channels: [] };
for (let i = 0; i < json.nodes.length; i++) {
  const node = json.nodes[i];
  const object = [...gltf.parser.associations].find(
    ([o, a]) => a.nodes === i,
  )?.[0];
  if (!object) continue;
  if (object.morphTargetInfluences?.length) {
    const values = object.morphTargetInfluences;
    const out = accessor([...values, ...values], "SCALAR");
    const sampler = animation.samplers.length;
    animation.samplers.push({
      input: inputAccessor,
      output: out,
      interpolation: "LINEAR",
    });
    animation.channels.push({ sampler, target: { node: i, path: "weights" } });
  }
  if (node.skin !== undefined) continue;
  for (const [p, value] of [
    ["rotation", object.quaternion.toArray()],
    ["translation", object.position.toArray()],
    ["scale", object.scale.toArray()],
  ]) {
    const outputAccessor = accessor(
      [...value, ...value],
      p === "rotation" ? "VEC4" : "VEC3",
    );
    const sampler = animation.samplers.length;
    animation.samplers.push({
      input: inputAccessor,
      output: outputAccessor,
      interpolation: "LINEAR",
    });
    animation.channels.push({ sampler, target: { node: i, path: p } });
  }
}
json.animations.push(animation);
json.buffers[0].byteLength = binary.length;
json.asset.generator += "; BlueOffice authored seated work v1";
const encoded = Buffer.from(JSON.stringify(json)),
  padded = Buffer.concat([
    encoded,
    Buffer.alloc((4 - (encoded.length % 4)) % 4, 32),
  ]);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + binary.length, 8);
header.writeUInt32LE(padded.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length);
binHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, padded, binHeader, binary]);
await fs.writeFile(path.join(output, "Yuuka.seated.glb"), result);
const report = await validator.validateBytes(new Uint8Array(result), {
  maxIssues: 200,
});
await fs.writeFile(
  path.join(output, "validator.json"),
  JSON.stringify(report, null, 2),
);
const manifest = JSON.parse(
  await fs.readFile(
    manifestPath ??
      path.join(path.dirname(input), "character-pack", "manifest.json"),
    "utf8",
  ),
);
manifest.version = "525ae0fa-seated-work-v1";
manifest.model = "Yuuka.seated.glb";
manifest.files = [
  { path: manifest.model, sha256: hash(result), bytes: result.length },
];
manifest.capabilities.seated = true;
manifest.clips.seated = animation.name;
manifest.seating = {
  compatibility: ["blueoffice.seated-work.v1"],
  seat: [0, 0.263, 0],
  ...markers,
  facing: 2,
};
manifest.knownLimitations = manifest.knownLimitations.filter(
  (n) => !n.startsWith("Standing café clips only"),
);
manifest.knownLimitations.push(
  "Office_SeatedWork_v1 is an original static skeletal work pose; typing finger motion is not authored. Compatible furniture requires the measured seated-work-v1 anchors. Visual acceptance remains independent of structural validation.",
);
await fs.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
await fs.writeFile(
  path.join(output, "alignment.json"),
  JSON.stringify(
    {
      sourceHash: hash(bytes),
      assetHash: hash(result),
      scale,
      offset: offset.toArray(),
      markers,
      soleBounds,
      clipping,
      triangleIntersections,
      roomMeasurements,
      errors: report.issues.numErrors,
      warnings: report.issues.numWarnings,
    },
    null,
    2,
  ),
);
console.log({
  markers,
  soleBounds,
  clipping,
  triangleIntersections,
  roomMeasurements,
  errors: report.issues.numErrors,
  warnings: report.issues.numWarnings,
});
if (report.issues.numErrors) process.exitCode = 1;
