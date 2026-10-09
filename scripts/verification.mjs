import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  readFile,
  writeFile as save,
  mkdir as makeDirectory,
} from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import {
  sourceIdentity,
  validateBrowserReport,
  releaseAcceptance,
  releaseCriteria,
} from "./verification-evidence.mjs";

import { runProcess } from "./verification-process.mjs";
import { cleanupFixtures } from "./verification-cleanup.mjs";

const [gate, ...args] = process.argv.slice(2);
if (!["check", "ui", "integration", "release"].includes(gate))
  throw new Error("Expected check, ui, integration, or release");
const acceptanceIndex = args.indexOf("--acceptance");
const acceptancePath =
  acceptanceIndex >= 0 ? args[acceptanceIndex + 1] : undefined;
const uiArgs = args.filter(
  (_, i) =>
    acceptanceIndex < 0 || (i !== acceptanceIndex && i !== acceptanceIndex + 1),
);
if (acceptanceIndex >= 0 && (gate !== "release" || !acceptancePath))
  throw new Error("--acceptance requires a file and the release gate");
if (gate !== "ui" && uiArgs.length)
  throw new Error(
    "Only verify:ui accepts Playwright options; integration never enables live probes implicitly",
  );
const output = resolve(
  "artifacts/verification",
  `${new Date().toISOString().replaceAll(":", "-")}-${gate}-${randomUUID().slice(0, 8)}`,
);
await makeDirectory(output, { recursive: true, mode: 0o700 });
const started = Date.now();
const report = {
  schema: 1,
  gate,
  startedAt: new Date(started).toISOString(),
  status: "running",
  passed: false,
  source: await sourceIdentity(),
  runtime: {
    node: process.version,
    python: execFileSync("python3", ["--version"], { encoding: "utf8" }).trim(),
    platform: process.platform,
  },
  commands: [],
  outstanding: gate === "release" ? releaseCriteria : [],
};
const reportPath = resolve(output, "report.json");
const publish = () =>
  save(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await publish();
console.log(`Verification evidence: ${relative(process.cwd(), output)}`);
let interrupted;
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = signal;
    abortController.abort();
  });

async function run(label, executable, arguments_, timeout = 180_000) {
  const began = Date.now();
  const log = `${String(report.commands.length + 1).padStart(2, "0")}-${label}.log`;
  const entry = {
    label,
    executable,
    arguments: arguments_,
    startedAt: new Date(began).toISOString(),
    log,
    status: "running",
  };
  report.commands.push(entry);
  await publish();
  console.log(`\n[${gate}] ${label}`);
  const stream = createWriteStream(resolve(output, log), { mode: 0o600 });
  const result = await runProcess({
    executable,
    args: arguments_,
    env: {
      ...process.env,
      BLUEOFFICE_VERIFICATION_OUTPUT: output,
      PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    },
    timeout,
    signal: abortController.signal,
    onStdout: (chunk) => {
      stream.write(chunk);
      process.stdout.write(chunk);
    },
    onStderr: (chunk) => {
      stream.write(chunk);
      process.stderr.write(chunk);
    },
  });
  const { error, timedOut } = result;
  await new Promise((resolve) => stream.end(resolve));
  Object.assign(entry, {
    durationMs: Date.now() - began,
    exitCode: result.code,
    signal: result.signal,
    error,
    status: timedOut
      ? "timed-out"
      : interrupted
        ? "interrupted"
        : result.code === 0 && !error
          ? "passed"
          : "failed",
  });
  await publish();
  if (entry.status !== "passed")
    throw new Error(`${label}: ${entry.status}${error ? ` (${error})` : ""}`);
}
async function check() {
  await run("format", "npm", ["run", "format:check"]);
  await run("lint", "npm", ["run", "lint"]);
  await run("build", "npm", ["run", "build"]);
  await run("verification-types", "npm", ["run", "typecheck:verification"]);
  await run("tests", "npm", ["test"]);
  await run("protocol", "npm", ["run", "test:protocol"]);
  await run("verification-runner", process.execPath, [
    "--test",
    "tests/verification.test.mjs",
  ]);
}
async function ui() {
  await run("build-ui", "npm", ["run", "build"]);
  await run(
    "browser",
    "npx",
    ["--no-install", "playwright", "test", ...uiArgs],
    600_000,
  );
  report.browser = validateBrowserReport(
    JSON.parse(await readFile(resolve(output, "playwright.json"), "utf8")),
    uiArgs,
  );
}
async function integration() {
  for (const suite of ["protocol", "office", "routes", "profiles"]) {
    const suiteOutput = resolve(output, `hermes-${suite}`);
    await run(
      `hermes-${suite}`,
      "python3",
      ["scripts/hermes_probe.py", "--suite", suite, "--output", suiteOutput],
      270_000,
    );
    const result = JSON.parse(
      await readFile(resolve(suiteOutput, "report.json"), "utf8"),
    );
    if (result.passed !== true || result.runner_completed !== true)
      throw new Error(
        `${suite} probe did not produce passing, completed evidence`,
      );
  }
}
try {
  if (gate === "check" || gate === "release") await check();
  if (gate === "ui" || gate === "release") await ui();
  if (gate === "integration" || gate === "release") await integration();
  if (gate === "release") {
    report.acceptance = await releaseAcceptance(acceptancePath, report.source);
    report.outstanding = report.acceptance.outstanding;
    report.status = report.acceptance.passed ? "passed" : "needs-acceptance";
  } else report.status = "passed";
} catch (error) {
  report.status = interrupted ? "interrupted" : "failed";
  report.error = error.message;
} finally {
  try {
    report.fixtureCleanup = await cleanupFixtures(output);
  } catch (error) {
    report.status = "failed";
    report.error = `Fixture cleanup failed: ${error.message}`;
  }
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  report.finalSource = await sourceIdentity();
  report.sourceUnchanged =
    report.source.fingerprint === report.finalSource.fingerprint;
  if (!report.sourceUnchanged) {
    report.status = "stale";
    report.error =
      "Source changed during verification. Rerun against the final integrated code.";
  }
  report.passed = report.status === "passed";
  await publish();
  console.log(
    `\nVerification ${report.status}: ${relative(process.cwd(), reportPath)}`,
  );
  if (report.error) console.error(report.error);
  if (report.outstanding.length)
    console.log(
      `Outstanding release criteria: ${report.outstanding.join(", ")}`,
    );
  process.exitCode = report.passed
    ? 0
    : report.status === "needs-acceptance"
      ? 2
      : 1;
}
