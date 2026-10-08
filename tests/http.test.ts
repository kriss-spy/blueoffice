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
