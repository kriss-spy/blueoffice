import { z } from "zod";
import { assetRefSchema } from "./assets.js";
import {
  workstation,
  worldAnchor,
  type Point,
  type QuarterTurn,
} from "./scene.js";

export const layoutComponents = [
  "desk",
  "chair",
  "computer",
  "keyboard",
] as const;
export type LayoutComponent = (typeof layoutComponents)[number];
const componentsSchema = z
  .object({
    desk: z.boolean(),
    chair: z.boolean(),
    computer: z.boolean(),
    keyboard: z.boolean(),
  })
  .strict();
const placementSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    kind: z.literal("workstation"),
    position: z.tuple([z.number().finite(), z.literal(0), z.number().finite()]),
    rotation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    components: componentsSchema,
  })
  .strict();
export const layoutDraftSchema = z
  .object({
    placements: z.array(placementSchema).max(32),
    assignments: z.record(
      z.string().min(1).max(200),
      z.string().max(80).nullable(),
    ),
  })
  .strict();
export const layoutSaveSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    draft: layoutDraftSchema,
  })
  .strict();
export const layoutSnapshotSchema = layoutDraftSchema
  .extend({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    recoveredFrom: z.number().int().nonnegative().optional(),
    avatars: z.record(z.string(), assetRefSchema.nullable()).optional(),
    references: z
      .array(
        z
          .object({
            agentId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
            deskId: z
              .string()
              .regex(/^[a-zA-Z0-9_-]{1,80}$/)
              .nullable(),
            avatar: assetRefSchema.nullable(),
            boundAgentId: z
              .string()
              .regex(/^[a-zA-Z0-9_-]{1,200}$/)
              .nullable(),
          })
          .strict(),
      )
      .max(64)
      .optional(),
  })
  .strict();
export type LayoutPlacement = z.infer<typeof placementSchema>;
export type LayoutDraft = z.infer<typeof layoutDraftSchema>;
export type LayoutSave = z.infer<typeof layoutSaveSchema>;
export type LayoutSnapshot = z.infer<typeof layoutSnapshotSchema>;
export interface LayoutIssue {
  code: "bounds" | "overlap" | "approach" | "slot" | "incomplete" | "identity";
  message: string;
  placementId?: string;
}
export const roomBounds = { minX: -4.95, maxX: 4.95, minZ: -3.95, maxZ: 3.95 };
// The cafe counter and stool zone are fixed room furniture.
export const fixedLayoutObstacles = [
  { id: "Safe standing area", minX: 0.1, maxX: 3.6, minZ: -3.8, maxZ: -1.8 },
  { id: "Coffee corner", minX: -4.28, maxX: -0.12, minZ: -3.32, maxZ: -1.5 },
  { id: "Corner plant", minX: 3.88, maxX: 4.52, minZ: -3.43, maxZ: -2.77 },
];
export function newWorkstation(
  id: string,
  position: Point = [0, 0, 0],
  rotation: QuarterTurn = 0,
): LayoutPlacement {
  return {
    id,
    kind: "workstation",
    position: [position[0], 0, position[2]],
    rotation,
    components: { desk: true, chair: true, computer: true, keyboard: true },
  };
}
export function initialLayout(
  agents: { id: string; deskId: string | null }[] = [],
): LayoutDraft {
  const positions: Point[] = [
    [-1.2, 0, 2.1],
    [1.2, 0, 2.1],
    [-3.6, 0, 2.1],
    [3.6, 0, 2.1],
    [-1.2, 0, -0.6],
    [1.2, 0, -0.6],
    [-3.6, 0, -0.6],
    [3.6, 0, -0.6],
  ];
  return {
    placements: positions.map((position, i) =>
      newWorkstation(`desk-${i + 1}`, position),
    ),
    assignments: Object.fromEntries(
      agents.map((agent) => [agent.id, agent.deskId]),
    ),
  };
}
export function completeWorkstation(placement: LayoutPlacement) {
  return layoutComponents.every((component) => placement.components[component]);
}
export function footprint(placement: LayoutPlacement) {
  const center = worldAnchor(
    workstation.footprint.center,
    placement.position,
    placement.rotation,
  );
  const width =
    placement.rotation % 2
      ? workstation.footprint.depth
      : workstation.footprint.width;
  const depth =
    placement.rotation % 2
      ? workstation.footprint.width
      : workstation.footprint.depth;
  return {
    minX: center[0] - width / 2,
    maxX: center[0] + width / 2,
    minZ: center[2] - depth / 2,
    maxZ: center[2] + depth / 2,
  };
}
type Rect = ReturnType<typeof footprint>;
const overlaps = (a: Rect, b: Rect) =>
  a.minX < b.maxX - 0.00001 &&
  a.maxX > b.minX + 0.00001 &&
  a.minZ < b.maxZ - 0.00001 &&
  a.maxZ > b.minZ + 0.00001;
const inside = (r: Rect) =>
  r.minX >= roomBounds.minX - 0.00001 &&
  r.maxX <= roomBounds.maxX + 0.00001 &&
  r.minZ >= roomBounds.minZ - 0.00001 &&
  r.maxZ <= roomBounds.maxZ + 0.00001;
function cell(point: Point, radius: number): Rect {
  return {
    minX: point[0] - radius,
    maxX: point[0] + radius,
    minZ: point[2] - radius,
    maxZ: point[2] + radius,
  };
}
export function validateLayout(draft: LayoutDraft): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const ids = new Set<string>();
  for (const p of draft.placements) {
    if (ids.has(p.id))
      issues.push({
        code: "identity",
        placementId: p.id,
        message: `Duplicate workstation ID ${p.id}.`,
      });
    ids.add(p.id);
    const rect = footprint(p);
    if (!inside(rect))
      issues.push({
        code: "bounds",
        placementId: p.id,
        message: `${p.id} extends outside the room.`,
      });
    for (const obstacle of fixedLayoutObstacles)
      if (overlaps(rect, obstacle))
        issues.push({
          code: "overlap",
          placementId: p.id,
          message: `${p.id} overlaps ${obstacle.id}.`,
        });
    const approach = cell(
      worldAnchor(workstation.anchors.approach, p.position, p.rotation),
      0.18,
    );
    if (!inside(approach))
      issues.push({
        code: "approach",
        placementId: p.id,
        message: `${p.id} has an approach cell outside the room.`,
      });
    for (const other of [
      ...draft.placements
        .filter((other) => other.id !== p.id)
        .map((other) => ({ ...footprint(other), id: other.id })),
      ...fixedLayoutObstacles,
    ]) {
      if (
        overlaps(rect, other) &&
        draft.placements.some((item) => item.id === other.id)
      )
        issues.push({
          code: "overlap",
          placementId: p.id,
          message: `${p.id} overlaps ${other.id}.`,
        });
      if (overlaps(approach, other))
        issues.push({
          code: "approach",
          placementId: p.id,
          message: `${p.id}'s approach is blocked by ${other.id}.`,
        });
      const standing = cell(
        worldAnchor(workstation.anchors.standing, p.position, p.rotation),
        0.18,
      );
      if (overlaps(standing, other))
        issues.push({
          code: "slot",
          placementId: p.id,
          message: `${p.id}'s standing interaction slot is occupied by ${other.id}.`,
        });
    }
  }
  const occupied = new Set<string>();
  for (const [agentId, deskId] of Object.entries(draft.assignments)) {
    if (deskId === null) continue;
    const p = draft.placements.find((p) => p.id === deskId);
    if (!p)
      issues.push({
        code: "identity",
        message: `${agentId} refers to missing workstation ${deskId}.`,
      });
    else if (!completeWorkstation(p))
      issues.push({
        code: "incomplete",
        placementId: p.id,
        message: `${p.id} is incomplete. Reattach all four components before assigning an assistant.`,
      });
    if (occupied.has(deskId))
      issues.push({
        code: "slot",
        placementId: deskId,
        message: `${deskId}'s interaction slot is assigned to more than one assistant.`,
      });
    occupied.add(deskId);
  }
  return issues;
}
export function removePlacement(draft: LayoutDraft, id: string): LayoutDraft {
  return {
    placements: draft.placements.filter((p) => p.id !== id),
    assignments: Object.fromEntries(
      Object.entries(draft.assignments).map(([agent, desk]) => [
        agent,
        desk === id ? null : desk,
      ]),
    ),
  };
}
export function detachComponent(
  draft: LayoutDraft,
  id: string,
  component: LayoutComponent,
): LayoutDraft {
  return {
    placements: draft.placements.map((p) =>
      p.id === id
        ? { ...p, components: { ...p.components, [component]: false } }
        : p,
    ),
    assignments: Object.fromEntries(
      Object.entries(draft.assignments).map(([agent, desk]) => [
        agent,
        desk === id ? null : desk,
      ]),
    ),
  };
}

export function safeStandingPosition(index: number): Point {
  return [0.5 + (index % 4) * 0.8, 0, -3.35 + Math.floor(index / 4) * 0.65];
}

/** Catalog and counts describe functional furniture, excluding decorative cups and keys. */
export const layoutCatalog = [
  {
    kind: "workstation",
    label: "Workstation assembly",
    components: [...layoutComponents],
    width: workstation.footprint.width,
    depth: workstation.footprint.depth,
  },
] as const;
export function layoutInventory(draft: LayoutDraft) {
  const components = Object.fromEntries(
    layoutComponents.map((component) => [
      component,
      draft.placements.filter((p) => p.components[component]).length,
    ]),
  ) as Record<LayoutComponent, number>;
  const componentCount = Object.values(components).reduce(
    (sum, count) => sum + count,
    0,
  );
  const roomFurniture = { cafeCounters: 1, barStools: 3, floorPlants: 2 };
  return {
    assemblies: draft.placements.length,
    components,
    componentCount,
    roomFurniture,
    furnitureCount: componentCount + 6,
  };
}
