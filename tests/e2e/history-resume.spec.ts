import {
  test,
  expect,
  createAgent,
  snapshot,
  send,
  frames,
} from "./fixtures.js";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setupCharacterPack } from "../setup-fixture.js";
import type { HistoryList } from "../../shared/history.js";

async function post(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const { csrf } = await (await fetch("/api/session")).json();
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BlueOffice-CSRF": csrf,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, body },
  );
}
async function history(page: Page): Promise<HistoryList> {
  return page.evaluate(async () => (await fetch("/api/history")).json());
}

test("keyboard New conversation and owned Resume preserve pinned transcript, fresh bindings and a shared reviewed avatar", async ({
  page,
  office,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof getContext>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const imported = await post(
    page,
    "/api/characters/import",
    setupCharacterPack(),
  );
  const ref = imported.body.ref;
  expect(
    (
      await post(page, "/api/characters/review", {
        ref,
        clips: ["Idle"],
        materials: true,
        coordinates: true,
        limitations: true,
      })
    ).status,
  ).toBe(200);
  let first = (await snapshot(page)).agents[0];
  expect(
    (await post(page, `/api/agents/${first.id}/avatar`, { ref })).status,
  ).toBe(200);
  const second = await post(page, "/api/agents", {
    name: "Mika",
    workspace: tmpdir(),
    model: "glm-5.3-flash",
    placement: { avatar: ref, deskId: "desk-2" },
  });
  expect(second.status).toBe(201);
  await send(page, "Hina", "Retain the cobalt notebook context");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].busy)
    .toBe(false);
  first = (await snapshot(page)).agents[0];
  const oldRow = (await history(page)).sessions.find(
    (s) => s.storedSessionId === first.storedSessionId,
  )!;
  expect(oldRow.persisted).toBe(true);
  const fresh = page.getByRole("button", {
    name: "New conversation",
    exact: true,
  });
  await expect(fresh).toBeEnabled();
  await fresh.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].epoch)
    .not.toBe(first.epoch);
  await expect
    .poll(async () => (await snapshot(page)).agents[0].lifecycle)
    .toBe("ready");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].storedSessionId)
    .not.toBe(first.storedSessionId);
  const newConversation = (await snapshot(page)).agents[0];
  expect(newConversation.storedSessionId).not.toBe(first.storedSessionId);
  expect({
    name: newConversation.name,
    avatar: newConversation.avatar,
    deskId: newConversation.deskId,
    profileHome: newConversation.profileHome,
  }).toEqual({
    name: first.name,
    avatar: ref,
    deskId: first.deskId,
    profileHome: first.profileHome,
  });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByLabel("Search public history")
    .fill(first.storedSessionId!);
  const row = activity.getByRole("button", { name: /Hina conversation/ });
  await row.click();
  const detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByText("Retain the cobalt notebook context", { exact: true }),
  ).toBeVisible();
  const beforeInspect = (await snapshot(page)).agents[0];
  expect(beforeInspect.liveSessionId).toBe(newConversation.liveSessionId);
  const resume = detail.getByRole("button", { name: "Resume", exact: true });
  await expect(resume).toBeEnabled();
  await resume.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].epoch)
    .not.toBe(newConversation.epoch);
  await expect
    .poll(async () => (await snapshot(page)).agents[0].lifecycle)
    .toBe("ready");
  const resumed = (await snapshot(page)).agents[0];
  expect(resumed.storedSessionId).toBe(first.storedSessionId);
  expect(resumed.liveSessionId).not.toBe(first.liveSessionId);
  expect(resumed.conversations.at(-1)?.resumedFrom).toMatchObject({
    historyId: oldRow.id,
    requestedStoredSessionId: first.storedSessionId,
    resolvedStoredSessionId: first.storedSessionId,
    source: "blueoffice",
  });
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(
    detail.getByText("Retain the cobalt notebook context", { exact: true }),
  ).toBeVisible();
  expect(resumed.avatar).toEqual(ref);
  expect(resumed.deskId).toBe(first.deskId);
  expect(
    (await snapshot(page)).agents.find((a) => a.id === second.body.id),
  ).toEqual(second.body);
  const commands = await frames(resumed);
  expect(commands.filter((f) => f.method === "prompt.submit")).toHaveLength(1);
  await page.reload();
  expect((await snapshot(page)).agents[0].avatar).toEqual(ref);
});

test("busy resume and external takeover are refused, and an old batch request cannot answer a resumed epoch", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "batch question");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].requests.length)
    .toBe(1);
  const old = (await snapshot(page)).agents[0];
  const target = { epoch: old.epoch, sessionId: old.liveSessionId };
  const own = (await history(page)).sessions.find((s) => s.agentId === old.id)!;
  const before = await frames(old);
  expect(
    (
      await post(page, `/api/agents/${old.id}/conversation`, {
        commandId: randomUUID(),
        expectedTarget: target,
        action: "resume",
        historyId: own.id,
      })
    ).status,
  ).toBe(409);
  expect(
    (await frames(old))
      .slice(before.length)
      .some(
        (f) =>
          f.method === "session.interrupt" || f.method === "session.resume",
      ),
  ).toBe(false);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByRole("button", { name: /CLI plan from yesterday/ })
    .click();
  const detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByRole("button", { name: "Resume", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.getByText(/External history cannot yet be resumed/),
  ).toBeVisible();
  const observed = (await history(page)).sessions.find(
    (s) => s.source === "cli",
  )!;
  expect(
    (
      await post(page, `/api/agents/${old.id}/conversation`, {
        commandId: randomUUID(),
        expectedTarget: target,
        action: "resume",
        historyId: observed.id,
      })
    ).status,
  ).toBe(409);
  expect((await post(page, `/api/agents/${old.id}/stop`, {})).status).toBe(200);
  const resumeId = randomUUID();
  const action = {
    commandId: resumeId,
    expectedTarget: target,
    action: "resume",
    historyId: own.id,
  };
  const accepted = await post(
    page,
    `/api/agents/${old.id}/conversation`,
    action,
  );
  expect(accepted.body.state).toBe("accepted");
  expect(
    (await post(page, `/api/agents/${old.id}/conversation`, action)).body,
  ).toEqual(accepted.body);
  const pending = old.requests[0];
  expect(
    (
      await post(page, `/api/agents/${old.id}/answer-question`, {
        commandId: randomUUID(),
        target,
        requestId: pending.id,
        questionId: pending.questions[0].qid,
        answer: "Oak",
      })
    ).status,
  ).toBe(409);
  const resumed = (await snapshot(page)).agents[0];
  expect(resumed.storedSessionId).toBe(old.storedSessionId);
  expect(resumed.requests.find((r) => r.id === pending.id)?.state).not.toBe(
    "resolved",
  );
  expect(
    (await frames(resumed)).filter((f) => f.method === "session.resume"),
  ).toHaveLength(1);
});

test("missing stored history rejects Resume through HTTP and preserves the pinned inspection and foreground binding", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "Preserve visible context on failed resume");
  await expect
    .poll(async () => (await snapshot(page)).agents[0].busy)
    .toBe(false);
  const original = (await snapshot(page)).agents[0];
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByLabel("Search public history")
    .fill(original.storedSessionId!);
  const row = activity.getByRole("button", { name: /Hina conversation/ });
  await row.focus();
  await page.keyboard.press("Enter");
  const detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByText("Preserve visible context on failed resume", {
      exact: true,
    }),
  ).toBeVisible();
  const path = join(original.profileHome, ".history-fixture.json");
  const data = JSON.parse(await readFile(path, "utf8"));
  data.records = data.records.filter(
    (r: { storedSessionId: string }) =>
      r.storedSessionId !== original.storedSessionId,
  );
  await writeFile(path, JSON.stringify(data));
  await detail.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(detail.getByRole("alert")).toContainText(
    /not been persisted|unavailable/,
  );
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(
    detail.getByText("Preserve visible context on failed resume", {
      exact: true,
    }),
  ).toBeVisible();
  const after = (await snapshot(page)).agents[0];
  expect({
    epoch: after.epoch,
    live: after.liveSessionId,
    stored: after.storedSessionId,
    lifecycle: after.lifecycle,
  }).toEqual({
    epoch: original.epoch,
    live: original.liveSessionId,
    stored: original.storedSessionId,
    lifecycle: "ready",
  });
  expect(
    (await frames(after)).filter((f) => f.method === "session.resume"),
  ).toHaveLength(0);
  expect(
    (await frames(after)).filter((f) => f.method === "session.create"),
  ).toHaveLength(1);
});
