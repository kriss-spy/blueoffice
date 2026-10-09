import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { OfficeStore } from "../server/store.js";
import { LayoutTransferService } from "../server/layout-transfer.js";
import { LayoutError, LayoutService } from "../server/layout.js";
import type { OfficeAgent } from "../shared/office.js";
import type { CharacterPack } from "../shared/assets.js";
import { layoutManifestSchema } from "../shared/layout-transfer.js";
import { newWorkstation } from "../shared/layout.js";
const refA = {
  assetId: "character.test",
  version: "a",
  sha256: "a".repeat(64),
};
const refB = {
  assetId: "character.test",
  version: "b",
  sha256: "b".repeat(64),
};
function agent(id = "agent-1", deskId: string | null = "desk-1"): OfficeAgent {
  return {
    id,
    name: "Hina",
    profileName: "SECRET_PROFILE",
    profileHome: "/PRIVATE/home",
    workspace: "/PRIVATE/workspace",
    model: "glm-5.3-flash",
    avatarId: "unassigned",
    avatar: null,
    deskId,
    lifecycle: "ready",
    work: "working",
    freshness: "current",
    epoch: "epoch",
    liveSessionId: "session",
    storedSessionId: "stored",
    turnId: "turn",
    busy: true,
    conversations: [],
    messages: [
      {
        id: "m",
        epoch: "epoch",
        turnId: "turn",
        role: "user",
        text: "SECRET_TRANSCRIPT",
        state: "complete",
        at: "now",
        chunkIds: [],
      },
    ],
    requests: [
      {
        id: "r",
        frameId: 1,
        epoch: "epoch",
        sessionId: "session",
        kind: "clarify",
        text: "SECRET_QUESTION",
        choices: [],
        questions: [],
        state: "open",
        at: "now",
      },
    ],
    receipts: [],
    error: null,
    createdAt: "now",
  };
}
function setup() {
  const root = mkdtempSync(join(tmpdir(), "blueoffice-transfer-"));
  const path = join(root, "office.db");
  const store = new OfficeStore(path);
  store.save(agent(), "create", "create");
  const transfer = new LayoutTransferService(store);
  return { root, path, store, transfer };
}
function manifest(transfer: LayoutTransferService) {
  const result = transfer.export();
  result.placements = [newWorkstation("desk-1", [1, 0, 0], 1)];
  result.agents[0].avatar = refA;
  result.assets = [{ ref: refA, path: "characters/test/a/model.glb" }];
  return result;
}

test("export is a strict reference-only manifest with no private state or bytes", () => {
  const { root, store, transfer } = setup();
  try {
    const result = transfer.export();
    const json = JSON.stringify(result);
    assert.ok(
      !/SECRET|PRIVATE|base64|profile|workspace|messages|requests|transcript/.test(
        json,
      ),
    );
    assert.equal(result.schemaVersion, 1);
    assert.deepEqual(result.agents, [
      { agentId: "agent-1", deskId: "desk-1", avatar: null },
    ]);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("rotated assigned workstation and missing exact character round-trip transactionally with live identity unchanged", () => {
  const { root, store, transfer } = setup();
  try {
    const before = store.agents()[0];
    const input = manifest(transfer);
    const preview = transfer.preview(input);
    assert.ok(preview.diagnostics.some((d) => d.code === "missing-asset"));
    const saved = transfer.import({
      baseRevision: preview.baseRevision,
      manifest: input,
      bindings: preview.bindings,
    });
    assert.equal(saved.placements[0].rotation, 1);
    assert.deepEqual(store.agents()[0].avatar, refA);
    assert.deepEqual(
      { ...store.agents()[0], avatar: null, avatarId: "unassigned" },
      before,
    );
    const exported = transfer.export();
    assert.deepEqual(exported.agents[0].avatar, refA);
    assert.deepEqual(exported.placements, input.placements);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("unknown agent references persist unresolved across reload and re-export without creating agents", () => {
  const { root, path, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    input.agents[0].agentId = "unknown-source";
    const preview = transfer.preview(input);
    assert.equal(preview.bindings["unknown-source"], null);
    const saved = transfer.import({
      baseRevision: preview.baseRevision,
      manifest: input,
      bindings: preview.bindings,
    });
    assert.equal(store.agents().length, 1);
    assert.equal(saved.references?.[0].avatar?.version, "a");
    store.close();
    const reopened = new OfficeStore(path);
    assert.ok(
      new LayoutTransferService(reopened)
        .export()
        .agents.some(
          (ref) =>
            ref.agentId === "unknown-source" && ref.avatar?.version === "a",
        ),
    );
    reopened.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("incompatible schema, exact version, identifiers, relative paths, bounds and private fields fail before apply", () => {
  const { root, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    const current = new LayoutService(store).snapshot();
    for (const bad of [
      { ...input, schemaVersion: 2 },
      { ...input, workstationVersion: "other" },
      { ...input, assets: [{ ref: refA, path: "../secret.glb" }] },
      { ...input, assets: [{ ref: refA, path: "/absolute/model.glb" }] },
      { ...input, assets: [{ ref: { ...refA, version: "" } }] },
      { ...input, agents: [{ ...input.agents[0], agentId: "../../agent" }] },
      { ...input, placements: [newWorkstation("outside", [8, 0, 0])] },
      { ...input, workspace: "/private" },
    ])
      assert.throws(() => transfer.preview(bad), LayoutError);
    assert.deepEqual(new LayoutService(store).snapshot(), current);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("explicit bindings report displaced locals and reject duplicate or unknown targets", () => {
  const { root, store, transfer } = setup();
  try {
    store.save(agent("agent-2", "desk-2"), "create", "two");
    const input = manifest(transfer);
    input.agents = [input.agents[0]];
    input.agents[0].agentId = "source";
    const preview = transfer.preview(input, { source: "agent-2" });
    assert.ok(
      preview.diagnostics.some(
        (d) => d.code === "unassigned-local" && d.agentId === "agent-1",
      ),
    );
    transfer.import({
      baseRevision: preview.baseRevision,
      manifest: input,
      bindings: preview.bindings,
    });
    assert.equal(store.agents().find((a) => a.id === "agent-1")?.deskId, null);
    assert.equal(
      store.agents().find((a) => a.id === "agent-2")?.deskId,
      "desk-1",
    );
    assert.throws(
      () => transfer.preview(input, { source: "missing" }),
      LayoutError,
    );
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("stale imports reject and preserve current furniture, characters and requests", () => {
  const { root, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    const preview = transfer.preview(input);
    new LayoutService(store).save({
      baseRevision: preview.baseRevision,
      draft: {
        placements: input.placements,
        assignments: { "agent-1": "desk-1" },
      },
    });
    const before = store.agents()[0];
    assert.throws(
      () =>
        transfer.import({
          baseRevision: preview.baseRevision,
          manifest: input,
          bindings: preview.bindings,
        }),
      (error) => error instanceof LayoutError && error.status === 409,
    );
    assert.deepEqual(store.agents()[0], before);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("installed unreviewed and mismatched exact versions report placeholders without substituting", () => {
  const { root, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    const unreviewed = new LayoutTransferService(store, () => [
      { ref: refA } as CharacterPack,
    ]);
    assert.ok(
      unreviewed
        .preview(input)
        .diagnostics.some((d) => d.code === "unreviewed-asset"),
    );
    const mismatched = new LayoutTransferService(store, () => [
      { ref: refB } as CharacterPack,
    ]);
    assert.ok(
      mismatched
        .preview(input)
        .diagnostics.some((d) => d.code === "asset-version"),
    );
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("ordinary character reassignment after import remains current through save and corrupt layout recovery", () => {
  const { root, path, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    const preview = transfer.preview(input);
    transfer.import({
      baseRevision: preview.baseRevision,
      manifest: input,
      bindings: preview.bindings,
    });
    store.save(
      { ...store.agents()[0], avatar: refB, avatarId: refB.assetId },
      "avatar.assigned",
      "B",
    );
    assert.deepEqual(transfer.export().agents[0].avatar, refB);
    const layouts = new LayoutService(store);
    const current = layouts.snapshot();
    const latest = layouts.save({
      baseRevision: current.revision,
      draft: {
        placements: current.placements,
        assignments: current.assignments,
      },
    });
    const raw = new DatabaseSync(path);
    raw
      .prepare("UPDATE layout_revisions SET body=? WHERE revision=?")
      .run("{bad", latest.revision);
    raw.close();
    const recovered = layouts.snapshot();
    assert.equal(recovered.recoveredFrom, current.revision);
    assert.deepEqual(store.agents()[0].avatar, refB);
    assert.equal(store.agents()[0].requests[0].id, "r");
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("binding maps cannot satisfy explicit references through inherited object properties", () => {
  const { root, store, transfer } = setup();
  try {
    const input = manifest(transfer);
    input.agents[0].agentId = "constructor";
    assert.throws(() => transfer.preview(input, {}), LayoutError);
    const valid = transfer.preview(input, { constructor: null });
    assert.equal(valid.bindings.constructor, null);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("portable capacity includes locals and prevents later creation or generation growth", () => {
  const { root, store, transfer } = setup();
  try {
    const input = transfer.export();
    input.agents = Array.from({ length: 64 }, (_, i) => ({
      agentId: `foreign-${i}`,
      deskId: null,
      avatar: null,
    }));
    const before = store.agents();
    const revision = store.layoutSnapshot().revision;
    assert.throws(() => transfer.preview(input), /exceed the 64 portable/);
    assert.throws(
      () =>
        transfer.import({
          baseRevision: revision,
          manifest: input,
          bindings: Object.fromEntries(
            input.agents.map((ref) => [ref.agentId, null]),
          ),
        }),
      /exceed the 64 portable/,
    );
    assert.equal(store.layoutSnapshot().revision, revision);
    assert.deepEqual(store.agents(), before);
    input.agents.pop();
    for (let generation = 0; generation < 3; generation++) {
      const preview = transfer.preview(input);
      transfer.import({
        baseRevision: preview.baseRevision,
        manifest: input,
        bindings: preview.bindings,
      });
      const exported = transfer.export();
      assert.equal(exported.agents.length, 64);
      assert.ok(layoutManifestSchema.safeParse(exported).success);
      input.agents = exported.agents;
    }
    assert.throws(() => store.assertCanAddAgents(), /portable reference slots/);
    const full = store.layoutSnapshot();
    const events = store.revision();
    assert.throws(
      () => store.save(agent("new-local", null), "create", "over-capacity"),
      /portable reference slots/,
    );
    assert.deepEqual(store.agents(), before);
    assert.deepEqual(store.layoutSnapshot(), full);
    assert.equal(store.revision(), events);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing and incomplete bound desks survive fallback and only explicit assignment changes supersede them", () => {
  for (const incomplete of [false, true]) {
    const { root, store, transfer } = setup();
    try {
      const input = transfer.export();
      input.agents[0].deskId = "missing-desk";
      if (incomplete) {
        const desk = newWorkstation("missing-desk", [1, 0, 0]);
        desk.components.chair = false;
        input.placements = [desk];
      }
      const before = store.agents()[0];
      const preview = transfer.preview(input);
      assert.ok(preview.diagnostics.some((d) => d.code === "missing-desk"));
      transfer.import({
        baseRevision: preview.baseRevision,
        manifest: input,
        bindings: preview.bindings,
      });
      assert.equal(store.agents()[0].deskId, null);
      assert.deepEqual({ ...store.agents()[0], deskId: before.deskId }, before);
      let exported = transfer.export();
      assert.equal(exported.agents[0].deskId, "missing-desk");
      const repeated = transfer.preview(exported);
      assert.ok(repeated.diagnostics.some((d) => d.code === "missing-desk"));
      transfer.import({
        baseRevision: repeated.baseRevision,
        manifest: exported,
        bindings: repeated.bindings,
      });
      // Runtime updates, character reassignment and no-op layout saves are not desk choices.
      store.save(store.agents()[0], "runtime", "runtime");
      store.save(
        { ...store.agents()[0], avatar: refB, avatarId: refB.assetId },
        "avatar.assigned",
        "avatar",
      );
      const current = store.layoutSnapshot();
      store.saveLayout({
        baseRevision: current.revision,
        draft: {
          placements: current.placements,
          assignments: current.assignments,
        },
      });
      assert.equal(transfer.export().agents[0].deskId, "missing-desk");
      const latest = store.layoutSnapshot();
      store.saveLayout({
        baseRevision: latest.revision,
        draft: {
          placements: [newWorkstation("chosen", [1, 0, 0])],
          assignments: { "agent-1": "chosen" },
        },
      });
      assert.equal(transfer.export().agents[0].deskId, "chosen");
      store.save(
        { ...store.agents()[0], deskId: null },
        "desk.assigned",
        "unassign",
      );
      exported = transfer.export();
      assert.equal(exported.agents[0].deskId, null);
      assert.equal(store.agents()[0].requests[0].id, before.requests[0].id);
      assert.equal(store.agents()[0].turnId, before.turnId);
      store.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("agent creation after import consumes exactly one remaining portable slot", () => {
  const { root, store, transfer } = setup();
  try {
    const input = transfer.export();
    input.agents = Array.from({ length: 62 }, (_, i) => ({
      agentId: `foreign-${i}`,
      deskId: null,
      avatar: null,
    }));
    const preview = transfer.preview(input);
    transfer.import({
      baseRevision: preview.baseRevision,
      manifest: input,
      bindings: preview.bindings,
    });
    store.assertCanAddAgents();
    store.save(agent("new-local", null), "create", "new-local");
    assert.equal(transfer.export().agents.length, 64);
    assert.ok(layoutManifestSchema.safeParse(transfer.export()).success);
    assert.throws(
      () => store.save(agent("extra-local", null), "create", "extra-local"),
      /portable reference slots/,
    );
    assert.equal(store.agents().length, 2);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
