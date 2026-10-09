import {
  test,
  expect,
  createAgent,
  openOfficeSettings,
  closeOfficeSettings,
  snapshot,
} from "./fixtures.js";
import { assignSceneTestPack } from "./scene-asset-fixture.js";

test("scene quality persists with two loaded avatars and preserves agent identity across graphics loss", async ({
  page,
  office,
}) => {
  await page.goto(`${office.url}/?performance=1`);
  await createAgent(page, "Quality one");
  await createAgent(page, "Quality two");
  for (const agent of (await snapshot(page)).agents)
    await assignSceneTestPack(page, agent.id);
  const metrics = () =>
    page
      .locator("[data-office-scene]")
      .evaluate((node) => JSON.parse(node.getAttribute("data-office-scene")!));
  await expect
    .poll(async () => Object.keys((await metrics()).avatars).length)
    .toBe(2);
  const before = (await metrics()).avatars;
  await openOfficeSettings(page);
  await page
    .getByLabel("Scene quality", { exact: true })
    .selectOption("reduced");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__blueofficePerformance.dpr),
    )
    .toBe(1);
  await expect
    .poll(async () => (await metrics()).scene.quality)
    .toBe("reduced");
  for (const [id, rig] of Object.entries(before))
    expect((await metrics()).avatars[id].geometryId).toBe(
      (rig as any).geometryId,
    );
  await page.reload();
  await openOfficeSettings(page);
  await expect(page.getByLabel("Scene quality", { exact: true })).toHaveValue(
    "reduced",
  );
  await expect(
    page.getByText("32 components + 8 room furniture", { exact: false }),
  ).toBeVisible();
  await closeOfficeSettings(page);
  await page.evaluate(() =>
    document
      .querySelector("canvas")!
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext(),
  );
  await expect(page.locator(".scene-fallback")).toBeVisible();
  expect((await snapshot(page)).agents.map((agent) => agent.name)).toEqual([
    "Quality one",
    "Quality two",
  ]);
});
