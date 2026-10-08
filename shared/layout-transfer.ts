import { z } from "zod";
import { assetPath, assetRefSchema, type AssetRef } from "./assets.js";
import { layoutDraftSchema, type LayoutSnapshot } from "./layout.js";
import { workstation } from "./scene.js";
export const portableAgentId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
export const portableAgentSchema = z
  .object({
    agentId: portableAgentId,
    deskId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .nullable(),
    avatar: assetRefSchema.nullable(),
  })
  .strict();
export const layoutManifestSchema = z
  .object({
    format: z.literal("blueoffice.layout"),
    schemaVersion: z.literal(1),
    workstationVersion: z.literal(workstation.id),
    placements: layoutDraftSchema.shape.placements,
    agents: z.array(portableAgentSchema).max(64),
    assets: z
      .array(
        z.object({ ref: assetRefSchema, path: assetPath.optional() }).strict(),
      )
      .max(64),
  })
  .strict();
export type LayoutManifest = z.infer<typeof layoutManifestSchema>;
export const layoutImportSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    manifest: layoutManifestSchema,
    bindings: z.record(portableAgentId, portableAgentId.nullable()),
  })
  .strict();
export interface TransferDiagnostic {
  code:
    | "missing-agent"
    | "missing-asset"
    | "asset-version"
    | "unreviewed-asset"
    | "missing-desk"
    | "unassigned-local";
  message: string;
  agentId?: string;
  asset?: AssetRef;
}
export interface LayoutPreview {
  baseRevision: number;
  manifest: LayoutManifest;
  bindings: Record<string, string | null>;
  diagnostics: TransferDiagnostic[];
  currentAgents: { id: string; name: string }[];
}
export interface LayoutTransferProps {
  agents: { id: string; name: string }[];
  connected: boolean;
  layout?: LayoutSnapshot;
  saved?: (value: LayoutSnapshot) => void;
}
