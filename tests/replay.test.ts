import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import {
  agentChange,
  applyAgentChange,
  applyEventBatch,
} from "../shared/events.js";
import { EventSequence } from "../server/sequence.js";

test("normalized durable replay reproduces appends, removals, ordering and cleared fields without duplicates", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "blueoffice-journal-"));
  const store = new OfficeStore(join(directory, "office.db"), 3);
  const office = new Office(store, new FixtureRuntime(directory));
  t.after(() => store.close());
  const agent = await office.create("Hina", directory);
  const before = office.snapshot();
  const next = structuredClone(agent);
  next.configRevision = "one";
  next.messages.push({
    id: "m",
    role: "assistant",
    epoch: "epoch",
    turnId: "turn",
    state: "streaming",
    text: "first",
    at: "now",
    chunkIds: ["1"],
  });
  store.save(next, "test", randomUUID());
  delete next.configRevision;
  next.messages[0].text += " second";
  next.messages[0].chunkIds.push("2");
  store.save(next, "test", randomUUID());
  const batch = office.eventsSince(before.revision, before.journalId!)!;
  const replayed = applyEventBatch(before, JSON.parse(JSON.stringify(batch)));
  assert.deepEqual(replayed, office.snapshot());
  assert.deepEqual(applyEventBatch(replayed, batch), replayed);
  assert.throws(
    () =>
      applyEventBatch(before, {
        ...batch,
        events: [...batch.events].reverse(),
      }),
    /order/,
  );
  assert.throws(
    () => applyEventBatch(before, { ...batch, events: [] }),
    /Incomplete/,
  );
  assert.throws(
    () => applyEventBatch(before, { ...batch, journalId: "replacement" }),
    /gap/,
  );
  const reordered = structuredClone(next);
  reordered.messages.unshift({ ...next.messages[0], id: "earlier" });
  assert.deepEqual(
    applyAgentChange(
      next,
      JSON.parse(JSON.stringify(agentChange(next, reordered))),
    ),
    reordered,
  );
  const removed = structuredClone(reordered);
  removed.messages = [removed.messages[1]];
  assert.deepEqual(
    applyAgentChange(reordered, agentChange(reordered, removed)),
    removed,
  );
  for (let i = 0; i < 4; i++) store.save(next, "test", randomUUID());
  assert.equal(
    office.eventsSince(before.revision, before.journalId!),
    undefined,
  );
  assert.deepEqual(office.snapshot().agents[0], next);
  const reopened = new OfficeStore(join(directory, "office.db"));
  assert.equal(reopened.journalId(), before.journalId);
  assert.deepEqual(reopened.checkpoint(), store.checkpoint());
  reopened.close();
});

test("native event sequencing holds reordered events and discards duplicates beyond journal retention", () => {
  const sequence = new EventSequence();
  const event = (seq: number) => ({
    jsonrpc: "2.0" as const,
    method: "event",
    params: { session_id: "s", seq },
  });
  assert.deepEqual(sequence.accept(event(2)).frames, []);
  assert.equal(sequence.accept(event(2)).gap, "s");
  assert.deepEqual(
    sequence.accept(event(1)).frames.map((f) => f.params!.seq),
    [1, 2],
  );
  assert.deepEqual(sequence.accept(event(1)).frames, []);
  sequence.accept(event(5));
  assert.deepEqual(
    sequence.checkpoint("s", 4).map((f) => f.params!.seq),
    [5],
  );
  assert.deepEqual(sequence.accept(event(2)).frames, []);
});
