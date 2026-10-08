export type FailureKind =
  "quota" | "authentication" | "connection" | "route" | "turn";
const copy: Record<FailureKind, string> = {
  quota:
    "Provider quota was reached. No automatic retry or provider fallback will run; retry explicitly after the quota resets.",
  authentication:
    "CLIProxyAPI rejected authentication. Check the server-side proxy key, then send the task again explicitly.",
  connection:
    "CLIProxyAPI is unavailable or the stream disconnected. Check the local service on port 8317; the task outcome may be incomplete. Retry explicitly when it is available.",
  route:
    "The model or API route was rejected. Re-run route verification before trying again.",
  turn: "Hermes reported a task failure. Review the public activity and retry explicitly if appropriate.",
};
export function turnFailure(payload: Record<string, unknown>) {
  const surface = payload.error_surface as
    { layer?: unknown; code?: unknown } | undefined;
  const error = [payload.error, payload.text, surface?.code]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  let kind: FailureKind = "turn";
  if (
    surface?.layer === "billing" ||
    /usage_limit_reached|quota|insufficient_quota|credit.*exhaust|billing/.test(
      error,
    )
  )
    kind = "quota";
  else if (
    surface?.layer === "auth" ||
    /\b401\b|invalid_api_key|authentication|unauthorized/.test(error)
  )
    kind = "authentication";
  else if (
    /model_not_found|format_error|unsupported.*(route|model|api)|\b404\b/.test(
      error,
    )
  )
    kind = "route";
  else if (
    ["endpoint", "streaming"].includes(String(surface?.layer)) ||
    /connection|connecterror|timeout|timed out|unavailable/.test(error)
  )
    kind = "connection";
  return { kind, message: copy[kind] };
}
