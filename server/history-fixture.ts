import type { HistoryRecord } from "../shared/history.js";

/** Disposable public histories for source-aware browser acceptance. */
export function historyFixture() {
  const records: HistoryRecord[] = [
    {
      storedSessionId: "cli-history-fixture",
      title: "CLI plan from yesterday",
      source: "cli",
      startedAt: "2026-10-01T08:00:00Z",
      lastActivityAt: "2026-10-01T08:05:00Z",
      endedAt: null,
      endReason: null,
      parentStoredSessionId: null,
      metrics: {
        inputTokens: null,
        outputTokens: null,
        calls: null,
        costUsd: null,
        costKind: null,
      },
    },
    {
      storedSessionId: "automation-history-fixture",
      title: "Scheduled summary",
      source: "cron",
      startedAt: "2026-10-02T08:00:00Z",
      lastActivityAt: "2026-10-02T08:05:00Z",
      endedAt: "2026-10-02T08:05:00Z",
      endReason: "error",
      parentStoredSessionId: null,
      metrics: {
        inputTokens: 20,
        outputTokens: 10,
        calls: 1,
        costUsd: null,
        costKind: null,
      },
    },
  ];
  return {
    records,
    messages: {
      "cli-history-fixture": [
        {
          id: "cli-1",
          role: "user",
          text: "Find the cobalt notebook",
          at: "2026-10-01T08:00:00Z",
        },
        {
          id: "cli-2",
          role: "assistant",
          text: "The public plan is available for inspection.",
          at: "2026-10-01T08:05:00Z",
        },
      ],
      "automation-history-fixture": [
        {
          id: "cron-1",
          role: "user",
          text: "Summarize the scheduled report",
          at: "2026-10-02T08:00:00Z",
        },
      ],
    },
    tools: {
      "cli-history-fixture": [
        {
          id: "cli-tool",
          name: "read_file",
          context: "notes.md",
          at: "2026-10-01T08:03:00Z",
          outcome: "unknown",
        },
      ],
    },
  };
}
