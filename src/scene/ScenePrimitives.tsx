import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Box3,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Vector3,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  type Point,
  type ProofMotion,
  type QuarterTurn,
} from "../../shared/scene";
import {
  boneSignature,
  cloneAvatar,
  disposeAvatarInstance,
  resolveAvatarClip,
  type AvatarAsset,
  type AvatarMotion,
} from "./avatar";

import { packSceneMarkers } from "../../shared/scene-markers";
import { seatedPlacement, type SeatingTarget } from "../../shared/seating";

export type Metrics = {
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
      seating?: ReturnType<typeof seatedPlacement>;
    }
  >;
  renderer?: { calls: number; triangles: number };
};
export type CameraCommand = {
  action: "reset" | "in" | "out" | "left" | "right" | "up" | "down" | "locate";
  id: number;
  target?: Point;
};
export class SceneBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure?.();
  }
  render() {
    return this.state.failed
      ? (this.props.fallback ?? (
          <div className="scene-fallback" role="alert">
            The 3D preview could not start. The agent controls and chat remain
            available. Reload to retry.
          </div>
        ))
      : this.props.children;
  }
}
export function SceneContextEvents({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}
export function Camera({
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
  const locatedTarget = useRef<Point | undefined>(undefined);
  const reset = (preserveView = false) => {
    const target = controls.target.clone();
    const zoomRatio = camera.zoom / baseZoom.current;
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
    if (preserveView) {
      camera.position.add(target.clone().sub(controls.target));
      controls.target.copy(target);
    }
    camera.zoom = baseZoom.current * (preserveView ? zoomRatio : 1);
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
  const fitted = useRef(false);
  useEffect(() => {
    reset(fitted.current);
    fitted.current = true;
  }, [size.width, size.height]);
  useEffect(() => {
    if (command.action === "reset") {
      locatedTarget.current = undefined;
      reset();
      return;
    }
    if (command.action === "locate" && command.target) {
      locatedTarget.current = command.target;
      const next = new Vector3(command.target[0], 0.6, command.target[2]);
      camera.position.add(next.clone().sub(controls.target));
      controls.target.copy(next);
      camera.zoom = baseZoom.current * 1.5;
    } else if (command.action === "in" || command.action === "out")
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
    const xExtent = Math.max(3, Math.abs(locatedTarget.current?.[0] ?? 0));
    const zExtent = Math.max(2.5, Math.abs(locatedTarget.current?.[2] ?? 0));
    controls.target.x = Math.max(
      -xExtent,
      Math.min(xExtent, controls.target.x),
    );
    controls.target.z = Math.max(
      -zExtent,
      Math.min(zExtent, controls.target.z),
    );
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
export function Avatar({
  asset,
  id,
  position,
  rotation,
  motion,
  playing,
  time,
  metrics,
  onSelect,
  seating,
  heading,
  cueKey,
}: {
  heading?: number;
  cueKey?: string;
  asset: AvatarAsset;
  seating?: SeatingTarget;
  id: string;
  position: Point;
  rotation: QuarterTurn;
  motion: AvatarMotion;
  playing: boolean;
  time: number;
  metrics: React.RefObject<Metrics>;
  onSelect: () => void;
}) {
  const instance = useMemo(() => cloneAvatar(asset), [asset]);
  useEffect(() => () => disposeAvatarInstance(instance), [instance]);
  const measurement = useRef({ elapsed: 1, box: [] as number[] });
  const placement = seatedPlacement(
    asset.clips?.seated &&
      asset.gltf.animations.some((c) => c.name === asset.clips?.seated)
      ? asset.seating
      : undefined,
    seating,
  );
  const effectiveMotion =
    motion === "seated" && !placement.compatible ? "idle" : motion;
  const { clip } = resolveAvatarClip(
    asset.gltf.animations,
    effectiveMotion,
    asset.clips,
  );
  useEffect(() => {
    instance.mixer.stopAllAction();
    const action = instance.mixer.clipAction(clip);
    action.reset();
    action.setLoop(
      motion === "react" ? LoopOnce : LoopRepeat,
      motion === "react" ? 1 : Infinity,
    );
    action.clampWhenFinished = true;
    action.play();
    instance.mixer.setTime(time);
    return () => {
      instance.mixer.stopAllAction();
      instance.mixer.uncacheRoot(instance.scene);
    };
  }, [instance, clip, cueKey]);
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
      seating: motion === "seated" ? placement : undefined,
    };
  });
  return (
    <group
      position={position}
      rotation={[0, heading ?? (rotation * Math.PI) / 2, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <group
        position={
          motion === "seated" && placement.compatible
            ? placement.offset
            : [0, 0, 0]
        }
        rotation={[
          0,
          motion === "seated" && placement.compatible
            ? (placement.facing * Math.PI) / 2
            : 0,
          0,
        ]}
      >
        <group scale={asset.scale}>
          <group position={asset.offset}>
            <primitive object={instance.scene} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  );
}
export function Labels({
  markers,
  anchors,
  metrics,
  onMetrics,
  priorities,
}: {
  markers: React.RefObject<(HTMLButtonElement | null)[]>;
  anchors: Point[];
  metrics: React.RefObject<Metrics>;
  onMetrics: (metrics: Metrics) => void;
  priorities?: number[];
}) {
  const { camera, size, gl } = useThree();
  const elapsed = useRef(0);
  const sizes = useRef(
    new WeakMap<
      HTMLElement,
      { signature: string; width: number; height: number }
    >(),
  );
  const lastPacking = useRef("");
  useFrame((_, delta) => {
    const projected = anchors.flatMap((point, i) => {
      const node = markers.current[i];
      if (!node) return [];
      const p = new Vector3(...point).project(camera);
      const visible = Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      node.style.visibility = visible ? "visible" : "hidden";
      if (!visible) return [];
      const signature = `${node.textContent}/${node.className}/${size.width}`;
      let measured = sizes.current.get(node);
      if (!measured || measured.signature !== signature) {
        node.removeAttribute("data-collapsed");
        measured = {
          signature,
          width: node.offsetWidth,
          height: node.offsetHeight,
        };
        sizes.current.set(node, measured);
      }
      return [
        {
          id: i,
          x: ((p.x + 1) * size.width) / 2,
          y: ((1 - p.y) * size.height) / 2,
          width: measured.width,
          height: measured.height,
          priority: priorities?.[i] ?? 0,
        },
      ];
    });
    const packing = JSON.stringify([
      size.width,
      size.height,
      projected.map((p) => [
        p.id,
        Math.round(p.x),
        Math.round(p.y),
        p.width,
        p.height,
        p.priority,
      ]),
    ]);
    if (packing !== lastPacking.current) {
      lastPacking.current = packing;
      for (const placed of packSceneMarkers(
        projected,
        size.width,
        size.height,
      )) {
        const node = markers.current[placed.id]!;
        node.dataset.collapsed = String(placed.collapsed);
        node.style.transform = `translate(-50%,-100%) translate(${placed.x}px,${placed.y}px)`;
      }
    }
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
