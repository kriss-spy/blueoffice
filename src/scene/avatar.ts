import {
  AnimationMixer,
  Box3,
  Mesh,
  SkinnedMesh,
  Vector3,
  type Object3D,
  type Material,
  type Texture,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { inspectProofGlb, proofAvatar } from "../../shared/scene";

export interface AvatarAsset {
  gltf: GLTF;
  scale: number;
  offset: [number, number, number];
  bounds: number[];
  hash: string;
}
export async function loadProofAvatar(file: File): Promise<AvatarAsset> {
  if (file.size > 16_000_000)
    throw new Error("This proof accepts a GLB up to 16 MB.");
  const buffer = await file.arrayBuffer();
  inspectProofGlb(buffer);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== proofAvatar.hash)
    throw new Error(
      "This scene expects the normalized Yuuka proof file. Run the documented preparation command on the pinned source first.",
    );
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = false;
    }
  });
  const mixer = new AnimationMixer(gltf.scene);
  const clip = gltf.animations.find(
    (clip) => clip.name === proofAvatar.clips.idle,
  );
  if (!clip) {
    disposeAvatar(gltf);
    throw new Error("The expected café idle clip is missing.");
  }
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  gltf.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(gltf.scene, true);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = proofAvatar.coordinates.targetHeight / size.y;
  mixer.stopAllAction();
  mixer.uncacheRoot(gltf.scene);
  return {
    gltf,
    scale,
    offset: [-center.x, -box.min.y, -center.z],
    bounds: [...box.min.toArray(), ...box.max.toArray()],
    hash,
  };
}
export function cloneAvatar(asset: AvatarAsset) {
  const scene = clone(asset.gltf.scene);
  return { scene, mixer: new AnimationMixer(scene) };
}
export function disposeAvatarInstance(
  instance: ReturnType<typeof cloneAvatar>,
) {
  instance.mixer.stopAllAction();
  instance.mixer.uncacheRoot(instance.scene);
  disposeSkeletons(instance.scene);
}
function disposeSkeletons(scene: Object3D) {
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  scene.traverse((object) => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}
export function disposeAvatar(gltf: GLTF) {
  disposeSkeletons(gltf.scene);
  const materials = new Set<Material>(),
    textures = new Set<Texture>();
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    const image = texture.image as { close?: () => void } | undefined;
    if (typeof image?.close === "function") image.close();
  }
}
export function boneSignature(scene: Object3D) {
  const values: number[] = [];
  scene.traverse((object) => {
    if (object.type === "Bone" && values.length < 60)
      values.push(
        ...object.quaternion
          .toArray()
          .map((n) => Math.round(n * 10000) / 10000),
      );
  });
  return values.join(",");
}
