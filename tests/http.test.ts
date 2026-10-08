import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Office } from "../server/office.js";
import { OfficeStore } from "../server/store.js";
import { FixtureRuntime } from "../server/fixture-runtime.js";
import { officeServer } from "../server/http.js";
import { request } from "node:http";

test("loopback HTTP authenticates commands/events and rejects hostile origins, hosts and schemas", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "blueoffice-http-"));
  const store = new OfficeStore(join(directory, "office.db"));
  const office = new Office(store, new FixtureRuntime(directory));
  const app = officeServer(office);
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(async () => {
    await app.close();
    store.close();
  });
  const address = app.server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(url + "/api/snapshot")).status, 401);
  assert.equal((await fetch(url + "/api/events")).status, 401);
  const hostileHost = await new Promise<number>((resolve) => {
    request(
      url + "/api/session",
      { headers: { Host: `evil.example:${address.port}` } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    ).end();
  });
  assert.equal(hostileHost, 403);
  assert.equal(
    (
      await fetch(url + "/api/session", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const auth = await fetch(url + "/api/session");
  const cookie = auth.headers.get("set-cookie")!.split(";")[0];
  assert.match(auth.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  const { csrf } = await auth.json();
  const headers = {
    Cookie: cookie,
    Origin: url,
    "Content-Type": "application/json",
    "X-BlueOffice-CSRF": csrf,
  };
  assert.equal(
    (
      await fetch(url + "/api/agents", {
        method: "POST",
        headers: { ...headers, "X-BlueOffice-CSRF": "wrong" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/agents", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/agents", {
        method: "POST",
        headers,
        body: '{"name":42}',
      })
    ).status,
    400,
  );
  const created = await fetch(url + "/api/agents", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "<script>evil()</script>",
      workspace: directory,
    }),
  });
  assert.equal(created.status, 201);
  const agent = await created.json();
  assert.equal(
    (
      await fetch(url + `/api/agents/${agent.id}/start`, {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    200,
  );
  const snapshot = await (
    await fetch(url + "/api/snapshot", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(snapshot.agents[0].lifecycle, "ready");
  assert.equal(snapshot.mode, "fixture");
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /OPENAI_API_KEY|synthetic-not-a-secret/,
  );
  const noCsrf = await fetch(url + `/api/agents/${agent.id}/stop`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(noCsrf.status, 403);
});

test("SSE resumes after a consistent checkpoint and resets on retention gap or journal replacement", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "blueoffice-sse-"));
  const store = new OfficeStore(join(directory, "office.db"), 2);
  const office = new Office(store, new FixtureRuntime(directory));
  const app = officeServer(office);
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(async () => {
    await app.close();
    store.close();
  });
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const auth = await fetch(url + "/api/session");
  const cookie = auth.headers.get("set-cookie")!.split(";")[0];
  const initial = (await auth.json()).snapshot;
  const agent = await office.create("Recovery", directory);
  const first = async (cursor: string) => {
    const controller = new AbortController();
    const response = await fetch(url + "/api/events", {
      headers: { Cookie: cookie, "Last-Event-ID": cursor },
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    let text = "";
    while (!text.includes("\n\n"))
      text += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    return text;
  };
  const replay = await first(`${initial.journalId}:${initial.revision}`);
  assert.match(replay, /event: updates/);
  const data = JSON.parse(replay.split("data: ")[1].split("\n")[0]);
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].agentId, agent.id);
  await office.start(agent.id);
  const fallback = await first(`${initial.journalId}:${initial.revision}`);
  assert.match(fallback, /event: snapshot/);
  assert.equal(
    JSON.parse(fallback.split("data: ")[1].split("\n")[0]).agents[0].lifecycle,
    "ready",
  );
  assert.match(
    await first(`replacement:${office.snapshot().revision}`),
    /event: snapshot/,
  );
});
