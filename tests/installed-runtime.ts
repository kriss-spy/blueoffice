/** Invoked only by python3 scripts/hermes_probe.py --suite office inside bubblewrap. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
  await office.prompt(created.id, randomUUID(), target(), "PROBE_APPROVAL");
  await until(() => attention(current()).some((r) => r.kind === "approval"));
  const permission = attention(current())[0];
  assert.notEqual(permission.frameId, permission.innerId);
  await office.reply(created.id, permission.id, randomUUID(), target(), {
    choice: "deny",
  });
  await until(
    () =>
      current().work === "completed" &&
      !current().busy &&
      !attention(current()).length,
  );
  checks.push("real Hermes approval frame, denied reply and resolution");
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
