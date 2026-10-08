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
}
export interface PendingRequest {
  id: string;
  frameId: string | number;
  innerId?: string;
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
  epoch: string;
  liveSessionId: string;
  storedSessionId: string;
  storedSessionIds: string[];
  createdAt: string;
}
export interface OfficeAgent {
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
  if (agent.freshness === "unknown") return "Unknown";
  if (agent.lifecycle !== "ready")
    return {
      stopped: "Stopped",
      starting: "Starting",
      stopping: "Stopping",
      failed: "Startup failed",
      unknown: "Unknown",
    }[agent.lifecycle];
  const waiting = attention(agent);
  if (waiting.some((r) => r.kind === "approval")) return "Needs permission";
  if (waiting.length) return "Needs an answer";
  return {
    idle: "Ready",
    working: "Working",
    tool: "Using a tool",
    interrupting: "Interrupting",
    completed: "Completed",
    interrupted: "Interrupted",
    failed: "Task failed",
    unknown: "Unknown",
  }[agent.work];
}
