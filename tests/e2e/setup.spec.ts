import { test, expect, snapshot } from "./fixtures.js";
import { setupCharacterPack } from "../setup-fixture.js";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

test("new and adopted setup collect reviewed avatar and explicit desk identity before launch", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await expect(
    page.getByText("Connected locally", { exact: true }),
  ).toBeVisible();
  const ref = await page.evaluate(async (pack) => {
    const { csrf } = await (await fetch("/api/session")).json();
    const post = async (path: string, body: unknown) => {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BlueOffice-CSRF": csrf,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const imported = await post("/api/characters/import", pack);
    await post("/api/characters/review", {
      ref: imported.ref,
      clips: ["Idle"],
      materials: true,
      coordinates: true,
      limitations: true,
    });
    return imported.ref;
  }, setupCharacterPack());
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  let dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Name", { exact: true }).fill("Assigned");
  await dialog.getByLabel("Workspace", { exact: true }).fill(tmpdir());
  await dialog
    .getByRole("combobox", { name: "Model", exact: true })
    .selectOption("glm-5.3-flash");
  await dialog
    .getByRole("combobox", { name: "Avatar", exact: true })
    .selectOption(`${ref.assetId}/${ref.version}/${ref.sha256}`);
  await dialog
    .getByRole("combobox", { name: "Workstation", exact: true })
    .selectOption("desk-4");
  await dialog
    .getByRole("button", { name: "Create assistant", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const assigned = (await snapshot(page)).agents[0];
  expect(assigned.avatar).toEqual(ref);
  expect(assigned.deskId).toBe("desk-4");
  expect(assigned.lifecycle).toBe("stopped");
  expect(assigned.configRevision).toBeTruthy();
  const home = join(office.data, "profiles", "adopt-existing");
  await mkdir(home);
  await writeFile(
    join(home, "config.yaml"),
    await readFile(join(assigned.profileHome, "config.yaml")),
  );
  await writeFile(join(home, "SOUL.md"), "Existing private persona");
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Adopt an existing profile instead" })
    .click();
  dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Existing Hermes profile home").fill(home);
  await dialog
    .getByRole("button", { name: "Inspect profile", exact: true })
    .click();
  await dialog.getByLabel("Name", { exact: true }).fill("Unassigned adopted");
  await dialog
    .getByRole("combobox", { name: "Avatar", exact: true })
    .selectOption(`${ref.assetId}/${ref.version}/${ref.sha256}`);
  await expect(
    dialog
      .getByRole("combobox", { name: "Workstation", exact: true })
      .locator("option[value='desk-4']"),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Workstation", exact: true })
    .selectOption("");
  await dialog
    .getByRole("checkbox", { name: /only writer and runtime owner/ })
    .check();
  await dialog
    .getByRole("button", { name: "Adopt profile", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const stable = (await snapshot(page)).agents;
  expect(stable[1].avatar).toEqual(ref);
  expect(stable[1].deskId).toBeNull();
  expect(stable[1].profileHome).toBe(home);
  await page.reload();
  expect((await snapshot(page)).agents).toEqual(stable);
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  const overview = page.getByRole("dialog", { name: "Office overview" });
  await expect(overview.getByLabel("Office counts")).toContainText(
    "1 unassigned",
  );
  await expect(
    overview.getByRole("article", { name: "Overview for Unassigned adopted" }),
  ).toContainText("Unassigned");
});
