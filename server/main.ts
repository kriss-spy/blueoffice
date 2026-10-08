import { resolve } from "node:path";
import { OfficeStore } from "./store.js";
import { Office } from "./office.js";
import { HermesRuntime } from "./runtime.js";
import { FixtureRuntime } from "./fixture-runtime.js";
import { officeServer } from "./http.js";

const data = resolve(process.env.BLUEOFFICE_DATA ?? ".blueoffice");
const fixture = process.argv.includes("--fixture");
const store = new OfficeStore(resolve(data, "office.db"));
const office = new Office(
  store,
  fixture ? new FixtureRuntime(data) : new HermesRuntime(),
);
const app = officeServer(office);
const port = Number(process.env.BLUEOFFICE_PORT ?? 4310);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("BLUEOFFICE_PORT must be a valid port.");
app.server.on("error", (error) => {
  console.error(
    `BlueOffice could not listen on port ${port}. Choose a free BLUEOFFICE_PORT. (${(error as NodeJS.ErrnoException).code ?? "listen error"})`,
  );
  void app.close().finally(() => {
    store.close();
    process.exitCode = 1;
  });
});
app.server.listen(port, "127.0.0.1", () => {
  const address = app.server.address();
  console.log(
    `BlueOffice ${fixture ? "(offline fixture mode)" : "(live Hermes)"}: http://127.0.0.1:${typeof address === "object" ? address?.port : port}`,
  );
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  store.close();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
