/** Invoked only by python3 scripts/hermes_probe.py --suite office inside bubblewrap. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, writeFile, mkdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { HermesRuntime, type Installation } from "../server/runtime.js";
import { OfficeStore } from "../server/store.js";
import { Office } from "../server/office.js";
import { attention } from "../shared/office.js";

const installation = JSON.parse(process.argv[2]) as Installation;
const factory = new HermesRuntime(installation, "/tmp/alpha/mock-key");
const store = new OfficeStore("/tmp/office-state/office.db");
const office = new Office(store, factory);
const checks: string[] = [];
let failure: string | undefined;
const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 20_000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(
        "Installed runtime state did not reach expected condition",
      );
    await delay(20);
  }
};
try {
  await assert.rejects(access("/office/.blueoffice"));
  await assert.rejects(access("/office/.git"));
  await assert.rejects(access("/office/.env"));
  checks.push(
    "source allowlist excludes live office data, git and environment files",
  );
  const created = await office.create(
    "Installed Hermes integration",
    "/tmp/alpha/workspace",
  );
  const current = () => office.snapshot().agents[0];
  const target = () => ({
    epoch: current().epoch!,
    sessionId: current().liveSessionId!,
  });
  await office.start(created.id);
  assert.equal(current().lifecycle, "ready");
  checks.push(
    "production profile provision, canonical lease, handshake and session binding",
  );
  await office.prompt(created.id, randomUUID(), target(), "PROBE_SINGLE");
  await until(() => attention(current()).length === 1);
  const question = attention(current())[0];
  assert.equal(question.kind, "clarify");
  await office.reply(created.id, question.id, randomUUID(), target(), {
    answer: "Oak",
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  assert.match(
    current().messages.find((m) => m.role === "assistant")!.text,
    /Synthetic turn complete/,
  );
  checks.push(
    "real Hermes public stream, clarify answer and same-turn completion",
  );
  await office.prompt(created.id, randomUUID(), target(), "PROBE_BATCH_MULTI");
  await until(() => attention(current()).length === 1);
  const batch = attention(current())[0];
  const batchTurn = current().turnId;
  assert.equal(batch.questions.length, 2);
  assert.equal(batch.questions[1].multiSelect, true);
  await office.lockAnswer(
    created.id,
    batch.id,
    randomUUID(),
    target(),
    batch.questions[0].qid,
    "Birch",
  );
  assert.equal(current().requests.at(-1)!.questions[0].state, "locked");
  assert.equal(store.agents()[0].requests.at(-1)!.questions[0].answer, "Birch");
  await office.reply(created.id, batch.id, randomUUID(), target(), {
    answers: { [batch.questions[1].qid]: JSON.stringify(["Blue", "White"]) },
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  assert.equal(current().turnId, batchTurn);
  checks.push(
    "native batch lock acknowledgement, persisted partial progress, multiselect final tail and same-turn continuation",
  );
  await office.prompt(created.id, randomUUID(), target(), "PROBE_BATCH");
  await until(() => attention(current()).length === 1);
  const allLocked = attention(current())[0];
  for (const q of allLocked.questions)
    await office.lockAnswer(
      created.id,
      allLocked.id,
      randomUUID(),
      target(),
      q.qid,
      q.choices[0],
    );
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  assert.equal(current().requests.at(-1)!.state, "resolved");
  checks.push(
    "native final batch lock explicitly resolves the request without a response frame",
  );
  await mkdir("/tmp/blueoffice-approval-sentinel", { recursive: true });
  await writeFile(
    "/tmp/blueoffice-approval-sentinel/keep.txt",
    "must survive denial",
  );
  await office.prompt(
    created.id,
    randomUUID(),
    target(),
    "PROBE_APPROVAL_REDACT",
  );
  await until(() => attention(current()).some((r) => r.kind === "approval"));
  const permission = attention(current())[0];
  assert.notEqual(permission.frameId, permission.innerId);
  assert.equal(permission.responseSchema, "hermes.approval.v1");
  assert.ok(
    !permission.text.includes("ghp_" + "A".repeat(36)),
    "Native approval context must redact a credential-shaped canary",
  );
  assert.match(permission.text, /blueoffice-approval-sentinel/);
  await office.reply(created.id, permission.id, randomUUID(), target(), {
    choice: "deny",
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  assert.equal(
    await readFile("/tmp/blueoffice-approval-sentinel/keep.txt", "utf8"),
    "must survive denial",
  );
  assert.equal(store.agents()[0].requests.at(-1)!.decision?.choice, "deny");
  checks.push(
    "real Hermes redacted approval frame, durable denial and verified prevention of execution",
  );
  await office.prompt(
    created.id,
    randomUUID(),
    target(),
    "PROBE_APPROVAL_REDACT_ONCE",
  );
  await until(() => attention(current()).some((r) => r.kind === "approval"));
  const allowed = attention(current())[0];
  await office.reply(created.id, allowed.id, randomUUID(), target(), {
    choice: "once",
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  await assert.rejects(access("/tmp/blueoffice-approval-sentinel"));
  assert.equal(store.agents()[0].requests.at(-1)!.decision?.choice, "once");
  checks.push(
    "real Hermes allow-once executes only the disposable sentinel action and persists the exact decision",
  );
  await office.prompt(created.id, randomUUID(), target(), "PROBE_CANCEL");
  await until(() => attention(current()).length === 1);
  await office.interrupt(created.id, target());
  await until(() => current().work === "interrupted" && !current().busy);
  assert.equal(current().lifecycle, "ready");
  await office.stop(created.id);
  assert.equal(current().lifecycle, "stopped");
  checks.push("actual interrupt outcome and confirmed owned process stop");
  assert.doesNotMatch(
    JSON.stringify(office.snapshot()),
    /synthetic-office-key|OPENAI_API_KEY/,
  );
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(failure, JSON.stringify(office.snapshot()));
} finally {
  await office.shutdown();
  store.close();
  await writeFile(
    "/evidence/report.json",
    JSON.stringify({ passed: !failure, checks, failure }, null, 2),
  );
}
console.log(JSON.stringify({ passed: !failure, checks, failure }));
process.exitCode = failure ? 1 : 0;
