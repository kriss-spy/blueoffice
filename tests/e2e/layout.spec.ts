import {
  test,
  expect,
  createAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";
import type { LayoutSnapshot } from "../../shared/layout.js";
async function layout(
  page: import("@playwright/test").Page,
): Promise<LayoutSnapshot> {
  return page.evaluate(async () => (await fetch("/api/layout")).json());
}

test("move, rotate, undo/redo, save and reload during pending input preserve the exact live request", async ({
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
  await page.getByRole("button", { name: "Edit office", exact: true }).click();
  const editor = page.getByRole("region", { name: "Workstation editor" });
  for (let i = 2; i <= 8; i++) {
    await editor
      .getByLabel("Selected workstation", { exact: true })
      .selectOption(`desk-${i}`);
    await editor
      .getByRole("button", { name: "Delete workstation", exact: true })
      .click();
  }
  await editor
    .getByLabel("Selected workstation", { exact: true })
    .selectOption("desk-1");
  await editor
    .getByRole("button", { name: "Move workstation", exact: true })
    .click();
  await editor.getByLabel("Workstation X position").fill("1");
  await editor.getByLabel("Workstation Z position").fill("0");
  await editor
    .getByRole("button", { name: "Apply placement", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Rotate workstation 90°", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Undo placement", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Redo placement", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Save layout", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  const saved = await layout(page);
  expect(saved.placements).toHaveLength(1);
  expect(saved.placements[0].position).toEqual([1, 0, 0]);
  expect(saved.placements[0].rotation).toBe(1);
  expect(saved.assignments[before.id]).toBe("desk-1");
  const after = (await snapshot(page)).agents[0];
  expect(after.id).toBe(before.id);
  expect(after.epoch).toBe(before.epoch);
  expect(after.liveSessionId).toBe(before.liveSessionId);
  expect(after.turnId).toBe(before.turnId);
  expect(after.requests).toEqual(before.requests);
  expect(await frames(after)).toEqual(beforeFrames);
  await page.getByText("Furniture inventory", { exact: false }).click();
  await page
    .getByRole("button", { name: "Locate desk-1", exact: true })
    .click();
  await expect(page.locator('[data-located="true"]')).toContainText("desk-1");
  await page.screenshot({
    path: test.info().outputPath("saved-layout.png"),
    fullPage: true,
  });
});

test("invalid ghost, component detachment, safe unassignment and Cancel stay local", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const original = await layout(page);
  const before = (await snapshot(page)).agents[0];
  const beforeFrames = await frames(before);
  await page.getByRole("button", { name: "Edit office", exact: true }).click();
  const editor = page.getByRole("region", { name: "Workstation editor" });
  await editor
    .getByRole("button", { name: "Place workstation", exact: true })
    .click();
  await editor.getByLabel("Workstation X position").fill("6");
  await expect(
    editor.getByRole("list", { name: "Placement failures" }),
  ).toContainText("outside the room");
  await expect(
    editor.getByRole("button", { name: "Apply placement", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "Discard ghost", exact: true })
    .click();
  await editor
    .getByLabel("Selected workstation", { exact: true })
    .selectOption("desk-1");
  await editor
    .getByRole("button", { name: "Detach chair", exact: true })
    .click();
  await expect(editor.getByLabel("Workstation for Hina")).toHaveValue("");
  await expect(page.locator(`[data-scene-agent="${before.id}"]`)).toContainText(
    "Unassigned · safe standing",
  );
  await editor
    .getByRole("button", { name: "Undo placement", exact: true })
    .click();
  await expect(editor.getByLabel("Workstation for Hina")).toHaveValue("desk-1");
  await editor
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  expect(await layout(page)).toEqual(original);
  expect(await frames(before)).toEqual(beforeFrames);
});

test("stale revision cannot replace a newer saved room", async ({
  page,
  office,
  context,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const other = await context.newPage();
  await other.goto(office.url);
  await page.getByRole("button", { name: "Edit office", exact: true }).click();
  await other.getByRole("button", { name: "Edit office", exact: true }).click();
  const first = page.getByRole("region", { name: "Workstation editor" });
  const second = other.getByRole("region", { name: "Workstation editor" });
  await first
    .getByLabel("Selected workstation", { exact: true })
    .selectOption("desk-2");
  await first
    .getByRole("button", { name: "Delete workstation", exact: true })
    .click();
  await first.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(first).not.toBeVisible();
  await second
    .getByRole("button", { name: "Save layout", exact: true })
    .click();
  await expect(second.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  expect((await layout(other)).placements.some((p) => p.id === "desk-2")).toBe(
    false,
  );
});

test("corrupt latest saved layout visibly restores the previous valid room without resolving pending input", async ({
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
  const previous = await layout(page);
  const beforeFrames = await frames(before);
  await page.getByRole("button", { name: "Edit office", exact: true }).click();
  const editor = page.getByRole("region", { name: "Workstation editor" });
  await editor
    .getByLabel("Selected workstation", { exact: true })
    .selectOption("desk-1");
  await editor
    .getByRole("button", { name: "Delete workstation", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Save layout", exact: true })
    .click();
  await expect(editor).not.toBeVisible();
  const latest = await layout(page);
  expect(latest.assignments[before.id]).toBeNull();
  const { DatabaseSync } = await import("node:sqlite");
  const { join } = await import("node:path");
  const db = new DatabaseSync(join(office.data, "office.db"));
  try {
    db.prepare("UPDATE layout_revisions SET body=? WHERE revision=?").run(
      "{corrupt",
      latest.revision,
    );
  } finally {
    db.close();
  }
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "Layout restored" }),
  ).toBeVisible();
  const recovered = await layout(page);
  expect(recovered.recoveredFrom).toBe(previous.revision);
  expect(recovered.placements).toEqual(previous.placements);
  expect(recovered.assignments[before.id]).toBe("desk-1");
  const after = (await snapshot(page)).agents[0];
  expect(after.requests).toEqual(before.requests);
  expect(after.epoch).toBe(before.epoch);
  expect(await frames(after)).toEqual(beforeFrames);
});
