import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Box3,
  LoopOnce,
  LoopRepeat,
  Mesh,
  OrthographicCamera,
  PCFShadowMap,
  Vector3,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  proofAvatar,
  workstation,
  worldAnchor,
  type Point,
  type ProofMotion,
  type QuarterTurn,
} from "../../shared/scene";
import {
  boneSignature,
  cloneAvatar,
  disposeAvatar,
  disposeAvatarInstance,
  loadProofAvatar,
  type AvatarAsset,
} from "./avatar";
import { Room, Workstation } from "./Room";
import "./scene.css";

const states = {
  idle: "Ready",
  tool: "Using a tool",
  question: "Needs an answer",
  approval: "Needs permission",
  error: "Task failed",
};
type FixtureState = keyof typeof states;
const symbols: Record<FixtureState, string> = {
  idle: "•",
  tool: "⚙",
  question: "?",
  approval: "◇",
  error: "!",
};
const positions: Point[] = [
  [-2.4, 0, 1.15],
  [1.15, 0, 0.6],
];
type Metrics = {
  camera?: { position: number[]; target: number[]; zoom: number };
  avatars: Record<
    string,
    {
      time: number;
      pose: string;
      boneId: string;
      geometryId: string;
      clip: string;
      box: number[];
    }
  >;
  renderer?: { calls: number; triangles: number };
};
type CameraCommand = {
  action: "reset" | "in" | "out" | "left" | "right" | "up" | "down";
  id: number;
};
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback" role="alert">
        The 3D preview could not start. The fixture controls and chat remain
        available. Reload to retry.
      </div>
    ) : (
      this.props.children
    );
  }
}
function Camera({
  command,
  metrics,
}: {
  command: CameraCommand;
  metrics: React.RefObject<Metrics>;
}) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(
    () => new OrbitControls(camera, gl.domElement),
    [camera, gl],
  );
  const baseZoom = useRef(40);
  const reset = () => {
    camera.position.set(10, 10, 13);
    controls.target.set(0, 0.6, 0);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    const box = new Box3(new Vector3(-5, -0.4, -4), new Vector3(5, 3.2, 4));
    const points = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          points.push(
            new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
          );
    const extent = new Box3().setFromPoints(points).getSize(new Vector3());
    baseZoom.current = Math.min(
      size.width / (extent.x + 1.2),
      size.height / (extent.y + 0.6),
    );
    camera.zoom = baseZoom.current;
    camera.updateProjectionMatrix();
    controls.update();
  };
  useEffect(() => {
    controls.enableRotate = false;
    controls.enableDamping = false;
    controls.screenSpacePanning = false;
    controls.zoomSpeed = 0.6;
    controls.panSpeed = 0.6;
    return () => controls.dispose();
  }, [controls]);
  useEffect(() => {
    reset();
  }, [size.width, size.height]);
  useEffect(() => {
    if (command.action === "reset") {
      reset();
      return;
    }
    if (command.action === "in" || command.action === "out")
      camera.zoom *= command.action === "in" ? 1.2 : 1 / 1.2;
    else {
      const delta = new Vector3(
        command.action === "left" ? -0.7 : command.action === "right" ? 0.7 : 0,
        0,
        command.action === "up" ? -0.7 : command.action === "down" ? 0.7 : 0,
      );
      camera.position.add(delta);
      controls.target.add(delta);
    }
    camera.updateProjectionMatrix();
    controls.update();
  }, [command]);
  useFrame(() => {
    const previous = controls.target.clone();
    controls.target.x = Math.max(-3, Math.min(3, controls.target.x));
    controls.target.z = Math.max(-2.5, Math.min(2.5, controls.target.z));
    controls.target.y = 0.6;
    camera.position.add(controls.target.clone().sub(previous));
    camera.zoom = Math.max(
      baseZoom.current * 0.7,
      Math.min(baseZoom.current * 2.6, camera.zoom),
    );
    controls.minZoom = baseZoom.current * 0.7;
    controls.maxZoom = baseZoom.current * 2.6;
    camera.updateProjectionMatrix();
    controls.update();
    metrics.current.camera = {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      zoom: camera.zoom,
    };
  });
  return null;
}
function Avatar({
  asset,
  id,
  position,
  rotation,
  motion,
  playing,
  time,
  metrics,
  onSelect,
}: {
  asset: AvatarAsset;
  id: string;
  position: Point;
  rotation: QuarterTurn;
  motion: ProofMotion;
  playing: boolean;
  time: number;
  metrics: React.RefObject<Metrics>;
  onSelect: () => void;
}) {
  const instance = useMemo(() => cloneAvatar(asset), [asset]);
  useEffect(() => () => disposeAvatarInstance(instance), [instance]);
  const measurement = useRef({ elapsed: 1, box: [] as number[] });
  const requested =
    motion === "missing" ? "Absent_Clip" : proofAvatar.clips[motion];
  const clip =
    asset.gltf.animations.find((c) => c.name === requested) ??
    asset.gltf.animations.find((c) => c.name === proofAvatar.clips.idle)!;
  useEffect(() => {
    instance.mixer.stopAllAction();
    const action = instance.mixer.clipAction(clip);
    action.reset();
    action.setLoop(motion === "react" ? LoopOnce : LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.play();
    instance.mixer.setTime(time);
    return () => {
      instance.mixer.stopAllAction();
      instance.mixer.uncacheRoot(instance.scene);
    };
  }, [instance, clip]);
  useEffect(() => {
    instance.mixer.clipAction(clip).reset().play();
    instance.mixer.setTime(time);
  }, [instance, clip, time]);
  useFrame((_, delta) => {
    if (playing) instance.mixer.update(Math.min(delta, 0.05));
    instance.scene.updateMatrixWorld(true);
    let bone: Object3D | undefined;
    let geometryId = "";
    instance.scene.traverse((o) => {
      if (!bone && o.type === "Bone") bone = o;
      if (!geometryId && o instanceof Mesh) geometryId = o.geometry.uuid;
    });
    measurement.current.elapsed += delta;
    if (measurement.current.elapsed > 0.5) {
      measurement.current.elapsed = 0;
      const box = new Box3().setFromObject(instance.scene, true);
      measurement.current.box = [...box.min.toArray(), ...box.max.toArray()];
    }
    metrics.current.avatars[id] = {
      time: instance.mixer.time,
      pose: boneSignature(instance.scene),
      boneId: bone?.uuid ?? "",
      geometryId,
      clip: clip.name,
      box: measurement.current.box,
    };
  });
  return (
    <group
      position={position}
      rotation={[0, (rotation * Math.PI) / 2, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <group scale={asset.scale}>
        <group position={asset.offset}>
          <primitive object={instance.scene} dispose={null} />
        </group>
      </group>
    </group>
  );
}
function Labels({
  markers,
  anchors,
  metrics,
  onMetrics,
}: {
  markers: React.RefObject<(HTMLButtonElement | null)[]>;
  anchors: Point[];
  metrics: React.RefObject<Metrics>;
  onMetrics: (metrics: Metrics) => void;
}) {
  const { camera, size, gl } = useThree();
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    anchors.forEach((point, i) => {
      const node = markers.current[i];
      if (!node) return;
      const p = new Vector3(...point).project(camera);
      node.style.transform = `translate(-50%,-100%) translate(${((p.x + 1) * size.width) / 2}px,${((1 - p.y) * size.height) / 2}px)`;
      node.style.visibility =
        Math.abs(p.x) < 1 && Math.abs(p.y) < 1 ? "visible" : "hidden";
    });
    elapsed.current += delta;
    if (elapsed.current > 0.5) {
      elapsed.current = 0;
      metrics.current.renderer = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      };
      onMetrics(structuredClone(metrics.current));
    }
  });
  return null;
}
export function SceneLab() {
  const [asset, setAsset] = useState<AvatarAsset>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [statuses, setStatuses] = useState<FixtureState[]>(["idle", "idle"]);
  const state = statuses[selected];
  const setState = (next: FixtureState) =>
    setStatuses((list) =>
      list.map((value, i) => (i === selected ? next : value)),
    );
  const [motion, setMotion] = useState<ProofMotion[]>(["idle", "walk"]);
  const [playing, setPlaying] = useState([true, true]);
  const [times, setTimes] = useState([0, 1]);
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [anchors, setAnchors] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({
    action: "reset",
    id: 0,
  });
  const [metrics, setMetrics] = useState<Metrics>({ avatars: {} });
  const liveMetrics = useRef<Metrics>({ avatars: {} });
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const generation = useRef(0);
  const avatarPositions = positions.map((p, i) =>
    worldAnchor(workstation.anchors.standing, p, i === 0 ? rotation : 0),
  );
  const names = ["Yuuka · A", "Yuuka · B"];
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (asset) disposeAvatar(asset.gltf);
    },
    [asset],
  );
  const open = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await loadProofAvatar(file);
      if (token !== generation.current) {
        disposeAvatar(next.gltf);
        return;
      }
      setAsset(next);
    } catch (error) {
      if (token === generation.current) setError((error as Error).message);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  };
  const camera = (action: CameraCommand["action"]) =>
    setCommand((c) => ({ action, id: c.id + 1 }));
  return (
    <div className="scene-lab">
      <header className="scene-header">
        <a href="/" aria-label="Return to BlueOffice">
          <img src="/blueoffice-logo.png" alt="BlueOffice" />
        </a>
        <div>
          <strong>Office scene proof</strong>
          <span>Offline fixture · no model commands</span>
        </div>
        <label className="asset-open">
          {loading ? "Opening character…" : "Open proof GLB"}
          <input
            aria-label="Open proof GLB"
            type="file"
            accept=".glb"
            disabled={loading}
            onChange={(e) => void open(e.target.files?.[0])}
          />
        </label>
      </header>
      <main className="scene-layout">
        <section className="scene-view" aria-label="Office scene">
          <div className="scene-caption">
            <span>Morning at BlueOffice</span>
            <h1>A place for good work.</h1>
            <p>Modern desks, a quiet coffee corner, and room to think.</p>
          </div>
          <div className="scene-canvas">
            <SceneBoundary>
              <Canvas
                orthographic
                camera={{
                  position: [10, 10, 13],
                  zoom: 40,
                  near: 0.1,
                  far: 100,
                }}
                shadows={{ type: PCFShadowMap }}
                dpr={[1, 1.5]}
                fallback={
                  <div role="alert">
                    WebGL is unavailable. Fixture controls remain usable.
                  </div>
                }
              >
                <color attach="background" args={["#eaf2f6"]} />
                <ambientLight intensity={1.6} />
                <hemisphereLight args={["#edfaff", "#b8a78d", 1]} />
                <directionalLight
                  position={[4, 10, 8]}
                  intensity={2.4}
                  castShadow
                  shadow-mapSize={[2048, 2048]}
                  shadow-camera-left={-8}
                  shadow-camera-right={8}
                  shadow-camera-top={8}
                  shadow-camera-bottom={-8}
                  shadow-normalBias={0.03}
                />
                <Camera command={command} metrics={liveMetrics} />
                <Room />
                {positions.map((position, i) => (
                  <Workstation
                    key={i}
                    position={position}
                    rotation={i === 0 ? rotation : 0}
                    anchors={anchors}
                    onSelect={() => setSelected(i)}
                  />
                ))}
                {asset &&
                  avatarPositions.map((position, i) => (
                    <Avatar
                      key={`${asset.hash}:${i}`}
                      asset={asset}
                      id={String(i)}
                      position={position}
                      rotation={i === 0 ? rotation : 0}
                      motion={motion[i]}
                      playing={playing[i]}
                      time={times[i]}
                      metrics={liveMetrics}
                      onSelect={() => setSelected(i)}
                    />
                  ))}
                <Labels
                  markers={markers}
                  anchors={[
                    ...avatarPositions.map(
                      (p) => [p[0], p[1] + 1.85, p[2]] as Point,
                    ),
                    [-2.2, 2, -2.8],
                  ]}
                  metrics={liveMetrics}
                  onMetrics={setMetrics}
                />
              </Canvas>
            </SceneBoundary>
            <div className="scene-markers">
              {names.map((name, i) => (
                <button
                  key={name}
                  ref={(el) => {
                    markers.current[i] = el;
                  }}
                  className={`scene-marker ${selected === i ? "selected" : ""}`}
                  onClick={() => setSelected(i)}
                  aria-label={`Select ${name}: ${states[statuses[i]]}`}
                >
                  <b className={`state-${statuses[i]}`}>
                    {symbols[statuses[i]]}
                  </b>
                  <span>{name}</span>
                </button>
              ))}
              <button
                ref={(el) => {
                  markers.current[2] = el;
                }}
                className="cafe-marker"
                tabIndex={-1}
              >
                Coffee &amp; a little pause
              </button>
            </div>
          </div>
          <nav className="camera-controls" aria-label="Scene camera">
            <button onClick={() => camera("out")} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => camera("in")} aria-label="Zoom in">
              +
            </button>
            <button onClick={() => camera("left")} aria-label="Pan left">
              ←
            </button>
            <button onClick={() => camera("right")} aria-label="Pan right">
              →
            </button>
            <button onClick={() => camera("reset")}>Reset view</button>
          </nav>
          {!asset && (
            <div className="scene-empty">
              <strong>Bring the character into the room</strong>
              <p>
                Open the normalized Yuuka proof GLB. Character files stay in
                this browser and are not uploaded.
              </p>
            </div>
          )}
          <p className="scene-footnote">
            Standing compatibility preview. Seated computer work is not yet
            validated.
          </p>
        </section>
        <aside className="scene-chat" aria-label="Fixture chat">
          <div className="fixture-agent">
            <span className="fixture-monogram">Y</span>
            <div>
              <h2>{names[selected]}</h2>
              <p>{states[state]}</p>
            </div>
          </div>
          <div className="fixture-conversation">
            <p className="fixture-label">Local scene fixture</p>
            <p>
              The room is ready for a material and motion check. This
              conversation does not contact Hermes.
            </p>
            {state === "question" && (
              <section className="fixture-request">
                <h3>Which workstation should I use?</h3>
                <button onClick={() => setState("idle")}>Window desk</button>
                <button onClick={() => setState("idle")}>
                  Coffee-side desk
                </button>
              </section>
            )}
            {state === "approval" && (
              <section className="fixture-request">
                <h3>Permission requested</h3>
                <p>Synthetic request to inspect a fixture folder.</p>
                <button onClick={() => setState("idle")}>
                  Deny fixture request
                </button>
              </section>
            )}
            {state === "tool" && (
              <p role="status">Running a synthetic workspace inspection.</p>
            )}
            {state === "error" && (
              <p role="alert">
                Synthetic task failure. Animation does not change the task
                outcome.
              </p>
            )}
          </div>
          <section className="fixture-controls" aria-label="Scene fixtures">
            <label>
              Selected character
              <select
                aria-label="Selected character"
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {names.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status fixture
              <select
                aria-label="Status fixture"
                value={state}
                onChange={(e) => setState(e.target.value as FixtureState)}
              >
                {Object.entries(states).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preview motion
              <select
                aria-label="Preview motion"
                value={motion[selected]}
                onChange={(e) =>
                  setMotion((list) =>
                    list.map((m, i) =>
                      i === selected ? (e.target.value as ProofMotion) : m,
                    ),
                  )
                }
              >
                <option value="idle">Café idle</option>
                <option value="walk">Café walk (in place)</option>
                <option value="react">Café reaction</option>
                <option value="missing">Missing clip fallback</option>
              </select>
            </label>
            {motion[selected] === "missing" && (
              <p role="status">
                Requested clip is unavailable. Showing café idle; no work pose
                is implied.
              </p>
            )}
            <div className="fixture-actions">
              <button
                onClick={() =>
                  setPlaying((list) =>
                    list.map((v, i) => (i === selected ? !v : v)),
                  )
                }
              >
                {playing[selected] ? "Pause selected" : "Play selected"}
              </button>
              <button
                onClick={() =>
                  setRotation((value) => ((value + 1) % 4) as QuarterTurn)
                }
              >
                Rotate workstation A
              </button>
            </div>
            <label>
              Sample time
              <input
                aria-label="Sample time"
                type="range"
                min="0"
                max="4"
                step=".05"
                value={times[selected]}
                onChange={(e) => {
                  setPlaying((list) =>
                    list.map((v, i) => (i === selected ? false : v)),
                  );
                  setTimes((list) =>
                    list.map((v, i) =>
                      i === selected ? Number(e.target.value) : v,
                    ),
                  );
                }}
              />
            </label>
            <label className="fixture-check">
              <input
                type="checkbox"
                checked={anchors}
                onChange={(e) => setAnchors(e.target.checked)}
              />
              Show footprints and anchors
            </label>
            {error && <p role="alert">{error}</p>}
          </section>
          <details className="scene-diagnostics">
            <summary>Inspection details</summary>
            <p>
              Character redistribution permission is unverified. This local
              proof does not bundle model bytes.
            </p>
            <p>
              Unit: meter · Y-up · forward +Z. Each character owns a separate
              skeleton and mixer.
            </p>
            <output
              data-scene-report={JSON.stringify({
                ...metrics,
                asset: asset
                  ? {
                      hash: asset.hash,
                      bounds: asset.bounds,
                      scale: asset.scale,
                    }
                  : null,
                rotation,
              })}
            >
              {asset
                ? `${asset.gltf.animations.length} source clips · ${asset.gltf.scene.children.length} scene roots`
                : "No character loaded"}
            </output>
          </details>
        </aside>
      </main>
    </div>
  );
}
