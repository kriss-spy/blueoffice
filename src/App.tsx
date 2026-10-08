import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { Snapshot } from "../shared/office";
import { attention, presentAgent } from "../shared/office";
import { command, connectOffice } from "./api";
import { Activity } from "./Activity";
import { OfficeOverview } from "./OfficeOverview";
import { Chat } from "./Chat";
import { NewAssignmentFields } from "./newAssignmentFields";
import { completeWorkstation } from "../shared/layout";
import type { SetupPlacement } from "../shared/setup";
import { SettingsDialog } from "./SettingsDialog";

const OfficeScene = lazy(() =>
  import("./scene/OfficeScene").then((module) => ({
    default: module.OfficeScene,
  })),
);

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
  const [activity, setActivity] = useState(false);
  const activityDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (activity) activityDialog.current?.showModal();
  }, [activity]);
  const [overview, setOverview] = useState(false);
  const [locate, setLocate] = useState<{ deskId: string; token: number }>();
  const [setupGeneration, setSetupGeneration] = useState(0);
  const [placement, setPlacement] = useState<SetupPlacement>({
    avatar: null,
    deskId: null,
  });
  const [creating, setCreating] = useState(false);
  const [adoptionPath, setAdoptionPath] = useState("");
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<
    { id: string } | undefined
  >();
  const [acting, setActing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem("blueoffice.chat-width.v1"));
    return saved >= 320 && saved <= 560 ? saved : 380;
  });
  const workspace = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const resizeChat = (value: number) => {
    const width = Math.max(
      320,
      Math.min(
        560,
        (workspace.current?.clientWidth ?? innerWidth) - 600,
        value,
      ),
    );
    setChatWidth(width);
    try {
      localStorage.setItem("blueoffice.chat-width.v1", String(width));
    } catch {
      /* Storage can be unavailable. */
    }
  };
  useEffect(() => {
    const resized = () => resizeChat(chatWidth);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, [chatWidth]);
  const agents = snapshot.agents;
  const agent = agents.find((a) => a.id === selected) ?? agents[0];
  useEffect(() => connectOffice(setSnapshot, setConnected, setError), []);
  const select = (id: string) => {
    setSelected(id);
    localStorage.setItem("blueoffice.selected.v1", id);
    setError("");
  };
  const openSetup = () => {
    setSetupGeneration((value) => value + 1);
    const occupied = new Set(Object.values(snapshot.layout?.assignments ?? {}));
    setPlacement({
      avatar: null,
      deskId:
        snapshot.layout?.placements.find(
          (desk) => completeWorkstation(desk) && !occupied.has(desk.id),
        )?.id ?? null,
    });
    dialog.current?.showModal();
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
        soul: data.get("soul") ?? "",
        toolsets: data.getAll("toolsets"),
        approvalMode: data.get("approvalMode"),
        placement,
      })) as { id: string };
      select(result.id);
      dialog.current?.close();
      form.reset();
      setPlacement({ avatar: null, deskId: null });
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
    <div
      className={`app-shell live-office ${snapshot.mode === "fixture" ? "fixture-office" : ""}`}
    >
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
        <button onClick={() => setOverview(true)}>Office overview</button>
        <button onClick={() => setActivity(true)}>Activity</button>
        <span className="beta-label">Beta in progress</span>
      </header>
      {snapshot.mode === "fixture" ? (
        <div className="fixture-banner">
          Offline fixture office. Tasks and requests are synthetic; no model
          calls are made.
        </div>
      ) : null}
      <div
        className="workspace"
        ref={workspace}
        style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}
      >
        <aside className="roster" aria-label="Office agents">
          <div className="roster-title">
            <h1>Office</h1>
            <button
              className="add-button"
              aria-label="Add agent"
              disabled={!connected}
              onClick={() => {
                setError("");
                openSetup();
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
                  <small>{presentAgent(a, connected).label}</small>
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
            <button
              className="primary first-agent"
              disabled={!connected}
              onClick={openSetup}
            >
              Add your first agent
            </button>
          ) : null}
          {waiting > 0 && (
            <section className="roster-attention" aria-label="Attention queue">
              <h2>Waiting for you</h2>
              {agents.flatMap((a) =>
                attention(a).map((request) => (
                  <button
                    key={request.id}
                    onClick={() => {
                      select(a.id);
                      setFocusRequest({ id: request.id });
                    }}
                  >
                    <strong>{a.name}</strong>
                    <small>
                      {request.kind === "approval"
                        ? "Needs permission"
                        : "Needs an answer"}
                    </small>
                  </button>
                )),
              )}
            </section>
          )}
          <div className="roster-bottom">
            <span aria-hidden="true">☕</span>
            <p>
              Make room
              <br />
              for good work.
            </p>
          </div>
        </aside>
        <main className="office-stage">
          {error ? (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          ) : null}
          {snapshot.pendingAdoptions?.map((pending) => (
            <div
              key={pending.profileHome}
              className="error-banner"
              role="status"
            >
              <p>
                Adoption of {pending.name} needs review: {pending.profileHome}
              </p>
              <button
                onClick={() => {
                  setAdoptionPath(pending.profileHome);
                  setSettingsFor("adopt");
                }}
              >
                Review adoption
              </button>
            </div>
          ))}
          <Suspense
            fallback={
              <div className="scene-loading">
                Opening the office… Chat and agent controls remain available.
              </div>
            }
          >
            <OfficeScene
              agents={agents}
              layout={snapshot.layout}
              locate={locate}
              connected={connected}
              selected={agent?.id}
              select={select}
              focusRequest={(agentId, requestId) => {
                select(agentId);
                setFocusRequest({ id: requestId });
              }}
            />
          </Suspense>
        </main>
        <div
          role="separator"
          aria-label="Resize conversation"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={560}
          aria-valuenow={Math.round(chatWidth)}
          aria-controls="conversation-panel"
          tabIndex={0}
          className="chat-resizer"
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (dragging.current && workspace.current)
              resizeChat(
                workspace.current.getBoundingClientRect().right - event.clientX,
              );
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              resizeChat(
                event.key === "Home"
                  ? 320
                  : event.key === "End"
                    ? 560
                    : chatWidth + (event.key === "ArrowLeft" ? 20 : -20),
              );
            }
          }}
        />
        <div id="conversation-panel" className="office-conversation">
          {agent ? (
            <Chat
              key={agent.id}
              agent={agent}
              connected={connected}
              run={run}
              focusRequest={focusRequest}
              acting={acting}
              settings={() => setSettingsFor(agent.id)}
            />
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
      </div>
      {activity && (
        <dialog
          ref={activityDialog}
          className="office-overview"
          aria-label="Activity history"
          onCancel={() => setActivity(false)}
        >
          <button
            aria-label="Close Activity"
            onClick={() => setActivity(false)}
          >
            Close
          </button>
          <Activity
            agents={agents}
            revision={snapshot.revision}
            connected={connected}
          />
        </dialog>
      )}
      {overview && (
        <OfficeOverview
          agents={agents}
          placements={snapshot.layout?.placements ?? []}
          connected={connected}
          select={select}
          locate={(deskId) => setLocate({ deskId, token: Date.now() })}
          configure={setSettingsFor}
          act={async (id, action, body) => {
            await command(`/api/agents/${id}/${action}`, body);
          }}
          focusRequest={(id, requestId) => {
            select(id);
            setFocusRequest({ id: requestId });
          }}
          close={() => setOverview(false)}
        />
      )}
      {settingsFor ? (
        <SettingsDialog
          key={settingsFor}
          agent={agents.find((a) => a.id === settingsFor)}
          routes={snapshot.routes}
          layout={snapshot.layout}
          close={() => setSettingsFor(null)}
          adopted={select}
          initialPath={adoptionPath}
        />
      ) : null}
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
          <button
            type="button"
            className="adopt-link"
            onClick={() => {
              dialog.current?.close();
              setSettingsFor("adopt");
            }}
          >
            Adopt an existing profile instead
          </button>
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
          <label>
            Persona / SOUL
            <textarea
              name="soul"
              rows={4}
              maxLength={32000}
              placeholder="How should this assistant work with you?"
            />
          </label>
          <fieldset className="tool-choices">
            <legend>Enabled tool groups</legend>
            <label>
              <input
                type="checkbox"
                name="toolsets"
                value="terminal"
                defaultChecked
              />
              Terminal commands
            </label>
            <label>
              <input
                type="checkbox"
                name="toolsets"
                value="file"
                defaultChecked
              />
              Read and edit files
            </label>
            <label>
              <input
                type="checkbox"
                name="toolsets"
                value="clarify"
                defaultChecked
              />
              Ask structured questions
            </label>
          </fieldset>
          <label>
            Command approvals
            <select name="approvalMode" defaultValue="manual">
              <option value="manual">Ask for permission</option>
              <option value="off">Run without permission prompts</option>
            </select>
          </label>
          <NewAssignmentFields
            key={setupGeneration}
            layout={snapshot.layout}
            value={placement}
            onChange={setPlacement}
          />
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
