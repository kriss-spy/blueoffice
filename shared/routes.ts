export const PROXY_ENDPOINT = "http://127.0.0.1:8317/v1";
export const MODEL_IDS = [
  "glm-5.3-flash",
  "muse-spark-1.3-contributor",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];
export const ROUTES = [
  {
    model: MODEL_IDS[0],
    provider: "custom:blueoffice-glm",
    apiFamily: "chat_completions",
    apiMode: "chat_completions",
    endpoint: PROXY_ENDPOINT,
  },
  {
    model: MODEL_IDS[1],
    provider: "custom:blueoffice-muse",
    apiFamily: "responses",
    apiMode: "codex_responses",
    endpoint: PROXY_ENDPOINT,
  },
] as const;
export interface RouteStatus {
  model: ModelId;
  endpoint: string;
  apiFamily: "chat_completions" | "responses";
  status: "unverified" | "verified" | "fixture";
  reason: string;
  verifiedAt?: string;
}
export function routeFor(model: string) {
  const route = ROUTES.find((r) => r.model === model);
  if (!route) throw new Error("Choose a supported BlueOffice model route.");
  return route;
}
