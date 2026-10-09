import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ScenePerformance, useSceneQuality } from "./ScenePerformance";
import { parseSceneQuality } from "../../shared/scene-quality";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import { presentAgent, type OfficeAgent } from "../../shared/office";
import {
  CompletionTracker,
  updateCompletionCues,
  type CompletionCues,
} from "../../shared/presentation";
import {
  roomFurnitureItems,
  workstation,
  worldAnchor,
  type Point,
} from "../../shared/scene";
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
import { useSceneMotion } from "./useSceneMotion";
import { SceneSound } from "./scene-sound";
import { DOMAttentionQueue } from "./DOMAttentionQueue";
import { SceneError } from "./SceneError";
import { Room, Workstation } from "./Room";
import { GameWindow } from "../GameWindow";
import { GameIcon } from "../GameIcon";
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
  settingsOpen = false,
  closeSettings = () => {},
  transfer,
}: {
  settingsOpen?: boolean;
  closeSettings?: () => void;
  transfer?: ReactNode;
  agents: OfficeAgent[];
  connected: boolean;
  selected?: string;
  select: (id: string) => void;
  focusRequest: (agentId: string, requestId: string) => void;
  layout?: LayoutSnapshot;
  onLayoutSaved?: (layout: LayoutSnapshot) => void;
  locate?: { deskId: string; token: number };
}) {
  const { quality, setQuality, policy } = useSceneQuality();
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
  const sound = useRef(new SceneSound());
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [lounge, setLounge] = useState(false);
  const noticedRequests = useRef(new Set<string>());
  const soundInitialized = useRef(false);
  useEffect(() => () => sound.current.dispose(), []);
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
    if (ids.length && soundOn && !hidden && !reducedMotion)
      sound.current.play();
    setCues((previous) =>
      updateCompletionCues(
        previous,
        agents,
        connected,
        ids,
        performance.now() + 3000,
      ),
    );
  }, [agents, connected, soundOn, hidden, reducedMotion]);
  useEffect(() => {
    const requestIds = agents.flatMap((a) =>
      presentAgent(a, connected).requests.map((r) => `${a.id}/${r.id}`),
    );
    const fresh = requestIds.some((id) => !noticedRequests.current.has(id));
    requestIds.forEach((id) => noticedRequests.current.add(id));
    if (
      soundInitialized.current &&
      fresh &&
      soundOn &&
      !hidden &&
      !reducedMotion
    )
      sound.current.play();
    if (connected) soundInitialized.current = true;
  }, [agents, connected, soundOn, hidden, reducedMotion]);
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
  const baseOccupants = agents.map((agent, i) => {
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
      standingPosition,
      canReact:
        !!entry?.asset?.clips?.react &&
        entry.asset.gltf.animations.some(
          (c) => c.name === entry.asset?.clips?.react,
        ),
      canWalk:
        !!entry?.asset?.clips?.walk &&
        entry.asset.gltf.animations.some(
          (c) => c.name === entry.asset?.clips?.walk,
        ),
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
  const intents = baseOccupants.map((o, i) => ({
    id: o.agent.id,
    goal:
      o.view.tone === "working"
        ? o.standingPosition
        : lounge
          ? safeStandingPosition(i)
          : o.desk
            ? worldAnchor(
                workstation.anchors.approach,
                o.desk.position,
                o.desk.rotation,
              )
            : o.standingPosition,
    fallback: o.standingPosition,
    deskId: o.desk?.id,
    destinationKey: JSON.stringify([
      o.desk?.id,
      o.desk?.position,
      o.desk?.rotation,
      o.view.tone === "working",
      o.agent.turnId,
      lounge,
      o.canWalk,
      hidden,
      reducedMotion,
      o.view.canCelebrate && cues[o.agent.id]?.key === o.view.terminalKey,
    ]),
    canWalk: o.canWalk,
    preempt:
      o.view.pauseMotion ||
      o.view.requests.length > 0 ||
      !connected ||
      !!editing ||
      (o.view.canCelebrate && cues[o.agent.id]?.key === o.view.terminalKey),
    paused: hidden || reducedMotion || !!sceneFailure,
  }));
  const actors = useSceneMotion(
    intents,
    visibleLayout.placements,
    hidden || reducedMotion || !!sceneFailure,
  );
  const occupants = baseOccupants.map((o, i) => {
    const actor = actors[o.agent.id];
    const preempt = intents[i].preempt || intents[i].paused;
    const walking =
      !preempt &&
      !!actor?.walking &&
      o.canWalk &&
      actor.destinationKey === intents[i].destinationKey;
    const seated = o.seated && !walking && !preempt && !actor?.reason;
    return {
      ...o,
      walking,
      heading: walking ? actor?.heading : undefined,
      position: preempt
        ? o.standingPosition
        : walking
          ? actor.position
          : seated
            ? o.position
            : actor && actor.destinationKey === intents[i].destinationKey
              ? actor.position
              : o.standingPosition,
      motionReason: actor?.reason,
      route: walking ? actor.route : [],
      seated,
    };
  });
  const isCueActive = (id: string, view: ReturnType<typeof presentAgent>) =>
    view.canCelebrate &&
    cues[id]?.key === view.terminalKey &&
    !!baseOccupants.find((o) => o.agent.id === id)?.canReact;
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
      <div className="scene-tools">
        <button
          disabled={!connected || !savedLayout || !!editing}
          onClick={() => {
            if (savedLayout) {
              setEditing(structuredClone(savedLayout));
              setDraft(structuredClone(savedLayout));
            }
          }}
          className="hud-button"
          aria-label="Edit office"
          title="Edit office"
        >
          <GameIcon name="furniture" />
          <span>Furnish</span>
        </button>
        <button
          className="hud-button"
          aria-label="Characters"
          title="Characters"
          disabled={!connected}
          onClick={() => setLibraryOpen(true)}
        >
          <GameIcon name="character" />
          <span>Characters</span>
        </button>
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
              shadows={policy.shadows ? { type: PCFShadowMap } : false}
              dpr={policy.dpr}
              fallback={
                <SceneError reason="initialization" retry={retryScene} />
              }
            >
              <ScenePerformance quality={quality} />
              <SceneContextEvents onLost={lostContext} />
              <OfficeLighting />
              <Camera command={command} metrics={liveMetrics} />
              <Room decorative={policy.decorative} />
              {visibleDesks.map((desk) => (
                <Workstation
                  key={desk.id}
                  position={desk.position}
                  rotation={desk.rotation}
                  components={desk.components}
                  decorative={policy.decorative}
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
                ({
                  agent,
                  position,
                  desk,
                  view,
                  asset,
                  seated,
                  seating,
                  walking,
                  heading,
                }) =>
                  asset ? (
                    <Avatar
                      key={agent.id}
                      asset={asset}
                      id={agent.id}
                      position={position}
                      rotation={desk?.rotation ?? 0}
                      heading={heading}
                      cueKey={
                        isCueActive(agent.id, view)
                          ? cues[agent.id]?.key
                          : undefined
                      }
                      motion={
                        walking
                          ? "walk"
                          : seated
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
                  ...occupants.map(
                    ({ position, asset, desk, seated, seating }) => {
                      const anchor = asset?.anchors?.nameplate ?? [0, 1.85, 0];
                      const seat = seated
                        ? seatedPlacement(asset?.seating, seating)
                        : undefined;
                      const offset = seat?.compatible ? seat.offset : [0, 0, 0];
                      return worldAnchor(
                        anchor.map((n, i) => n + offset[i]) as Point,
                        position,
                        desk?.rotation ?? 0,
                      );
                    },
                  ),
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
                  title={`${agent.name} · ${view.label}`}
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
                  <span className="marker-caption">
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
          <button
            aria-label="Reset view"
            title="Reset view"
            onClick={() => camera("reset")}
          >
            <GameIcon name="home" />
          </button>
        </nav>
      </div>
      {settingsOpen && (
        <GameWindow
          title="Office settings"
          close={closeSettings}
          className="room-settings-window"
        >
          <div className="scene-dom-controls">
            <label>
              Scene quality{" "}
              <select
                aria-label="Scene quality"
                value={quality}
                onChange={(event) =>
                  setQuality(parseSceneQuality(event.target.value))
                }
              >
                <option value="ordinary">Ordinary</option>
                <option value="reduced">
                  Reduced · fewer decorative details
                </option>
              </select>
            </label>
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
            <label>
              <input
                type="checkbox"
                checked={lounge}
                onChange={(e) => setLounge(e.target.checked)}
              />{" "}
              Lounge idle assistants
            </label>
            <label>
              <input
                type="checkbox"
                checked={soundOn}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  if (!enabled) {
                    setSoundOn(false);
                    return;
                  }
                  try {
                    await sound.current.enable();
                    setSoundOn(true);
                    setSoundError("");
                  } catch {
                    setSoundOn(false);
                    setSoundError(
                      "Sound could not start; visual attention remains available.",
                    );
                  }
                }}
              />{" "}
              Quiet notification sound
            </label>
            {soundError && <span role="status">{soundError}</span>}
            <span>
              {reducedMotion
                ? "Reduced motion · all status and request controls remain available"
                : hidden
                  ? "Decorative motion paused while hidden"
                  : ""}
            </span>
          </div>
          {transfer}
          <details className="layout-inventory">
            <summary>
              Furniture inventory · {visibleLayout.placements.length}{" "}
              workstations · {layoutInventory(visibleLayout).componentCount}{" "}
              components + {layoutInventory(visibleLayout).roomFurnitureCount}{" "}
              room furniture
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
              {roomFurnitureItems.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <button
                    aria-label={`Locate ${item.name}`}
                    onClick={() =>
                      setCommand((c) => ({
                        action: "locate",
                        target: item.position,
                        id: c.id + 1,
                      }))
                    }
                  >
                    Locate
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <span role="status">
            {selectedCharacter?.diagnostic
              ? `${selectedCharacter.agent.name}: ${selectedCharacter.diagnostic}`
              : selectedCharacter?.motionReason &&
                  !selectedCharacter.view.pauseMotion &&
                  !hidden &&
                  !reducedMotion &&
                  !selectedCharacter.view.canCelebrate
                ? `${selectedCharacter.agent.name}: ${selectedCharacter.motionReason} Staying at a safe position.`
                : occupants.some((o) => o.asset)
                  ? occupants.some((o) => o.seated)
                    ? "Compatible characters seated at work"
                    : "Saved character assignments · standing pose"
                  : "Character placeholders shown"}
          </span>
        </GameWindow>
      )}
      {sceneFailure && (
        <DOMAttentionQueue
          agents={agents}
          connected={connected}
          focusRequest={focusRequest}
        />
      )}
      <output
        hidden
        data-office-scene={JSON.stringify({
          scene: {
            quality,
            ready: sceneReady,
            failure: sceneFailure ?? null,
            generation: sceneGeneration,
            hidden,
            reducedMotion,
            lounge,
            soundOn,
            soundsPlayed: sound.current.played,
          },
          layout: visibleLayout,
          editing: !!editing,
          selectedDesk,
          camera: metrics.camera,
          assets: occupants.filter((o) => o.asset).map((o) => o.agent.avatar),
          avatars: metrics.avatars,
          agents: occupants.map(
            ({
              agent,
              view,
              desk,
              diagnostic,
              position,
              walking,
              heading,
              route,
              motionReason,
              seated,
            }) => ({
              id: agent.id,
              deskId: desk?.id,
              avatar: agent.avatar,
              diagnostic,
              label: view.label,
              work: agent.work,
              requests: view.requests.map((request) => request.id),
              cue: isCueActive(agent.id, view),
              motion: walking
                ? "walk"
                : seated
                  ? "seated"
                  : isCueActive(agent.id, view)
                    ? "react"
                    : "idle",
              position,
              heading,
              route,
              motionReason,
              paused: view.pauseMotion || reducedMotion || hidden,
            }),
          ),
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
      {editing && (
        <GameWindow
          title="Furnish office"
          className="furniture-window"
          close={() => {
            setEditing(undefined);
            setDraft(undefined);
          }}
        >
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
        </GameWindow>
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
