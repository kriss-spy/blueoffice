import type { OfficeAgent } from "./office.js";

export interface HistoryProfile {
  id: string;
  name: string;
  /** Server-only trusted path. Never accepted from a browser or returned by the service. */
  home: string;
}
export interface HistoryQuery {
  category?: "chats" | "automation" | "all";
  agentId?: string;
  profileId?: string;
  source?: string;
  after?: string;
  before?: string;
  attention?: "attention" | "error";
  search?: string;
}
export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string | null;
}
export interface HistoryTool {
  id: string;
  name: string;
  context: string;
  at: string | null;
  outcome: "unknown" | "completed" | "failed" | "interrupted";
}
export interface HistoryMetrics {
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number | null;
  costUsd: number | null;
  costKind: "actual" | "estimated" | null;
}
export interface HistoryRecord {
  storedSessionId: string;
  title: string;
  source: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  parentStoredSessionId: string | null;
  metrics: HistoryMetrics;
}
export interface HistoryReadResult {
  records: HistoryRecord[];
  messages?: HistoryMessage[];
  tools?: HistoryTool[];
  truncated: boolean;
  capability: {
    reader: string;
    textSearch: "public-loaded";
    lineage: boolean;
    resume: boolean;
    resumeReason: string;
  };
}
export interface HistorySession extends HistoryRecord {
  id: string;
  profileId: string;
  profileName: string;
  agentId: string | null;
  agentName: string | null;
  liveSessionIds: string[];
  epochs: string[];
  ownership: "owned" | "observed";
  category: "chats" | "automation";
  state: string;
  attention: boolean;
  error: boolean;
  live: boolean;
  persisted: boolean;
  capability: HistoryReadResult["capability"];
}
export interface HistoryList {
  sessions: HistorySession[];
  profiles: { id: string; name: string }[];
  diagnostics: { profileId: string; profileName: string; message: string }[];
  truncated: boolean;
  searchScope: string;
}
export interface HistoryDetail {
  session: HistorySession;
  messages: HistoryMessage[];
  tools: HistoryTool[];
  truncated: boolean;
  controls: { prompt: false; interrupt: false; stop: false; reason: string };
}
export interface HistoryAccess {
  agents(): OfficeAgent[];
  profiles(): Promise<HistoryProfile[]>;
  read(
    profile: HistoryProfile,
    request: { storedSessionId?: string },
  ): Promise<HistoryReadResult>;
}
