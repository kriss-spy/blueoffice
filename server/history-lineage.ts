import type { CapturedChild } from "../shared/lineage.js";

const id = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 300
    ? value
    : null;
/** Native typed lifecycle data; completion survives delayed/duplicated starts. */
export function captureChild(
  existing: CapturedChild[],
  event: string,
  payload: Record<string, unknown>,
  context: {
    epoch: string;
    liveSessionId: string;
    storedSessionIds: string[];
    at: string;
  },
): CapturedChild[] | undefined {
  if (
    ![
      "subagent.spawn_requested",
      "subagent.start",
      "subagent.complete",
    ].includes(event)
  )
    return;
  const child = id(payload.child_session_id);
  if (!child) return;
  const prior = existing.find(
    (row) =>
      row.childStoredSessionId === child && row.parentEpoch === context.epoch,
  );
  const terminal = event === "subagent.complete";
  if (prior && prior.parentLiveSessionId !== context.liveSessionId) return;

  const status: CapturedChild["status"] = terminal
    ? ((
        {
          completed: "completed",
          failed: "failed",
          error: "failed",
          interrupted: "interrupted",
        } as const
      )[
        String(payload.status) as
          "completed" | "failed" | "error" | "interrupted"
      ] ?? "unknown")
    : "running";
  if (prior?.terminal && (!terminal || prior.status === status))
    return existing;
  const next: CapturedChild =
    prior?.terminal && !terminal
      ? prior
      : {
          childStoredSessionId: child,
          parentEpoch: context.epoch,
          parentLiveSessionId: context.liveSessionId,
          parentStoredSessionIds: [
            ...new Set(
              context.storedSessionIds.filter((value) => !!id(value)).reverse(),
            ),
          ]
            .slice(0, 32)
            .reverse(),
          subagentId: id(payload.subagent_id) ?? prior?.subagentId ?? null,
          status,
          terminal,
          at: context.at,
        };
  // Conflicting terminal evidence is unknown, rather than last-message-wins success.
  if (prior?.terminal && terminal && prior.status !== next.status)
    next.status = "unknown";
  return [
    ...existing.filter(
      (row) =>
        row.childStoredSessionId !== child || row.parentEpoch !== context.epoch,
    ),
    next,
  ].slice(-500);
}
