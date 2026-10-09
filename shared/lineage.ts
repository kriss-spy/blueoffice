/** Public identifier/outcome projection only; goals, reasoning and tool payloads are excluded. */
export interface CapturedChild {
  childStoredSessionId: string;
  parentEpoch: string;
  parentLiveSessionId: string;
  parentStoredSessionIds: string[];
  subagentId: string | null;
  status: "running" | "completed" | "failed" | "interrupted" | "unknown";
  terminal: boolean;
  at: string;
}
