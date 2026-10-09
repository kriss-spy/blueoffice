import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  sourceIdentity,
  releaseAcceptance,
  releaseCriteria,
  validateBrowserReport,
} from "../scripts/verification-evidence.mjs";

test("source identity invalidates changed, added, deleted code and ignores evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "verification-identity-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init");
    await writeFile(join(root, ".gitignore"), "evidence/\n");
    await writeFile(join(root, "source.ts"), "original\n");
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    const original = await sourceIdentity(root);
    await writeFile(join(root, "source.ts"), "modified\n");
    assert.notEqual(
      (await sourceIdentity(root)).fingerprint,
      original.fingerprint,
    );
    await writeFile(join(root, "source.ts"), "original\n");
    await writeFile(join(root, "new.ts"), "new\n");
    assert.notEqual(
      (await sourceIdentity(root)).fingerprint,
      original.fingerprint,
    );
    await rm(join(root, "new.ts"));
    await mkdir(join(root, "evidence"));
    await writeFile(join(root, "evidence/report.json"), "ignored evidence");
    assert.equal(
      (await sourceIdentity(root)).fingerprint,
      original.fingerprint,
    );
    await rm(join(root, "source.ts"));
    assert.notEqual(
      (await sourceIdentity(root)).fingerprint,
      original.fingerprint,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release gate requires current signoff and readable evidence for every criterion", async () => {
  const root = await mkdtemp(join(tmpdir(), "verification-acceptance-"));
  try {
    const identity = { fingerprint: "current" };
    assert.equal((await releaseAcceptance(undefined, identity)).passed, false);
    const path = join(root, "acceptance.json");
    await mkdir(join(root, "artifacts"));
    const evidence = join(root, "artifacts/evidence.txt");
    await writeFile(evidence, "reviewed measurements");
    const acceptance = {
      sourceFingerprint: "current",
      criteria: Object.fromEntries(
        releaseCriteria.map((criterion) => [
          criterion,
          {
            passed: true,
            reviewedBy: "Reviewer",
            evidence,
            evidenceSha256: createHash("sha256")
              .update("reviewed measurements")
              .digest("hex"),
          },
        ]),
      ),
    };
    await writeFile(path, JSON.stringify(acceptance));
    assert.equal((await releaseAcceptance(path, identity, root)).passed, true);
    assert.equal(
      (await releaseAcceptance(path, { fingerprint: "new code" }, root)).passed,
      false,
    );
    await writeFile(evidence, "changed evidence");
    assert.equal((await releaseAcceptance(path, identity, root)).passed, false);
    await writeFile(evidence, "reviewed measurements");
    delete acceptance.criteria.visual;
    await writeFile(path, JSON.stringify(acceptance));
    assert.deepEqual(
      (await releaseAcceptance(path, identity, root)).outstanding,
      ["visual"],
    );
    await rm(evidence);
    assert.equal((await releaseAcceptance(path, identity, root)).passed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture cleanup stops only a registered run's detached RPC process", async () => {
  if (process.platform !== "linux") return;
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const { cleanupFixtures } =
    await import("../scripts/verification-cleanup.mjs");
  const root = await mkdtemp(join(tmpdir(), "verification-cleanup-"));
  const owned = await mkdtemp(join(tmpdir(), "blueoffice-ui-"));
  await writeFile(
    join(owned, ".verification-owner.json"),
    JSON.stringify({ token: "owned" }),
  );
  const other = join(root, "other");
  await mkdir(join(root, "owned-servers"));
  await mkdir(join(owned, "profile"), { recursive: true });
  await mkdir(join(other, "profile"), { recursive: true });
  const peer = (data) =>
    spawn(
      "python3",
      [
        "-u",
        resolve("tests/fixtures/rpc_peer.py"),
        join(data, "profile"),
        "normal",
      ],
      {
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  const child = peer(owned);
  const unrelated = peer(other);
  const closed = once(child, "close");
  const otherClosed = once(unrelated, "close");
  try {
    await Promise.all([
      Promise.race([
        once(child.stdout, "data"),
        closed.then(() => {
          throw new Error("Owned fixture exited before readiness");
        }),
      ]),
      Promise.race([
        once(unrelated.stdout, "data"),
        otherClosed.then(() => {
          throw new Error("Unrelated fixture exited before readiness");
        }),
      ]),
    ]);
    await writeFile(
      join(root, "owned-servers/owned.json"),
      JSON.stringify({ pid: 0, data: owned, token: "owned" }),
    );
    assert.deepEqual(await cleanupFixtures(root), {
      stoppedPids: [child.pid],
      removedData: [owned],
    });
    await closed;
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.signalCode, null);
  } finally {
    child.kill("SIGKILL");
    unrelated.kill("SIGKILL");
    await Promise.all([closed, otherClosed]);
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup tolerates completed teardown but refuses a surviving unowned root", async () => {
  const { removeFixtureData } =
    await import("../scripts/verification-cleanup.mjs");
  const data = await mkdtemp(join(tmpdir(), "blueoffice-ui-"));
  const owner = { data, token: "original" };
  try {
    await assert.rejects(removeFixtureData(owner), { code: "ENOENT" });
    await writeFile(
      join(data, ".verification-owner.json"),
      JSON.stringify({ token: "replacement" }),
    );
    await assert.rejects(removeFixtureData(owner), /ownership changed/);
    await writeFile(
      join(data, ".verification-owner.json"),
      JSON.stringify({ token: "original" }),
    );
    assert.equal(await removeFixtureData(owner), true);
    assert.equal(await removeFixtureData(owner), false);
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("browser completion requires actual executed passes and records scoped runs", () => {
  const passing = {
    title: "flow",
    tests: [
      {
        expectedStatus: "passed",
        status: "expected",
        results: [{ status: "passed", errors: [] }],
      },
    ],
  };
  const report = { suites: [{ specs: [passing] }], errors: [] };
  assert.equal(validateBrowserReport(report).executed, 1);
  assert.equal(
    validateBrowserReport(report, ["--grep", "flow"]).scope,
    "requested-playwright-options",
  );
  assert.throws(() => validateBrowserReport({ suites: [] }));
  for (const change of [
    { results: [] },
    { expectedStatus: "skipped" },
    { expectedStatus: "failed" },
    { results: [{ status: "skipped" }] },
    { results: [{ status: "failed" }, { status: "passed" }] },
  ]) {
    const changed = structuredClone(report);
    Object.assign(changed.suites[0].specs[0].tests[0], change);
    assert.throws(() => validateBrowserReport(changed));
  }
});

test("command timeout finalizes despite a detached descendant retaining stdout", async () => {
  const { runProcess } = await import("../scripts/verification-process.mjs");
  const started = Date.now();
  let output = "";
  let cleanupError;
  try {
    const result = await runProcess({
      executable: process.execPath,
      args: [
        "-e",
        `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'inherit'});console.log(child.pid);child.unref();`,
      ],
      timeout: 250,
      killGrace: 50,
      onStdout: (chunk) => {
        output += chunk;
      },
    });
    assert.equal(result.timedOut, true);
    assert.ok(
      Date.now() - started < 2_000,
      "runner must not wait for retained pipes indefinitely",
    );
  } finally {
    const pid = Number(output.trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") cleanupError = error;
      }
    }
  }
  if (cleanupError) throw cleanupError;
});

test("a missing executable fails promptly with an explicit spawn error", async () => {
  const { runProcess } = await import("../scripts/verification-process.mjs");
  const result = await runProcess({
    executable: "/definitely-missing-blueoffice-executable",
    args: [],
    timeout: 250,
    killGrace: 50,
  });
  assert.equal(result.code, null);
  assert.match(result.error, /ENOENT/);
});
