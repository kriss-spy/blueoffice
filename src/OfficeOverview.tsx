import { useEffect, useRef, useState } from "react";
import { attention, presentAgent, type OfficeAgent } from "../shared/office";
import "./office-overview.css";

export interface InventoryPlacement {
  id: string;
  kind: string;
  position: [number, number, number];
  rotation: number;
  components: {
    desk: boolean;
    chair: boolean;
    computer: boolean;
    keyboard: boolean;
  };
}
export function OfficeOverview({
  agents,
  placements,
  connected,
  select,
  locate,
  configure,
  act,
  focusRequest,
  close,
}: {
  agents: OfficeAgent[];
  placements: InventoryPlacement[];
  connected: boolean;
  select: (id: string) => void;
  locate: (deskId: string) => void;
  configure: (id: string) => void;
  act: (
    id: string,
    action: "start" | "interrupt" | "stop",
    body?: unknown,
  ) => Promise<void>;
  focusRequest: (agentId: string, requestId: string) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"agents" | "furniture">("agents");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const running = agents.filter(
    (a) => a.lifecycle === "ready" && a.freshness === "current",
  ).length;
  const waiting = agents.filter((a) => attention(a).length > 0).length;
  const unassigned = agents.filter(
    (a) => !a.deskId || !placements.some((p) => p.id === a.deskId),
  );
  const run = async (
    agent: OfficeAgent,
    action: "start" | "interrupt" | "stop",
  ) => {
    setActing(agent.id);
    setError("");
    try {
      await act(
        agent.id,
        action,
        action === "interrupt"
          ? { target: { epoch: agent.epoch, sessionId: agent.liveSessionId } }
          : {},
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };
  const openAgent = (id: string) => {
    select(id);
    close();
  };
  const componentCounts = Object.fromEntries(
    ["desk", "chair", "computer", "keyboard"].map((key) => [
      key,
      placements.filter(
        (p) => p.components[key as keyof InventoryPlacement["components"]],
      ).length,
    ]),
  );
  return (
    <dialog
      ref={dialog}
      className="office-overview"
      aria-labelledby="overview-title"
      onCancel={close}
    >
      <div className="dialog-title">
        <h2 id="overview-title">Office overview</h2>
        <button aria-label="Close office overview" onClick={close}>
          ×
        </button>
      </div>
      <div className="overview-counts" aria-label="Office counts">
        <span>
          <strong>{agents.length}</strong> configured
        </span>
        <span>
          <strong>{connected ? running : "Unknown"}</strong> running
        </span>
        <span>
          <strong>{waiting}</strong> need input
        </span>
        <span>
          <strong>{unassigned.length}</strong> unassigned
        </span>
      </div>
      <p className="form-note">
        Configured means saved assistants. Running means a currently confirmed
        ready runtime. Need input counts assistants with unanswered requests,
        including requests whose status is uncertain.
      </p>
      <nav aria-label="Overview sections">
        <button
          aria-pressed={tab === "agents"}
          onClick={() => setTab("agents")}
        >
          Agents
        </button>
        <button
          aria-pressed={tab === "furniture"}
          onClick={() => setTab("furniture")}
        >
          Furniture
        </button>
      </nav>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {tab === "agents" ? (
        <>
          <div className="overview-agent-grid">
            {agents.map((agent) => {
              const view = presentAgent(agent, connected);
              const requests = attention(agent);
              const ready =
                connected &&
                agent.lifecycle === "ready" &&
                agent.freshness === "current";
              const latest = [...agent.messages]
                .reverse()
                .find((m) => m.role !== "tool" && m.epoch === agent.epoch);
              return (
                <article
                  key={agent.id}
                  className="overview-agent"
                  aria-label={`Overview for ${agent.name}`}
                >
                  <button
                    className="overview-agent-name"
                    onClick={() => openAgent(agent.id)}
                  >
                    {agent.name}
                  </button>
                  <p>
                    <strong>{view.label}</strong>
                    {view.detail && ` · ${view.detail}`}
                  </p>
                  <dl>
                    <dt>Profile</dt>
                    <dd>{agent.profileName}</dd>
                    <dt>Model</dt>
                    <dd>{agent.model}</dd>
                    <dt>Character</dt>
                    <dd>
                      {agent.avatar
                        ? `${agent.avatar.assetId} · ${agent.avatar.version}`
                        : "Placeholder"}
                    </dd>
                    <dt>Workstation</dt>
                    <dd>{agent.deskId ?? "Unassigned · reception"}</dd>
                  </dl>
                  <p className="overview-excerpt">
                    {latest?.text.slice(0, 180) ||
                      "No public message in this foreground conversation."}
                  </p>
                  {requests.map((request) => (
                    <button
                      className="overview-request"
                      key={request.id}
                      onClick={() => {
                        focusRequest(agent.id, request.id);
                        close();
                      }}
                    >
                      {request.kind === "approval" ? "Permission" : "Question"}:{" "}
                      {request.text.slice(0, 100) || request.id}
                      {!view.current ? " · status unknown" : ""}
                    </button>
                  ))}
                  <div className="overview-actions">
                    <button
                      disabled={
                        !connected ||
                        !!acting ||
                        !["stopped", "failed", "unknown"].includes(
                          agent.lifecycle,
                        )
                      }
                      onClick={() => void run(agent, "start")}
                    >
                      Start {agent.name}
                    </button>
                    <button
                      disabled={
                        !ready || !!acting || (!agent.busy && !requests.length)
                      }
                      onClick={() => void run(agent, "interrupt")}
                    >
                      Interrupt {agent.name}
                    </button>
                    <button
                      disabled={
                        !connected ||
                        !!acting ||
                        ["stopped", "starting", "stopping", "failed"].includes(
                          agent.lifecycle,
                        )
                      }
                      onClick={() => void run(agent, "stop")}
                    >
                      Stop {agent.name}
                    </button>
                    <button
                      disabled={!connected}
                      onClick={() => {
                        configure(agent.id);
                        close();
                      }}
                    >
                      Configure {agent.name}
                    </button>
                    <button
                      disabled={
                        !agent.deskId ||
                        !placements.some((p) => p.id === agent.deskId)
                      }
                      onClick={() => {
                        select(agent.id);
                        locate(agent.deskId!);
                        close();
                      }}
                    >
                      Locate {agent.name}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {unassigned.length > 0 && (
            <section aria-label="Unassigned assistants">
              <h3>Unassigned assistants</h3>
              <p>
                These assistants keep their work and appear at reception until
                assigned a complete workstation.
              </p>
              {unassigned.map((agent) => (
                <button key={agent.id} onClick={() => openAgent(agent.id)}>
                  {agent.name} · {presentAgent(agent, connected).label}
                </button>
              ))}
            </section>
          )}
        </>
      ) : (
        <section aria-label="Furniture inventory">
          <h3>Furniture inventory</h3>
          <p>
            {placements.length} workstation assemblies ·{" "}
            {Object.entries(componentCounts)
              .map(
                ([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`,
              )
              .join(" · ")}
          </p>
          <p className="form-note">
            Original BlueOffice furniture pack. Furniture stays in the office
            when assistants stop.
          </p>
          <div className="overview-inventory">
            {placements.map((p) => (
              <article key={p.id}>
                <h4>{p.id}</h4>
                <p>Workstation · original BlueOffice pack</p>
                <p>
                  Position {p.position[0].toFixed(2)},{" "}
                  {p.position[2].toFixed(2)} · {p.rotation * 90}°
                </p>
                <p>
                  {Object.entries(p.components)
                    .filter(([, present]) => !present)
                    .map(([name]) => `Missing ${name}`)
                    .join(" · ") ||
                    "Complete desk, chair, computer and keyboard"}
                </p>
                <p>
                  {agents
                    .filter((a) => a.deskId === p.id)
                    .map((a) => a.name)
                    .join(", ") || "Unassigned"}
                </p>
                <button
                  onClick={() => {
                    locate(p.id);
                    close();
                  }}
                >
                  Locate {p.id}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </dialog>
  );
}
