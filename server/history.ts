import { createHash } from "node:crypto";
import type { OfficeAgent } from "../shared/office.js";
import { attention, presentAgent } from "../shared/office.js";
import type {
  HistoryAccess,
  HistoryDetail,
  HistoryList,
  HistoryProfile,
  HistoryQuery,
  HistoryReadResult,
  HistoryRecord,
  HistorySession,
} from "../shared/history.js";

export class HistoryError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
const emptyMetrics = () => ({
  inputTokens: null,
  outputTokens: null,
  calls: null,
  costUsd: null,
  costKind: null,
});
const officeCapability: HistoryReadResult["capability"] = {
  reader: "office-public-events-v1",
  textSearch: "public-loaded",
  lineage: false,
  resume: false,
  resumeReason: "Resume capability has not been verified for this history.",
};
const key = (profile: string, stored: string) =>
  createHash("sha256")
    .update(JSON.stringify([profile, stored]))
    .digest("hex");
const automation = (source: string) =>
  /^(cron|automation|kanban|tool|subagent|scheduled|one.?shot)$/i.test(source);
const historicalState = (row: HistoryRecord) => {
  if (!row.endedAt) return "Unknown outcome";
  if (/error|fail/i.test(row.endReason ?? "")) return "Failed";
  if (/interrupt|cancel/i.test(row.endReason ?? "")) return "Interrupted";
  // Session closure is not proof that every task completed successfully.
  return "Ended";
};

/** Read-only index. Every lookup is re-scoped to trusted discovered profiles. */
export class HistoryService {
  constructor(private access: HistoryAccess) {}
  private async index() {
    const agents = this.access.agents();
    const profiles = await this.access.profiles();
    const sessions = new Map<string, HistorySession>();
    const diagnostics: HistoryList["diagnostics"] = [];
    let truncated = false;
    const reads = await Promise.allSettled(
      profiles.map((profile) => this.access.read(profile, {})),
    );
    profiles.forEach((profile, index) => {
      const read = reads[index];
      if (read.status === "rejected") {
        diagnostics.push({
          profileId: profile.id,
          profileName: profile.name,
          message:
            "History is unavailable for this profile. Check its database and supported Hermes revision; no history was changed.",
        });
        return;
      }
      truncated ||= read.value.truncated;
      for (const row of read.value.records) {
        if (
          !row ||
          typeof row.storedSessionId !== "string" ||
          !row.storedSessionId
        ) {
          diagnostics.push({
            profileId: profile.id,
            profileName: profile.name,
            message:
              "A malformed history row was omitted. Inspect this profile with Hermes before retrying.",
          });
          continue;
        }
        const owner = agents.find(
          (a) =>
            a.profileHome === profile.home &&
            a.conversations.some(
              (c) =>
                c.storedSessionIds.includes(row.storedSessionId) ||
                c.storedSessionId === row.storedSessionId,
            ),
        );
        const session = this.project(
          profile,
          row,
          owner,
          read.value.capability,
          true,
        );
        sessions.set(session.id, session);
      }
    });
    for (const agent of agents) {
      const profile = profiles.find((p) => p.home === agent.profileHome);
      if (!profile) continue;
      for (const conversation of agent.conversations) {
        const ids = [
          ...new Set([
            conversation.storedSessionId,
            ...conversation.storedSessionIds,
          ]),
        ].filter(Boolean);
        for (const storedSessionId of ids) {
          const id = key(profile.id, storedSessionId);
          if (sessions.has(id)) continue;
          const row: HistoryRecord = {
            storedSessionId,
            title: `${agent.name} conversation`,
            source: "blueoffice",
            startedAt: conversation.createdAt,
            lastActivityAt:
              agent.messages
                .filter((m) => m.epoch === conversation.epoch)
                .at(-1)?.at ?? conversation.createdAt,
            endedAt: null,
            endReason: null,
            parentStoredSessionId: null,
            metrics: emptyMetrics(),
          };
          sessions.set(
            id,
            this.project(profile, row, agent, officeCapability, false),
          );
        }
      }
    }
    return { profiles, sessions, diagnostics, truncated };
  }
  private project(
    profile: HistoryProfile,
    row: HistoryRecord,
    owner: OfficeAgent | undefined,
    capability: HistoryReadResult["capability"],
    persisted: boolean,
  ): HistorySession {
    const conversations =
      owner?.conversations.filter(
        (c) =>
          c.storedSessionId === row.storedSessionId ||
          c.storedSessionIds.includes(row.storedSessionId),
      ) ?? [];
    const live =
      !!owner &&
      owner.freshness === "current" &&
      owner.lifecycle === "ready" &&
      conversations.some(
        (c) =>
          c.epoch === owner.epoch && c.liveSessionId === owner.liveSessionId,
      );
    const needsAttention = live && attention(owner!).length > 0;
    const state = live ? presentAgent(owner!).label : historicalState(row);
    return {
      ...row,
      id: key(profile.id, row.storedSessionId),
      profileId: profile.id,
      profileName: profile.name,
      agentId: owner?.id ?? null,
      agentName: owner?.name ?? null,
      liveSessionIds: [...new Set(conversations.map((c) => c.liveSessionId))],
      epochs: [...new Set(conversations.map((c) => c.epoch))],
      ownership: owner ? "owned" : "observed",
      category: automation(row.source) ? "automation" : "chats",
      state,
      attention: needsAttention,
      error:
        state === "Failed" ||
        (live && (owner!.work === "failed" || !!owner!.error)),
      live,
      persisted,
      capability,
    };
  }
  async list(query: HistoryQuery = {}): Promise<HistoryList> {
    const index = await this.index();
    const search = query.search?.trim().toLocaleLowerCase() ?? "";
    const after = query.after ? Date.parse(query.after) : null;
    const before = query.before ? Date.parse(query.before) : null;
    if (
      (after !== null && !Number.isFinite(after)) ||
      (before !== null && !Number.isFinite(before))
    )
      throw new HistoryError(
        "Choose valid dates for the history time filter.",
        400,
      );
    if (search.length > 200)
      throw new HistoryError(
        "History search is limited to 200 characters.",
        400,
      );
    const sessions = [...index.sessions.values()].filter((row) => {
      const at = Date.parse(row.lastActivityAt ?? row.startedAt ?? "");
      return (
        (!query.category ||
          query.category === "all" ||
          row.category === query.category) &&
        (!query.agentId || row.agentId === query.agentId) &&
        (!query.profileId || row.profileId === query.profileId) &&
        (!query.source || row.source === query.source) &&
        (after === null || at >= after) &&
        (before === null || at <= before) &&
        (!query.attention ||
          (query.attention === "attention" ? row.attention : row.error))
      );
    });
    sessions.sort(
      (a, b) =>
        (Date.parse(b.lastActivityAt ?? b.startedAt ?? "") || 0) -
        (Date.parse(a.lastActivityAt ?? a.startedAt ?? "") || 0),
    );
    const searched: HistorySession[] = [];
    let publicSearchReads = 0;
    for (const row of sessions) {
      if (
        !search ||
        [row.title, row.storedSessionId, row.agentName ?? "", row.source]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search)
      )
        searched.push(row);
      else {
        if (publicSearchReads >= 25) {
          index.truncated = true;
          continue;
        }
        publicSearchReads++;
        try {
          const detail = await this.readDetail(row, index.profiles);
          if (
            [
              ...detail.messages.map((m) => m.text),
              ...detail.tools.map((t) => `${t.name} ${t.context}`),
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(search)
          )
            searched.push(row);
          index.truncated ||= detail.truncated;
        } catch {
          index.truncated = true;
          if (!index.diagnostics.some((d) => d.profileId === row.profileId))
            index.diagnostics.push({
              profileId: row.profileId,
              profileName: row.profileName,
              message:
                "Public transcript search is incomplete for this profile. Refresh history and inspect the session directly.",
            });
        }
      }
    }
    searched.sort(
      (a, b) =>
        (Date.parse(b.lastActivityAt ?? b.startedAt ?? "") || 0) -
          (Date.parse(a.lastActivityAt ?? a.startedAt ?? "") || 0) ||
        a.id.localeCompare(b.id),
    );
    return {
      sessions: searched,
      profiles: index.profiles.map(({ id, name }) => ({ id, name })),
      diagnostics: index.diagnostics,
      truncated: index.truncated,
      searchScope:
        "Search covers all loaded titles and identifiers, plus the bounded public conversation/tool pages of up to 25 newest matching sessions. Narrow the agent, profile, source or time filters for older transcripts. Private reasoning and hidden rows are excluded.",
    };
  }
  async detail(id: string): Promise<HistoryDetail> {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new HistoryError(
        "History selection is invalid. Refresh Activity and select a listed session.",
        400,
      );
    const index = await this.index();
    const row = index.sessions.get(id);
    if (!row)
      throw new HistoryError(
        "This history is no longer available. Refresh Activity and check the profile diagnostics.",
        404,
      );
    return this.readDetail(row, index.profiles);
  }
  private async readDetail(
    session: HistorySession,
    profiles: HistoryProfile[],
  ): Promise<HistoryDetail> {
    let messages: HistoryDetail["messages"] = [];
    let tools: HistoryDetail["tools"] = [];
    let truncated = false;
    if (session.persisted) {
      const profile = profiles.find((p) => p.id === session.profileId)!;
      const read = await this.access.read(profile, {
        storedSessionId: session.storedSessionId,
      });
      if (
        !read.records.some((r) => r.storedSessionId === session.storedSessionId)
      )
        throw new HistoryError(
          "This stored history was removed. Refresh Activity.",
          404,
        );
      messages = read.messages ?? [];
      tools = read.tools ?? [];
      truncated = read.truncated;
    } else {
      const owner = this.access.agents().find((a) => a.id === session.agentId);
      const rows =
        owner?.messages.filter((m) => session.epochs.includes(m.epoch)) ?? [];
      messages = rows
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          text: m.text,
          at: m.at,
        }));
      tools = rows
        .filter((m) => m.role === "tool")
        .map((m) => ({
          id: m.id,
          name: m.toolName ?? "tool",
          context: m.text,
          at: m.at,
          outcome:
            m.state === "complete"
              ? "completed"
              : ["failed", "interrupted"].includes(m.state)
                ? (m.state as "failed" | "interrupted")
                : "unknown",
        }));
    }
    return {
      session,
      messages,
      tools,
      truncated,
      controls: {
        prompt: false,
        interrupt: false,
        stop: false,
        reason:
          session.ownership === "observed"
            ? "Observed history does not establish ownership of a live process. Live controls are unavailable."
            : "History inspection never changes the foreground session. Use the agent's live chat for controls.",
      },
    };
  }
}
