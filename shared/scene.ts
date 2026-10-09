export type Point = [number, number, number];
export type QuarterTurn = 0 | 1 | 2 | 3;
export const defaultDesks = [
  [-1.45, 0, 1.9],
  [0.95, 0, 1.9],
  [-3.85, 0, 1.9],
  [3.35, 0, 1.9],
  [-1.45, 0, -0.6],
  [0.95, 0, -0.6],
  [-3.85, 0, -0.6],
  [3.35, 0, -0.6],
].map((position, i) => ({
  id: `desk-${i + 1}`,
  position: position as Point,
  rotation: 0 as QuarterTurn,
}));
export function availableDesk(used: Iterable<string | null>) {
  const occupied = new Set(used);
  return defaultDesks.find((desk) => !occupied.has(desk.id))?.id ?? null;
}
export const workstation = {
  id: "blueoffice.workstation.v2",
  unit: "meter",
  up: "Y",
  forward: "+Z",
  footprint: { width: 2.4, depth: 2.5, center: [0, 0, 0.38] as Point },
  anchors: {
    desk: [0, 0.57, 0] as Point,
    monitor: [0, 0.94, -0.2] as Point,
    keyboard: [0, 0.65, 0.38] as Point,
    chair: [0, 0, 0.72] as Point,
    seat: [0, 0.263, 0.72] as Point,
    standing: [1.02, 0, 0.72] as Point,
    approach: [0, 0, 1.65] as Point,
    work: [0, 0.65, 0.38] as Point,
  },
  compatibility: { standing: true, seated: true },
  seatingTags: ["blueoffice.seated-work.v1"],
} as const;

export function worldAnchor(
  anchor: Point,
  origin: Point,
  rotation: QuarterTurn,
): Point {
  const angle = (rotation * Math.PI) / 2;
  return [
    origin[0] + anchor[0] * Math.cos(angle) + anchor[2] * Math.sin(angle),
    origin[1] + anchor[1],
    origin[2] - anchor[0] * Math.sin(angle) + anchor[2] * Math.cos(angle),
  ];
}
export const proofAvatar = {
  id: "yuuka.original.proof",
  version: "525ae0fa-normalized-v1",
  hash: "a93f46c9f39c5bc51047f7301811e0affafebb8eac966fe30cac6e5e97f255ca",
  sourceHash:
    "9986383537011aca594b5ce8129ef87e325f559583ed77d975170127f5fecc64",
  sourceCommit: "525ae0faeb0a89f54ef4023f3be3692dcb529e51",
  clips: { idle: "Cafe_Idle", walk: "Cafe_Walk", react: "Cafe_Reaction" },
  coordinates: { up: "Y", forward: "+Z", targetHeight: 1.5 },
  redistributionAllowed: null,
} as const;
export type ProofMotion = keyof typeof proofAvatar.clips | "missing";

export function inspectProofGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 28 || buffer.byteLength > 16_000_000)
    throw new Error("Choose a GLB between 28 bytes and 16 MB.");
  const data = new DataView(buffer);
  if (
    data.getUint32(0, true) !== 0x46546c67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("The file is not a complete glTF 2.0 binary.");
  const length = data.getUint32(12, true);
  if (
    data.getUint32(16, true) !== 0x4e4f534a ||
    length > buffer.byteLength - 28
  )
    throw new Error("The GLB JSON chunk is invalid.");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  if (
    !json ||
    json.asset?.version !== "2.0" ||
    !Array.isArray(json.buffers) ||
    json.buffers.length !== 1 ||
    json.buffers[0].uri ||
    !Array.isArray(json.images) ||
    json.images.some((image: { uri?: unknown }) => image.uri) ||
    json.extensionsRequired?.length
  )
    throw new Error(
      "This proof requires self-contained geometry and images, without remote resources or required extensions.",
    );
  return {
    clips: (json.animations ?? []).map((clip: { name: string }) => clip.name),
    meshes: json.meshes?.length ?? 0,
    materials: json.materials?.length ?? 0,
  };
}

/** Fixed functional items already rendered by Room; submeshes are not separate items. */
export const roomFurnitureItems: { name: string; position: Point }[] = [
  { name: "Café counter", position: [-2.2, 0, -2.8] },
  { name: "Café stool 1", position: [-3.5, 0, -1.75] },
  { name: "Café stool 2", position: [-2.2, 0, -1.75] },
  { name: "Café stool 3", position: [-0.9, 0, -1.75] },
  { name: "Corner plant", position: [4.2, 0, -3.1] },
  { name: "Floor plant", position: [-4.3, 0, -0.45] },
  { name: "Espresso machine", position: [-3.23, 1.43, -2.9] },
  { name: "Tabletop plant", position: [-0.6, 1.13, -2.9] },
];
