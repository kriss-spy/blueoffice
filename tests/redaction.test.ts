import test from "node:test";
import assert from "node:assert/strict";
import { FrameRedactor } from "../server/redaction.js";
import type { Frame } from "../server/rpc.js";

const event = (
  type: string,
  text: string,
  session = "one",
  extra = {},
): Frame => ({
  jsonrpc: "2.0",
  method: "event",
  params: { type, session_id: session, seq: 1, payload: { text, ...extra } },
});
const texts = (frames: Frame[]) =>
  frames.map((f) => (f.params?.payload as { text: string }).text).join("");

test("credential redaction covers every stream boundary and isolated session buffers", () => {
  const secret = "synthetic-review-key";
  for (let split = 1; split < secret.length; split++) {
    const redactor = new FrameRedactor(secret);
    assert.equal(
      texts(
        redactor.frames(
          event("message.delta", "Before " + secret.slice(0, split)),
        ),
      ),
      "Before ",
    );
    assert.equal(
      texts(redactor.frames(event("message.delta", "Other session", "two"))),
      "Other session",
    );
    assert.equal(
      texts(
        redactor.frames(event("message.delta", secret.slice(split) + " after")),
      ),
      "[redacted] after",
    );
  }
});

test("terminal replacement redacts full text and clears prefixes before the next segment", () => {
  const redactor = new FrameRedactor("synthetic-review-key");
  redactor.frames(event("message.delta", "synthetic-"));
  assert.equal(
    texts(
      redactor.frames(
        event("message.interim", "synthetic-review-key", "one", {
          already_streamed: true,
        }),
      ),
    ),
    "[redacted]",
  );
  assert.equal(
    texts(redactor.frames(event("message.delta", "review-key"))),
    "review-key",
  );
  redactor.frames(event("message.delta", " synt"));
  assert.equal(texts(redactor.frames(event("message.complete", ""))), "synt");
});
