import { type LayoutPlacement } from "../../shared/layout";
import { workstation, type Point, type QuarterTurn } from "../../shared/scene";

const palette = {
  white: "#f4f7f8",
  frame: "#a9bac5",
  blue: "#9bcddd",
  wood: "#dcbd95",
  ink: "#354653",
  green: "#719985",
};
function Box({
  position,
  size,
  color,
  ...props
}: {
  position: Point;
  size: Point;
  color: string;
  rotation?: Point;
}) {
  return (
    <mesh position={position} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.82} />
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
      <cylinderGeometry args={[radius, radius, height, 24]} />
      <meshStandardMaterial color={color} roughness={0.75} />
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
      <Cylinder
        position={[0, 0.08, 0]}
        radius={0.3}
        height={0.04}
        color={palette.frame}
      />
      <Cylinder
        position={[0, 0.17, 0]}
        radius={0.045}
        height={0.18}
        color={palette.frame}
      />
      <Box
        position={[0, 0.235, 0]}
        size={[0.55, 0.09, 0.53]}
        color={palette.blue}
      />
      <Box
        position={[0, 0.5, 0.23]}
        size={[0.55, 0.5, 0.09]}
        color={palette.blue}
      />
      <Box
        position={[0, 0.35, 0.24]}
        size={[0.08, 0.42, 0.06]}
        color={palette.frame}
      />
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
}: {
  position: Point;
  rotation: QuarterTurn;
  anchors: boolean;
  onSelect: () => void;
  components?: LayoutPlacement["components"];
  highlighted?: boolean;
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
            color={palette.white}
          />
          {[-0.79, 0.79].map((x) => (
            <group key={x}>
              <Box
                position={[x, 0.28, 0]}
                size={[0.065, 0.54, 0.7]}
                color={palette.frame}
              />
              <Box
                position={[x, 0.05, 0]}
                size={[0.11, 0.06, 0.76]}
                color={palette.frame}
              />
            </group>
          ))}
          <Box
            position={[0, 0.51, -0.31]}
            size={[1.58, 0.16, 0.04]}
            color={palette.blue}
          />
        </>
      )}
      {components?.computer !== false && (
        <>
          <Box
            position={[0, 0.635, -0.18]}
            size={[0.33, 0.035, 0.22]}
            color={palette.frame}
          />
          <Box
            position={[0, 0.77, -0.22]}
            size={[0.055, 0.3, 0.04]}
            color={palette.frame}
          />
          <Box
            position={workstation.anchors.monitor}
            size={[0.72, 0.43, 0.055]}
            color={palette.ink}
          />
          <Box
            position={[0, 0.94, -0.166]}
            size={[0.66, 0.36, 0.008]}
            color="#b9e6ed"
          />
        </>
      )}
      {components?.keyboard !== false && (
        <>
          <Box
            position={workstation.anchors.keyboard}
            size={[0.53, 0.025, 0.2]}
            color={palette.frame}
          />
          {[0, 1, 2].map((row) => (
            <Box
              key={row}
              position={[0, 0.668, 0.33 + row * 0.045]}
              size={[0.46, 0.008, 0.018]}
              color={palette.white}
            />
          ))}
        </>
      )}
      {components?.desk !== false && (
        <>
          <Box
            position={[0.41, 0.635, 0.38]}
            size={[0.085, 0.03, 0.13]}
            color={palette.white}
          />
          <Cylinder
            position={[-0.65, 0.71, 0.22]}
            radius={0.067}
            height={0.17}
            color="#eeb995"
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
export function Room() {
  return (
    <group>
      <Box position={[0, -0.19, 0]} size={[10, 0.34, 8]} color="#c8d7e0" />
      <Box
        position={[0, -0.035, 0]}
        size={[9.9, 0.055, 7.9]}
        color={palette.wood}
      />
      {Array.from({ length: 20 }, (_, i) => (
        <Box
          key={i}
          position={[-4.7 + i * 0.5, 0.001, 0]}
          size={[0.016, 0.007, 7.85]}
          color="#c6a782"
        />
      ))}
      <Box
        position={[0, 1.24, -4]}
        size={[10, 0.2 + 2.3, 0.14]}
        color="#eaf3f6"
      />
      <Box position={[-5, 1.24, 0]} size={[0.14, 2.5, 8]} color="#e0eef2" />
      <Box
        position={[0, 0.18, -3.9]}
        size={[9.85, 0.3, 0.04]}
        color={palette.blue}
      />
      <Box
        position={[-4.9, 0.18, 0]}
        size={[0.04, 0.3, 7.9]}
        color={palette.blue}
      />
      <Box
        position={[2.2, 1.7, -3.9]}
        size={[2.7, 1.2, 0.065]}
        color={palette.white}
      />
      <Box
        position={[2.2, 1.7, -3.85]}
        size={[2.5, 1.04, 0.02]}
        color="#c4e1ee"
      />
      <Box
        position={[2.2, 1.7, -3.81]}
        size={[0.055, 1.1, 0.03]}
        color={palette.white}
      />
      <Box
        position={[2.2, 1.7, -3.81]}
        size={[2.6, 0.05, 0.03]}
        color={palette.white}
      />
      <Box
        position={[-4.9, 1.05, 2.5]}
        size={[0.08, 2.1, 1.15]}
        color={palette.frame}
      />
      <Box
        position={[-4.84, 1.05, 2.5]}
        size={[0.045, 1.96, 1.01]}
        color="#b6d8df"
      />
      <Box
        position={[-4.79, 1.08, 2.15]}
        size={[0.04, 0.035, 0.12]}
        color={palette.ink}
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
          color="#d6b38e"
        />
        {[-1.3, 0, 1.3].map((x) => (
          <Box
            key={x}
            position={[x, 0.5, 0.46]}
            size={[0.025, 0.7, 0.01]}
            color="#c19f7c"
          />
        ))}
        <Box
          position={[0, 1.08, 0]}
          size={[4.15, 0.1, 1.0]}
          color={palette.wood}
        />
        <Box
          position={[-1.03, 1.43, -0.1]}
          size={[0.68, 0.6, 0.43]}
          color={palette.ink}
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
        <Cylinder
          position={[-1.23, 1.22, 0.22]}
          radius={0.057}
          height={0.12}
          color={palette.white}
        />
        <Cylinder
          position={[-0.84, 1.22, 0.22]}
          radius={0.057}
          height={0.12}
          color={palette.white}
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
        <Plant position={[1.6, 1.13, -0.1]} scale={0.4} />
        {[-1.3, 0, 1.3].map((x) => (
          <group key={x} position={[x, 0, 1.05]}>
            <Cylinder
              position={[0, 0.06, 0]}
              radius={0.26}
              height={0.07}
              color={palette.frame}
            />
            <Cylinder
              position={[0, 0.38, 0]}
              radius={0.04}
              height={0.6}
              color={palette.frame}
            />
            <Cylinder
              position={[0, 0.75, 0]}
              radius={0.27}
              height={0.1}
              color={palette.blue}
            />
          </group>
        ))}
      </group>
      <Plant position={[4.2, 0, -3.1]} scale={1.1} />
      <Plant position={[-4.3, 0, -0.45]} scale={0.75} />
    </group>
  );
}
