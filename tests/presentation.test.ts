import test from "node:test";
import assert from "node:assert/strict";
import {
  presentAgent,
  type OfficeAgent,
  type PendingRequest,
} from "../shared/office";
import { CompletionTracker } from "../shared/presentation";
const agent = (overrides: Partial<OfficeAgent> = {}): OfficeAgent => ({
  id: "a",
  name: "Yuuka",
  model: "glm-5.3-flash",
  profileName: "p",
  profileHome: "/tmp/p",
  workspace: "/tmp",
  avatarId: "unassigned",
  deskId: "desk-1",
  lifecycle: "ready",
  work: "idle",
  freshness: "current",
  epoch: "e",
  liveSessionId: "s",
  storedSessionId: "stored",
  turnId: "t1",
  busy: false,
  conversations: [],
  messages: [],
  requests: [],
  receipts: [],
  error: null,
  createdAt: "2026-10-08",
  ...overrides,
});
const request = (overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  id: "q1",
  frameId: "wire-q1",
  epoch: "e",
  sessionId: "s",
  kind: "clarify",
  text: "Choose",
  choices: [],
  questions: [],
  state: "open",
  at: "2026-10-08",
  ...overrides,
});
const completed = (turnId = "t1", overrides: Partial<OfficeAgent> = {}) =>
  agent({
    work: "completed",
    turnId,
    terminal: { epoch: "e", turnId, outcome: "completed" },
    ...overrides,
  });

test("all live state labels preserve independent attention, work and freshness", () => {
  for (const [work, label] of Object.entries({
    idle: "Ready",
    working: "Working",
    tool: "Using a tool",
    interrupting: "Interrupting",
    completed: "Completed",
    interrupted: "Interrupted",
    failed: "Task failed",
    unknown: "Unknown",
  }))
    assert.equal(
      presentAgent(agent({ work: work as OfficeAgent["work"] })).label,
      label,
    );
  assert.equal(
    presentAgent(agent({ work: "failed", failureKind: "quota" })).label,
    "Provider limit reached",
  );
  for (const lifecycle of [
    "stopped",
    "starting",
    "stopping",
    "failed",
    "unknown",
  ] as const)
    assert.notEqual(presentAgent(agent({ lifecycle })).label, "Ready");
  const pending = agent({
    work: "tool",
    busy: true,
    requests: [
      request(),
      request({ id: "p1", kind: "approval", state: "delivered" }),
    ],
  });
  const view = presentAgent(pending);
  assert.equal(view.label, "Needs permission");
  assert.equal(view.detail, "Using a tool");
  assert.equal(view.pauseMotion, true);
  assert.equal(view.requests.length, 2);
  assert.match(presentAgent(pending, false).label, /Disconnected.*unknown/);
  assert.equal(presentAgent(pending, false).requests.length, 2);
  assert.equal(
    presentAgent(
      agent({
        requests: [
          request({ state: "resolved" }),
          request({ state: "expired" }),
        ],
      }),
    ).requests.length,
    0,
  );
  assert.equal(presentAgent(agent({ freshness: "unknown" })).pauseMotion, true);
});

test("completion cues have terminal identity, suppress replay and preempt for requests", () => {
  const tracker = new CompletionTracker();
  assert.deepEqual(tracker.observe([completed()], true), []); // history on initial load
  assert.deepEqual(tracker.observe([completed()], true), []);
  assert.deepEqual(
    tracker.observe([agent({ work: "working", turnId: "t2" })], true),
    [],
  );
  assert.deepEqual(tracker.observe([completed("t2")], true), ["a"]);
  assert.deepEqual(tracker.observe([completed("t2")], true), []);
  const blocked = completed("t3", { requests: [request()] });
  assert.deepEqual(tracker.observe([blocked], true), []);
  assert.deepEqual(tracker.observe([completed("t3")], true), []); // don't celebrate after the question disappears
  assert.deepEqual(tracker.observe([completed("t4")], false), []);
  assert.deepEqual(tracker.observe([completed("t4")], true), []); // reconnect doesn't celebrate stale evidence
  assert.equal(
    presentAgent(completed("t5", { turnId: "t6", work: "working" }))
      .canCelebrate,
    false,
  );
  assert.equal(presentAgent(agent({ work: "completed" })).canCelebrate, false); // display alone cannot invent a terminal turn
  assert.equal(
    presentAgent(completed("t6", { freshness: "unknown" })).canCelebrate,
    false,
  );
});
