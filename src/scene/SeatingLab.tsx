import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { type AvatarAsset, type AvatarMotion } from "./avatar";
import { Avatar, type Metrics } from "./ScenePrimitives";
import { OfficeLighting } from "./OfficeLighting";
import { characterManifestSchema } from "../../shared/assets";
import { type Point, type QuarterTurn } from "../../shared/scene";

const target = {
  seat: [0, 0.263, 0.72] as Point,
  keyboard: [0, 0.65, 0.38] as Point,
  compatibility: ["blueoffice.seated-work.v1"],
};
function Box({
  position,
  size,
  color,
}: {
  position: Point;
  size: Point;
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
function Furniture() {
  return (
    <>
      <Box position={[0, 0.57, 0]} size={[1.85, 0.1, 0.9]} color="#f4f7f8" />
      {[-0.79, 0.79].map((x) => (
        <Box
          key={x}
          position={[x, 0.28, 0]}
          size={[0.06, 0.56, 0.7]}
          color="#a9bac5"
        />
      ))}
      <Box
        position={[0, 0.218, 0.81]}
        size={[0.55, 0.09, 0.2]}
        color="#9bcddd"
      />
      <Box
        position={[0, 0.585, 1.16]}
        size={[0.55, 0.33, 0.07]}
        color="#9bcddd"
      />
      <Box
        position={[0, 0.11, 0.72]}
        size={[0.05, 0.22, 0.05]}
        color="#a9bac5"
      />
      <Box
        position={[0, 0.94, -0.2]}
        size={[0.68, 0.42, 0.055]}
        color="#354653"
      />
      <Box
        position={[0, 0.94, -0.164]}
        size={[0.61, 0.35, 0.01]}
        color="#c4e4ec"
      />
      <Box
        position={[0, 0.644, 0.38]}
        size={[0.46, 0.024, 0.14]}
        color="#c6d2d8"
      />
      {Array.from({ length: 10 }, (_, i) => (
        <Box
          key={i}
          position={[-0.2 + i * 0.044, 0.659, 0.38]}
          size={[0.026, 0.004, 0.09]}
          color="#f5f7fa"
        />
      ))}
    </>
  );
}
export function SeatingLab() {
  const [asset, setAsset] = useState<AvatarAsset>();
  const [motion, setMotion] = useState<AvatarMotion>("seated");
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [view, setView] = useState("front");
  const [time, setTime] = useState(0);
  const [compatible, setCompatible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const metrics = useRef<Metrics>({ avatars: {} });
  useEffect(() => {
    void (async () => {
      const manifest = characterManifestSchema.parse(
        await (await fetch("/artifacts/seating/manifest.json")).json(),
      );
      const gltf = await new GLTFLoader().loadAsync(
        "/artifacts/seating/" + manifest.model,
      );
      setAsset({
        gltf,
        scale: manifest.coordinates.scale,
        offset: manifest.coordinates.offset,
        clips: manifest.clips,
        seating: manifest.seating,
        hash: manifest.files[0].sha256,
        bounds: [],
      });
    })();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      (window as unknown as { seatingMetrics: Metrics }).seatingMetrics =
        structuredClone(metrics.current);
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <main
      style={{
        height: "100vh",
        background: "#eaf2f6",
        display: "grid",
        gridTemplateRows: "auto 1fr",
      }}
    >
      <div style={{ padding: 12, display: "flex", gap: 12 }}>
        <label>
          Motion{" "}
          <select
            value={motion}
            onChange={(e) => setMotion(e.target.value as AvatarMotion)}
          >
            {["seated", "idle", "walk", "react"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Rotate{" "}
          <select
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value) as QuarterTurn)}
          >
            {[0, 1, 2, 3].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          View{" "}
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {["front", "side", "office"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Time{" "}
          <input
            type="number"
            value={time}
            step=".5"
            onChange={(e) => setTime(Number(e.target.value))}
          />
        </label>
        <label>
          Compatible{" "}
          <input
            type="checkbox"
            checked={compatible}
            onChange={(e) => setCompatible(e.target.checked)}
          />
        </label>
        <label>
          Playing{" "}
          <input
            type="checkbox"
            checked={playing}
            onChange={(e) => setPlaying(e.target.checked)}
          />
        </label>
        <span>
          Original authored seated work pose · local private asset ·{" "}
          {asset?.hash.slice(0, 12)}
        </span>
      </div>
      <Canvas
        key={view}
        shadows
        orthographic
        camera={{
          position:
            view === "side"
              ? [4, 1.8, 0.5]
              : view === "office"
                ? [4, 4, 5]
                : [2, 2, -4],
          zoom: view === "office" ? 190 : 250,
        }}
      >
        <OfficeLighting />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[15, 15]} />
          <meshStandardMaterial color="#e9ddc8" />
        </mesh>
        <group rotation={[0, (rotation * Math.PI) / 2, 0]}>
          <Furniture />
          {asset && (
            <Avatar
              asset={asset}
              id="seated"
              position={motion === "seated" ? [0, 0, 0] : [1.05, 0, 0.72]}
              rotation={0}
              motion={motion}
              playing={playing}
              time={time}
              metrics={metrics}
              onSelect={() => {}}
              seating={{
                ...target,
                compatibility: compatible ? target.compatibility : [],
              }}
            />
          )}
        </group>
      </Canvas>
    </main>
  );
}
