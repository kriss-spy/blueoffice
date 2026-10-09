import {
  test,
  expect,
  createAgent,
  selectAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";
import { setupCharacterPack } from "../setup-fixture.js";

test("two overview agents keep prompts, question, denial, stop and configuration independent", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question · HINA_ONLY_PROMPT");
  await expect(
    page.getByRole("region", { name: "Question request" }),
  ).toBeVisible();
  await createAgent(page, "Akane");
  await send(page, "Akane", "approval private metadata · AKANE_ONLY_PROMPT");
  await expect(
    page.getByRole("region", { name: "Permission request" }),
  ).toBeVisible();
  let before = await snapshot(page);
  const hina = before.agents.find((agent) => agent.name === "Hina")!;
  const akane = before.agents.find((agent) => agent.name === "Akane")!;
  expect(JSON.stringify(hina.messages)).not.toContain("AKANE_ONLY_PROMPT");
  expect(JSON.stringify(akane.messages)).not.toContain("HINA_ONLY_PROMPT");
  expect(hina.profileHome).not.toBe(akane.profileHome);
  expect(hina.liveSessionId).not.toBe(akane.liveSessionId);
  const ref = await page.evaluate(
    async ({ pack, ids }) => {
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
      for (const id of ids)
        await post(`/api/agents/${id}/avatar`, { ref: imported.ref });
      return imported.ref;
    },
    { pack: setupCharacterPack(), ids: [hina.id, akane.id] },
  );
  before = await snapshot(page);
  const heldHina = before.agents.find((agent) => agent.id === hina.id)!;
  const hinaFrames = await frames(heldHina);
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  let overview = page.getByRole("dialog", { name: "Office overview" });
  await expect(overview.getByLabel("Office counts")).toHaveText(
    /2 configured.*2 running.*2 need input/,
  );
  for (const name of ["Hina", "Akane"])
    await expect(
      overview.getByRole("article", { name: `Overview for ${name}` }),
    ).toContainText(ref.assetId);
  await overview
    .getByRole("article", { name: "Overview for Akane" })
    .getByRole("button", { name: /^Permission:/ })
    .click();
  const permission = page.getByRole("region", { name: "Permission request" });
  await permission.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(
    permission.getByText("Hermes confirmed this request is closed."),
  ).toBeVisible();
  expect(
    (await snapshot(page)).agents.find((agent) => agent.id === hina.id),
  ).toEqual(heldHina);
  expect(await frames(heldHina)).toEqual(hinaFrames);
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  overview = page.getByRole("dialog", { name: "Office overview" });
  await overview
    .getByRole("button", { name: "Stop Akane", exact: true })
    .click();
  await expect(
    overview.getByRole("button", { name: "Start Akane", exact: true }),
  ).toBeEnabled();
  expect(
    (await snapshot(page)).agents.find((agent) => agent.id === hina.id),
  ).toEqual(heldHina);
  await overview
    .getByRole("button", { name: "Configure Akane", exact: true })
    .click();
  const settings = page.locator("dialog.settings-dialog[open]");
  await settings.getByLabel("Name", { exact: true }).fill("Akane configured");
  await settings
    .getByLabel("Persona / SOUL", { exact: true })
    .fill("AKANE_ONLY_PERSONA");
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    settings.getByText("Settings saved. Start the agent to apply them."),
  ).toBeVisible();
  expect(
    (await snapshot(page)).agents.find((agent) => agent.id === hina.id),
  ).toEqual(heldHina);
  await settings
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  overview = page.getByRole("dialog", { name: "Office overview" });
  await overview
    .getByRole("article", { name: "Overview for Hina" })
    .getByRole("button", { name: /^Question:/ })
    .click();
  const question = page.getByRole("region", { name: "Question request" });
  await question.getByRole("radio", { name: "Oak", exact: true }).check();
  await question
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  const denied = (await snapshot(page)).agents.find(
    (agent) => agent.id === akane.id,
  )!;
  expect(denied.requests.at(-1)?.decision?.choice).toBe("deny");
  expect(
    (await frames(denied)).filter(
      (frame) => !frame.method && frame.id === akane.requests.at(-1)?.frameId,
    ),
  ).toHaveLength(1);
  const stable = (await snapshot(page)).agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    deskId: agent.deskId,
    profileHome: agent.profileHome,
    configRevision: agent.configRevision,
    storedSessionId: agent.storedSessionId,
  }));
  await page.reload();
  await selectAgent(page, "Hina");
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  expect(
    (await snapshot(page)).agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      deskId: agent.deskId,
      profileHome: agent.profileHome,
      configRevision: agent.configRevision,
      storedSessionId: agent.storedSessionId,
    })),
  ).toEqual(stable);
});
