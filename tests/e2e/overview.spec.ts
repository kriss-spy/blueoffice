import {
  test,
  expect,
  createAgent,
  selectAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";

test("eight-agent overview counts and direct lifecycle controls preserve another agent's pending work", async ({
  page,
  office,
}) => {
  test.setTimeout(120_000);
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question");
  await expect(
    page.getByRole("region", { name: "Question request" }),
  ).toBeVisible();
  await createAgent(page, "Akane");
  await send(page, "Akane", "approval private metadata");
  await expect(
    page.getByRole("region", { name: "Permission request" }),
  ).toBeVisible();
  for (const name of ["Yuuka", "Noa", "Hoshino", "Shiroko", "Serika", "Nonomi"])
    await createAgent(page, name);
  const before = await snapshot(page);
  const hina = before.agents.find((a) => a.name === "Hina")!;
  const akane = before.agents.find((a) => a.name === "Akane")!;
  const hinaFrames = await frames(hina);
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  let overview = page.getByRole("dialog", { name: "Office overview" });
  await expect(overview.getByLabel("Office counts")).toHaveText(
    /8 configured.*8 running.*2 need input.*0 unassigned/,
  );
  await expect(overview.getByRole("article")).toHaveCount(8);
  await overview
    .getByRole("button", { name: "Stop Akane", exact: true })
    .click();
  await expect(overview.getByLabel("Office counts")).toHaveText(
    /8 configured.*7 running/,
  );
  const afterStop = await snapshot(page);
  expect(afterStop.agents.find((a) => a.id === hina.id)).toEqual(hina);
  expect(await frames(hina)).toEqual(hinaFrames);
  expect(afterStop.agents.find((a) => a.id === akane.id)?.lifecycle).toBe(
    "stopped",
  );
  await overview
    .getByRole("button", { name: "Furniture", exact: true })
    .click();
  await expect(overview.getByLabel("Furniture inventory")).toContainText(
    "8 workstation assemblies",
  );
  await expect(overview.getByLabel("Furniture inventory")).toContainText(
    "Akane",
  );
  await overview.getByRole("button", { name: "Agents", exact: true }).click();
  await overview
    .getByRole("article", { name: "Overview for Hina" })
    .getByRole("button", { name: /^Question:/ })
    .click();
  const question = page.getByRole("region", { name: "Question request" });
  await expect(question).toBeVisible();
  await expect(page.getByLabel("Message Hina")).toBeDisabled();
  await question.getByRole("radio", { name: "Oak", exact: true }).check();
  await question
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  expect(
    (await frames(akane)).filter(
      (f) => f.id === akane.requests.at(-1)?.frameId && !f.method,
    ),
  ).toHaveLength(0);
  const stable = (await snapshot(page)).agents.map((a) => ({
    id: a.id,
    profileHome: a.profileHome,
    deskId: a.deskId,
    avatar: a.avatar,
    storedSessionId: a.storedSessionId,
  }));
  await page.reload();
  await selectAgent(page, "Hina");
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  expect(
    (await snapshot(page)).agents.map((a) => ({
      id: a.id,
      profileHome: a.profileHome,
      deskId: a.deskId,
      avatar: a.avatar,
      storedSessionId: a.storedSessionId,
    })),
  ).toEqual(stable);
  await page
    .getByRole("button", { name: "Office overview", exact: true })
    .click();
  overview = page.getByRole("dialog", { name: "Office overview" });
  await expect(
    overview.getByRole("button", { name: "Start Akane", exact: true }),
  ).toBeEnabled();
});
