import {
  test,
  expect,
  createAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";
import type { Locator, Page } from "@playwright/test";
const activate = async (locator: Locator) => {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press("Enter");
};
const scene = async (page: Page) =>
  page
    .locator("[data-office-scene]")
    .evaluate((node) => JSON.parse(node.getAttribute("data-office-scene")!));

test("keyboard questions and denial remain actionable without WebGL and recreation preserves ownership", async ({
  page,
  office,
}) => {
  await page.addInitScript(
    `window.__graphicsAllowed=false;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return !window.__graphicsAllowed&&String(type).includes('webgl')?null:original.call(this,type,...args);};`,
  );
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await expect(
    page.getByRole("button", { name: "Retry 3D view", exact: true }),
  ).toBeVisible();
  const message = page.getByLabel("Message Hina");
  await message.focus();
  await page.keyboard.type("question");
  await activate(page.getByRole("button", { name: "Send task", exact: true }));
  const card = page.getByRole("region", { name: "Question request" }).last();
  await expect(card).toBeVisible();
  const agent = (await snapshot(page)).agents[0];
  const pending = agent.requests.at(-1)!;
  await activate(
    page
      .getByRole("region", { name: "Room attention", exact: true })
      .getByRole("button", {
        name: `Open question for Hina: ${pending.id}`,
        exact: true,
      }),
  );
  await card.getByRole("radio", { name: "Oak", exact: true }).focus();
  await page.keyboard.press("Space");
  await activate(
    card.getByRole("button", { name: "Send answer", exact: true }),
  );
  await expect(card).toContainText("Hermes confirmed this request is closed.");
  await message.focus();
  await page.keyboard.type("approval");
  await activate(page.getByRole("button", { name: "Send task", exact: true }));
  const permission = page
    .getByRole("region", { name: "Permission request" })
    .last();
  await activate(permission.getByRole("button", { name: "Deny", exact: true }));
  await expect(permission).toContainText(
    "Hermes confirmed this request is closed.",
  );
  await activate(
    page.getByRole("button", { name: "Agent settings", exact: true }),
  );
  await expect(
    page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Agent settings", exact: true }),
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await activate(
    page.getByRole("button", { name: "Office overview", exact: true }),
  );
  await expect(
    page.getByRole("dialog", { name: "Office overview" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await activate(page.getByRole("button", { name: "Activity", exact: true }));
  await expect(
    page.getByRole("region", { name: "Activity", exact: true }),
  ).toBeVisible();
  await activate(
    page.getByRole("button", { name: "Close Activity", exact: true }),
  );
  const before = (await snapshot(page)).agents[0],
    commands = await frames(before);
  await page.evaluate(() => {
    (window as unknown as { __graphicsAllowed: boolean }).__graphicsAllowed =
      true;
  });
  await activate(
    page.getByRole("button", { name: "Retry 3D view", exact: true }),
  );
  await expect.poll(async () => (await scene(page)).scene.ready).toBe(true);
  const after = (await snapshot(page)).agents[0];
  expect(after.epoch).toBe(before.epoch);
  expect(after.liveSessionId).toBe(before.liveSessionId);
  expect(after.requests).toEqual(before.requests);
  expect(await frames(after)).toEqual(commands);
});

test("context loss with reduced motion retains eight exact requests including unassigned agents", async ({
  page,
  office,
}) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(office.url);
  for (let i = 0; i < 8; i++) {
    await createAgent(page, `Assistant ${i + 1}`);
    await send(page, `Assistant ${i + 1}`, i % 2 ? "approval" : "question");
    await expect(
      page
        .getByRole("region", {
          name: i % 2 ? "Permission request" : "Question request",
        })
        .last(),
    ).toBeVisible();
  }
  const before = await snapshot(page);
  const queue = page.getByRole("region", {
    name: "Room attention",
    exact: true,
  });
  await expect(queue).toContainText("8 pending requests");
  await expect(queue.getByRole("button")).toHaveCount(8);
  await page.evaluate(async () => {
    const { csrf } = await (await fetch("/api/session")).json();
    const layout = await (await fetch("/api/layout")).json();
    const response = await fetch("/api/layout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BlueOffice-CSRF": csrf,
      },
      body: JSON.stringify({
        baseRevision: layout.revision,
        draft: {
          placements: [],
          assignments: Object.fromEntries(
            Object.keys(layout.assignments).map((id) => [id, null]),
          ),
        },
      }),
    });
    if (!response.ok) throw Error(await response.text());
  });
  await expect
    .poll(async () =>
      (await scene(page)).agents.every((a: { deskId?: string }) => !a.deskId),
    )
    .toBe(true);
  await expect
    .poll(async () => (await scene(page)).scene.reducedMotion)
    .toBe(true);
  await page.locator(".live-room canvas").evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(
    page.getByRole("button", { name: "Retry 3D view", exact: true }),
  ).toBeVisible();
  await expect(queue.getByRole("button")).toHaveCount(8);
  const first = before.agents[0];
  await activate(
    queue.getByRole("button", {
      name: `Open question for ${first.name}: ${first.requests.at(-1)!.id}`,
      exact: true,
    }),
  );
  await expect(page.getByLabel(`Message ${first.name}`)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Question request" }).last(),
  ).toBeVisible();
  await activate(
    page.getByRole("button", { name: "Retry 3D view", exact: true }),
  );
  await expect.poll(async () => (await scene(page)).scene.ready).toBe(true);
  const after = await snapshot(page);
  for (const a of before.agents) {
    const b = after.agents.find((b) => b.id === a.id)!;
    expect(b.requests).toEqual(a.requests);
    expect(b.epoch).toBe(a.epoch);
    expect(b.liveSessionId).toBe(a.liveSessionId);
  }
  await expect(queue.getByRole("button")).toHaveCount(8);
  await expect
    .poll(async () =>
      (await scene(page)).agents.every((a: { paused: boolean }) => a.paused),
    )
    .toBe(true);
});
