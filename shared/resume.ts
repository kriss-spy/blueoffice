import type { Target } from "./office.js";

export type ConversationTarget = Target | { epoch: null; sessionId: null };
export interface ResumePlan {
  requestedStoredSessionId: string;
  resolvedStoredSessionId: string;
  source: string;
  profileName: string;
  /** Binds native preflight to the owned-launch recheck; server only. */
  profileRevision: string;
}
export type ConversationAction =
  | { kind: "new" }
  | {
      kind: "resume";
      historyId: string;
      storedSessionId: string;
      profileId: string;
    };
