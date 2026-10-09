import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import type { Snapshot } from "../shared/office";
import { attention, presentAgent } from "../shared/office";
import { command, connectOffice } from "./api";
import { Activity } from "./Activity";
import { OfficeOverview } from "./OfficeOverview";
import { LayoutTransfer } from "./scene/LayoutTransfer";
import { Chat } from "./Chat";
import { NewAssignmentFields } from "./newAssignmentFields";
import { completeWorkstation } from "../shared/layout";
import type { SetupPlacement } from "../shared/setup";
import { SettingsDialog } from "./SettingsDialog";
import { GameWindow } from "./GameWindow";
import { GameIcon } from "./GameIcon";
import "./immersive.css";

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
  const [chatOpen, setChatOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [roomSettings, setRoomSettings] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const agents = snapshot.agents;
  const agent = agents.find((a) => a.id === selected) ?? agents[0];
  useEffect(() => connectOffice(setSnapshot, setConnected, setError), []);
  const select = (id: string) => {
    setChatOpen(true);
    setRosterOpen(false);
    setRoomSettings(false);
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
  const conversation = async (
    id: string,
    action: "new" | "resume",
    historyId?: string,
  ) => {
    const current = agents.find((candidate) => candidate.id === id);
    if (!current || !connected)
      throw new Error(
        "Reconnect to this assistant before changing conversations.",
      );
    setActing(true);
    try {
      const receipt = (await command(`/api/agents/${id}/conversation`, {
        commandId: crypto.randomUUID(),
        expectedTarget: {
          epoch: current.epoch,
          sessionId: current.liveSessionId,
        },
        action,
        ...(historyId ? { historyId } : {}),
      })) as { state: string; message: string };
      if (receipt.state !== "accepted") throw new Error(receipt.message);
      // Only this explicit transition selects its owner; inspecting history does not.
      select(id);
      setFocusRequest(undefined);
    } finally {
      setActing(false);
    }
  };
  const waiting = agents.reduce((n, a) => n + attention(a).length, 0);
  return (
    <div
      className={`app-shell immersive-office ${snapshot.mode === "fixture" ? "fixture-office" : ""} ${hudHidden ? "hud-hidden" : ""}`}
    >
      <header className="office-hud">
        <img
          className="office-logo"
          src="/blueoffice-logo.png"
          alt="BlueOffice"
        />
        <div className="office-presence">
          <span
            className={`connection-dot ${connected ? "online" : ""}`}
            role="status"
            aria-label={connected ? "Connected locally" : "Connecting…"}
            title={connected ? "Connected locally" : "Connecting…"}
          />
          {snapshot.mode === "fixture" && (
            <span
              className="fixture-tag"
              title="Offline fixture office · synthetic runtime"
            >
              Demo
            </span>
          )}
        </div>
      </header>
      <button
        className="hud-visibility hud-button"
        aria-label={hudHidden ? "Show controls" : "Hide controls"}
        title={hudHidden ? "Show controls" : "Hide controls"}
        onClick={() => setHudHidden(!hudHidden)}
      >
        <GameIcon name="eye" />
      </button>
      <nav className="office-dock" aria-label="Office controls">
        <button
          className="hud-button"
          aria-label="Agents"
          title="Agents"
          onClick={() => setRosterOpen(!rosterOpen)}
        >
          <GameIcon name="people" />
          {waiting > 0 && <span className="hud-badge">{waiting}</span>}
          <span>Agents</span>
        </button>
        <button
          className="hud-button"
          aria-label="Add agent"
          title="Add assistant"
          disabled={!connected}
          onClick={openSetup}
        >
          <GameIcon name="add" />
          <span>Add</span>
        </button>
        <button
          className="hud-button"
          aria-label="Office overview"
          title="Office overview"
          onClick={() => setOverview(true)}
        >
          <GameIcon name="office" />
          <span>Office</span>
        </button>
        <button
          className="hud-button"
          aria-label="Activity"
          title="Activity"
          onClick={() => setActivity(true)}
        >
          <GameIcon name="history" />
          <span>History</span>
        </button>
      </nav>
      <button
        className="office-settings hud-button"
        aria-label="Office settings"
        title="Office settings"
        onClick={() => setRoomSettings(!roomSettings)}
      >
        <GameIcon name="settings" />
      </button>
      {rosterOpen && (
        <GameWindow
          title="Agents"
          close={() => setRosterOpen(false)}
          className="agents-window"
        >
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
                    aria-label={`Open ${request.kind === "approval" ? "permission" : "question"} for ${a.name}: ${request.id}`}
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
        </GameWindow>
      )}
      <div className="workspace">
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
            fallback={<div className="scene-loading">Opening the office…</div>}
          >
            <OfficeScene
              settingsOpen={roomSettings}
              closeSettings={() => setRoomSettings(false)}
              transfer={
                <LayoutTransfer
                  agents={agents}
                  connected={connected}
                  layout={snapshot.layout}
                  saved={(layout) =>
                    setSnapshot((current) => ({ ...current, layout }))
                  }
                />
              }
              agents={agents}
              layout={snapshot.layout}
              locate={locate}
              connected={connected}
              selected={chatOpen ? agent?.id : undefined}
              select={select}
              focusRequest={(agentId, requestId) => {
                select(agentId);
                setFocusRequest({ id: requestId });
              }}
            />
          </Suspense>
        </main>
      </div>
      {agent && (
        <GameWindow
          title={agent.name}
          open={chatOpen}
          close={() => setChatOpen(false)}
          className="conversation-window"
        >
          <div id="conversation-panel" className="office-conversation">
            <Chat
              key={agent.id}
              visible={chatOpen}
              agent={agent}
              connected={connected}
              run={run}
              focusRequest={focusRequest}
              acting={acting}
              settings={() => setSettingsFor(agent.id)}
              newConversation={() => conversation(agent.id, "new")}
            />
          </div>
        </GameWindow>
      )}
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
            onResume={(session) => {
              if (!session.agentId)
                return Promise.reject(
                  new Error("This history has no owned assistant."),
                );
              return conversation(session.agentId, "resume", session.id);
            }}
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
