export function OfficeLighting() {
  return (
    <>
      <color attach="background" args={["#dcecf1"]} />
      <ambientLight intensity={1.05} color="#fff5df" />
      <hemisphereLight args={["#effbff", "#c0aa85", 1.25]} />
      <directionalLight
        position={[1, 9, -2]}
        color="#fff5e1"
        intensity={2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.03}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[6, 5, 8]} color="#e2f4ff" intensity={0.6} />
    </>
  );
}
