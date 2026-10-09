import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chat } from "../src/Chat";
import type { OfficeAgent } from "../shared/office";
const agent = (edit: Partial<OfficeAgent> = {}): OfficeAgent => ({
  id: "a",
  name: "Hina",
  model: "glm-5.3-flash",
  profileName: "fixture",
  profileHome: "/tmp/fixture",
  workspace: "/tmp",
  avatarId: "unassigned",
  deskId: "desk-1",
  lifecycle: "ready",
  work: "idle",
  freshness: "current",
  epoch: "e",
  liveSessionId: "s",
  storedSessionId: "stored",
  turnId: null,
  busy: false,
  conversations: [],
  messages: [],
  requests: [],
  receipts: [],
  error: null,
  createdAt: "2026-10-09",
  ...edit,
});
const disabled = (current: OfficeAgent, connected = true) => {
  const markup = renderToStaticMarkup(
    createElement(Chat, {
      agent: current,
      connected,
      acting: false,
      run: async () => {},
      settings: () => {},
      newConversation: async () => {},
    }),
  );
  const button = markup.match(/<button\b[^>]*>New conversation<\/button>/)?.[0];
  assert.ok(button, "New conversation remains available as a DOM control");
  return button.includes('disabled=""');
};
test("verified stopped unknown work admits an explicit new conversation while uncertain live work stays gated", () => {
  assert.equal(
    disabled(agent({ lifecycle: "stopped", work: "unknown" })),
    false,
  );
  assert.equal(disabled(agent()), false);
  for (const edit of [
    { work: "unknown" },
    { work: "working" },
    { busy: true },
    { lifecycle: "stopped", work: "unknown", busy: true },
    { lifecycle: "starting" },
    { lifecycle: "stopping" },
    { lifecycle: "stopped", work: "unknown", freshness: "unknown" },
  ] as Partial<OfficeAgent>[])
    assert.equal(disabled(agent(edit)), true, JSON.stringify(edit));
  assert.equal(
    disabled(agent({ lifecycle: "stopped", work: "unknown" }), false),
    true,
  );
  assert.equal(
    disabled(
      agent({
        lifecycle: "stopped",
        work: "unknown",
        requests: [
          {
            id: "q",
            frameId: 1,
            epoch: "e",
            sessionId: "s",
            kind: "clarify",
            text: "Choose",
            choices: [],
            questions: [],
            state: "open",
            at: "2026-10-09",
          },
        ],
      }),
    ),
    true,
  );
});
