import { presentAgent, type OfficeAgent } from "../../shared/office";
export function DOMAttentionQueue({
  agents,
  connected,
  focusRequest,
}: {
  agents: OfficeAgent[];
  connected: boolean;
  focusRequest: (agentId: string, requestId: string) => void;
}) {
  const requests = agents.flatMap((agent) => {
    const view = presentAgent(agent, connected);
    return view.requests.map((request) => ({ agent, view, request }));
  });
  return (
    <section className="room-attention" aria-label="Room attention">
      <h3>
        Attention{" "}
        <span aria-live="polite" aria-atomic="true">
          {requests.length} pending{" "}
          {requests.length === 1 ? "request" : "requests"}
        </span>
      </h3>
      {requests.length === 0 ? (
        <p>No pending requests.</p>
      ) : (
        requests.map(({ agent, view, request }) => (
          <button
            key={`${agent.id}/${request.id}`}
            data-scene-request={request.id}
            className={`request-marker ${request.kind}`}
            onClick={() => focusRequest(agent.id, request.id)}
            aria-label={`Open ${request.kind === "approval" ? "permission" : "question"} for ${agent.name}: ${request.id}`}
          >
            <span aria-hidden="true">
              {request.kind === "approval" ? "🔒" : "?"}
            </span>
            <strong>{agent.name}</strong>
            <span>
              {request.kind === "approval"
                ? "Needs permission"
                : request.kind === "clarify"
                  ? "Needs an answer"
                  : "Input unavailable"}
              {!view.current || request.freshness === "unknown"
                ? " · status unknown"
                : ""}
            </span>
          </button>
        ))
      )}
    </section>
  );
}
