import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Snapshot } from "../shared/office";
import { attention, status } from "../shared/office";
import { command, session } from "./api";
import { Chat } from "./Chat";

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    revision: 0,
    routes: [],
    agents: [],
    mode: "live",
  });
  const [selected, setSelected] = useState(
    () => localStorage.getItem("blueoffice.selected.v1") ?? "",
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const agents = snapshot.agents;
  const agent = agents.find((a) => a.id === selected) ?? agents[0];
  useEffect(() => {
    let disposed = false,
      stream: EventSource | undefined;
    void session()
      .then((initial) => {
        if (disposed) return;
        setSnapshot(initial);
        stream = new EventSource("/api/events");
        stream.addEventListener("snapshot", (event) => {
          const next = JSON.parse((event as MessageEvent).data) as Snapshot;
          setSnapshot((current) =>
            next.revision >= current.revision ? next : current,
          );
          setConnected(true);
        });
        stream.onerror = () => setConnected(false);
      })
      .catch((err) => setError(err.message));
    return () => {
      disposed = true;
      stream?.close();
    };
  }, []);
  const select = (id: string) => {
    setSelected(id);
    localStorage.setItem("blueoffice.selected.v1", id);
    setError("");
  };
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    const form = event.currentTarget,
      data = new FormData(form);
    try {
      const result = (await command("/api/agents", {
        name: data.get("name"),
        workspace: data.get("workspace"),
        model: data.get("model"),
      })) as { id: string };
      select(result.id);
      dialog.current?.close();
      form.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };
  const run = async (action: string, body: unknown = {}) => {
    if (!agent) return;
    setActing(true);
    setError("");
    try {
      await command(`/api/agents/${agent.id}/${action}`, body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(false);
    }
  };
  const running = agents.filter((a) => a.lifecycle === "ready").length;
  const waiting = agents.reduce((sum, a) => sum + attention(a).length, 0);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="BlueOffice home">
          <img src="/blueoffice-logo.png" alt="BlueOffice" />
        </a>
        <div className="place-label">
          <span className="office-symbol" aria-hidden="true">
            ▦
          </span>
          Your office
        </div>
        <div
          className={`connection ${connected ? "online" : ""}`}
          role="status"
        >
          <span />
          {connected ? "Connected locally" : "Connecting…"}
        </div>
        <span className="beta-label">Beta in progress</span>
      </header>
      {snapshot.mode === "fixture" ? (
        <div className="fixture-banner">
          Offline fixture office. Tasks and requests are synthetic; no model
          calls are made.
        </div>
      ) : null}
      <div className="workspace">
        <aside className="roster" aria-label="Office agents">
          <div className="roster-title">
            <h1>Office</h1>
            <button
              className="add-button"
              aria-label="Add agent"
              disabled={!connected}
              onClick={() => {
                setError("");
                dialog.current?.showModal();
              }}
            >
              +
            </button>
          </div>
          <p className="roster-subtitle">A place for your assistants.</p>
          <div className="office-counts">
            <span>{agents.length} configured</span>
            <span>{running} running</span>
          </div>
          <nav aria-label="Select an agent">
            {agents.map((a) => (
              <button
                key={a.id}
                className={`agent-row ${a.id === agent?.id ? "selected" : ""}`}
                aria-current={a.id === agent?.id ? "true" : undefined}
                onClick={() => select(a.id)}
              >
                <span className="roster-avatar" aria-hidden="true">
                  {a.name.slice(0, 1)}
                </span>
                <span className="agent-row-copy">
                  <strong>{a.name}</strong>
                  <small>{connected ? status(a) : "Unknown"}</small>
                </span>
                {attention(a).length ? (
                  <span
                    className="attention-count"
                    aria-label={`${attention(a).length} pending requests`}
                  >
                    {attention(a).length}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          {!agents.length ? (
            <p className="roster-empty">
              Your first assistant
              <br />
              starts here.
            </p>
          ) : null}
          <div className="roster-bottom">
            <span aria-hidden="true">☕</span>
            <p>
              Make room
              <br />
              for good work.
            </p>
          </div>
        </aside>
        <main className="office-main">
          <div className="overview-heading">
            <div>
              <p className="date-label">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h2>{agent ? "At your service." : "Welcome to BlueOffice."}</h2>
            </div>
            <span className="attention-summary">
              {waiting ? `${waiting} awaiting you` : "All quiet here"}
            </span>
          </div>
          {error ? (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          ) : null}
          {agent ? (
            <section className="agent-overview" aria-label="Selected agent">
              <div className="agent-badge">
                <span aria-hidden="true">{agent.name.slice(0, 1)}</span>
              </div>
              <div className="selected-agent">
                <h3>{agent.name}</h3>
                <p
                  className={`state-pill ${agent.freshness === "unknown" ? "unknown" : ""}`}
                >
                  {connected ? status(agent) : "Unknown"}
                </p>
              </div>
              <p className="agent-description">
                Your assistant’s conversations, tasks, and requests stay
                together here.
              </p>
              <dl>
                <div>
                  <dt>Workspace</dt>
                  <dd title={agent.workspace}>{agent.workspace}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{agent.model}</dd>
                </div>
                <div>
                  <dt>API family</dt>
                  <dd>
                    {snapshot.routes.find((r) => r.model === agent.model)
                      ?.apiFamily ?? "Unverified"}
                  </dd>
                </div>
                <div>
                  <dt>Endpoint</dt>
                  <dd>http://127.0.0.1:8317/v1</dd>
                </div>
                <div>
                  <dt>Character</dt>
                  <dd>
                    {agent.avatarId === "unassigned"
                      ? "Not assigned yet"
                      : agent.avatarId}
                  </dd>
                </div>
                <div>
                  <dt>Workstation</dt>
                  <dd>{agent.deskId ?? "Not assigned yet"}</dd>
                </div>
              </dl>
              <button
                className="primary start-button"
                disabled={
                  !connected ||
                  acting ||
                  ["starting", "ready", "stopping"].includes(agent.lifecycle)
                }
                onClick={() => void run("start")}
              >
                {agent.lifecycle === "starting"
                  ? "Starting agent…"
                  : agent.lifecycle === "ready"
                    ? "Agent is running"
                    : "Start agent"}
              </button>
              <p className="lifecycle-note">
                Interrupt ends a task. Stop closes this agent’s runtime. Closing
                this tab keeps it running.
              </p>
            </section>
          ) : (
            <section className="office-welcome">
              <div className="welcome-mark" aria-hidden="true">
                ✧
              </div>
              <h3>
                Give your next idea
                <br />a desk of its own.
              </h3>
              <p>
                Add an assistant, choose its workspace, and start a
                conversation. You’ll always know when it needs you.
              </p>
              <button
                className="primary"
                disabled={!connected}
                onClick={() => dialog.current?.showModal()}
              >
                Add your first agent
              </button>
            </section>
          )}
          {waiting ? (
            <section className="attention-queue" aria-label="Attention queue">
              <h3>Waiting for you</h3>
              {agents
                .filter((a) => attention(a).length)
                .map((a) => (
                  <button key={a.id} onClick={() => select(a.id)}>
                    <strong>{a.name}</strong>
                    <span>
                      {attention(a).length} pending request
                      {attention(a).length > 1 ? "s" : ""}
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
            </section>
          ) : (
            <div className="office-footnote">
              <span aria-hidden="true">◇</span>
              <p>Questions and permissions will wait for your answer.</p>
            </div>
          )}
        </main>
        {agent ? (
          <Chat key={agent.id} agent={agent} connected={connected} run={run} />
        ) : (
          <aside className="empty-chat">
            <span aria-hidden="true">◌</span>
            <h2>
              Every good task
              <br />
              starts with a conversation.
            </h2>
            <p>Your assistant’s chat will appear here.</p>
          </aside>
        )}
      </div>
      <dialog ref={dialog} className="create-dialog">
        <form onSubmit={add}>
          <div className="dialog-title">
            <h2>Add an assistant</h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          <p>
            A new, separate profile keeps this assistant’s conversations and
            tools together.
          </p>
          <label>
            Name
            <input
              name="name"
              placeholder="e.g. Hoshino"
              required
              maxLength={60}
              autoFocus
            />
          </label>
          <label>
            Workspace
            <input
              name="workspace"
              placeholder="/absolute/path/to/project"
              required
              maxLength={4096}
            />
          </label>
          <label>
            Model
            <select
              name="model"
              defaultValue={
                snapshot.routes.find((r) => r.status !== "unverified")?.model ??
                ""
              }
              required
            >
              <option value="" disabled>
                Select a verified route
              </option>
              {snapshot.routes.map((route) => (
                <option
                  key={route.model}
                  value={route.model}
                  disabled={route.status === "unverified"}
                >
                  {route.model} · {route.apiFamily} · {route.status}
                </option>
              ))}
            </select>
          </label>
          {snapshot.routes.some((r) => r.status === "unverified") ? (
            <p className="form-note">
              Unverified routes are disabled. Run npm run verify:routes --
              --live in the server project, then refresh to load the results.
            </p>
          ) : null}
          <p className="form-note">
            Choose an existing folder. Character and workstation assignments
            will follow in the room editor.
          </p>
          {error ? (
            <p role="alert" className="inline-error">
              {error}
            </p>
          ) : null}
          <button className="primary" disabled={creating}>
            {creating ? "Creating assistant…" : "Create assistant"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
