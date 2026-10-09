import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { OfficeAgent } from "../../shared/office.js";
import { sceneTestPack } from "./scene-asset-fixture.js";
import {
  test,
  expect,
  createAgent,
  send,
  snapshot,
  frames,
} from "./fixtures.js";

/** Two original colored engineering meshes. Functional identity proof, never character/art acceptance. */
function coloredPack(assetId: string, color: [number, number, number, number]) {
  const base = sceneTestPack(false, false);
  const source = Buffer.from(base.files[0].base64, "base64");
  const jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  gltf.materials = [
    {
      name: assetId,
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    },
  ];
  gltf.meshes[0].primitives[0].material = 0;
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const header = Buffer.from(source.subarray(0, 20));
  const binaryChunk = source.subarray(20 + jsonLength);
  header.writeUInt32LE(20 + padded.length + binaryChunk.length, 8);
  header.writeUInt32LE(padded.length, 12);
  const bytes = Buffer.concat([header, padded, binaryChunk]);
  return {
    manifest: {
      ...base.manifest,
      assetId,
      name: assetId,
      files: [
        {
          path: "avatar.glb",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    },
    files: [{ path: "avatar.glb", base64: bytes.toString("base64") }],
  };
}
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
async function assign(
  page: Page,
  id: string,
  pack: ReturnType<typeof coloredPack>,
) {
  const imported = await post(page, "/api/characters/import", pack);
  expect(imported.status).toBe(201);
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
  expect((await post(page, `/api/agents/${id}/avatar`, { ref })).status).toBe(
    200,
  );
  return ref;
}
const mutationFrames = async (agent: OfficeAgent) =>
  (await frames(agent)).filter(
    (frame) =>
      !["session.events.since", "session.activate"].includes(frame.method),
  );
const identity = (a: OfficeAgent) => ({
  id: a.id,
  name: a.name,
  profileHome: a.profileHome,
  profileName: a.profileName,
  workspace: a.workspace,
  avatar: a.avatar,
  deskId: a.deskId,
  epoch: a.epoch,
  liveSessionId: a.liveSessionId,
  storedSessionId: a.storedSessionId,
});

test("PRD scenario 1: different reviewed avatars and profiles retain independent tasks, exact attention and settings across reload", async ({
  page,
  office,
}) => {
  await page.goto(office.url);
  await createAgent(page, "Hina");
  const first = (await snapshot(page)).agents[0];
  const orange = coloredPack("test.release.orange", [0.95, 0.25, 0.08, 1]);
  const blue = coloredPack("test.release.blue", [0.08, 0.35, 0.95, 1]);
  expect(orange.manifest.files[0].sha256).not.toBe(
    blue.manifest.files[0].sha256,
  );
  const orangeRef = await assign(page, first.id, orange);
  await send(page, "Hina", "question");
  await expect(
    page.getByRole("region", { name: "Question request" }).last(),
  ).toBeVisible();
  await createAgent(page, "Akane");
  const second = (await snapshot(page)).agents.find((a) => a.name === "Akane")!;
  const blueRef = await assign(page, second.id, blue);
  expect(orangeRef.assetId).not.toBe(blueRef.assetId);
  expect(orangeRef.sha256).not.toBe(blueRef.sha256);
  await send(page, "Akane", "approval");
  await expect(
    page.getByRole("region", { name: "Permission request" }).last(),
  ).toBeVisible();
  const waiting = await snapshot(page),
    hina = waiting.agents.find((a) => a.id === first.id)!,
    akane = waiting.agents.find((a) => a.id === second.id)!;
  expect(hina.profileHome).not.toBe(akane.profileHome);
  expect(hina.profileName).not.toBe(akane.profileName);
  expect(hina.deskId).not.toBe(akane.deskId);
  expect(hina.lifecycle).toBe("ready");
  expect(akane.lifecycle).toBe("ready");
  expect(hina.avatar).toEqual(orangeRef);
  expect(akane.avatar).toEqual(blueRef);
  const question = hina.requests.at(-1)!,
    permission = akane.requests.at(-1)!,
    heldFrames = await mutationFrames(akane);
  const queue = page.getByRole("region", {
    name: "Room attention",
    exact: true,
  });
  await expect(queue.getByRole("button")).toHaveCount(2);
  expect(
    (
      await post(page, `/api/agents/${akane.id}/reply`, {
        commandId: randomUUID(),
        requestId: question.id,
        target: { epoch: akane.epoch, sessionId: akane.liveSessionId },
        answer: { answer: "Oak" },
      })
    ).status,
  ).toBe(409);
  expect((await snapshot(page)).agents.find((a) => a.id === akane.id)).toEqual(
    akane,
  );
  expect(await mutationFrames(akane)).toEqual(heldFrames);
  await queue
    .getByRole("button", {
      name: `Open question for Hina: ${question.id}`,
      exact: true,
    })
    .click();
  const questionCard = page
    .getByRole("region", { name: "Question request" })
    .last();
  await questionCard.getByRole("radio", { name: "Oak", exact: true }).check();
  await questionCard
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await expect(questionCard).toContainText(
    "Hermes confirmed this request is closed.",
  );
  expect((await snapshot(page)).agents.find((a) => a.id === akane.id)).toEqual(
    akane,
  );
  expect(await mutationFrames(akane)).toEqual(heldFrames);
  await page.getByRole("button", { name: "Stop agent", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start agent", exact: true }),
  ).toBeEnabled();
  const otherSoul = await readFile(join(akane.profileHome, "SOUL.md"), "utf8"),
    otherConfig = await readFile(
      join(akane.profileHome, "config.yaml"),
      "utf8",
    );
  await page
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  const settings = page.locator("dialog[open]");
  await settings
    .getByLabel("Persona / SOUL", { exact: true })
    .fill("HINA_ONLY_RELEASE_PERSONA");
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(settings).toContainText(
    "Settings saved. Start the agent to apply them.",
  );
  expect(
    (await readFile(join(hina.profileHome, "SOUL.md"), "utf8")).trim(),
  ).toBe("HINA_ONLY_RELEASE_PERSONA");
  expect(await readFile(join(akane.profileHome, "SOUL.md"), "utf8")).toBe(
    otherSoul,
  );
  expect(await readFile(join(akane.profileHome, "config.yaml"), "utf8")).toBe(
    otherConfig,
  );
  expect((await snapshot(page)).agents.find((a) => a.id === akane.id)).toEqual(
    akane,
  );
  expect(await mutationFrames(akane)).toEqual(heldFrames);
  await settings
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  const preservedHina = (await snapshot(page)).agents.find(
    (a) => a.id === hina.id,
  )!;
  await queue
    .getByRole("button", {
      name: `Open permission for Akane: ${permission.id}`,
      exact: true,
    })
    .click();
  const permissionCard = page
    .getByRole("region", { name: "Permission request" })
    .last();
  await permissionCard
    .getByRole("button", { name: "Deny", exact: true })
    .click();
  await expect(permissionCard).toContainText(
    "Hermes confirmed this request is closed.",
  );
  expect((await snapshot(page)).agents.find((a) => a.id === hina.id)).toEqual(
    preservedHina,
  );
  const completed = await snapshot(page),
    stable = completed.agents.map(identity);
  expect(
    completed.agents
      .find((a) => a.id === akane.id)
      ?.requests.find((r) => r.id === permission.id)?.decision?.choice,
  ).toBe("deny");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Live office", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).agents.map(identity)).toEqual(stable);
  const aFrames = await frames(hina),
    bFrames = await frames(akane);
  expect(aFrames.filter((f) => f.method === "prompt.submit")).toHaveLength(1);
  expect(bFrames.filter((f) => f.method === "prompt.submit")).toHaveLength(1);
  expect(
    aFrames.filter((f) => f.id === question.frameId && !f.method),
  ).toHaveLength(1);
  const decisions = bFrames.filter(
    (f) => f.id === permission.frameId && !f.method,
  );
  expect(decisions).toHaveLength(1);
  expect(decisions[0].result).toMatchObject({ choice: "deny" });
});
