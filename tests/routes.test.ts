import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  RouteRegistry,
  routingConfig,
  HERMES_REVISION,
  ROUTE_CONTRACT,
} from "../server/routes.js";
import { ROUTES } from "../shared/routes.js";
import { turnFailure } from "../server/failures.js";

test("route admission requires current live evidence for the exact endpoint and API family", async () => {
  const path = join(
    await mkdtemp(join(tmpdir(), "blueoffice-routes-")),
    "routes.json",
  );
  const registry = new RouteRegistry(path);
  assert.throws(() => registry.require(ROUTES[0].model), /verify:routes/);
  const record = {
    contract: ROUTE_CONTRACT,
    live: true,
    runner_completed: true,
    proxyConfigUnchanged: true,
    hermesRevision: HERMES_REVISION,
    routes: [
      {
        ...ROUTES[0],
        passed: true,
        verifiedAt: new Date().toISOString(),
        checks: ["text", "stream", "tool", "auxiliary", "delegation"],
      },
    ],
  };
  await writeFile(path, JSON.stringify(record));
  assert.equal(registry.require(ROUTES[0].model).apiMode, "chat_completions");
  assert.throws(() => registry.require(ROUTES[1].model));
  await writeFile(path, JSON.stringify({ ...record, live: false }));
  assert.throws(() => registry.require(ROUTES[0].model), /verify:routes/);
  await writeFile(path, JSON.stringify({ routes: "corrupt" }));
  assert.equal(registry.statuses()[0].status, "unverified");
  record.routes[0].endpoint = "https://example.com/v1" as any;
  await writeFile(path, JSON.stringify(record));
  assert.throws(() => registry.require(ROUTES[0].model));
});
test("both native configs pin main, auxiliary and delegation routes with no automatic recovery", () => {
  for (const route of ROUTES) {
    const cfg = routingConfig(route.model);
    assert.equal(
      cfg.providers[route.provider.slice(7)].transport,
      route.apiMode,
    );
    assert.equal(
      cfg.providers[route.provider.slice(7)].key_env,
      "BLUEOFFICE_PROXY_KEY",
    );
    assert.equal(cfg.delegation.provider, route.provider);
    assert.equal(cfg.auxiliary.title_generation.provider, route.provider);
    assert.equal(cfg.agent.api_max_retries, 1);
    assert.equal(cfg.agent.auto_recovery_cycles, 0);
    assert.equal(cfg.auxiliary.transient_retries, 0);
    assert.deepEqual(cfg.fallback_providers, []);
    assert.doesNotMatch(JSON.stringify(cfg), /api_key/);
  }
});
test("failure classes remain distinct and raw provider data never becomes diagnostic copy", () => {
  for (const [payload, expected] of [
    [{ error: "429 usage_limit_reached PRIVATE_KEY" }, "quota"],
    [
      { error_surface: { layer: "auth", code: "auth" }, error: "PRIVATE_KEY" },
      "authentication",
    ],
    [{ error: "404 model_not_found PRIVATE_KEY" }, "route"],
    [{ error: "Connection refused PRIVATE_KEY" }, "connection"],
    [{ error: "ordinary tool failure PRIVATE_KEY" }, "turn"],
  ] as const) {
    const failure = turnFailure(payload);
    assert.equal(failure.kind, expected);
    assert.doesNotMatch(failure.message, /PRIVATE_KEY/);
  }
});
