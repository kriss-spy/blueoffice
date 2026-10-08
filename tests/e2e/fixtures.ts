import { test as base, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Snapshot, OfficeAgent } from "../../shared/office.js";

export const test = base.extend<{ office: { url: string; data: string } }>({
  office: async ({}, use, testInfo) => {
    const data = await mkdtemp(join(tmpdir(), "blueoffice-ui-"));
    const token = randomUUID();
    await writeFile(
      join(data, ".verification-owner.json"),
      JSON.stringify({ token }),
    );
    const child = spawn("python3", ["scripts/run_server.py", "--fixture"], {
      env: { ...process.env, BLUEOFFICE_DATA: data, BLUEOFFICE_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (process.env.BLUEOFFICE_VERIFICATION_OUTPUT) {
      const registry = join(
        process.env.BLUEOFFICE_VERIFICATION_OUTPUT,
        "owned-servers",
      );
      await mkdir(registry, { recursive: true });
      await writeFile(
        join(registry, `${child.pid ?? "failed"}-${testInfo.testId}.json`),
        JSON.stringify({ pid: child.pid, data, token }),
      );
    }
    let logs = "";
    let exited = false;
    let readinessTimer: NodeJS.Timeout;
    const stopped = new Promise<void>((resolve) =>
      child.once("close", () => {
        exited = true;
        resolve();
      }),
    );
    try {
      const url = await new Promise<string>((resolve, reject) => {
        readinessTimer = setTimeout(
          () => reject(new Error("Fixture server readiness timed out")),
          20_000,
        );
        child.once("error", reject);
        child.once("exit", (code) =>
          reject(new Error(`Fixture server exited ${code}: ${logs}`)),
        );
        child.stdout.on("data", (buffer) => {
          logs += buffer;
          const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (match) resolve(match[0]);
        });
        child.stderr.on("data", (buffer) => {
          logs += buffer;
        });
      }).finally(() => clearTimeout(readinessTimer));
      const response = await fetch(`${url}/api/session`, {
        signal: AbortSignal.timeout(5_000),
      });
      expect(response.ok).toBeTruthy();
      await use({ url, data });
    } finally {
      // SIGTERM asks Office.shutdown to stop its independently owned RPC processes.
      if (!exited && child.pid) child.kill("SIGTERM");
      let timeout: NodeJS.Timeout | undefined;
      await Promise.race([
        stopped,
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            if (!exited && child.pid) {
              try {
                child.kill("SIGKILL");
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH")
                  throw error;
              }
            }
            resolve();
          }, 8_000);
        }),
      ]);
      clearTimeout(timeout);
      await stopped;
      await writeFile(testInfo.outputPath("fixture-server.log"), logs);
      if (testInfo.status !== testInfo.expectedStatus)
        await testInfo.attach("fixture-server", {
          body: logs,
          contentType: "text/plain",
        });
      await rm(data, { recursive: true, force: true });
    }
  },
});
export { expect };

export async function createAgent(page: Page, name: string) {
  await page.getByRole("button", { name: "Add agent", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Workspace", { exact: true }).fill(tmpdir());
  await dialog
    .getByRole("combobox", { name: "Model", exact: true })
    .selectOption("glm-5.3-flash");
  await dialog
    .getByRole("button", { name: "Create assistant", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Start agent", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Agent is running", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(`Message ${name}`)).toBeEnabled();
}
export async function send(page: Page, name: string, text: string) {
  await page.getByLabel(`Message ${name}`).fill(text);
  await page.getByRole("button", { name: "Send task", exact: true }).click();
}
export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => (await fetch("/api/snapshot")).json());
}
export async function frames(agent: OfficeAgent) {
  return (await readFile(join(agent.profileHome, "commands.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
