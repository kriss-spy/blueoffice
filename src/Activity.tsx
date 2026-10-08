import { useEffect, useRef, useState } from "react";
import type { OfficeAgent } from "../shared/office";
import { attention } from "../shared/office";
import type {
  HistoryDetail,
  HistoryList,
  HistoryQuery,
} from "../shared/history";
import "./history.css";

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      "History is unavailable. Refresh Activity and check the profile diagnostics.",
    );
  return response.json() as Promise<T>;
}
const date = (at: string | null) =>
  at ? new Date(at).toLocaleString() : "Unavailable";
const value = (number: number | null) =>
  number === null ? "Unavailable" : String(number);

/** Pinned inspection is local UI state; it never changes the office foreground. */
export function Activity({
  agents,
  revision,
  connected,
}: {
  agents: OfficeAgent[];
  revision: number;
  connected: boolean;
}) {
  const [query, setQuery] = useState<HistoryQuery>({ category: "all" });
  const [list, setList] = useState<HistoryList | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newAttention, setNewAttention] = useState<string[]>([]);
  const seenAttention = useRef(
    new Set(agents.flatMap((a) => attention(a).map((r) => `${a.id}:${r.id}`))),
  );
  const attentionKey = agents
    .flatMap((a) => attention(a).map((r) => `${a.id}:${r.id}`))
    .join("\n");
  useEffect(() => {
    const current = attentionKey ? attentionKey.split("\n") : [];
    const fresh = current.filter((id) => !seenAttention.current.has(id));
    if (fresh.length)
      setNewAttention((old) => [...new Set([...old, ...fresh])]);
    seenAttention.current = new Set(current);
  }, [attentionKey]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams(
        Object.entries({
          ...query,
          ...(query.after
            ? { after: new Date(query.after).toISOString() }
            : {}),
          ...(query.before
            ? { before: new Date(query.before).toISOString() }
            : {}),
        }).filter(([, v]) => !!v),
      );
      read<HistoryList>(`/api/history?${params}`, controller.signal)
        .then((next) => {
          setList(next);
          setError("");
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "History could not be loaded.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, revision, refresh]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError("");
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    read<HistoryDetail>(
      `/api/history/${encodeURIComponent(selected)}`,
      controller.signal,
    )
      .then(setDetail)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setDetailError(
            cause instanceof Error
              ? cause.message
              : "History detail could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [selected, refresh]);
  const filter = <K extends keyof HistoryQuery>(
    field: K,
    next: HistoryQuery[K],
  ) => setQuery((old) => ({ ...old, [field]: next || undefined }));
  const sources = [...new Set(list?.sessions.map((s) => s.source) ?? [])];
  return (
    <section className="history-panel" aria-label="Activity">
      <div className="history-heading">
        <h2>Activity</h2>
        <button onClick={() => setRefresh((n) => n + 1)}>
          Refresh history
        </button>
      </div>
      {!connected && (
        <p role="status">
          Disconnected. History inspection remains available; live status is
          unknown.
        </p>
      )}
      {newAttention.length > 0 && (
        <div className="history-attention" role="status">
          {newAttention.length} new attention{" "}
          {newAttention.length === 1 ? "request" : "requests"} in live chat.
          Historical selection is pinned.{" "}
          <button onClick={() => setNewAttention([])}>
            Dismiss attention notice
          </button>
        </div>
      )}
      <div className="history-tabs" role="group" aria-label="History category">
        {(
          [
            ["chats", "Chats"],
            ["automation", "Automation"],
            ["all", "All"],
          ] as const
        ).map(([category, label]) => (
          <button
            key={category}
            aria-pressed={query.category === category}
            onClick={() => filter("category", category)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="history-filters">
        <label>
          Agent
          <select
            value={query.agentId ?? ""}
            onChange={(e) => filter("agentId", e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profile
          <select
            value={query.profileId ?? ""}
            onChange={(e) => filter("profileId", e.target.value)}
          >
            <option value="">All profiles</option>
            {list?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select
            value={query.source ?? ""}
            onChange={(e) => filter("source", e.target.value)}
          >
            <option value="">All sources</option>
            {[
              ...new Set([...sources, ...(query.source ? [query.source] : [])]),
            ].map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
        </label>
        <label>
          State
          <select
            value={query.attention ?? ""}
            onChange={(e) =>
              filter("attention", e.target.value as HistoryQuery["attention"])
            }
          >
            <option value="">All states</option>
            <option value="attention">Needs attention</option>
            <option value="error">Errors</option>
          </select>
        </label>
        <label>
          From (local time)
          <input
            type="datetime-local"
            value={query.after ?? ""}
            onChange={(e) => filter("after", e.target.value)}
          />
        </label>
        <label>
          Until (local time)
          <input
            type="datetime-local"
            value={query.before ?? ""}
            onChange={(e) => filter("before", e.target.value)}
          />
        </label>
        <label className="history-search">
          Search public history
          <input
            type="search"
            maxLength={200}
            value={query.search ?? ""}
            onChange={(e) => filter("search", e.target.value)}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {list?.diagnostics.map((d) => (
        <p role="alert" key={d.profileId}>
          {d.profileName}: {d.message}
        </p>
      ))}
      <p className="history-search-scope">
        {list?.searchScope ?? "Search covers public history only."}{" "}
        {list?.truncated && "Some history is outside the loaded page."}
      </p>
      <div className="history-columns">
        <div
          className="history-list"
          aria-label="History sessions"
          aria-busy={loading}
        >
          {list?.sessions.map((session) => (
            <button
              className="history-row"
              key={session.id}
              aria-pressed={selected === session.id}
              onClick={() => setSelected(session.id)}
            >
              <strong>{session.title || "Untitled session"}</strong>
              <span>
                {session.agentName ?? "External session"} ·{" "}
                {session.profileName} · {session.source}
              </span>
              <span>
                {session.ownership === "observed" ? "Observed" : "Owned"} ·{" "}
                {session.state}
              </span>
              <span>Started {date(session.startedAt)}</span>
              <span>Last activity {date(session.lastActivityAt)}</span>
            </button>
          ))}
          {list && !list.sessions.length && (
            <p>No sessions match these filters.</p>
          )}
        </div>
        <section className="history-detail" aria-label="History inspection">
          {!selected && (
            <p>
              Select a session to inspect its public history. Your running
              conversation stays in place.
            </p>
          )}
          {detailError && <p role="alert">{detailError}</p>}
          {selected && !detail && !detailError && (
            <p role="status">Loading history inspection…</p>
          )}
          {detail && (
            <>
              <h3>{detail.session.title || "Untitled session"}</h3>
              <p>
                {detail.session.ownership === "observed" ? "Observed" : "Owned"}{" "}
                · {detail.session.state} · {detail.session.source}
              </p>
              <dl className="history-identifiers">
                <dt>Office agent</dt>
                <dd>
                  {detail.session.agentName ?? "No correlated office agent"}
                  {detail.session.agentId && ` (${detail.session.agentId})`}
                </dd>
                <dt>Profile</dt>
                <dd>{detail.session.profileName}</dd>
                <dt>Stored history ID</dt>
                <dd>{detail.session.storedSessionId}</dd>
                <dt>Live Hermes IDs</dt>
                <dd>
                  {detail.session.liveSessionIds.join(", ") ||
                    "No evidenced live binding"}
                </dd>
                <dt>Owner epochs</dt>
                <dd>{detail.session.epochs.join(", ") || "Unavailable"}</dd>
                <dt>Persistence</dt>
                <dd>
                  {detail.session.persisted
                    ? "Stored history"
                    : "Not yet persisted · public office events"}
                </dd>
                <dt>Reader provenance</dt>
                <dd>{detail.session.capability.reader}</dd>
                <dt>Input tokens</dt>
                <dd>{value(detail.session.metrics.inputTokens)}</dd>
                <dt>Output tokens</dt>
                <dd>{value(detail.session.metrics.outputTokens)}</dd>
                <dt>API calls</dt>
                <dd>{value(detail.session.metrics.calls)}</dd>
                <dt>Cost</dt>
                <dd>
                  {detail.session.metrics.costUsd === null
                    ? "Unavailable"
                    : `$${detail.session.metrics.costUsd} (${detail.session.metrics.costKind})`}
                </dd>
                <dt>Lineage</dt>
                <dd>
                  {detail.session.capability.lineage
                    ? "Evidenced identifiers available"
                    : "Unsupported · lineage has not been captured for this revision"}
                </dd>
              </dl>
              <p>{detail.controls.reason}</p>
              <div className="history-controls" aria-label="History controls">
                <button disabled>Prompt</button>
                <button disabled>Interrupt</button>
                <button disabled>Stop</button>
                <button disabled title={detail.session.capability.resumeReason}>
                  Resume
                </button>
              </div>
              <p>{detail.session.capability.resumeReason}</p>
              {detail.truncated && (
                <p role="status">
                  This is a bounded public history page. Earlier messages are
                  unavailable in this view.
                </p>
              )}
              <h4>Public conversation</h4>
              {detail.messages.length ? (
                detail.messages.map((message) => (
                  <article className="history-message" key={message.id}>
                    <strong>
                      {message.role === "user" ? "You" : "Assistant"}
                    </strong>
                    <p>{message.text}</p>
                  </article>
                ))
              ) : (
                <p>No public messages are available.</p>
              )}
              <h4>Tool timeline</h4>
              {detail.tools.length ? (
                <ol>
                  {detail.tools.map((tool) => (
                    <li key={tool.id}>
                      <strong>{tool.name}</strong> ·{" "}
                      {tool.outcome === "unknown"
                        ? "Outcome unknown"
                        : tool.outcome}
                      <p>{tool.context}</p>
                      <small>
                        {date(tool.at)} · {tool.id}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No public tool activity is available.</p>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
