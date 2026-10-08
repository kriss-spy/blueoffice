import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import { presentAgent, type OfficeAgent } from "../../shared/office";
import {
  CompletionTracker,
  updateCompletionCues,
  type CompletionCues,
} from "../../shared/presentation";
import {
  defaultDesks,
  workstation,
  worldAnchor,
  type Point,
} from "../../shared/scene";
import { assetKey } from "../../shared/assets";
import { useCharacters } from "./characters";
import { CharacterLibrary } from "./CharacterLibrary";
import { OfficeLighting } from "./OfficeLighting";
import {
  Avatar,
  Camera,
  Labels,
  SceneBoundary,
  type Metrics,
  type CameraCommand,
} from "./ScenePrimitives";
import { Room, Workstation } from "./Room";
import "./scene.css";
import "./office-scene.css";

const symbols: Record<string, string> = {
  question: "?",
  approval: "🔒",
  failed: "!",
  unknown: "?",
  working: "⋯",
  completed: "✓",
  stopped: "○",
  ready: "•",
};

export function OfficeScene({
  agents,
  connected,
  selected,
  select,
  focusRequest,
}: {
  agents: OfficeAgent[];
  connected: boolean;
  selected?: string;
  select: (id: string) => void;
  focusRequest: (agentId: string, requestId: string) => void;
}) {
  const loaded = useCharacters(agents.map((a) => a.avatar));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({
    action: "reset",
    id: 0,
  });
  const [metrics, setMetrics] = useState<Metrics>({ avatars: {} });
  const liveMetrics = useRef<Metrics>({ avatars: {} });
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const tracker = useRef(new CompletionTracker());
  const [cues, setCues] = useState<CompletionCues>({});
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const ids = tracker.current.observe(agents, connected);
    setCues((previous) =>
      updateCompletionCues(
        previous,
        agents,
        connected,
        ids,
        performance.now() + 3000,
      ),
    );
  }, [agents, connected]);
  useEffect(() => {
    const future = Object.values(cues)
      .map((cue) => cue.until)
      .filter((until) => until > performance.now());
    if (!future.length) return;
    const timer = setTimeout(
      () =>
        setCues((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([, cue]) => cue.until > performance.now(),
            ),
          ),
        ),
      Math.max(0, Math.min(...future) - performance.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [cues]);
  const occupants = agents.map((agent, i) => {
    const desk = defaultDesks.find((desk) => desk.id === agent.deskId);
    const position: Point = desk
      ? worldAnchor(workstation.anchors.standing, desk.position, desk.rotation)
      : [-4 + i, 0, 3.4];
    const entry = agent.avatar ? loaded[assetKey(agent.avatar)] : undefined;
    return {
      agent,
      desk,
      position,
      view: presentAgent(agent, connected),
      asset: entry?.asset,
      diagnostic:
        entry?.error ??
        (!agent.avatar
          ? agent.avatarId === "unassigned"
            ? "No character assigned"
            : "Character version missing"
          : entry?.asset
            ? ""
            : "Loading character…"),
    };
  });
  const isCueActive = (id: string, view: ReturnType<typeof presentAgent>) =>
    view.canCelebrate && cues[id]?.key === view.terminalKey;
  const visibleDesks = defaultDesks.filter(
    (desk, i) => i < 2 || agents.some((agent) => agent.deskId === desk.id),
  );
  const selectedCharacter = occupants.find((o) => o.agent.id === selected);
  const camera = (action: CameraCommand["action"]) =>
    setCommand((c) => ({ action, id: c.id + 1 }));
  return (
    <section className="live-scene" aria-label="Live office">
      <div className="live-scene-heading">
        <div>
          <h2>Your office</h2>
          <p>
            {agents.length
              ? "Choose an assistant or a desk to open its conversation."
              : "Add an assistant to bring the office to life."}
          </p>
        </div>
        <button disabled={!connected} onClick={() => setLibraryOpen(true)}>
          Characters
        </button>
      </div>
      <div className="live-room">
        <SceneBoundary>
          <Canvas
            orthographic
            camera={{ position: [10, 10, 13], zoom: 40, near: 0.1, far: 100 }}
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 1.5]}
            fallback={
              <p role="alert">
                3D is unavailable. Use the agent list and attention controls to
                continue.
              </p>
            }
          >
            <OfficeLighting />
            <Camera command={command} metrics={liveMetrics} />
            <Room />
            {visibleDesks.map((desk) => (
              <Workstation
                key={desk.id}
                position={desk.position}
                rotation={desk.rotation}
                anchors={false}
                onSelect={() => {
                  const agent = agents.find(
                    (agent) => agent.deskId === desk.id,
                  );
                  if (agent) select(agent.id);
                }}
              />
            ))}
            {occupants.map(({ agent, position, desk, view, asset }) =>
              asset ? (
                <Avatar
                  key={agent.id}
                  asset={asset}
                  id={agent.id}
                  position={position}
                  rotation={desk?.rotation ?? 0}
                  motion={isCueActive(agent.id, view) ? "react" : "idle"}
                  playing={!reducedMotion && !view.pauseMotion}
                  time={0}
                  metrics={liveMetrics}
                  onSelect={() => select(agent.id)}
                />
              ) : (
                <group
                  key={agent.id}
                  position={position}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(agent.id);
                  }}
                >
                  <mesh position={[0, 0.44, 0]} castShadow>
                    <cylinderGeometry args={[0.22, 0.3, 0.75, 12]} />
                    <meshStandardMaterial
                      color={agent.id === selected ? "#73b8d5" : "#acbfcc"}
                    />
                  </mesh>
                  <mesh position={[0, 1.03, 0]} castShadow>
                    <sphereGeometry args={[0.24, 16, 12]} />
                    <meshStandardMaterial color="#edf5f8" />
                  </mesh>
                </group>
              ),
            )}
            <Labels
              markers={markers}
              anchors={[
                ...occupants.map(({ position, asset, desk }) =>
                  worldAnchor(
                    asset?.anchors?.nameplate ?? [0, 1.85, 0],
                    position,
                    desk?.rotation ?? 0,
                  ),
                ),
                [-2.2, 2, -2.8],
              ]}
              metrics={liveMetrics}
              onMetrics={setMetrics}
            />
          </Canvas>
        </SceneBoundary>
        <div className="scene-markers">
          {occupants.map(({ agent, view, desk, diagnostic }, i) => (
            <div key={agent.id}>
              <button
                ref={(el) => {
                  markers.current[i] = el;
                }}
                data-scene-agent={agent.id}
                className={`scene-marker live-marker ${selected === agent.id ? "selected" : ""} tone-${view.tone}`}
                aria-label={`Select ${agent.name}: ${view.label}`}
                onClick={() =>
                  view.requests.length
                    ? focusRequest(agent.id, view.requests[0].id)
                    : select(agent.id)
                }
              >
                <b aria-hidden="true">{symbols[view.tone]}</b>
                <span>
                  <strong>{agent.name}</strong>
                  <small>{view.label}</small>
                  {view.detail && <small>{view.detail}</small>}
                  {!desk && <small>Workstation missing</small>}
                  {diagnostic && (
                    <small className="character-diagnostic" title={diagnostic}>
                      {diagnostic.startsWith("Loading")
                        ? "Loading character…"
                        : agent.avatarId === "unassigned"
                          ? "No character assigned"
                          : "Character unavailable"}
                    </small>
                  )}
                </span>
              </button>
            </div>
          ))}
          <button
            ref={(el) => {
              markers.current[occupants.length] = el;
            }}
            className="cafe-marker"
            tabIndex={-1}
          >
            Coffee corner
          </button>
        </div>
      </div>
      <div className="live-scene-bottom">
        <nav aria-label="Scene camera">
          <button aria-label="Zoom out" onClick={() => camera("out")}>
            −
          </button>
          <button aria-label="Zoom in" onClick={() => camera("in")}>
            +
          </button>
          <button aria-label="Pan left" onClick={() => camera("left")}>
            ←
          </button>
          <button aria-label="Pan right" onClick={() => camera("right")}>
            →
          </button>
          <button onClick={() => camera("reset")}>Reset view</button>
        </nav>
        <span>
          {selectedCharacter?.diagnostic
            ? `${selectedCharacter.agent.name}: ${selectedCharacter.diagnostic}`
            : occupants.some((o) => o.asset)
              ? "Saved character assignments · standing pose"
              : "Character placeholders shown"}
        </span>
      </div>
      <div className="room-attention" aria-label="Room attention">
        {occupants.flatMap(({ agent, view }) =>
          view.requests.map((request) => (
            <button
              key={request.id}
              data-scene-request={request.id}
              className={`request-marker ${request.kind}`}
              onClick={() => focusRequest(agent.id, request.id)}
              aria-label={`Open ${request.kind === "approval" ? "permission" : "question"} for ${agent.name}: ${request.id}`}
            >
              <span aria-hidden="true">
                {request.kind === "approval" ? "🔒" : "?"}
              </span>
              <strong>{agent.name}</strong>
              <span>
                {request.kind === "approval"
                  ? "Needs permission"
                  : request.kind === "clarify"
                    ? "Needs an answer"
                    : "Input unavailable"}
                {!view.current || request.freshness === "unknown"
                  ? " · status unknown"
                  : ""}
              </span>
            </button>
          )),
        )}
      </div>
      <output
        hidden
        data-office-scene={JSON.stringify({
          camera: metrics.camera,
          assets: occupants.filter((o) => o.asset).map((o) => o.agent.avatar),
          avatars: metrics.avatars,
          agents: occupants.map(({ agent, view, desk, diagnostic }) => ({
            id: agent.id,
            deskId: desk?.id,
            avatar: agent.avatar,
            diagnostic,
            label: view.label,
            work: agent.work,
            requests: view.requests.map((request) => request.id),
            cue: isCueActive(agent.id, view),
            motion: isCueActive(agent.id, view) ? "react" : "idle",
            paused: view.pauseMotion || reducedMotion,
          })),
        })}
      />
      {libraryOpen && (
        <CharacterLibrary
          agent={agents.find((a) => a.id === selected)}
          close={() => setLibraryOpen(false)}
        />
      )}
    </section>
  );
}
