import assert from "node:assert/strict";
import test from "node:test";
import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Group,
} from "three";
import { inspectProofGlb, workstation, worldAnchor } from "../shared/scene";
import { cloneAvatar, type AvatarAsset } from "../src/scene/avatar";

function glb(overrides: Record<string, unknown> = {}) {
  const text = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 4 }],
    images: [{ bufferView: 0 }],
    ...overrides,
  });
  const length = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(32 + length);
  const data = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, length, 0x4e4f534a].forEach((n, i) =>
    data.setUint32(i * 4, n, true),
  );
  new Uint8Array(buffer, 20, length).fill(32);
  new Uint8Array(buffer, 20, text.length).set(new TextEncoder().encode(text));
  data.setUint32(20 + length, 4, true);
  data.setUint32(24 + length, 0x004e4942, true);
  return buffer;
}

test("workstation rotation keeps all anchors in the same local frame", () => {
  const origin: [number, number, number] = [4, 0, -2];
  for (const anchor of Object.values(workstation.anchors)) {
    const [x, y, z] = worldAnchor(anchor, origin, 1);
    assert.ok(Math.abs(x - (4 + anchor[2])) < 1e-10);
    assert.equal(y, anchor[1]);
    assert.ok(Math.abs(z - (-2 - anchor[0])) < 1e-10);
    const local = worldAnchor([x - 4, y, z + 2], [0, 0, 0], 3);
    local.forEach((value, i) => assert.ok(Math.abs(value - anchor[i]) < 1e-10));
  }
  assert.equal(workstation.compatibility.seated, false);
});

test("proof GLB rejects malformed headers and external resources before loading", () => {
  assert.throws(() => inspectProofGlb(new ArrayBuffer(10)), /GLB/);
  const broken = glb();
  new DataView(broken).setUint32(8, 12, true);
  assert.throws(() => inspectProofGlb(broken), /complete/);
  assert.throws(
    () =>
      inspectProofGlb(
        glb({ buffers: [{ uri: "https://example.com/data.bin" }] }),
      ),
    /self-contained/,
  );
  assert.throws(
    () =>
      inspectProofGlb(
        glb({ images: [{ uri: "https://example.com/face.png" }] }),
      ),
    /self-contained/,
  );
  assert.throws(
    () => inspectProofGlb(glb({ extensionsRequired: ["unknown"] })),
    /self-contained/,
  );
  assert.deepEqual(
    inspectProofGlb(glb({ animations: [{ name: "Idle" }] })).clips,
    ["Idle"],
  );
});

test("duplicate avatars share geometry and materials but own skeletons and mixers", () => {
  const scene = new Group();
  const bone = new Bone();
  bone.name = "rootBone";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  scene.add(mesh);
  const asset = { gltf: { scene } } as AvatarAsset;
  const first = cloneAvatar(asset),
    second = cloneAvatar(asset);
  const a = first.scene.children[0] as SkinnedMesh,
    b = second.scene.children[0] as SkinnedMesh;
  assert.equal(a.geometry, b.geometry);
  assert.equal(a.material, b.material);
  assert.notEqual(a.skeleton, b.skeleton);
  assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
  const clip = new AnimationClip("Move", 1, [
    new NumberKeyframeTrack("rootBone.position[x]", [0, 1], [0, 2]),
  ]);
  first.mixer.clipAction(clip).play();
  second.mixer.clipAction(clip).play();
  first.mixer.update(0.25);
  second.mixer.update(0.75);
  assert.equal(a.skeleton.bones[0].position.x, 0.5);
  assert.equal(b.skeleton.bones[0].position.x, 1.5);
  assert.equal(bone.position.x, 0);
  second.mixer.update(0.1);
  assert.equal(a.skeleton.bones[0].position.x, 0.5);
});
