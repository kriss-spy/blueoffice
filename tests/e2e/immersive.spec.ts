import {
  test,
  expect,
  createAgent,
  selectAgent,
  openRoster,
  send,
  snapshot,
  frames,
} from "./fixtures.js";

test("the room fills the viewport and conversation windows preserve room size, bounded dragging and keyboard return", async ({
  page,
  office,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(office.url);
  const room = page.locator(".live-room");
  await expect(room.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Select an agent" }),
  ).toHaveCount(0);
  await expect(page.locator(".conversation-window")).toHaveCount(0);
  const initial = (await room.boundingBox())!;
  expect(initial.width).toBeGreaterThanOrEqual(1260);
  expect(initial.height).toBeGreaterThanOrEqual(880);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  const commands = await frames(agent);
  const chat = page.getByRole("dialog", { name: "Hina", exact: true });
  await expect(chat).toBeVisible();
  expect(await room.boundingBox()).toEqual(initial);
  await chat.getByLabel("Message Hina").fill("Keep this unfinished task draft");
  await chat.getByRole("button", { name: "Close Hina", exact: true }).click();
  await expect(chat).not.toBeVisible();
  const marker = page.getByRole("button", { name: /^Select Hina: / });
  await marker.click();
  await expect(chat).toBeVisible();
  await expect(chat.getByLabel("Message Hina")).toHaveValue(
    "Keep this unfinished task draft",
  );
  await expect(chat).toHaveJSProperty("open", true);
  expect(await chat.evaluate((node) => node.matches(":modal"))).toBe(false);
  expect(await room.boundingBox()).toEqual(initial);
  const title = chat.locator(".game-window-title");
  const titleBounds = (await title.boundingBox())!;
  await page.mouse.move(titleBounds.x + 30, titleBounds.y + 15);
  await page.mouse.down();
  await page.mouse.move(1, 1, { steps: 6 });
  await page.mouse.up();
  const moved = (await chat.boundingBox())!;
  expect(moved.x).toBeGreaterThanOrEqual(8);
  expect(moved.y).toBeGreaterThanOrEqual(8);
  expect(moved.x + moved.width).toBeLessThanOrEqual(1272);
  expect(moved.y + moved.height).toBeLessThanOrEqual(892);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(chat).not.toBeVisible();
  await expect(marker).toBeFocused();
  await marker.press("Enter");
  await expect(chat).toBeVisible();
  await page.reload();
  await expect(page.locator(".conversation-window")).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Select an agent" }),
  ).toHaveCount(0);
  await selectAgent(page, "Hina");
  expect(await room.boundingBox()).toEqual(initial);
  const after = (await snapshot(page)).agents[0];
  expect(after.epoch).toBe(agent.epoch);
  expect(after.liveSessionId).toBe(agent.liveSessionId);
  expect(
    (await frames(after)).filter(
      (frame) =>
        !["session.events.since", "session.activate"].includes(frame.method),
    ),
  ).toEqual(
    commands.filter(
      (frame) =>
        !["session.events.since", "session.activate"].includes(frame.method),
    ),
  );
});

test("an exact roster request reopens a closed conversation and focuses the retained request", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question");
  const card = page.getByRole("region", { name: "Question request" });
  await expect(card).toBeVisible();
  const before = (await snapshot(page)).agents[0];
  const request = before.requests.at(-1)!;
  const commands = await frames(before);
  await page.getByRole("button", { name: "Close Hina", exact: true }).click();
  await expect(card).not.toBeVisible();
  const roster = await openRoster(page);
  await roster
    .getByRole("button", {
      name: `Open question for Hina: ${request.id}`,
      exact: true,
    })
    .click();
  await expect(roster).not.toBeVisible();
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  const after = (await snapshot(page)).agents[0];
  expect(after.requests).toEqual(before.requests);
  expect(after.epoch).toBe(before.epoch);
  expect(after.liveSessionId).toBe(before.liveSessionId);
  expect(await frames(after)).toEqual(commands);
});

test("long transcripts follow the latest on reload and retain a reading position while closed messages arrive", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "long output");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].work)
    .toBe("completed");
  const owner = (await snapshot(page)).agents[0];
  const transcript = page.locator(".conversation-window .transcript");
  const scroll = () =>
    transcript.evaluate((node) => ({
      top: node.scrollTop,
      remaining: node.scrollHeight - node.clientHeight - node.scrollTop,
    }));
  await expect.poll(async () => (await scroll()).remaining).toBeLessThan(4);
  expect((await scroll()).top).toBeGreaterThan(600);
  await page.reload();
  await expect(page.locator(".conversation-window")).not.toBeVisible();
  await selectAgent(page, "Hina");
  await expect(transcript).toContainText("FINAL_TAIL");
  await expect.poll(async () => (await scroll()).remaining).toBeLessThan(4);
  const latestTop = (await scroll()).top;
  await transcript.hover();
  await page.mouse.wheel(0, -600);
  await expect
    .poll(async () => (await scroll()).top)
    .toBeLessThan(latestTop - 400);
  const readingTop = (await scroll()).top;
  expect(readingTop).toBeGreaterThan(0);
  expect((await scroll()).remaining).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Close Hina", exact: true }).click();
  await selectAgent(page, "Hina");
  await expect
    .poll(async () => Math.abs((await scroll()).top - readingTop))
    .toBeLessThan(2);
  await page.getByRole("button", { name: "Close Hina", exact: true }).click();
  // A second client can deliver work while this conversation window is closed.
  const response = await page.evaluate(
    async ({ id, epoch, sessionId }) => {
      const { csrf } = await (await fetch("/api/session")).json();
      return (
        await fetch(`/api/agents/${id}/prompt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BlueOffice-CSRF": csrf,
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            target: { epoch, sessionId },
            text: "history stream",
          }),
        })
      ).status;
    },
    { id: owner.id, epoch: owner.epoch, sessionId: owner.liveSessionId },
  );
  expect(response).toBe(200);
  await expect
    .poll(async () => {
      const agent = (await snapshot(page)).agents[0];
      return (
        agent.work === "completed" &&
        !agent.busy &&
        agent.messages.length > owner.messages.length
      );
    })
    .toBe(true);
  await expect(page.locator(".conversation-window")).not.toBeVisible();
  await selectAgent(page, "Hina");
  await expect
    .poll(async () => Math.abs((await scroll()).top - readingTop))
    .toBeLessThan(2);
  const after = (await snapshot(page)).agents[0];
  expect(after.id).toBe(owner.id);
  expect(after.epoch).toBe(owner.epoch);
  expect(after.liveSessionId).toBe(owner.liveSessionId);
  expect(
    (await frames(after)).filter((frame) => frame.method === "prompt.submit"),
  ).toHaveLength(2);
});
