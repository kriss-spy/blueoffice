import {
  test,
  expect,
  createAgent,
  selectAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";

test("question answers survive reload, reject competing answers, and resume the same turn", async ({
  page,
  office,
  context,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "multi batch question");
  let card = page.getByRole("region", { name: "Question request" }).last();
  await expect(card.getByRole("group", { name: "Which desk?" })).toBeVisible();
  const agent = (await snapshot(page)).agents[0];
  const request = agent.requests[0];
  const other = await context.newPage();
  await other.goto(office.url);
  await selectAgent(other, "Hina");
  await expect(
    other.getByRole("region", { name: "Question request" }),
  ).toBeVisible();
  await card.getByRole("radio", { name: "Birch", exact: true }).focus();
  await page.keyboard.press("Space");
  await card
    .getByRole("group", { name: "Which desk?" })
    .getByRole("button", { name: "Confirm this answer" })
    .click();
  await expect(card.getByText("Answer confirmed by Hermes.")).toBeVisible();
  const duplicate = await other.evaluate(
    async ({ agent, request }) => {
      const { csrf } = await (await fetch("/api/session")).json();
      const response = await fetch(`/api/agents/${agent.id}/answer-question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-blueoffice-csrf": csrf,
        },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          requestId: request.id,
          target: { epoch: request.epoch, sessionId: request.sessionId },
          questionId: "q0",
          answer: "Oak",
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { agent, request },
  );
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error).toMatch(/already locked/);
  await page.reload();
  await selectAgent(page, "Hina");
  card = page.getByRole("region", { name: "Question request" }).last();
  await expect(
    card.getByRole("radio", { name: "Birch", exact: true }),
  ).toBeChecked();
  await expect(
    card.getByRole("radio", { name: "Birch", exact: true }),
  ).toBeDisabled();
  expect((await snapshot(page)).agents[0].requests[0].id).toBe(request.id);
  expect(
    (await frames(agent)).filter((frame) => frame.method === "prompt.submit"),
  ).toHaveLength(1);
  await card.getByRole("checkbox", { name: "Blue", exact: true }).check();
  await card.getByRole("checkbox", { name: "White", exact: true }).check();
  await card.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(
    card.getByText("Hermes confirmed this request is closed."),
  ).toBeVisible();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  const completed = (await snapshot(page)).agents[0];
  expect(completed.turnId).toBe(agent.turnId);
  expect(completed.requests[0].state).toBe("resolved");
  expect(
    (await frames(agent)).filter((frame) => frame.method === "prompt.submit"),
  ).toHaveLength(1);
});

test("permission denial persists and never sends an allow decision", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "approval private metadata");
  let card = page.getByRole("region", { name: "Permission request" }).last();
  await expect(
    card.getByRole("button", { name: "Deny", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message Hina")).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(
    "PRIVATE_APPROVAL_METADATA",
  );
  const agent = (await snapshot(page)).agents[0];
  const request = agent.requests.at(-1)!;
  await card.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(
    card.getByText("Hermes confirmed this request is closed."),
  ).toBeVisible();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  await page.reload();
  await selectAgent(page, "Hina");
  card = page.getByRole("region", { name: "Permission request" }).last();
  await expect(card).toContainText("Decision recorded: Deny");
  expect(
    (await snapshot(page)).agents[0].requests.at(-1)?.decision?.choice,
  ).toBe("deny");
  const responses = (await frames(agent)).filter(
    (frame) => frame.id === request.frameId && !frame.method,
  );
  expect(responses).toHaveLength(1);
  expect(JSON.stringify(responses[0].result)).toContain('"choice":"deny"');
});

test("Interrupt ends the task while Stop ends the owned runtime", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question");
  const card = page.getByRole("region", { name: "Question request" }).last();
  await expect(
    card.getByRole("button", { name: "Send answer", exact: true }),
  ).toBeVisible();
  const before = (await snapshot(page)).agents[0];
  await page
    .getByRole("button", { name: "Interrupt task", exact: true })
    .click();
  await expect(card.getByText("interrupted", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  const interrupted = (await snapshot(page)).agents[0];
  expect(interrupted.lifecycle).toBe("ready");
  expect(interrupted.work).toBe("interrupted");
  expect(interrupted.epoch).toBe(before.epoch);
  expect(interrupted.requests.at(-1)?.decision).toBeUndefined();
  await send(page, "Hina", "hello again");
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  await page.getByRole("button", { name: "Stop agent", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start agent", exact: true }),
  ).toBeEnabled();
  expect((await snapshot(page)).agents[0].lifecycle).toBe("stopped");
  await expect(page.getByLabel("Message Hina")).toBeDisabled();
});

test("answering one of two waiting agents leaves the other request untouched", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "single question");
  await expect(
    page
      .getByRole("region", { name: "Question request" })
      .getByRole("radio", { name: "Oak", exact: true }),
  ).toBeVisible();
  const hina = (await snapshot(page)).agents.find(
    (agent) => agent.name === "Hina",
  )!;
  await createAgent(page, "Akane");
  await send(page, "Akane", "single question");
  await expect(
    page
      .getByRole("region", { name: "Question request" })
      .getByRole("radio", { name: "Oak", exact: true }),
  ).toBeVisible();
  const akane = (await snapshot(page)).agents.find(
    (agent) => agent.name === "Akane",
  )!;
  await selectAgent(page, "Hina");
  const card = page.getByRole("region", { name: "Question request" }).last();
  await card.getByRole("radio", { name: "Oak", exact: true }).check();
  await card.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(
    card.getByText("Hermes confirmed this request is closed."),
  ).toBeVisible();
  await page.reload();
  await selectAgent(page, "Hina");
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  const current = await snapshot(page);
  expect(
    current.agents.find((agent) => agent.id === hina.id)?.requests.at(-1)
      ?.state,
  ).toBe("resolved");
  const untouched = current.agents.find((agent) => agent.id === akane.id)!;
  expect(untouched.requests.at(-1)?.id).toBe(akane.requests.at(-1)?.id);
  expect(untouched.requests.at(-1)?.state).toBe("open");
  expect(untouched.requests.at(-1)?.questions).toEqual(
    akane.requests.at(-1)?.questions,
  );
  expect(untouched.requests.at(-1)?.decision).toBeUndefined();
  expect(
    (await frames(hina)).filter((frame) => frame.method === "prompt.submit"),
  ).toHaveLength(1);
  expect(
    (await frames(akane)).filter((frame) => frame.method === "prompt.submit"),
  ).toHaveLength(1);
  await selectAgent(page, "Akane");
  await expect(
    page
      .getByRole("region", { name: "Question request" })
      .getByRole("button", { name: "Send answer", exact: true }),
  ).toBeEnabled();
});
