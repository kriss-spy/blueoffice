import type { LayoutSnapshot } from "./layout.js";
import type { AssetRef } from "./assets.js";
import type { ApprovalDecision } from "./approval.js";
import type { ModelId, RouteStatus } from "./routes.js";
export type Lifecycle =
  "stopped" | "starting" | "ready" | "stopping" | "failed" | "unknown";
export type Work =
  | "idle"
  | "working"
  | "tool"
  | "interrupting"
  | "completed"
  | "interrupted"
  | "failed"
  | "unknown";
export type Freshness = "current" | "unknown";
export type ReceiptState = "pending" | "accepted" | "failed" | "unknown";
export interface Receipt {
  id: string;
  action: string;
  state: ReceiptState;
  message: string;
  at: string;
}
export interface ChatItem {
  streamed?: boolean;
  id: string;
  epoch: string;
  turnId: string;
  role: "user" | "assistant" | "tool";
  text: string;
  state:
    "pending" | "streaming" | "complete" | "interrupted" | "failed" | "unknown";
  at: string;
  toolName?: string;
  chunkIds: string[];
}
export interface Question {
  qid: string;
  question: string;
  choices: string[];
  multiSelect: boolean;
  allowFreeText?: boolean;
  state?: "open" | "pending" | "locked" | "unknown";
  answer?: string;
}
export interface PendingRequest {
  id: string;
  frameId: string | number;
  innerId?: string;
  multiSelect?: boolean;
  allowFreeText?: boolean;
  answer?: string;
  responseSchema?: "hermes.clarify.v1" | "hermes.approval.v1";
  decision?: ApprovalDecision;
  freshness?: Freshness;
  epoch: string;
  sessionId: string;
  kind: "clarify" | "approval" | "unsupported";
  text: string;
  choices: string[];
  questions: Question[];
  state: "open" | "delivered" | "resolved" | "expired" | "lost";
  reason?: string;
  at: string;
}
export interface Conversation {
  resumedFrom?: {
    historyId: string;
    requestedStoredSessionId: string;
    resolvedStoredSessionId: string;
    source: string;
    profileName: string;
  };
  epoch: string;
  liveSessionId: string;
  storedSessionId: string;
  storedSessionIds: string[];
  createdAt: string;
}
export interface OfficeAgent {
  activeMessageId?: string | null;
  replay?: { epoch: string; sequence: number };
  terminal?: {
    epoch: string;
    turnId: string;
    outcome: "completed" | "interrupted" | "failed" | "unknown";
  };
  settingsVersion?: number;
  configRevision?: string;
  configHistory?: {
    revision: string;
    at: string;
    applied: string[];
    failed: string[];
  }[];
  model: ModelId;
  id: string;
  name: string;
  profileName: string;
  profileHome: string;
  workspace: string;
  avatarId: string;
  avatar?: AssetRef | null;
  deskId: string | null;
  lifecycle: Lifecycle;
  work: Work;
  freshness: Freshness;
  epoch: string | null;
  liveSessionId: string | null;
  storedSessionId: string | null;
  turnId: string | null;
  busy: boolean;
  conversations: Conversation[];
  messages: ChatItem[];
  requests: PendingRequest[];
  receipts: Receipt[];
  error: string | null;
  failureKind?:
    "quota" | "authentication" | "connection" | "route" | "turn" | null;
  createdAt: string;
}
export interface Snapshot {
  layout?: LayoutSnapshot;
  journalId?: string;
  pendingAdoptions?: { name: string; profileHome: string }[];
  routes: RouteStatus[];
  revision: number;
  agents: OfficeAgent[];
  mode: "live" | "fixture";
}
export interface Target {
  epoch: string;
  sessionId: string;
}
export function attention(agent: OfficeAgent) {
  return agent.requests.filter(
    (r) => r.state === "open" || r.state === "delivered",
  );
}
export function status(agent: OfficeAgent): string {
  return presentAgent(agent).label;
}

const workLabels = {
  idle: "Ready",
  working: "Working",
  tool: "Using a tool",
  interrupting: "Interrupting",
  completed: "Completed",
  interrupted: "Interrupted",
  failed: "Task failed",
  unknown: "Unknown",
} as const;

/** One projection for room, roster, chat and activity; decoration never changes it. */
export function presentAgent(agent: OfficeAgent, connected = true) {
  const requests = attention(agent);
  const current = connected && agent.freshness === "current";
  const workLabel = workLabels[agent.work];
  let label: string;
  let tone = "ready";
  if (!current || agent.lifecycle === "unknown") {
    label = connected ? "Status unknown" : "Disconnected · status unknown";
    tone = "unknown";
  } else if (agent.lifecycle !== "ready") {
    label = {
      stopped: "Stopped",
      starting: "Starting",
      stopping: "Stopping",
      failed: "Startup failed",
    }[agent.lifecycle];
    tone = agent.lifecycle === "failed" ? "failed" : "stopped";
  } else if (requests.length) {
    label = requests.some((r) => r.kind === "approval")
      ? "Needs permission"
      : requests.some((r) => r.kind === "clarify")
        ? "Needs an answer"
        : "Input unavailable";
    tone = requests.some((r) => r.kind === "approval")
      ? "approval"
      : "question";
  } else if (agent.failureKind === "quota" && agent.work === "failed") {
    label = "Provider limit reached";
    tone = "failed";
  } else {
    label = workLabel;
    tone = ["failed", "unknown"].includes(agent.work)
      ? agent.work
      : agent.work === "completed"
        ? "completed"
        : agent.busy
          ? "working"
          : "ready";
  }
  const detail =
    requests.length && label !== workLabel
      ? current
        ? workLabel
        : `Last known: ${workLabel}`
      : "";
  const terminalKey = agent.terminal
    ? `${agent.id}:${agent.terminal.epoch}:${agent.terminal.turnId}`
    : undefined;
  const canCelebrate =
    current &&
    agent.lifecycle === "ready" &&
    !requests.length &&
    agent.work === "completed" &&
    agent.terminal?.outcome === "completed" &&
    agent.terminal.epoch === agent.epoch &&
    agent.terminal.turnId === agent.turnId;
  return {
    label,
    detail,
    tone,
    requests,
    current,
    terminalKey,
    canCelebrate,
    pauseMotion: !current || agent.lifecycle !== "ready" || requests.length > 0,
  };
}
