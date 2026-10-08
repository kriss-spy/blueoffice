/** Isolated native route suite; invoked by hermes_probe.py only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HermesRuntime, type Installation } from "../server/runtime.js";
import { OfficeStore } from "../server/store.js";
import { Office, OfficeError } from "../server/office.js";
import { ROUTES } from "../shared/routes.js";
import { HERMES_REVISION, ROUTE_CONTRACT } from "../server/routes.js";
import { attention } from "../shared/office.js";

const execute = promisify(execFile);
const installation = JSON.parse(process.argv[2]) as Installation;
const live = process.env.BLUEOFFICE_LIVE === "1";
const factory = new HermesRuntime(
  installation,
  live ? "/probe-key" : "/tmp/alpha/mock-key",
);
const originalLaunch = factory.launch.bind(factory);
factory.launch = async (agent) => {
  const launch = await originalLaunch(agent);
  launch.args[2] = "/office/scripts/probe_route_gateway.py";
  launch.options.env = {
    ...launch.options.env,
    BLUEOFFICE_EXPECT_MODEL: agent.model,
    BLUEOFFICE_ROUTE_TRACE: join(agent.profileHome, "route-trace.jsonl"),
  };
  return launch;
};
const store = new OfficeStore("/tmp/office-state/routes.db");
const office = new Office(store, factory);
const records: any[] = [];
const until = async (predicate: () => boolean, timeout = 90000) => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Route probe deadline exceeded");
    await delay(20);
  }
};
try {
  for (const route of ROUTES) {
    const record: any = {
      model: route.model,
      endpoint: route.endpoint,
      apiFamily: route.apiFamily,
      passed: false,
      checks: [],
      calls: [],
    };
    records.push(record);
    let id: string | undefined;
    let tracePath: string | undefined;
    try {
      const agent = await office.create(
        "Disposable routing probe",
        "/tmp/alpha/workspace",
        route.model,
      );
      id = agent.id;
      tracePath = join(agent.profileHome, "route-trace.jsonl");
      const current = () => office.snapshot().agents.find((a) => a.id === id)!;
      const target = () => ({
        epoch: current().epoch!,
        sessionId: current().liveSessionId!,
      });
      const path = join(agent.profileHome, "config.yaml");
      const cfg = JSON.parse(await readFile(path, "utf8"));
      cfg.platform_toolsets.cli = ["clarify"];
      cfg.agent.max_turns = 4;
      cfg.agent.platform_hints = {
        tui: {
          replace:
            "Answer the small verification request precisely. Use clarify only when asked.",
        },
      };
      await writeFile(path, JSON.stringify(cfg));
      await office.start(id);
      const send = async (prompt: string) => {
        const receipt = await office.prompt(
          id!,
          randomUUID(),
          target(),
          prompt,
        );
        assert.equal(receipt.state, "accepted");
      };
      await send("Reply exactly ROUTE_OK. No tools or explanation.");
      await until(() => !current().busy);
      assert.equal(
        current().work,
        "completed",
        current().error ?? "Text turn failed",
      );
      assert.ok(
        current().messages.some(
          (m) => m.role === "assistant" && m.text.includes("ROUTE_OK"),
        ),
      );
      assert.ok(
        current().messages.some(
          (m) => m.role === "assistant" && m.chunkIds.length >= 2,
        ),
        "No public streamed delta",
      );
      record.checks.push("text", "stream");
      await send(
        'ROUTE_TOOL: Call clarify exactly once, asking "Choose the probe answer" with choices Oak and Birch. After my answer reply exactly ROUTE_OK. Do not use another tool.',
      );
      await until(() => attention(current()).length > 0 || !current().busy);
      const request = attention(current())[0];
      assert.equal(
        request?.kind,
        "clarify",
        current().error ?? "No tool request",
      );
      record.requestShape = {
        kind: request.kind,
        questions: request.questions.length,
      };
      const answer = request.questions.length
        ? {
            answers: Object.fromEntries(
              request.questions.map((q) => [
                q.qid,
                q.choices.find((c) => c.startsWith("Oak")) ??
                  q.choices[0] ??
                  "Oak",
              ]),
            ),
          }
        : { answer: "Oak" };
      await office.reply(id, request.id, randomUUID(), target(), answer);
      await until(() => !current().busy);
      assert.equal(
        current().work,
        "completed",
        current().error ?? "Tool turn failed",
      );
      assert.ok(
        current().messages.some(
          (m) => m.role === "tool" && m.state === "complete",
        ),
      );
      record.checks.push("tool");
      await office.stop(id);
      const launch = await factory.launch(current());
      const auxResult = join(agent.profileHome, "aux-result.json");
      await execute(
        installation.python,
        ["-B", "-I", "/office/scripts/probe_route_aux.py", installation.source],
        {
          cwd: agent.workspace,
          env: { ...launch.options.env, BLUEOFFICE_AUX_RESULT: auxResult },
          timeout: 90000,
          maxBuffer: 200000,
        },
      );
      const aux = JSON.parse(await readFile(auxResult, "utf8"));
      assert.equal(aux.passed, true);
      record.checks.push(...aux.checks);
      if (!live) {
        for (const [scenario, kind] of [
          ["QUOTA", "quota"],
          ["AUTH", "authentication"],
          ["ROUTE", "route"],
          ["UNAVAILABLE", "connection"],
        ] as const) {
          await office.start(id);
          const before = (
            await readFile(join(agent.profileHome, "route-trace.jsonl"), "utf8")
          )
            .trim()
            .split("\n").length;
          await send(`FAIL_${scenario}`);
          await until(() => !current().busy);
          assert.equal(current().failureKind, kind);
          const after = (
            await readFile(join(agent.profileHome, "route-trace.jsonl"), "utf8")
          )
            .trim()
            .split("\n").length;
          if (scenario === "UNAVAILABLE")
            assert.ok(
              after - before <= 2,
              "Transient failure exceeded its bounded native transport attempts",
            );
          else
            assert.equal(
              after - before,
              1,
              "Quota/auth/route rejection was automatically retried",
            );
          assert.doesNotMatch(
            JSON.stringify(current()),
            /PRIVATE_PROVIDER_CANARY|synthetic-office-key/,
          );
          await office.stop(id);
        }
        cfg.providers[route.provider.slice(7)].base_url =
          "https://example.invalid/v1";
        await writeFile(path, JSON.stringify(cfg));
        await assert.rejects(
          office.start(id),
          /effective model.*verified BlueOffice route/,
        );
        cfg.providers[route.provider.slice(7)].base_url = route.endpoint;
        await writeFile(path, JSON.stringify(cfg));
        record.checks.push("reject changed endpoint before launch");
        record.checks.push(
          "failure classes",
          "quota not retried",
          "secret redaction",
        );
      }
      record.calls = (
        await readFile(join(agent.profileHome, "route-trace.jsonl"), "utf8")
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const expected =
        route.apiFamily === "responses"
          ? "/v1/responses"
          : "/v1/chat/completions";
      assert.ok(record.calls.length >= 5);
      assert.ok(
        record.calls.every(
          (c: any) => c.path === expected && c.model === route.model,
        ),
      );
      assert.ok(
        record.calls.some((c: any) =>
          c.input_types.includes(
            route.apiFamily === "responses" ? "function_call_output" : "tool",
          ),
        ),
      );
      record.passed = true;
      record.verifiedAt = new Date().toISOString();
    } catch (error) {
      if (tracePath)
        record.calls = await readFile(tracePath, "utf8")
          .then((s) =>
            s
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line)),
          )
          .catch(() => []);
      console.error(
        JSON.stringify({ model: route.model, calls: record.calls.slice(-3) }),
      );
      // No raw child stdout/stderr or provider exception in published evidence.
      const last = office.snapshot().agents.find((a) => a.id === id);
      record.observation = last
        ? {
            work: last.work,
            busy: last.busy,
            error: last.error,
            requests: last.requests.map((r) => ({
              kind: r.kind,
              questions: r.questions.length,
              state: r.state,
            })),
          }
        : null;
      record.failure =
        error instanceof assert.AssertionError || error instanceof OfficeError
          ? error.message.slice(0, 500)
          : "Route execution failed or timed out. Inspect the disposable probe privately.";
      console.error(
        JSON.stringify({ model: route.model, failure: record.failure }),
      );
    } finally {
      if (id) await office.stop(id).catch(() => {});
    }
  }
} finally {
  await office.shutdown();
  store.close();
}
const report = {
  passed: records.every((r) => r.passed),
  live,
  contract: ROUTE_CONTRACT,
  hermesRevision: HERMES_REVISION,
  routes: records,
};
await writeFile("/evidence/report.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    passed: report.passed,
    routes: records.map(({ model, passed, checks, failure }) => ({
      model,
      passed,
      checks,
      failure,
    })),
  }),
);
process.exitCode = report.passed ? 0 : 1;
