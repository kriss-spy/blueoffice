import {
  test,
  expect,
  createAgent,
  snapshot,
  frames,
  send,
} from "./fixtures.js";

test("quota and unavailable proxy stay distinct, redact provider details and never retry on reload", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "fail quota");
  await expect(
    page.getByText("Provider limit reached", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Provider quota was reached/).first(),
  ).toBeVisible();
  let current = (await snapshot(page)).agents[0];
  await expect
    .poll(async () => (await snapshot(page)).agents[0].busy)
    .toBe(false);
  expect(current.work).toBe("failed");
  expect(current.failureKind).toBe("quota");
  expect(current.terminal?.outcome).toBe("failed");
  expect(await page.locator("body").innerText()).not.toContain(
    "PRIVATE_PROVIDER_CANARY",
  );
  expect(
    (await frames(current)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.getByLabel("Message Hina")).toBeEnabled();
  await expect(
    page.getByText(/Provider quota was reached/).first(),
  ).toBeVisible();
  expect(
    (await frames(current)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(1);
  await send(page, "Hina", "fail proxy");
  await expect(
    page.getByText(/CLIProxyAPI is unavailable/).first(),
  ).toBeVisible();
  current = (await snapshot(page)).agents[0];
  expect(current.work).toBe("failed");
  expect(current.failureKind).toBe("connection");
  expect(JSON.stringify(current)).not.toContain("PRIVATE_PROVIDER_CANARY");
  expect(
    (await frames(current)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(2);
});

test("one native transport failure leaves another assistant's exact unanswered request usable", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const hina = (await snapshot(page)).agents[0];
  await createAgent(page, "Yuuka");
  await send(page, "Yuuka", "question");
  await expect(
    page.getByRole("region", { name: "Question request" }),
  ).toBeVisible();
  const yuuka = (await snapshot(page)).agents.find((a) => a.name === "Yuuka")!;
  const request = yuuka.requests.at(-1)!;
  await page
    .getByRole("navigation", { name: "Select an agent" })
    .getByRole("button", { name: /Hina/ })
    .click();
  await send(page, "Hina", "exit");
  await expect(page.getByLabel("Message Hina")).toBeDisabled();
  await expect(page.getByText(/Status unknown/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Message Hina")).toBeDisabled();
  const after = await snapshot(page);
  expect(after.agents.find((a) => a.id === hina.id)?.freshness).toBe("unknown");
  const surviving = after.agents.find((a) => a.id === yuuka.id)!;
  expect(surviving.liveSessionId).toBe(yuuka.liveSessionId);
  expect(surviving.requests.find((r) => r.id === request.id)?.state).toBe(
    "open",
  );
  await page
    .getByRole("region", { name: "Room attention", exact: true })
    .getByRole("button", {
      name: `Open question for Yuuka: ${request.id}`,
      exact: true,
    })
    .click();
  const card = page.getByRole("region", { name: "Question request" }).last();
  await card.getByRole("radio", { name: "Oak", exact: true }).check();
  await card.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(card).toContainText("Hermes confirmed this request is closed.");
  expect(
    (await frames(hina)).filter((f) => f.method === "prompt.submit"),
  ).toHaveLength(1);
});
