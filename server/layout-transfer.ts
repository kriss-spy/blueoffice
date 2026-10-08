import {
  assetKey,
  type CharacterPack,
  type AssetRef,
} from "../shared/assets.js";
import {
  layoutManifestSchema,
  layoutImportSchema,
  type LayoutManifest,
  type LayoutPreview,
  type TransferDiagnostic,
} from "../shared/layout-transfer.js";
import {
  validateLayout,
  completeWorkstation,
  type LayoutSnapshot,
  type LayoutDraft,
} from "../shared/layout.js";
import { workstation } from "../shared/scene.js";
import { LayoutError } from "./layout.js";
import type { OfficeStore } from "./store.js";

/** Portable references only. The registry diagnoses exact packs; no assets are loaded or copied. */
export class LayoutTransferService {
  constructor(
    private store: OfficeStore,
    private packs: () => CharacterPack[] = () => store.characterPacks(),
  ) {}
  export(): LayoutManifest {
    const current = this.store.layoutSnapshot();
    const agents = this.store.agents();
    const references = (current.references ?? []).map((ref) => {
      const local = agents.find((agent) => agent.id === ref.boundAgentId);
      return {
        agentId: ref.agentId,
        deskId: local ? local.deskId : ref.deskId,
        avatar: local ? (local.avatar ?? null) : ref.avatar,
      };
    });
    const represented = new Set(
      (current.references ?? [])
        .filter((ref) => ref.boundAgentId)
        .map((ref) => ref.boundAgentId),
    );
    const sourceIds = new Set(references.map((ref) => ref.agentId));
    for (const agent of agents) {
      if (!represented.has(agent.id) && sourceIds.has(agent.id))
        throw new LayoutError(
          "An unresolved portable reference shares a local assistant identifier. Explicitly bind that reference before exporting so both bindings cannot be confused.",
          409,
        );
      if (!represented.has(agent.id) && !sourceIds.has(agent.id))
        references.push({
          agentId: agent.id,
          deskId: agent.deskId,
          avatar: agent.avatar ?? null,
        });
    }
    const assets = Array.from(
      new Map(
        references
          .filter((ref) => ref.avatar)
          .map((ref) => [assetKey(ref.avatar!), { ref: ref.avatar! }]),
      ).values(),
    );
    return {
      format: "blueoffice.layout",
      schemaVersion: 1,
      workstationVersion: workstation.id,
      placements: structuredClone(current.placements),
      agents: references,
      assets,
    };
  }
  preview(input: unknown, selectedBindings?: unknown): LayoutPreview {
    const parsed = layoutManifestSchema.safeParse(input);
    if (!parsed.success)
      throw new LayoutError(
        "Invalid portable layout schema, version, identifier or relative path. Only schema 1 with exact asset versions is supported.",
        400,
      );
    const manifest = parsed.data;
    const current = this.store.layoutSnapshot();
    const agents = this.store.agents();
    this.validateManifest(manifest);
    const defaults = Object.fromEntries(
      manifest.agents.map((ref) => [
        ref.agentId,
        agents.some((agent) => agent.id === ref.agentId) ? ref.agentId : null,
      ]),
    );
    const parsedBindings = layoutImportSchema.safeParse({
      baseRevision: current.revision,
      manifest,
      bindings: selectedBindings ?? defaults,
    });
    if (!parsedBindings.success)
      throw new LayoutError("Invalid explicit assistant bindings.", 400);
    const bindings = parsedBindings.data.bindings;
    const { diagnostics } = this.project(manifest, bindings);
    return {
      baseRevision: current.revision,
      manifest,
      bindings,
      diagnostics,
      currentAgents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
      })),
    };
  }
  import(input: unknown): LayoutSnapshot {
    const parsed = layoutImportSchema.safeParse(input);
    if (!parsed.success)
      throw new LayoutError(
        "Invalid portable layout import or explicit bindings.",
        400,
      );
    this.validateManifest(parsed.data.manifest);
    const projected = this.project(parsed.data.manifest, parsed.data.bindings);
    const references = parsed.data.manifest.agents.map((ref) => ({
      ...ref,
      boundAgentId: parsed.data.bindings[ref.agentId] ?? null,
    }));
    return this.store.saveLayout(
      { baseRevision: parsed.data.baseRevision, draft: projected.draft },
      { references, avatars: projected.avatars },
    );
  }
  private validateManifest(manifest: LayoutManifest) {
    if (
      new Set(manifest.agents.map((ref) => ref.agentId)).size !==
      manifest.agents.length
    )
      throw new LayoutError("Portable agent identifiers must be unique.", 400);
    const assetIds = manifest.assets.map((asset) => assetKey(asset.ref));
    if (new Set(assetIds).size !== assetIds.length)
      throw new LayoutError(
        "Declare each exact asset reference only once.",
        400,
      );
    if (
      manifest.agents.some(
        (ref) => ref.avatar && !assetIds.includes(assetKey(ref.avatar)),
      )
    )
      throw new LayoutError(
        "Every character binding must declare its exact asset reference.",
        400,
      );
    if (
      assetIds.some(
        (key) =>
          !manifest.agents.some(
            (ref) => ref.avatar && assetKey(ref.avatar) === key,
          ),
      )
    )
      throw new LayoutError(
        "Every declared asset must be referenced by an office-agent binding; unused files or asset payloads are not portable layout content.",
        400,
      );
    const issues = validateLayout({
      placements: manifest.placements,
      assignments: {},
    });
    if (issues.length)
      throw new LayoutError(
        issues.map((issue) => issue.message).join(" "),
        422,
      );
  }
  private project(
    manifest: LayoutManifest,
    bindings: Record<string, string | null>,
  ) {
    const agents = this.store.agents();
    const localIds = new Set(agents.map((agent) => agent.id));
    const sourceIds = new Set(manifest.agents.map((ref) => ref.agentId));
    const targetIds = Object.values(bindings).filter(
      (id): id is string => id !== null,
    );
    if (
      Object.keys(bindings).some((id) => !sourceIds.has(id)) ||
      manifest.agents.some((ref) => !Object.hasOwn(bindings, ref.agentId)) ||
      targetIds.some((id) => !localIds.has(id)) ||
      new Set(targetIds).size !== targetIds.length
    )
      throw new LayoutError(
        "Choose one unique existing local assistant for each binding, or leave it unresolved.",
        422,
      );
    const diagnostics: TransferDiagnostic[] = [];
    const assignments: Record<string, string | null> = {};
    const avatars: Record<string, AssetRef | null> = {};
    const occupied = new Set<string>();
    const packs = this.packs();
    for (const ref of manifest.agents) {
      const local = bindings[ref.agentId];
      const placement = manifest.placements.find((p) => p.id === ref.deskId);
      const safeDesk =
        placement && completeWorkstation(placement) ? placement.id : null;
      if (ref.deskId && !safeDesk)
        diagnostics.push({
          code: "missing-desk",
          agentId: ref.agentId,
          message: `${ref.agentId}: workstation ${ref.deskId} is missing or incomplete; the reference is retained and any bound assistant will stand unassigned.`,
        });
      if (!local)
        diagnostics.push({
          code: "missing-agent",
          agentId: ref.agentId,
          message: `${ref.agentId}: no local assistant is bound. This reference will be retained without creating or starting an assistant.`,
        });
      if (ref.avatar) {
        const exact = packs.find(
          (pack) => assetKey(pack.ref) === assetKey(ref.avatar!),
        );
        if (!exact)
          diagnostics.push({
            code: packs.some((pack) => pack.ref.assetId === ref.avatar!.assetId)
              ? "asset-version"
              : "missing-asset",
            asset: ref.avatar,
            agentId: ref.agentId,
            message: `${ref.agentId}: exact character ${ref.avatar.assetId}@${ref.avatar.version} (${ref.avatar.sha256.slice(0, 12)}) is unavailable. A diagnostic placeholder preserves this reference; no other version is substituted.`,
          });
        else if (exact.diagnostic || !exact.review)
          diagnostics.push({
            code: exact.review ? "missing-asset" : "unreviewed-asset",
            asset: ref.avatar,
            agentId: ref.agentId,
            message: `${ref.agentId}: ${exact.diagnostic ?? "the exact character has not completed review"}. A diagnostic placeholder preserves the reference until the exact pack is available and reviewed.`,
          });
      }
      if (local) {
        if (safeDesk && occupied.has(safeDesk))
          throw new LayoutError(
            `More than one explicit binding occupies ${safeDesk}.`,
            422,
          );
        assignments[local] = safeDesk;
        avatars[local] = ref.avatar;
        if (safeDesk) occupied.add(safeDesk);
      }
    }
    for (const agent of agents)
      if (!(agent.id in assignments)) {
        const placement = manifest.placements.find(
          (p) => p.id === agent.deskId,
        );
        const safeDesk =
          placement &&
          completeWorkstation(placement) &&
          !occupied.has(placement.id)
            ? placement.id
            : null;
        assignments[agent.id] = safeDesk;
        if (safeDesk) occupied.add(safeDesk);
        if (agent.deskId && !safeDesk)
          diagnostics.push({
            code: "unassigned-local",
            agentId: agent.id,
            message: `${agent.name}: imported placement or an explicit binding makes ${agent.deskId} unavailable. This local assistant will become safely unassigned; its character and current task are preserved.`,
          });
      }
    const draft: LayoutDraft = { placements: manifest.placements, assignments };
    const issues = validateLayout(draft);
    if (issues.length)
      throw new LayoutError(
        issues.map((issue) => issue.message).join(" "),
        422,
      );
    return { draft, avatars, diagnostics };
  }
}
