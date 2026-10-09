import {
  test,
  expect,
  createAgent,
  selectAgent,
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
  await chat.getByRole("button", { name: "Close Hina", exact: true }).click();
  await expect(chat).not.toBeVisible();
  const marker = page.getByRole("button", { name: /^Select Hina: / });
  await marker.click();
  await expect(chat).toBeVisible();
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
  await chat.getByLabel("Message Hina").focus();
  await page.keyboard.press("Escape");
  await expect(chat).not.toBeVisible();
  await expect(marker).toBeFocused();
  await marker.press("Enter");
  await expect(chat).toBeVisible();
  await page.reload();
  await expect(page.locator(".conversation-window")).toHaveCount(0);
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
