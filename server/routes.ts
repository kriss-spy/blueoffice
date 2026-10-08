import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROUTES,
  routeFor,
  type ModelId,
  type RouteStatus,
} from "../shared/routes.js";
export const HERMES_REVISION = "f1247d2e0146bbd8edd4e510b9e67e0d259509a4";
export const ROUTE_CONTRACT = 1;
const proofSchema = z.object({
  contract: z.literal(ROUTE_CONTRACT),
  hermesRevision: z.literal(HERMES_REVISION),
  live: z.literal(true),
  runner_completed: z.literal(true),
  proxyConfigUnchanged: z.literal(true),
  routes: z.array(
    z.object({
      model: z.string(),
      endpoint: z.string(),
      apiFamily: z.string(),
      passed: z.boolean(),
      verifiedAt: z.string().optional(),
      checks: z.array(z.string()),
    }),
  ),
});
export class RouteRegistry {
  constructor(
    private path = resolve(
      process.env.BLUEOFFICE_DATA ?? ".blueoffice",
      "routes.json",
    ),
    private fixture = false,
  ) {}
  statuses(): RouteStatus[] {
    let evidence: z.infer<typeof proofSchema> | undefined;
    try {
      evidence = proofSchema.parse(JSON.parse(readFileSync(this.path, "utf8")));
    } catch {
      /* Unverified until explicitly probed. */
    }
    return ROUTES.map((route) => {
      const record = evidence?.routes?.find((r) => r.model === route.model);
      const valid =
        evidence?.contract === ROUTE_CONTRACT &&
        evidence?.hermesRevision === HERMES_REVISION &&
        record?.passed === true &&
        record.endpoint === route.endpoint &&
        record.apiFamily === route.apiFamily &&
        ["text", "stream", "tool", "auxiliary", "delegation"].every((check) =>
          record.checks?.includes(check),
        ) &&
        Number.isFinite(Date.parse(record.verifiedAt ?? ""));
      return {
        model: route.model,
        endpoint: route.endpoint,
        apiFamily: route.apiFamily,
        status: this.fixture ? "fixture" : valid ? "verified" : "unverified",
        reason: this.fixture
          ? "Synthetic fixture route; no live model calls."
          : valid
            ? "Live text, stream, tool and auxiliary/delegation probes passed."
            : "Run npm run verify:routes -- --live, then refresh. This model cannot start until its route passes.",
        ...(valid && !this.fixture ? { verifiedAt: record.verifiedAt } : {}),
      };
    });
  }
  require(model: string) {
    const route = routeFor(model);
    const status = this.statuses().find((r) => r.model === model)!;
    if (status.status === "unverified") throw new Error(status.reason);
    return route;
  }
}
export function routingConfig(model: ModelId) {
  const route = routeFor(model);
  const pin = { provider: route.provider, model: route.model };
  const auxiliary = Object.fromEntries(
    [
      "vision",
      "compression",
      "skills_hub",
      "approval",
      "review",
      "mcp",
      "title_generation",
      "memory_query_rewrite",
      "tts_audio_tags",
      "triage_specifier",
      "kanban_decomposer",
      "profile_describer",
      "goal_judge",
      "curator",
      "monitor",
      "background_review",
      "moa_reference",
      "moa_aggregator",
    ].map((task) => [task, { ...pin }]),
  );
  return {
    model: {
      default: route.model,
      provider: route.provider,
      base_url: route.endpoint,
      api_mode: route.apiMode,
    },
    providers: Object.fromEntries(
      ROUTES.map((r) => [
        r.provider.slice(7),
        {
          base_url: r.endpoint,
          transport: r.apiMode,
          key_env: "BLUEOFFICE_PROXY_KEY",
          default_model: r.model,
        },
      ]),
    ),
    auxiliary: {
      ...auxiliary,
      transient_retries: 0,
      title_generation: { ...pin, model_upgrade_enabled: false },
      background_review: { ...pin, enabled: false },
    },
    delegation: { ...pin, api_mode: route.apiMode, fallback_providers: [] },
    agent: { api_max_retries: 1, auto_recovery_cycles: 0 },
    desktop: { auto_continue: { enabled: false } },
    fallback_providers: [],
  };
}
