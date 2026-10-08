import { test, expect, createAgent, snapshot, frames } from "./fixtures.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

test("Activity source filters, public search and keyboard inspection preserve owned foreground and observed limits", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  const beforeFrames = await frames(agent);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity.getByRole("button", { name: "Chats", exact: true }).click();
  const cli = activity.getByRole("button", { name: /CLI plan from yesterday/ });
  await expect(cli).toBeVisible();
  await expect(
    activity.getByRole("button", { name: /Scheduled summary/ }),
  ).toHaveCount(0);
  await cli.focus();
  await page.keyboard.press("Enter");
  const detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByText("Find the cobalt notebook", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("Unknown outcome", { exact: false }).first(),
  ).toBeVisible();
  await expect(detail.getByText("read_file", { exact: true })).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Prompt", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.getByRole("button", { name: "Stop", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.getByRole("button", { name: "Interrupt", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.locator("dt", { hasText: /^Cost$/ }).locator("+ dd"),
  ).toHaveText("Unavailable");
  await activity.getByLabel("Search public history").fill("cobalt notebook");
  await expect(
    activity.getByRole("button", { name: /CLI plan from yesterday/ }),
  ).toBeVisible();
  await expect(
    activity.getByRole("button", { name: /Hina conversation/ }),
  ).toHaveCount(0);
  await activity.getByLabel("Search public history").fill("");
  await activity
    .getByRole("button", { name: "Automation", exact: true })
    .click();
  await activity.getByLabel("State", { exact: true }).selectOption("error");
  await expect(
    activity.getByRole("button", { name: /Scheduled summary/ }),
  ).toBeVisible();
  await expect(cli).toHaveCount(0);
  await activity.getByRole("button", { name: "All", exact: true }).click();
  await activity.getByLabel("State", { exact: true }).selectOption("");
  await activity.getByLabel("Until (local time)").fill("2026-10-01T23:59");
  await expect(cli).toBeVisible();
  await expect(
    activity.getByRole("button", { name: /Scheduled summary/ }),
  ).toHaveCount(0);
  await expect(activity.getByRole("alert")).toHaveCount(0);
  await activity.getByLabel("Until (local time)").fill("");
  await activity.getByLabel("From (local time)").fill("2026-10-02T00:00");
  await expect(
    activity.getByRole("button", { name: /Scheduled summary/ }),
  ).toBeVisible();
  await expect(cli).toHaveCount(0);
  await expect(activity.getByRole("alert")).toHaveCount(0);
  const after = (await snapshot(page)).agents[0];
  expect(after.liveSessionId).toBe(agent.liveSessionId);
  expect(after.storedSessionId).toBe(agent.storedSessionId);
  expect(after.epoch).toBe(agent.epoch);
  expect(after.messages).toEqual(agent.messages);
  expect(await frames(agent)).toEqual(beforeFrames);
});

test("pinned historical inspection survives new live attention without redirecting it", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByRole("button", { name: /CLI plan from yesterday/ })
    .click();
  const detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByText("Find the cobalt notebook", { exact: true }),
  ).toBeVisible();
  const response = await page.evaluate(
    async ({ id, epoch, sessionId, commandId }) => {
      const session = await (await fetch("/api/session")).json();
      return (
        await fetch(`/api/agents/${id}/prompt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BlueOffice-CSRF": session.csrf,
          },
          body: JSON.stringify({
            commandId,
            target: { epoch, sessionId },
            text: "question",
          }),
        })
      ).status;
    },
    {
      id: agent.id,
      epoch: agent.epoch!,
      sessionId: agent.liveSessionId!,
      commandId: randomUUID(),
    },
  );
  expect(response).toBe(200);
  await expect(
    activity.getByText(/new attention request in live chat/),
  ).toBeVisible();
  await expect(
    detail.getByText("Find the cobalt notebook", { exact: true }),
  ).toBeVisible();
  await expect(
    activity.getByRole("button", { name: /CLI plan from yesterday/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const current = (await snapshot(page)).agents[0];
  expect(current.liveSessionId).toBe(agent.liveSessionId);
  expect(current.requests.some((r) => r.state === "open")).toBe(true);
  expect(current.messages.filter((m) => m.role === "user")).toHaveLength(1);
});

test("malformed history gives scoped safe diagnostics and a missing pinned detail can be retried", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const agent = (await snapshot(page)).agents[0];
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByRole("button", { name: /CLI plan from yesterday/ })
    .click();
  await expect(
    activity.getByText("Find the cobalt notebook", { exact: true }),
  ).toBeVisible();
  await writeFile(
    join(agent.profileHome, ".history-fixture.json"),
    "TOKEN=PRIVATE_HISTORY_CANARY malformed",
  );
  await activity
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(
    activity.getByRole("alert").filter({ hasText: /Check its database/ }),
  ).toBeVisible();
  await expect(
    activity.getByRole("alert").filter({ hasText: /History is unavailable/ }),
  ).toBeVisible();
  await expect(activity).not.toContainText("PRIVATE_HISTORY_CANARY");
  await expect(activity).not.toContainText(agent.profileHome);
  expect((await snapshot(page)).agents[0].liveSessionId).toBe(
    agent.liveSessionId,
  );
});
