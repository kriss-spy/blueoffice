import {
  test,
  expect,
  createAgent,
  snapshot,
  frames,
  send,
} from "./fixtures.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

test("typed historical children group under a parent without gaining agents or live controls, and reload deduplicates discovery", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  await send(page, "Hina", "persist parent");
  await expect(
    page.getByText("Fixture task complete. Your workspace is ready.", {
      exact: true,
    }),
  ).toBeVisible();
  const before = (await snapshot(page)).agents[0];
  const commandFrames = await frames(before);
  const path = join(before.profileHome, ".history-fixture.json");
  const data = JSON.parse(await readFile(path, "utf8"));
  const parent = before.storedSessionId;
  const row = (
    id: string,
    title: string,
    parentId: string | null,
    evidence: boolean,
  ) => ({
    storedSessionId: id,
    title,
    source: "subagent",
    startedAt: "2026-10-09T00:00:00Z",
    lastActivityAt: "2026-10-09T00:00:00Z",
    endedAt: "2026-10-09T00:01:00Z",
    endReason: "agent_close",
    parentStoredSessionId: parentId,
    lineageEvidence: evidence ? "native-delegate-marker" : null,
    metrics: {
      inputTokens: null,
      outputTokens: null,
      calls: null,
      costUsd: null,
      costKind: null,
    },
  });
  data.records.push(
    row("child-historic", "Historical delegate", parent, true),
    row("child-orphan", "Unknown parent delegate", "not-discovered", true),
    row("child-missing", "Missing lineage delegate", null, false),
  );
  data.messages["child-historic"] = [
    { id: "m", role: "assistant", text: "Public child result", at: null },
  ];
  data.tools["child-historic"] = [
    {
      id: "t",
      name: "read_file",
      context: "public child tool",
      at: null,
      outcome: "unknown",
    },
  ];
  await writeFile(path, JSON.stringify(data));
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  let activity = page.getByRole("region", { name: "Activity", exact: true });
  await activity
    .getByRole("combobox", { name: "Agent", exact: true })
    .selectOption(before.id);
  const child = activity.getByRole("button", { name: /Historical delegate/ });
  await expect(child).toHaveCount(1);
  await expect(child).toContainText("Child task of Hina");
  await expect(
    activity.getByRole("button", { name: /Unknown parent delegate/ }),
  ).toHaveCount(0);
  await child.focus();
  await page.keyboard.press("Enter");
  let detail = activity.getByRole("region", { name: "History inspection" });
  await expect(
    detail.getByText("Public child result", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("public child tool", { exact: true }),
  ).toBeVisible();
  await expect(detail.getByText(/Parent turn ID: unavailable/)).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Resume", exact: true }),
  ).toBeDisabled();
  await expect(
    detail.getByRole("button", { name: "Stop", exact: true }),
  ).toBeDisabled();
  await detail.getByRole("button", { name: "Inspect parent history" }).click();
  await expect(
    detail.getByRole("button", {
      name: /Historical delegate.*Unknown outcome.*Observed/,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  activity = page.getByRole("region", { name: "Activity", exact: true });
  await expect(
    activity.getByRole("button", { name: /Historical delegate/ }),
  ).toHaveCount(1);
  await activity
    .getByRole("button", { name: /Missing lineage delegate/ })
    .click();
  detail = activity.getByRole("region", { name: "History inspection" });
  await expect(detail.getByText(/Observed · Unknown outcome/)).toBeVisible();
  const after = (await snapshot(page)).agents;
  expect(after).toHaveLength(1);
  expect(after[0].liveSessionId).toBe(before.liveSessionId);
  expect(after[0].epoch).toBe(before.epoch);
  expect(after[0].avatar).toEqual(before.avatar);
  expect(after[0].messages).toEqual(before.messages);
  // Reconnect legitimately activates the same native session and reads events.
  // It must not create/resume a conversation or submit/reply to work.
  const mutations = (log: Awaited<ReturnType<typeof frames>>) =>
    log.filter(
      (f) =>
        /^(prompt\.submit|session\.(create|resume|stop|interrupt))$/.test(
          f.method ?? "",
        ) ||
        (!f.method && f.id),
    );
  expect(mutations(await frames(before))).toEqual(mutations(commandFrames));
});
