import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, Float32BufferAttribute } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type LayoutPlacement } from "../../shared/layout";
import { workstation, type Point, type QuarterTurn } from "../../shared/scene";

const palette = {
  white: "#fff8e9",
  frame: "#947651",
  blue: "#81afc6",
  wood: "#d6ae77",
  ink: "#354d5b",
  green: "#719c77",
  brass: "#bca36d",
};
function Box({
  position,
  size,
  color,
  rounded = false,
  ...props
}: {
  position: Point;
  size: Point;
  color: string;
  rotation?: Point;
  rounded?: boolean;
}) {
  const geometry = useMemo(
    () =>
      rounded
        ? new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.22)
        : new BoxGeometry(...size),
    [rounded, ...size],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={position}
      geometry={geometry}
      castShadow
      receiveShadow
      {...props}
    >
      <meshStandardMaterial color={color} roughness={0.76} />
    </mesh>
  );
}
function Cylinder({
  position,
  radius,
  height,
  color,
}: {
  position: Point;
  radius: number;
  height: number;
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 20]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  );
}
function Plant({ position, scale = 1 }: { position: Point; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Cylinder
        position={[0, 0.22, 0]}
        radius={0.22}
        height={0.44}
        color={palette.white}
      />
      <Cylinder
        position={[0, 0.435, 0]}
        radius={0.235}
        height={0.045}
        color={palette.wood}
      />
      <Cylinder
        position={[0, 0.6, 0]}
        radius={0.035}
        height={0.6}
        color="#8e9c74"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin(i * 2) * 0.15,
            0.65 + i * 0.075,
            Math.cos(i * 2) * 0.15,
          ]}
          scale={[0.18, 0.32, 0.12]}
          rotation={[0, i * 1.1, 0.4]}
          castShadow
        >
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={palette.green} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
function Chair() {
  return (
    <group position={workstation.anchors.chair}>
      {[-0.22, 0.22].flatMap((x) =>
        [-0.17, 0.29].map((z) => (
          <Box
            key={`${x}-${z}`}
            position={[x, 0.105, z]}
            size={[0.045, 0.21, 0.045]}
            color={palette.frame}
          />
        )),
      )}
      <Box
        position={[0, 0.19, 0.07]}
        size={[0.59, 0.04, 0.57]}
        color={palette.frame}
        rounded
      />
      <Box
        position={[0, 0.238, 0.07]}
        size={[0.55, 0.05, 0.53]}
        color={palette.blue}
        rounded
      />
      <Box
        position={[0, 0.585, 0.44]}
        size={[0.59, 0.35, 0.08]}
        color={palette.frame}
        rounded
      />
      <Box
        position={[0, 0.585, 0.39]}
        size={[0.5, 0.27, 0.035]}
        color={palette.blue}
        rounded
      />
      {[-0.23, 0.23].map((x) => (
        <Box
          key={x}
          position={[x, 0.35, 0.31]}
          size={[0.035, Math.hypot(0.26, 0.26), 0.035]}
          rotation={[Math.PI / 4, 0, 0]}
          color={palette.frame}
        />
      ))}
    </group>
  );
}
export function Workstation({
  position,
  rotation,
  anchors,
  onSelect,
  components,
  highlighted = false,
  decorative = true,
}: {
  position: Point;
  rotation: QuarterTurn;
  anchors: boolean;
  onSelect: () => void;
  components?: LayoutPlacement["components"];
  highlighted?: boolean;
  decorative?: boolean;
}) {
  return (
    <group
      position={position}
      rotation={[0, (rotation * Math.PI) / 2, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {components?.desk !== false && (
        <>
          <Box
            position={workstation.anchors.desk}
            size={[1.85, 0.1, 0.9]}
            color={palette.wood}
            rounded
          />
          {[-0.77, 0.77].flatMap((x) =>
            [-0.32, 0.32].map((z) => (
              <group key={`${x}-${z}`}>
                <Box
                  position={[x, 0.28, z]}
                  size={[0.075, 0.54, 0.075]}
                  color={palette.frame}
                />
                {decorative && (
                  <Box
                    position={[x, 0.065, z]}
                    size={[0.079, 0.09, 0.079]}
                    color={palette.brass}
                  />
                )}
              </group>
            )),
          )}
          <Box
            position={[0, 0.48, -0.31]}
            size={[1.6, 0.16, 0.065]}
            color={palette.frame}
          />
          {decorative && (
            <Box
              position={[0.54, 0.48, 0.34]}
              size={[0.42, 0.14, 0.05]}
              color={palette.wood}
              rounded
            />
          )}
        </>
      )}
      {components?.computer !== false && (
        <>
          <Box
            position={[0, 0.635, -0.18]}
            size={[0.33, 0.035, 0.22]}
            color={palette.ink}
            rounded
          />
          <Box
            position={[0, 0.77, -0.22]}
            size={[0.055, 0.3, 0.04]}
            color={palette.ink}
          />
          <Box
            position={workstation.anchors.monitor}
            size={[0.72, 0.43, 0.055]}
            color={palette.ink}
            rounded
          />
          <Box
            position={[0, 0.94, -0.166]}
            size={[0.66, 0.36, 0.008]}
            color="#c3e1e7"
          />
          {decorative && (
            <Box
              position={[0, 0.86, -0.158]}
              size={[0.48, 0.018, 0.008]}
              color="#eaf5f3"
            />
          )}
        </>
      )}
      {components?.keyboard !== false && (
        <>
          <Box
            position={workstation.anchors.keyboard}
            size={[0.53, 0.025, 0.2]}
            color={palette.white}
            rounded
          />
          {decorative &&
            [0, 1, 2].map((row) => (
              <Box
                key={row}
                position={[0, 0.668, 0.33 + row * 0.045]}
                size={[0.46, 0.008, 0.018]}
                color="#9db7bf"
              />
            ))}
        </>
      )}
      {decorative && components?.desk !== false && (
        <>
          <Box
            position={[0.41, 0.635, 0.38]}
            size={[0.085, 0.03, 0.13]}
            color={palette.white}
            rounded
          />
          <Cylinder
            position={[-0.65, 0.71, 0.22]}
            radius={0.067}
            height={0.17}
            color="#edc19b"
          />
          <Cylinder
            position={[-0.65, 0.797, 0.22]}
            radius={0.051}
            height={0.003}
            color="#6b4c36"
          />
          <Plant position={[0.69, 0.62, -0.22]} scale={0.27} />
        </>
      )}
      {components?.chair !== false && <Chair />}
      {highlighted && (
        <mesh position={[0, 0.01, 0.38]}>
          <boxGeometry
            args={[
              workstation.footprint.width,
              0.02,
              workstation.footprint.depth,
            ]}
          />
          <meshBasicMaterial color="#2d80c9" wireframe />
        </mesh>
      )}
      {anchors && (
        <>
          <mesh
            position={[
              workstation.footprint.center[0],
              0.014,
              workstation.footprint.center[2],
            ]}
          >
            <boxGeometry
              args={[
                workstation.footprint.width,
                0.02,
                workstation.footprint.depth,
              ]}
            />
            <meshBasicMaterial color="#308da3" wireframe />
          </mesh>
          {Object.entries(workstation.anchors).map(([name, p]) => (
            <mesh key={name} position={p}>
              <sphereGeometry args={[0.05, 12, 8]} />
              <meshBasicMaterial
                color={name === "seat" ? "#e98577" : "#2d80c9"}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/** Staggered parquet is one draw call, including the subtle plank color variation. */
function Parquet() {
  const geometry = useMemo(() => {
    const planks = [];
    const tones = ["#dfc397", "#e4cda6", "#d9b98c", "#ead1a7", "#dec096"];
    for (let row = 0; row < 20; row++) {
      const offset = row % 2 ? 0.8 : 0;
      for (let col = -1; col < 7; col++) {
        const start = Math.max(-4.94, -4.94 + col * 1.6 + offset);
        const end = Math.min(4.94, -4.94 + (col + 1) * 1.6 + offset);
        if (end <= start) continue;
        const plank = new BoxGeometry(end - start - 0.012, 0.008, 0.382);
        plank.translate((start + end) / 2, -0.002, -3.8 + row * 0.39);
        const color = new Color(tones[(row * 3 + col + 5) % tones.length]);
        const colors = [];
        for (let vertex = 0; vertex < plank.attributes.position.count; vertex++)
          colors.push(color.r, color.g, color.b);
        plank.setAttribute("color", new Float32BufferAttribute(colors, 3));
        planks.push(plank);
      }
    }
    const merged = mergeGeometries(planks)!;
    planks.forEach((plank) => plank.dispose());
    return merged;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
function Window({
  position,
  width = 2.65,
}: {
  position: Point;
  width?: number;
}) {
  return (
    <group position={position}>
      <Box
        position={[0, 0, 0]}
        size={[width, 1.42, 0.06]}
        color={palette.white}
      />
      <mesh position={[0, 0, 0.037]}>
        <boxGeometry args={[width - 0.14, 1.28, 0.012]} />
        <meshStandardMaterial
          color="#c3e5ee"
          emissive="#d4edf2"
          emissiveIntensity={0.22}
          roughness={0.4}
        />
      </mesh>
      {[-width / 6, width / 6].map((x) => (
        <Box
          key={x}
          position={[x, 0, 0.06]}
          size={[0.045, 1.3, 0.045]}
          color={palette.white}
        />
      ))}
      <Box
        position={[0, 0.05, 0.06]}
        size={[width - 0.08, 0.04, 0.045]}
        color={palette.white}
      />
      <Box
        position={[0, -0.74, 0.08]}
        size={[width + 0.16, 0.08, 0.23]}
        color={palette.wood}
        rounded
      />
    </group>
  );
}
export function Room({ decorative = true }: { decorative?: boolean }) {
  return (
    <group>
      <Box position={[0, -0.19, 0]} size={[10, 0.34, 8]} color="#b1a38a" />
      <Box position={[0, -0.035, 0]} size={[9.9, 0.055, 7.9]} color="#c6a478" />
      {decorative && <Parquet />}
      <Box position={[0, 1.24, -4]} size={[10, 2.5, 0.14]} color="#f5f1e7" />
      <Box position={[-5, 1.24, 0]} size={[0.14, 2.5, 8]} color="#edece3" />
      <Box
        position={[0, 0.36, -3.9]}
        size={[9.85, 0.72, 0.05]}
        color={palette.blue}
      />
      <Box
        position={[-4.9, 0.36, 0]}
        size={[0.05, 0.72, 7.9]}
        color={palette.blue}
      />
      <Box
        position={[0, 0.75, -3.87]}
        size={[9.85, 0.055, 0.1]}
        color={palette.white}
      />
      <Box
        position={[-4.87, 0.75, 0]}
        size={[0.1, 0.055, 7.9]}
        color={palette.white}
      />
      <Box
        position={[0, 0.06, -3.85]}
        size={[9.85, 0.09, 0.1]}
        color="#638da4"
      />
      <Box
        position={[-4.85, 0.06, 0]}
        size={[0.1, 0.09, 7.9]}
        color="#638da4"
      />
      {decorative && (
        <>
          {Array.from({ length: 17 }, (_, i) => (
            <Box
              key={`back-${i}`}
              position={[-4.7 + i * 0.58, 0.37, -3.86]}
              size={[0.018, 0.63, 0.022]}
              color="#6f9bb3"
            />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <Box
              key={`side-${i}`}
              position={[-4.86, 0.37, -3.7 + i * 0.55]}
              size={[0.022, 0.63, 0.018]}
              color="#6f9bb3"
            />
          ))}
          <Box
            position={[0, 2.45, -3.89]}
            size={[9.85, 0.08, 0.1]}
            color={palette.white}
          />
          <Box
            position={[-4.89, 2.45, 0]}
            size={[0.1, 0.08, 7.9]}
            color={palette.white}
          />
        </>
      )}
      <Window position={[2.2, 1.65, -3.87]} width={3.25} />
      <group position={[-4.87, 1.65, -2.25]} rotation={[0, Math.PI / 2, 0]}>
        <Window position={[0, 0, 0]} width={2.45} />
      </group>
      <Box
        position={[-4.9, 1.05, 2.5]}
        size={[0.08, 2.1, 1.15]}
        color={palette.white}
      />
      <Box
        position={[-4.84, 1.05, 2.5]}
        size={[0.045, 1.96, 1.01]}
        color="#aac8d2"
      />
      <Box
        position={[-4.8, 1.38, 2.5]}
        size={[0.02, 0.9, 0.72]}
        color="#d0e8e9"
      />
      <Box
        position={[-4.79, 1.08, 2.15]}
        size={[0.04, 0.035, 0.12]}
        color={palette.brass}
      />
      <group position={[-2.2, 0, -2.8]}>
        <Box
          position={[0, 0.52, 0]}
          size={[4, 1.04, 0.8]}
          color={palette.white}
        />
        <Box
          position={[0, 0.48, 0.42]}
          size={[3.85, 0.77, 0.055]}
          color="#94b7c4"
        />
        {[-1.3, 0, 1.3].map((x) => (
          <group key={x}>
            <Box
              position={[x, 0.49, 0.455]}
              size={[1.17, 0.65, 0.035]}
              color={palette.white}
            />
            <Box
              position={[x, 0.49, 0.478]}
              size={[1.04, 0.52, 0.012]}
              color="#a8c5cb"
            />
          </group>
        ))}
        <Box
          position={[0, 0.08, 0.47]}
          size={[3.9, 0.09, 0.07]}
          color={palette.frame}
        />
        <Box
          position={[0, 1.08, 0]}
          size={[4.15, 0.1, 1]}
          color={palette.wood}
          rounded
        />
        <Box
          position={[-1.03, 1.43, -0.1]}
          size={[0.68, 0.6, 0.43]}
          color={palette.ink}
          rounded
        />
        <Box
          position={[-1.03, 1.33, 0.13]}
          size={[0.58, 0.3, 0.035]}
          color="#bdcbd0"
        />
        <Box
          position={[-1.03, 1.17, 0.2]}
          size={[0.64, 0.04, 0.21]}
          color={palette.frame}
        />
        {[-1.23, -0.84].map((x) => (
          <Cylinder
            key={x}
            position={[x, 1.22, 0.22]}
            radius={0.057}
            height={0.12}
            color={palette.white}
          />
        ))}
        {decorative && (
          <>
            <Box
              position={[-1.03, 1.68, 0.128]}
              size={[0.55, 0.09, 0.04]}
              color={palette.brass}
              rounded
            />
            <Box
              position={[-1.03, 1.47, 0.19]}
              size={[0.26, 0.025, 0.14]}
              color={palette.ink}
            />
            {[0.45, 0.73, 1.01].map((x) => (
              <Cylinder
                key={x}
                position={[x, 1.18, 0.15]}
                radius={0.073}
                height={0.14}
                color={palette.white}
              />
            ))}
            <Box
              position={[0.72, 1.15, 0.15]}
              size={[0.94, 0.035, 0.38]}
              color={palette.frame}
              rounded
            />
          </>
        )}
        <Plant position={[1.6, 1.13, -0.1]} scale={0.4} />
        {[-1.3, 0, 1.3].map((x) => (
          <group key={x} position={[x, 0, 1.05]}>
            {[-0.17, 0.17].flatMap((legX) =>
              [-0.17, 0.17].map((z) => (
                <Box
                  key={`${legX}-${z}`}
                  position={[legX, 0.36, z]}
                  size={[0.045, 0.7, 0.045]}
                  color={palette.frame}
                />
              )),
            )}
            <Cylinder
              position={[0, 0.7, 0]}
              radius={0.29}
              height={0.07}
              color={palette.frame}
            />
            <Cylinder
              position={[0, 0.75, 0]}
              radius={0.27}
              height={0.1}
              color={palette.blue}
            />
            {decorative && (
              <Box
                position={[0, 0.3, 0.19]}
                size={[0.37, 0.035, 0.035]}
                color={palette.brass}
              />
            )}
          </group>
        ))}
      </group>
      {decorative && (
        <group position={[-2.5, 1.85, -3.84]}>
          <Box
            position={[0, 0, 0]}
            size={[1.15, 0.62, 0.07]}
            color={palette.wood}
            rounded
          />
          <Box
            position={[0, 0, 0.042]}
            size={[1, 0.47, 0.012]}
            color="#d6e4dd"
          />
          <mesh position={[0, 0, 0.052]}>
            <circleGeometry args={[0.16, 24]} />
            <meshBasicMaterial color="#91b8c1" />
          </mesh>
        </group>
      )}
      <Plant position={[4.2, 0, -3.1]} scale={1.1} />
      <Plant position={[-4.3, 0, -0.45]} scale={0.75} />
    </group>
  );
}
