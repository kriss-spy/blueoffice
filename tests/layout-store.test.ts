import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OfficeStore } from "../server/store.js";
import { LayoutService, LayoutError } from "../server/layout.js";
import type { OfficeAgent } from "../shared/office.js";
import { removePlacement } from "../shared/layout.js";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "blueoffice-layout-"));
  const path = join(root, "office.sqlite");
  return { root, path, store: new OfficeStore(path) };
}
function agent(): OfficeAgent {
  return {
    id: "agent-1",
    name: "Hina",
    profileName: "hina",
    profileHome: "/synthetic/hina",
    workspace: "/synthetic",
    model: "glm-5.3-flash",
    avatarId: "unassigned",
    deskId: "desk-1",
    lifecycle: "ready",
    work: "working",
    freshness: "current",
    epoch: "epoch-1",
    liveSessionId: "session-1",
    storedSessionId: "session-1",
    turnId: "turn-1",
    busy: true,
    conversations: [],
    messages: [],
    requests: [
      {
        id: "request-1",
        frameId: 1,
        epoch: "epoch-1",
        sessionId: "session-1",
        kind: "clarify",
        text: "Choose",
        choices: ["yes"],
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

test("layout save/reload is atomic with assignments and preserves live request state", () => {
  const { root, path, store } = setup();
  try {
    const before = agent();
    store.save(before, "created", "created");
    const service = new LayoutService(store);
    const first = service.snapshot();
    const next = service.save({
      baseRevision: first.revision,
      draft: removePlacement(first, "desk-1"),
    });
    assert.equal(next.assignments[before.id], null);
    const after = store.agents()[0];
    assert.deepEqual({ ...after, deskId: before.deskId }, before);
    const event = store.since(1)?.[0];
    assert.equal(event?.kind, "layout.assigned");
    store.close();
    const reopened = new OfficeStore(path);
    assert.deepEqual(new LayoutService(reopened).snapshot(), next);
    assert.deepEqual(reopened.agents()[0].requests, before.requests);
    reopened.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("stale editors and invalid assignments never partially persist", () => {
  const { root, store } = setup();
  try {
    store.save(agent(), "created", "created");
    const service = new LayoutService(store);
    const first = service.snapshot();
    service.save({
      baseRevision: first.revision,
      draft: removePlacement(first, "desk-2"),
    });
    assert.throws(
      () =>
        service.save({
          baseRevision: first.revision,
          draft: removePlacement(first, "desk-1"),
        }),
      (error) => error instanceof LayoutError && error.status === 409,
    );
    const current = service.snapshot();
    assert.throws(
      () =>
        service.save({
          baseRevision: current.revision,
          draft: {
            placements: current.placements,
            assignments: { "agent-1": "missing" },
          },
        }),
      (error) => error instanceof LayoutError && error.status === 422,
    );
    assert.equal(store.agents()[0].deskId, "desk-1");
    assert.deepEqual(service.snapshot(), current);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("new assistant assignment changes the revision so open editors cannot overwrite it", () => {
  const { root, store } = setup();
  try {
    const service = new LayoutService(store);
    const first = service.snapshot();
    store.save(agent(), "created", "created");
    assert.ok(service.snapshot().revision > first.revision);
    assert.throws(
      () => service.save({ baseRevision: first.revision, draft: first }),
      LayoutError,
    );
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("corrupt latest revision recovers previous valid assignments and keeps requests untouched", () => {
  const { root, path, store } = setup();
  try {
    const before = agent();
    store.save(before, "created", "created");
    const service = new LayoutService(store);
    const first = service.snapshot();
    const second = service.save({
      baseRevision: first.revision,
      draft: removePlacement(first, "desk-1"),
    });
    store.close();
    const raw = new DatabaseSync(path);
    raw
      .prepare("UPDATE layout_revisions SET body=? WHERE revision=?")
      .run('{"broken":', second.revision);
    raw.close();
    const restored = new OfficeStore(path);
    const recovered = new LayoutService(restored).snapshot();
    assert.equal(recovered.recoveredFrom, first.revision);
    assert.ok(recovered.revision > second.revision);
    assert.equal(restored.agents()[0].deskId, "desk-1");
    assert.deepEqual(restored.agents()[0].requests, before.requests);
    restored.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
