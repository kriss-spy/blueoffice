import {
  test,
  expect,
  createAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";
import { assignSceneTestPack } from "./scene-asset-fixture.js";
import type { Page } from "@playwright/test";
const scene = (page: Page) =>
  page
    .locator("[data-office-scene]")
    .evaluate((n) => JSON.parse(n.getAttribute("data-office-scene")!));
const sparseLayout = async (page: Page, agentId: string, rotation = 0) =>
  page.evaluate(
    async ({ agentId, rotation }) => {
      const { csrf } = await (await fetch("/api/session")).json(),
        layout = await (await fetch("/api/layout")).json();
      const response = await fetch("/api/layout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BlueOffice-CSRF": csrf,
        },
        body: JSON.stringify({
          baseRevision: layout.revision,
          draft: {
            placements: [
              {
                id: "desk-motion",
                kind: "workstation",
                position: [0, 0, 1],
                rotation,
                components: {
                  desk: true,
                  chair: true,
                  computer: true,
                  keyboard: true,
                },
              },
            ],
            assignments: { [agentId]: "desk-motion" },
          },
        }),
      });
      if (!response.ok) throw Error(await response.text());
    },
    { agentId, rotation },
  );

test("mapped walks follow saved destinations, task movement has no commands and attention preempts immediately", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await sparseLayout(page, agent.id);
  await assignSceneTestPack(page, agent.id);
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("walk");
  await expect
    .poll(async () => (await scene(page)).agents[0].position[2])
    .toBeGreaterThan(1.72);
  await expect
    .poll(async () => (await scene(page)).agents[0].motion, { timeout: 7000 })
    .toBe("idle");
  expect((await scene(page)).agents[0].position).toEqual([0, 0, 2.65]);
  const commands = await frames(agent);
  await send(page, "Hina", "slow");
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("walk");
  await expect
    .poll(async () => (await scene(page)).agents[0].motion, { timeout: 7000 })
    .toBe("idle");
  const after = (await snapshot(page)).agents[0];
  expect(after.work).toBe("tool");
  expect(
    (await frames(agent)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(1);
  expect(commands.filter((f) => f.method === "prompt.submit")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Interrupt task", exact: true })
    .click();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  await send(page, "Hina", "question");
  await expect(
    page.getByRole("region", { name: "Question request" }).last(),
  ).toBeVisible();
  const visible = await scene(page);
  expect(visible.agents[0].motion).toBe("idle");
  expect(visible.agents[0].paused).toBe(true);
  expect(visible.agents[0].position).toEqual([1.02, 0, 1.72]);
  await page.getByLabel("Lounge idle assistants").check();
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("idle");
  expect((await snapshot(page)).agents[0].requests.at(-1)!.state).toBe("open");
});

test("desk edits during walk invalidate paths, missing clips and reduced motion retain safe stationary meaning", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await sparseLayout(page, agent.id);
  await assignSceneTestPack(page, agent.id);
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("walk");
  await sparseLayout(page, agent.id, 1);
  await expect
    .poll(async () => (await scene(page)).layout.placements[0].rotation)
    .toBe(1);
  await expect
    .poll(async () => (await scene(page)).agents[0].position[0])
    .toBeGreaterThan(0.7);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("idle");
  const safePosition = (await scene(page)).agents[0].position;
  expect(safePosition[0]).toBeCloseTo(0.72);
  expect(safePosition[2]).toBeCloseTo(-0.02);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await assignSceneTestPack(page, agent.id, false);
  await expect
    .poll(async () => (await scene(page)).agents[0].motionReason)
    .toBe("Mapped walk clip unavailable.");
  expect((await scene(page)).agents[0].motion).toBe("idle");
  expect((await snapshot(page)).agents[0].liveSessionId).toBe(
    agent.liveSessionId,
  );
});

test("actual-turn completion reacts once and optional original sound stays off until enabled", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await sparseLayout(page, agent.id);
  await assignSceneTestPack(page, agent.id);
  await expect(page.getByLabel("Quiet notification sound")).not.toBeChecked();
  await send(page, "Hina", "hello");
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("react");
  const completed = (await snapshot(page)).agents[0];
  expect(completed.work).toBe("completed");
  expect((await scene(page)).scene.soundsPlayed).toBe(0);
  await expect
    .poll(async () => (await scene(page)).agents[0].cue, { timeout: 6000 })
    .toBe(false);
  await page.reload();
  await expect.poll(async () => (await scene(page)).agents[0].cue).toBe(false);
  expect((await snapshot(page)).agents[0].turnId).toBe(completed.turnId);
  await page.getByLabel("Quiet notification sound").check();
  await expect.poll(async () => (await scene(page)).scene.soundOn).toBe(true);
  await send(page, "Hina", "question");
  await expect(
    page.getByRole("region", { name: "Question request" }).last(),
  ).toBeVisible();
  await expect.poll(async () => (await scene(page)).scene.soundsPlayed).toBe(1);
  await page.getByLabel("Lounge idle assistants").check();
  await page.getByLabel("Lounge idle assistants").uncheck();
  expect((await scene(page)).scene.soundsPlayed).toBe(1);
  expect((await scene(page)).agents[0].cue).toBe(false);
  await page.reload();
  await expect(page.getByLabel("Quiet notification sound")).not.toBeChecked();
  await expect.poll(async () => (await scene(page)).agents[0].cue).toBe(false);
  expect((await snapshot(page)).agents[0].turnId).not.toBe(completed.turnId);
});

test("missing reaction mapping preserves completed text without pretending to celebrate", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await sparseLayout(page, agent.id);
  await assignSceneTestPack(page, agent.id, false, false);
  await expect
    .poll(async () => (await scene(page)).agents[0].motionReason)
    .toBe("Mapped walk clip unavailable.");
  await send(page, "Hina", "hello");
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  await expect
    .poll(async () => (await snapshot(page)).agents[0].work)
    .toBe("completed");
  expect((await scene(page)).agents[0].cue).toBe(false);
  expect((await scene(page)).agents[0].motion).toBe("idle");
  expect((await scene(page)).agents[0].label).toBe("Completed");
  expect(
    (await frames(agent)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(1);
});

test("unchanged working destination restores seating after Edit Cancel and context Retry without runtime commands", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await sparseLayout(page, agent.id);
  await assignSceneTestPack(page, agent.id, true, true, true);
  await send(page, "Hina", "slow");
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("seated");
  const before = (await snapshot(page)).agents[0],
    commands = await frames(before),
    layout = (await scene(page)).layout;
  await page.getByRole("button", { name: "Edit office", exact: true }).click();
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("idle");
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("seated");
  expect((await scene(page)).agents[0].motionReason).toBeUndefined();
  await page.locator(".live-room canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw Error("Context loss extension unavailable");
    extension.loseContext();
  });
  await expect(
    page.getByRole("button", { name: "Retry 3D view", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("idle");
  await page
    .getByRole("button", { name: "Retry 3D view", exact: true })
    .click();
  await expect.poll(async () => (await scene(page)).scene.ready).toBe(true);
  await expect
    .poll(async () => (await scene(page)).agents[0].motion)
    .toBe("seated");
  expect((await scene(page)).agents[0].motionReason).toBeUndefined();
  expect((await scene(page)).layout).toEqual(layout);
  const after = (await snapshot(page)).agents[0];
  expect(after.work).toBe(before.work);
  expect(after.epoch).toBe(before.epoch);
  expect(after.liveSessionId).toBe(before.liveSessionId);
  expect(after.turnId).toBe(before.turnId);
  expect(await frames(after)).toEqual(commands);
});
