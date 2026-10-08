import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import { presentAgent, type OfficeAgent } from "../../shared/office";
import {
  CompletionTracker,
  updateCompletionCues,
  type CompletionCues,
} from "../../shared/presentation";
import { workstation, worldAnchor, type Point } from "../../shared/scene";
import { seatedPlacement } from "../../shared/seating";
import { assetKey } from "../../shared/assets";
import { useCharacters } from "./characters";
import { CharacterLibrary } from "./CharacterLibrary";
import { OfficeLighting } from "./OfficeLighting";
import {
  Avatar,
  Camera,
  Labels,
  SceneBoundary,
  SceneContextEvents,
  type Metrics,
  type CameraCommand,
} from "./ScenePrimitives";
import {
  initialLayout,
  layoutInventory,
  completeWorkstation,
  safeStandingPosition,
  type LayoutDraft,
  type LayoutSnapshot,
} from "../../shared/layout";
import { LayoutEditor } from "./LayoutEditor";
import { DOMAttentionQueue } from "./DOMAttentionQueue";
import { SceneError } from "./SceneError";
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
  layout: suppliedLayout,
  onLayoutSaved,
  locate,
}: {
  agents: OfficeAgent[];
  connected: boolean;
  selected?: string;
  select: (id: string) => void;
  focusRequest: (agentId: string, requestId: string) => void;
  layout?: LayoutSnapshot;
  onLayoutSaved?: (layout: LayoutSnapshot) => void;
  locate?: { deskId: string; token: number };
}) {
  const [sceneFailure, setSceneFailure] = useState<
    "initialization" | "context-loss"
  >();
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const lostContext = useCallback(() => {
    setSceneReady(false);
    setSceneFailure("context-loss");
  }, []);
  const retryScene = () => {
    setSceneFailure(undefined);
    setSceneReady(false);
    setSceneGeneration((n) => n + 1);
  };
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const lastLocate = useRef<number | undefined>(undefined);
  const [savedLayout, setSavedLayout] = useState<LayoutSnapshot | undefined>(
    suppliedLayout,
  );
  const [editing, setEditing] = useState<LayoutSnapshot>();
  const [draft, setDraft] = useState<LayoutDraft>();
  const [selectedDesk, setSelectedDesk] = useState<string>();
  const [layoutError, setLayoutError] = useState("");
  useEffect(() => {
    if (suppliedLayout) setSavedLayout(suppliedLayout);
  }, [suppliedLayout]);
  useEffect(() => {
    if (suppliedLayout) return;
    let active = true;
    void fetch("/api/layout")
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Layout is unavailable. Reconnect and reload the office.",
          );
        return response.json();
      })
      .then((value) => {
        if (active) setSavedLayout(value);
      })
      .catch((error) => {
        if (active) setLayoutError(error.message);
      });
    return () => {
      active = false;
    };
  }, [suppliedLayout]);
  const visibleLayout = draft ?? savedLayout ?? initialLayout(agents);
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
    const assignedId = draft
      ? draft.assignments[agent.id]
      : savedLayout
        ? savedLayout.assignments[agent.id]
        : agent.deskId;
    const desk = visibleLayout.placements.find(
      (desk) => desk.id === assignedId && completeWorkstation(desk),
    );
    const standingPosition: Point = desk
      ? worldAnchor(workstation.anchors.standing, desk.position, desk.rotation)
      : safeStandingPosition(
          agents
            .slice(0, i)
            .filter(
              (a) =>
                !visibleLayout.placements.some(
                  (p) =>
                    p.id === visibleLayout.assignments[a.id] &&
                    completeWorkstation(p),
                ),
            ).length,
        );
    const entry = agent.avatar ? loaded[assetKey(agent.avatar)] : undefined;
    const view = presentAgent(agent, connected);
    const seating = desk
      ? {
          seat: workstation.anchors.seat,
          keyboard: workstation.anchors.keyboard,
          compatibility: workstation.seatingTags,
        }
      : undefined;
    const placement = seatedPlacement(
      entry?.asset?.clips?.seated &&
        entry.asset.gltf.animations.some(
          (c) => c.name === entry.asset?.clips?.seated,
        )
        ? entry.asset.seating
        : undefined,
      seating,
    );
    const seated = view.tone === "working" && placement.compatible;
    return {
      agent,
      desk,
      position: seated && desk ? desk.position : standingPosition,
      seating,
      seated,
      poseDiagnostic:
        view.tone === "working" && entry?.asset && !placement.compatible
          ? placement.diagnostic
          : "",
      view,
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
  const visibleDesks = visibleLayout.placements;
  const selectedCharacter = occupants.find((o) => o.agent.id === selected);
  const camera = (action: CameraCommand["action"]) =>
    setCommand((c) => ({ action, id: c.id + 1 }));
  const locateDesk = (id: string) => {
    const desk = visibleLayout.placements.find((p) => p.id === id);
    if (!desk) return;
    setSelectedDesk(id);
    // The camera owns the elevated view and pan/zoom; Locate requests its target.
    setCommand((c) => ({
      action: "locate",
      target: desk.position,
      id: c.id + 1,
    }));
  };
  useEffect(() => {
    if (!locate || lastLocate.current === locate.token) return;
    const desk = (savedLayout?.placements ?? []).find(
      (p) => p.id === locate.deskId,
    );
    if (desk) {
      lastLocate.current = locate.token;
      setSelectedDesk(desk.id);
      setCommand((c) => ({
        action: "locate",
        target: desk.position,
        id: c.id + 1,
      }));
    }
  }, [locate, savedLayout]);
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
        <button
          disabled={!connected || !savedLayout || !!editing}
          onClick={() => {
            if (savedLayout) {
              setEditing(structuredClone(savedLayout));
              setDraft(structuredClone(savedLayout));
            }
          }}
        >
          Edit office
        </button>
        <button disabled={!connected} onClick={() => setLibraryOpen(true)}>
          Characters
        </button>
      </div>
      <div className="scene-dom-controls">
        <label>
          Assistant{" "}
          <select
            aria-label="Select office assistant"
            value={
              selected && agents.some((a) => a.id === selected)
                ? selected
                : (agents[0]?.id ?? "")
            }
            onChange={(e) => select(e.target.value)}
            disabled={!agents.length}
          >
            {!agents.length && <option value="">No assistants yet</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {presentAgent(agent, connected).label}
              </option>
            ))}
          </select>
        </label>
        <span>
          {reducedMotion
            ? "Reduced motion · all status and request controls remain available"
            : hidden
              ? "Decorative motion paused while hidden"
              : ""}
        </span>
      </div>
      <div className="live-room">
        {sceneFailure ? (
          <SceneError reason={sceneFailure} retry={retryScene} />
        ) : (
          <SceneBoundary
            key={sceneGeneration}
            fallback={<SceneError reason="initialization" retry={retryScene} />}
            onFailure={() => {
              setSceneReady(false);
              setSceneFailure("initialization");
            }}
          >
            <Canvas
              key={sceneGeneration}
              onCreated={() => setSceneReady(true)}
              orthographic
              camera={{ position: [10, 10, 13], zoom: 40, near: 0.1, far: 100 }}
              shadows={{ type: PCFShadowMap }}
              dpr={[1, 1.5]}
              fallback={
                <SceneError reason="initialization" retry={retryScene} />
              }
            >
              <SceneContextEvents onLost={lostContext} />
              <OfficeLighting />
              <Camera command={command} metrics={liveMetrics} />
              <Room />
              {visibleDesks.map((desk) => (
                <Workstation
                  key={desk.id}
                  position={desk.position}
                  rotation={desk.rotation}
                  components={desk.components}
                  highlighted={selectedDesk === desk.id}
                  anchors={!!editing}
                  onSelect={() => {
                    if (editing) {
                      setSelectedDesk(desk.id);
                      return;
                    }
                    const agent = agents.find(
                      (agent) =>
                        (savedLayout
                          ? savedLayout.assignments[agent.id]
                          : agent.deskId) === desk.id,
                    );
                    if (agent) select(agent.id);
                  }}
                />
              ))}
              {occupants.map(
                ({ agent, position, desk, view, asset, seated, seating }) =>
                  asset ? (
                    <Avatar
                      key={agent.id}
                      asset={asset}
                      id={agent.id}
                      position={position}
                      rotation={desk?.rotation ?? 0}
                      motion={
                        seated
                          ? "seated"
                          : isCueActive(agent.id, view)
                            ? "react"
                            : "idle"
                      }
                      seating={seating}
                      playing={!reducedMotion && !hidden && !view.pauseMotion}
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
                priorities={[
                  ...occupants.map((o) =>
                    o.view.requests.length
                      ? 2
                      : o.agent.id === selected
                        ? 1
                        : 0,
                  ),
                  -1,
                ]}
              />
            </Canvas>
          </SceneBoundary>
        )}
        <div className="scene-markers" hidden={!sceneReady || !!sceneFailure}>
          {occupants.map(
            ({ agent, view, desk, diagnostic, poseDiagnostic }, i) => (
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
                  <b aria-hidden="true">
                    {symbols[view.tone]}
                    {view.requests.length > 1 ? (
                      <sup>{view.requests.length}</sup>
                    ) : null}
                  </b>
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{view.label}</small>
                    {view.detail && <small>{view.detail}</small>}
                    {!desk && <small>Unassigned · safe standing</small>}
                    {poseDiagnostic && (
                      <small title={poseDiagnostic}>Standing fallback</small>
                    )}
                    {diagnostic && (
                      <small
                        className="character-diagnostic"
                        title={diagnostic}
                      >
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
            ),
          )}
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
              ? occupants.some((o) => o.seated)
                ? "Compatible characters seated at work"
                : "Saved character assignments · standing pose"
              : "Character placeholders shown"}
        </span>
      </div>
      <DOMAttentionQueue
        agents={agents}
        connected={connected}
        focusRequest={focusRequest}
      />
      <output
        hidden
        data-office-scene={JSON.stringify({
          scene: {
            ready: sceneReady,
            failure: sceneFailure ?? null,
            generation: sceneGeneration,
            hidden,
            reducedMotion,
          },
          layout: visibleLayout,
          editing: !!editing,
          selectedDesk,
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
            paused: view.pauseMotion || reducedMotion || hidden,
          })),
        })}
      />
      {layoutError && <p role="alert">{layoutError}</p>}
      {savedLayout?.recoveredFrom !== undefined && (
        <p className="layout-recovery" role="status">
          Layout restored from{" "}
          {savedLayout.recoveredFrom
            ? `valid revision ${savedLayout.recoveredFrom}`
            : "the default room"}{" "}
          to recover a valid room and safe assignment references.
        </p>
      )}
      <details className="layout-inventory">
        <summary>
          Furniture inventory · {visibleLayout.placements.length} workstations ·{" "}
          {layoutInventory(visibleLayout).componentCount} components + 6 room
          furniture
        </summary>
        <ul>
          {visibleLayout.placements.map((p) => (
            <li key={p.id} data-located={selectedDesk === p.id}>
              <span>
                {p.id} · {p.rotation * 90}° ·{" "}
                {completeWorkstation(p) ? "complete" : "incomplete"} ·{" "}
                {agents.find(
                  (agent) => visibleLayout.assignments[agent.id] === p.id,
                )?.name ?? "Unassigned"}
              </span>
              <button
                aria-label={`Locate ${p.id}`}
                onClick={() => locateDesk(p.id)}
              >
                Locate
              </button>
            </li>
          ))}
        </ul>
      </details>
      {editing && (
        <LayoutEditor
          snapshot={editing}
          agents={agents}
          selectedId={selectedDesk}
          select={setSelectedDesk}
          preview={setDraft}
          connected={connected}
          cancel={() => {
            setEditing(undefined);
            setDraft(undefined);
          }}
          saved={(value) => {
            setSavedLayout(value);
            onLayoutSaved?.(value);
            setEditing(undefined);
            setDraft(undefined);
          }}
        />
      )}
      {libraryOpen && (
        <CharacterLibrary
          agent={agents.find((a) => a.id === selected)}
          close={() => setLibraryOpen(false)}
        />
      )}
    </section>
  );
}
