import { MODEL_IDS } from "../shared/routes.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { z } from "zod";
import { Office, OfficeError } from "./office.js";
import { ProfileError } from "./profiles.js";
import { settingsSchema } from "../shared/settings.js";

const nameInput = z.string().trim().min(1).max(60);
const revisionInput = z.string().min(1).max(150);

const target = z
  .object({ epoch: z.uuid(), sessionId: z.string().min(1).max(200) })
  .strict();
const commandId = z.uuid();
const createInput = z
  .object({
    model: z.enum(MODEL_IDS).default("glm-5.3-flash"),
    name: z.string().trim().min(1).max(60),
    workspace: z.string().min(1).max(4096),
    soul: settingsSchema.shape.soul.default(""),
    toolsets: settingsSchema.shape.toolsets.default([
      "terminal",
      "file",
      "clarify",
    ]),
    approvalMode: settingsSchema.shape.approvalMode.default("manual"),
  })
  .strict();
const promptInput = z
  .object({ commandId, target, text: z.string().trim().min(1).max(32000) })
  .strict();
const replyInput = z
  .object({
    commandId,
    target,
    requestId: z.string().min(1).max(500),
    answer: z.record(z.string(), z.unknown()),
  })
  .strict();
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};

async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new OfficeError("Commands require JSON content.", 415);
  let content = "",
    bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 64_000)
      throw new OfficeError("Command exceeds the size limit.", 413);
    content += chunk;
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new OfficeError("Invalid JSON command.", 400);
  }
}

export function officeServer(office: Office, assets = resolve("dist")) {
  const sessions = new Map<string, string>();
  const clients = new Map<
    ServerResponse,
    { revision: number; journalId: string }
  >();
  let timer: NodeJS.Timeout | undefined;
  const broadcast = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      for (const [response, cursor] of clients) {
        if (response.writableLength > 1_000_000) {
          response.end();
          clients.delete(response);
          continue;
        }
        sendUpdates(response, cursor);
      }
    }, 25);
  };
  office.on("change", broadcast);
  const sendUpdates = (
    response: ServerResponse,
    cursor: { revision: number; journalId: string },
  ) => {
    const replay = office.eventsSince(cursor.revision, cursor.journalId);
    if (replay) {
      response.write(
        `id: ${replay.journalId}:${replay.to}\nevent: updates\ndata: ${JSON.stringify(replay)}\n\n`,
      );
      cursor.revision = replay.to;
    } else {
      const snapshot = office.snapshot();
      response.write(
        `id: ${snapshot.journalId}:${snapshot.revision}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
      );
      cursor.revision = snapshot.revision;
      cursor.journalId = snapshot.journalId!;
    }
  };
  const heartbeat = setInterval(() => {
    for (const client of clients.keys()) client.write(": connected\n\n");
  }, 15_000);
  heartbeat.unref();
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new OfficeError("Server is not ready.", 503);
      const allowedHosts = [
        `127.0.0.1:${address.port}`,
        `localhost:${address.port}`,
      ];
      const host = req.headers.host ?? "";
      if (!allowedHosts.includes(host))
        throw new OfficeError("Host is not allowed.", 403);
      const origin = `http://${host}`;
      if (req.headers.origin && req.headers.origin !== origin)
        throw new OfficeError("Origin is not allowed.", 403);
      if (
        req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(String(req.headers["sec-fetch-site"]))
      )
        throw new OfficeError("Cross-site access is not allowed.", 403);
      const url = new URL(req.url ?? "/", origin);
      const cookie =
        /(?:^|;\s*)blueoffice=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ??
        "";
      let csrf = sessions.get(cookie);
      if (url.pathname === "/api/session" && req.method === "GET") {
        if (!csrf) {
          if (sessions.size > 128)
            sessions.delete(sessions.keys().next().value!);
          const token = randomBytes(32).toString("hex");
          csrf = randomBytes(32).toString("hex");
          sessions.set(token, csrf);
          res.setHeader(
            "Set-Cookie",
            `blueoffice=${token}; HttpOnly; SameSite=Strict; Path=/`,
          );
        }
        await office.reconcileAll();
        send(res, 200, { csrf, snapshot: office.snapshot() });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        if (!csrf)
          throw new OfficeError(
            "Open BlueOffice again to authenticate this browser.",
            401,
          );
        if (
          req.method !== "GET" &&
          (!req.headers.origin ||
            !same(String(req.headers["x-blueoffice-csrf"] ?? ""), csrf))
        )
          throw new OfficeError(
            "Command authentication failed. Reload BlueOffice.",
            403,
          );
        if (url.pathname === "/api/events" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
          });
          const resume = String(req.headers["last-event-id"] ?? "").split(":");
          const cursor = {
            revision: Number(resume[1] ?? url.searchParams.get("since") ?? -1),
            journalId: resume[0] || url.searchParams.get("journal") || "",
          };
          res.write("retry: 500\n");
          sendUpdates(res, cursor);
          clients.set(res, cursor);
          res.on("close", () => clients.delete(res));
          return;
        }
        if (url.pathname === "/api/snapshot" && req.method === "GET") {
          send(res, 200, office.snapshot());
          return;
        }
        if (url.pathname === "/api/agents" && req.method === "POST") {
          const input = createInput.parse(await body(req));
          send(
            res,
            201,
            await office.create(input.name, input.workspace, input.model, {
              soul: input.soul,
              toolsets: input.toolsets,
              approvalMode: input.approvalMode,
            }),
          );
          return;
        }
        if (url.pathname === "/api/profiles/inspect" && req.method === "POST") {
          const input = z
            .object({ profileHome: z.string().min(1).max(4096) })
            .strict()
            .parse(await body(req));
          send(res, 200, await office.inspectProfile(input.profileHome));
          return;
        }
        if (url.pathname === "/api/profiles/adopt" && req.method === "POST") {
          const input = z
            .object({
              name: nameInput,
              profileHome: z.string().min(1).max(4096),
              expectedRevision: revisionInput,
              values: settingsSchema,
              acknowledgeOwnership: z.literal(true),
            })
            .strict()
            .parse(await body(req));
          send(
            res,
            200,
            await office.adopt(
              input.name,
              input.profileHome,
              input.expectedRevision,
              input.values,
              input.acknowledgeOwnership,
            ),
          );
          return;
        }
        const settingsRoute = /^\/api\/agents\/([a-f0-9-]{36})\/settings$/.exec(
          url.pathname,
        );
        if (settingsRoute && req.method === "GET") {
          send(res, 200, await office.settings(settingsRoute[1]));
          return;
        }
        if (settingsRoute && req.method === "POST") {
          const input = z
            .object({
              name: nameInput,
              expectedRevision: revisionInput,
              values: settingsSchema,
            })
            .strict()
            .parse(await body(req));
          send(
            res,
            200,
            await office.saveSettings(
              settingsRoute[1],
              input.expectedRevision,
              input.values,
              input.name,
            ),
          );
          return;
        }
        const route =
          /^\/api\/agents\/([a-f0-9-]{36})\/(start|stop|prompt|interrupt|reply|answer-question)$/.exec(
            url.pathname,
          );
        if (route && req.method === "POST") {
          const [, id, action] = route,
            input = await body(req);
          let result: unknown;
          if (action === "start" || action === "stop") {
            z.object({}).strict().parse(input);
            result = await office[action](id);
          } else if (action === "prompt") {
            const data = promptInput.parse(input);
            result = await office.prompt(
              id,
              data.commandId,
              data.target,
              data.text,
            );
          } else if (action === "interrupt") {
            const data = z.object({ target }).strict().parse(input);
            result = await office.interrupt(id, data.target);
          } else if (action === "answer-question") {
            const data = z
              .object({
                commandId,
                target,
                requestId: z.string().min(1).max(500),
                questionId: z.string().min(1).max(200),
                answer: z.string().min(1).max(16000),
              })
              .strict()
              .parse(input);
            result = await office.lockAnswer(
              id,
              data.requestId,
              data.commandId,
              data.target,
              data.questionId,
              data.answer,
            );
          } else {
            const data = replyInput.parse(input);
            result = await office.reply(
              id,
              data.requestId,
              data.commandId,
              data.target,
              data.answer,
            );
          }
          send(res, 200, result ?? { ok: true });
          return;
        }
        throw new OfficeError("API route not found.", 404);
      }
      if (req.method !== "GET")
        throw new OfficeError("Method not allowed.", 405);
      const requested =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const path = resolve(assets, "." + requested);
      if (!path.startsWith(assets + sep))
        throw new OfficeError("Invalid file path.", 403);
      const data = await readFile(path).catch(() => {
        throw new OfficeError(
          "Page not found. Run npm run build before starting.",
          404,
        );
      });
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      };
      res.writeHead(200, {
        "Content-Type": `${mime[extname(path)] ?? "application/octet-stream"}; charset=utf-8`,
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof z.ZodError)
        send(res, 400, {
          error:
            "The command has invalid fields. Check the form and try again.",
        });
      else if (error instanceof OfficeError || error instanceof ProfileError)
        send(res, error.status, { error: error.message });
      else
        send(res, 500, {
          error:
            "The operation could not be completed. Check the workspace, installed Hermes and local server.",
        });
    }
  });
  return {
    server,
    async close() {
      office.off("change", broadcast);
      clearInterval(heartbeat);
      clearTimeout(timer);
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      await office.shutdown();
      for (const client of clients.keys()) client.end();
      clients.clear();
      // A client with an unfinished upload must not hold the supervisor open.
      server.closeAllConnections();
      await closed;
    },
  };
}
