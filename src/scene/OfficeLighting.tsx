export function OfficeLighting() {
  return (
    <>
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
    </>
  );
}
