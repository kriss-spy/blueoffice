import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  createAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";
import type { LayoutManifest } from "../../shared/layout-transfer.js";
async function portable(
  page: import("@playwright/test").Page,
): Promise<LayoutManifest> {
  return page.evaluate(async () => (await fetch("/api/layout/export")).json());
}
async function upload(page: import("@playwright/test").Page, value: unknown) {
  await page
    .getByRole("button", { name: "Import layout", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Import portable layout" });
  await dialog.getByLabel("Choose manifest file").setInputFiles({
    name: "office.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await dialog
    .getByRole("button", { name: "Validate and preview", exact: true })
    .click();
  return dialog;
}
const mutations = (values: Awaited<ReturnType<typeof frames>>) =>
  values.filter(
    (frame) =>
      !["session.events.since", "session.activate"].includes(frame.method),
  );

test("downloaded reference-only layout round-trips rotated missing characters while the exact live question remains open", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question");
  await expect(
    page.getByRole("region", { name: "Question request" }),
  ).toBeVisible();
  const before = (await snapshot(page)).agents[0];
  const beforeFrames = await frames(before);
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export layout", exact: true })
    .click();
  const download = await downloadReady;
  const output = test.info().outputPath("portable-layout.json");
  await download.saveAs(output);
  const text = await readFile(output, "utf8");
  const manifest = JSON.parse(text) as LayoutManifest;
  expect(Object.keys(manifest).sort()).toEqual([
    "agents",
    "assets",
    "format",
    "placements",
    "schemaVersion",
    "workstationVersion",
  ]);
  expect(text).not.toContain(before.profileHome);
  expect(text).not.toContain(before.workspace);
  expect(text).not.toContain("single question");
  expect(text).not.toMatch(
    /base64|profileHome|workspace|messages|requests|transcript/,
  );
  manifest.placements = [
    { ...manifest.placements[0], position: [1, 0, 0], rotation: 1 },
  ];
  const ref = {
    assetId: "missing.character",
    version: "exact-v7",
    sha256: "a".repeat(64),
  };
  manifest.agents[0].avatar = ref;
  manifest.assets = [{ ref, path: "characters/missing/exact-v7/model.glb" }];
  const dialog = await upload(page, manifest);
  await expect(
    dialog.getByRole("region", { name: "Import preview" }),
  ).toContainText("90°");
  await expect(
    dialog.getByRole("list", { name: "Import diagnostics" }),
  ).toContainText("exact character missing.character@exact-v7");
  await expect(dialog.getByLabel(`Bind ${before.id}`)).toHaveValue(before.id);
  await dialog
    .getByRole("button", { name: "Apply imported layout", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const after = (await snapshot(page)).agents[0];
  expect(after.avatar).toEqual(ref);
  expect(after.requests).toEqual(before.requests);
  expect(after.epoch).toBe(before.epoch);
  expect(after.turnId).toBe(before.turnId);
  expect(after.liveSessionId).toBe(before.liveSessionId);
  expect(await frames(after)).toEqual(beforeFrames);
  await expect(page.locator(`[data-scene-agent="${before.id}"]`)).toContainText(
    "Character unavailable",
  );
  await page.reload();
  expect((await portable(page)).agents[0].avatar).toEqual(ref);
  expect((await portable(page)).placements[0].rotation).toBe(1);
  expect(mutations(await frames(after))).toEqual(mutations(beforeFrames));
  await page.screenshot({
    path: test.info().outputPath("missing-exact-reference.png"),
    fullPage: true,
  });
});

test("invalid schema, paths and versions have no applicable preview and leave the current room untouched", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const original = await portable(page);
  const variants = [
    { ...original, schemaVersion: 2 },
    { ...original, workstationVersion: "unsupported" },
    { ...original, workspace: "/private/path" },
    {
      ...original,
      placements: [{ ...original.placements[0], position: [8, 0, 0] }],
    },
    {
      ...original,
      agents: [
        {
          ...original.agents[0],
          avatar: {
            assetId: "test.asset",
            version: "v1",
            sha256: "a".repeat(64),
          },
        },
      ],
      assets: [
        {
          ref: { assetId: "test.asset", version: "v1", sha256: "a".repeat(64) },
          path: "../private.glb",
        },
      ],
    },
    {
      ...original,
      agents: [
        {
          ...original.agents[0],
          avatar: { assetId: "test.asset", sha256: "a".repeat(64) },
        },
      ],
    },
  ];
  for (const variant of variants) {
    const dialog = await upload(page, variant);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Apply imported layout",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Cancel import", exact: true })
      .click();
    expect(await portable(page)).toEqual(original);
  }
});

test("stale import preview cannot replace a newer editor revision", async ({
  page,
  office,
  context,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const manifest = await portable(page);
  const dialog = await upload(page, manifest);
  await expect(
    dialog.getByRole("region", { name: "Import preview" }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto(office.url);
  await other.getByRole("button", { name: "Edit office", exact: true }).click();
  const editor = other.getByRole("region", { name: "Workstation editor" });
  await editor
    .getByLabel("Selected workstation", { exact: true })
    .selectOption("desk-2");
  await editor
    .getByRole("button", { name: "Delete workstation", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Save layout", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  await dialog
    .getByRole("button", { name: "Apply imported layout", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  expect((await portable(page)).placements.some((p) => p.id === "desk-2")).toBe(
    false,
  );
});

test("unknown office-agent references remain unresolved across reload and re-export without creating assistants", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const before = (await snapshot(page)).agents[0];
  const manifest = await portable(page);
  manifest.agents[0].agentId = "foreign-agent-reference";
  const dialog = await upload(page, manifest);
  await expect(dialog.getByLabel("Bind foreign-agent-reference")).toHaveValue(
    "",
  );
  await expect(
    dialog.getByRole("list", { name: "Import diagnostics" }),
  ).toContainText("without creating or starting an assistant");
  await dialog
    .getByRole("button", { name: "Apply imported layout", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  expect((await snapshot(page)).agents).toHaveLength(1);
  expect((await snapshot(page)).agents[0].id).toBe(before.id);
  expect(
    (await portable(page)).agents.some(
      (ref) => ref.agentId === "foreign-agent-reference",
    ),
  ).toBe(true);
  await page
    .getByText("Unresolved portable references", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Portable layouts" }),
  ).toContainText("foreign-agent-reference");
});

test("portable import modal traps focus, closes with Escape and returns focus to Import", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const button = page.getByRole("button", {
    name: "Import layout",
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Import portable layout" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
});
