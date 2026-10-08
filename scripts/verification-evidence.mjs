import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

/** Includes tracked modifications, deletions, modes, and nonignored new files. */
export async function sourceIdentity(root = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const sha = git("rev-parse", "HEAD").trim();
  const paths = [
    ...new Set(
      git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const hash = createHash("sha256");
  hash.update(`${sha}\0`);
  for (const path of paths) {
    hash.update(`${path}\0`);
    try {
      const file = resolve(root, path);
      const stat = await lstat(file);
      hash.update(`${stat.mode}\0`);
      hash.update(
        stat.isSymbolicLink() ? await readlink(file) : await readFile(file),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("deleted");
    }
    hash.update("\0");
  }
  return {
    sha,
    fingerprint: hash.digest("hex"),
    dirty: !!git("status", "--porcelain").trim(),
    fileCount: paths.length,
  };
}

export const releaseCriteria = [
  "product",
  "visual",
  "performance",
  "liveRoutes",
];
export async function releaseAcceptance(path, identity, root = process.cwd()) {
  if (!path)
    return {
      passed: false,
      outstanding: releaseCriteria,
      reason:
        "Supply --acceptance artifacts/release-acceptance.json after reviewing the remaining release criteria.",
    };
  const acceptance = JSON.parse(await readFile(path, "utf8"));
  if (acceptance.sourceFingerprint !== identity.fingerprint)
    return {
      passed: false,
      outstanding: releaseCriteria,
      reason:
        "Release acceptance is stale: sourceFingerprint does not match this run.",
    };
  const artifactRoot = await realpath(resolve(root, "artifacts"));
  const outstanding = [];
  const evidence = {};
  for (const criterion of releaseCriteria) {
    const entry = acceptance.criteria?.[criterion];
    if (
      entry?.passed !== true ||
      typeof entry.reviewedBy !== "string" ||
      !entry.reviewedBy.trim() ||
      typeof entry.evidenceSha256 !== "string" ||
      typeof entry.evidence !== "string" ||
      !entry.evidence.trim()
    ) {
      outstanding.push(criterion);
      continue;
    }
    try {
      const file = await realpath(entry.evidence);
      if (!file.startsWith(artifactRoot + sep))
        throw new Error("Evidence must be inside project artifacts/");
      const content = await readFile(file);
      const digest = createHash("sha256").update(content).digest("hex");
      if (digest !== entry.evidenceSha256)
        throw new Error("Evidence changed since acceptance");
      evidence[criterion] = {
        path: file,
        sha256: digest,
        reviewedBy: entry.reviewedBy,
      };
    } catch {
      outstanding.push(criterion);
    }
  }
  return {
    passed: !outstanding.length,
    outstanding,
    acceptancePath: resolve(path),
    evidence,
  };
}

/** A CLI exit zero alone is insufficient: listing, skipping, and expected failures aren't verification. */
export function validateBrowserReport(report, selectionArguments = []) {
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        tests.push({ title: spec.title, ...test });
    for (const nested of suite.suites ?? []) visit(nested);
  }
  for (const suite of report.suites ?? []) visit(suite);
  if (
    !tests.length ||
    report.errors?.length ||
    tests.some(
      (test) =>
        test.expectedStatus !== "passed" ||
        test.status !== "expected" ||
        test.results?.length !== 1 ||
        test.results[0].status !== "passed" ||
        test.results[0].errors?.length,
    )
  )
    throw new Error(
      "Browser evidence must contain executed passing tests, no skipped/retried/expected-failure tests, and no errors",
    );
  return {
    executed: tests.length,
    tests: tests.map((test) => test.title),
    selectionArguments,
    scope: selectionArguments.length
      ? "requested-playwright-options"
      : "full-suite",
  };
}
