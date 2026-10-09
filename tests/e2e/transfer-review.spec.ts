import { test, expect, createAgent, snapshot } from "./fixtures.js";
import { setupCharacterPack } from "../setup-fixture.js";

test("an open unreviewed character preview cannot authorize a portable assignment", async ({
  page,
  office,
}) => {
  // This checks a completed preview cycle, not a hardware frame-rate target.
  // The software-rendered CI scene advances its mixer by at most 50ms/frame.
  test.setTimeout(60_000);
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const ref = await page.evaluate(async (pack) => {
    const { csrf } = await (await fetch("/api/session")).json();
    const response = await fetch("/api/characters/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-blueoffice-csrf": csrf,
      },
      body: JSON.stringify(pack),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).ref;
  }, setupCharacterPack());
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page
    .getByRole("button", { name: /Original triangle.*Needs visual review/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark this clip reviewed", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  const applied = await page.evaluate(async (ref) => {
    const { csrf } = await (await fetch("/api/session")).json();
    const manifest = await (await fetch("/api/layout/export")).json();
    manifest.agents[0].avatar = ref;
    manifest.assets = [{ ref }];
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-blueoffice-csrf": csrf,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const preview = await post("/api/layout/preview", { manifest });
    await post("/api/layout/import", {
      baseRevision: preview.baseRevision,
      manifest,
      bindings: preview.bindings,
    });
    return preview;
  }, ref);
  expect(JSON.stringify(applied.diagnostics)).toMatch(/review/);
  await page.getByRole("button", { name: "Close character library" }).click();
  const agent = (await snapshot(page)).agents[0];
  expect(agent.avatar).toEqual(ref);
  expect(agent.lifecycle).toBe("ready");
  await expect(page.locator(`[data-scene-agent="${agent.id}"]`)).toContainText(
    "Character unavailable",
  );
  await expect(page.locator(".live-scene-bottom")).toContainText(
    "Preview and review this exact character version",
  );
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
});
