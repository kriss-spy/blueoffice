export function SceneError({
  reason,
  retry,
}: {
  reason: "initialization" | "context-loss";
  retry: () => void;
}) {
  return (
    <div className="scene-fallback" role="alert">
      <strong>
        {reason === "context-loss"
          ? "The 3D view lost its graphics context."
          : "The 3D view could not start."}
      </strong>
      <p>
        Choose an assistant or an exact request below. Chat, agent settings,
        Office and Activity remain available.
      </p>
      <button onClick={retry}>Retry 3D view</button>
    </div>
  );
}
