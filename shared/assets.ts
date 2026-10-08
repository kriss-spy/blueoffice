import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const point = z.tuple([
  z.number().min(-100).max(100),
  z.number().min(-100).max(100),
  z.number().min(-100).max(100),
]);
export const assetRefSchema = z
  .object({ assetId: id, version: id, sha256 })
  .strict();
export type AssetRef = z.infer<typeof assetRefSchema>;
export const assetPath = z
  .string()
  .max(200)
  .refine(
    (path) =>
      path
        .split("/")
        .every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part)) &&
      !path.includes(".."),
    "Use plain relative paths without traversal, URLs or encoded characters.",
  );
export const seatingProfileSchema = z
  .object({
    compatibility: z.array(id).min(1).max(8),
    seat: point,
    pelvis: point,
    leftHand: point,
    rightHand: point,
    leftFoot: point,
    rightFoot: point,
    facing: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();
const note = z.string().trim().min(1).max(2000);
export const characterManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: id,
    version: id,
    name: z.string().trim().min(1).max(80),
    model: assetPath.refine((path) => path.endsWith(".glb")),
    files: z
      .array(
        z
          .object({
            path: assetPath,
            sha256,
            bytes: z.number().int().min(1).max(16_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    coordinates: z
      .object({
        unit: z.literal("meter"),
        up: z.literal("Y"),
        forward: z.literal("+Z"),
        scale: z.number().min(0.0001).max(100),
        offset: point,
      })
      .strict(),
    anchors: z
      .object({
        feet: z.tuple([z.literal(0), z.literal(0), z.literal(0)]),
        nameplate: point,
      })
      .strict(),
    seating: seatingProfileSchema.optional(),
    capabilities: z
      .object({ standing: z.literal(true), seated: z.boolean() })
      .strict(),
    clips: z
      .object({
        idle: note,
        walk: note.optional(),
        react: note.optional(),
        seated: note.optional(),
      })
      .strict(),
    provenance: z
      .object({
        source: note,
        creator: note,
        rightsOwner: note,
        permissionEvidence: note.nullable(),
        redistributionAllowed: z.boolean().nullable(),
      })
      .strict(),
    knownLimitations: z.array(note).min(1).max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.files.map((f) => f.path)).size !== value.files.length ||
      !value.files.some((f) => f.path === value.model)
    )
      ctx.addIssue({
        code: "custom",
        message: "Declare the model and each dependency exactly once.",
      });
    if (value.capabilities.seated && !value.seating)
      ctx.addIssue({
        code: "custom",
        message:
          "Seated capability requires measured compatibility and contact markers.",
      });
    if (value.capabilities.seated !== !!value.clips.seated)
      ctx.addIssue({
        code: "custom",
        message: "Seated capability requires an explicit seated clip mapping.",
      });
    if (
      value.provenance.redistributionAllowed === true &&
      !value.provenance.permissionEvidence
    )
      ctx.addIssue({
        code: "custom",
        message: "Redistribution claims require permission evidence.",
      });
  });
export type CharacterManifest = z.infer<typeof characterManifestSchema>;
export const importPackSchema = z
  .object({
    manifest: characterManifestSchema,
    files: z
      .array(
        z
          .object({ path: assetPath, base64: z.string().max(22_000_000) })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
export const reviewSchema = z
  .object({
    ref: assetRefSchema,
    clips: z.array(z.string().min(1).max(2000)).min(1).max(4),
    materials: z.literal(true),
    coordinates: z.literal(true),
    limitations: z.literal(true),
  })
  .strict();
export type CharacterReview = z.infer<typeof reviewSchema> & {
  at: string;
  scene: "office-v1";
};
export interface CharacterPack {
  ref: AssetRef;
  manifest: CharacterManifest;
  review?: CharacterReview;
  diagnostic?: string;
  warnings: number;
}
export const assetKey = (ref: AssetRef) =>
  `${ref.assetId}/${ref.version}/${ref.sha256}`;
export const mappedClips = (manifest: CharacterManifest) => [
  ...new Set(Object.values(manifest.clips)),
];
