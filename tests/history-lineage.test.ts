import test from "node:test";
import assert from "node:assert/strict";
import { captureChild } from "../server/history-lineage.js";
import { HistoryService } from "../server/history.js";
import type { OfficeAgent } from "../shared/office.js";
import type { HistoryRecord } from "../shared/history.js";
const context = {
  epoch: "epoch",
  liveSessionId: "live",
  storedSessionIds: ["parent"],
  at: "2026-10-09T00:00:00Z",
};
test("out-of-order starts and duplicate completions preserve terminal evidence; conflicts remain unknown", () => {
  const done = captureChild(
    [],
    "subagent.complete",
    { child_session_id: "child", status: "completed" },
    context,
  )!;
  assert.equal(
    captureChild(
      done,
      "subagent.start",
      { child_session_id: "child" },
      context,
    ),
    done,
  );
  assert.equal(
    captureChild(
      done,
      "subagent.complete",
      { child_session_id: "child", status: "completed" },
      context,
    ),
    done,
  );
  const conflict = captureChild(
    done,
    "subagent.complete",
    { child_session_id: "child", status: "failed" },
    context,
  )!;
  assert.equal(conflict[0].status, "unknown");
  assert.equal(
    captureChild([], "subagent.start", { child_session_id: {} }, context),
    undefined,
  );
  assert.equal(
    captureChild(
      done,
      "subagent.complete",
      { child_session_id: "child", status: "failed" },
      { ...context, liveSessionId: "other" },
    ),
    undefined,
  );
});
test("typed same-profile lineage filters by parent while children remain observed and missing completion stays unknown", async () => {
  const metrics = {
    inputTokens: null,
    outputTokens: null,
    calls: null,
    costUsd: null,
    costKind: null,
  };
  const record = (id: string, source = "cli"): HistoryRecord => ({
    storedSessionId: id,
    title: id,
    source,
    startedAt: null,
    lastActivityAt: null,
    endedAt: "2026-10-09",
    endReason: "agent_close",
    parentStoredSessionId: null,
    metrics,
  });
  const parent = record("parent");
  const child = {
    ...record("child", "subagent"),
    parentStoredSessionId: "parent",
    lineageEvidence: "native-delegate-marker" as const,
  };
  const missing = { ...child, storedSessionId: "missing" };
  const orphan = {
    ...child,
    storedSessionId: "orphan",
    parentStoredSessionId: "not-in-profile",
  };
  const agent = {
    id: "owner",
    name: "Hina",
    profileHome: "trusted",
    conversations: [
      {
        epoch: "epoch",
        liveSessionId: "live",
        storedSessionId: "parent",
        storedSessionIds: ["parent"],
      },
    ],
    historyChildren: captureChild(
      [],
      "subagent.complete",
      { child_session_id: "child", status: "completed" },
      context,
    ),
    freshness: "unknown",
    lifecycle: "stopped",
  } as unknown as OfficeAgent;
  const history = new HistoryService({
    agents: () => [agent],
    profiles: async () => [{ id: "p", name: "P", home: "trusted" }],
    read: async () => ({
      records: [parent, child, missing, orphan],
      truncated: false,
      capability: {
        reader: "native",
        textSearch: "public-loaded",
        lineage: true,
        resume: false,
        resumeReason: "",
      },
    }),
  });
  const list = await history.list({ agentId: "owner" });
  assert.deepEqual(
    new Set(list.sessions.map((s) => s.storedSessionId)),
    new Set(["parent", "child", "missing"]),
  );
  const row = list.sessions.find((s) => s.storedSessionId === "child")!;
  assert.equal(row.state, "Completed");
  assert.equal(row.ownership, "observed");
  assert.equal(row.agentId, null);
  assert.equal(row.capability.resume, false);
  assert.equal(
    list.sessions.find((s) => s.storedSessionId === "missing")!.state,
    "Unknown outcome",
  );
  const detail = await history.detail(
    list.sessions.find((s) => s.storedSessionId === "parent")!.id,
  );
  assert.equal(detail.children?.length, 2);
  await assert.rejects(history.ownedResumeTarget(row.id, "owner"), /External/);
  const all = await history.list();
  assert.equal(
    all.sessions.find((s) => s.storedSessionId === "orphan")!.lineage
      ?.parentAgentId,
    null,
  );
});

test("native child frames persist bounded metadata without changing foreground or private payload", async (t) => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Office } = await import("../server/office.js");
  const { OfficeStore } = await import("../server/store.js");
  const { FixtureRuntime } = await import("../server/fixture-runtime.js");
  const root = await mkdtemp(join(tmpdir(), "lineage-office-"));
  const store = new OfficeStore(join(root, "office.db"));
  const office = new Office(store, new FixtureRuntime(root));
  t.after(async () => {
    await office.shutdown();
    store.close();
  });
  const created = await office.create("Hina", root);
  await office.start(created.id);
  const view = office as unknown as {
    get(id: string): OfficeAgent;
    runtimes: Map<string, import("../server/rpc.js").RpcChild>;
    frame(
      agent: OfficeAgent,
      rpc: import("../server/rpc.js").RpcChild,
      frame: import("../server/rpc.js").Frame,
    ): void;
  };
  const agent = view.get(created.id),
    rpc = view.runtimes.get(created.id)!;
  const before = office.snapshot().agents[0];
  const event = (type: string, status?: string) =>
    view.frame(agent, rpc, {
      jsonrpc: "2.0",
      method: "event",
      params: {
        type,
        session_id: agent.liveSessionId,
        payload: {
          child_session_id: "child",
          status,
          goal: "PRIVATE_REASONING_CANARY",
          summary: "PRIVATE_SUMMARY_CANARY",
        },
      },
    });
  event("subagent.complete", "completed");
  event("subagent.start");
  event("subagent.complete", "completed");
  const after = office.snapshot().agents[0];
  const { historyChildren, ...foreground } = after;
  assert.deepEqual(foreground, before);
  assert.equal(historyChildren?.length, 1);
  assert.equal(historyChildren?.[0].status, "completed");
  assert.doesNotMatch(JSON.stringify(historyChildren), /PRIVATE_/);
  assert.deepEqual(store.agents()[0].historyChildren, historyChildren);
  for (let i = 0; i < 501; i++) {
    const records = captureChild(
      historyChildren ?? [],
      "subagent.start",
      { child_session_id: `bounded-${i}` },
      context,
    )!;
    historyChildren!.splice(0, historyChildren!.length, ...records);
  }
  assert.equal(historyChildren!.length, 500);
  const parents = captureChild(
    [],
    "subagent.start",
    { child_session_id: "child" },
    {
      ...context,
      storedSessionIds: [
        ...Array.from({ length: 100 }, (_, i) => `parent-${i}`),
        "current-parent",
      ],
    },
  )![0].parentStoredSessionIds;
  assert.equal(parents.length, 32);
  assert.equal(parents.at(-1), "current-parent");
});

test("identical stored IDs across profiles and unsupported lineage capability cannot establish an owned parent", async () => {
  const metrics = {
    inputTokens: null,
    outputTokens: null,
    calls: null,
    costUsd: null,
    costKind: null,
  };
  const parent = {
    storedSessionId: "parent",
    title: "parent",
    source: "cli",
    startedAt: null,
    lastActivityAt: null,
    endedAt: null,
    endReason: null,
    parentStoredSessionId: null,
    metrics,
  };
  const child = {
    ...parent,
    storedSessionId: "child",
    source: "subagent",
    parentStoredSessionId: "parent",
    lineageEvidence: "native-delegate-marker" as const,
  };
  const owner = {
    id: "owner",
    name: "Hina",
    profileHome: "owned-home",
    conversations: [
      {
        epoch: "epoch",
        liveSessionId: "live",
        storedSessionId: "parent",
        storedSessionIds: ["parent"],
      },
    ],
    historyChildren: captureChild(
      [],
      "subagent.complete",
      { child_session_id: "child", status: "completed" },
      context,
    ),
    freshness: "unknown",
    lifecycle: "stopped",
  } as unknown as OfficeAgent;
  const history = new HistoryService({
    agents: () => [owner],
    profiles: async () => [
      { id: "owned", name: "Owned", home: "owned-home" },
      { id: "foreign", name: "Foreign", home: "foreign-home" },
    ],
    read: async (p) => ({
      records: p.id === "owned" ? [parent, child] : [child],
      truncated: false,
      capability: {
        reader: "test",
        textSearch: "public-loaded",
        lineage: p.id !== "owned",
        resume: false,
        resumeReason: "unsupported",
      },
    }),
  });
  const list = await history.list();
  const ownChild = list.sessions.find(
    (s) => s.profileId === "owned" && s.storedSessionId === "child",
  )!;
  assert.equal(ownChild.lineage, undefined);
  assert.equal(ownChild.state, "Unknown outcome");
  assert.equal(ownChild.capability.resume, false);
  const foreign = list.sessions.find((s) => s.profileId === "foreign")!;
  assert.equal(foreign.lineage?.parentAgentId, null);
  assert.equal(foreign.lineage?.outcome, "unknown");
  assert.deepEqual(
    (await history.list({ agentId: "owner" })).sessions.map(
      (s) => s.storedSessionId,
    ),
    ["parent"],
  );
});
