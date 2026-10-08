import { readFile, readdir, realpath, lstat, rm } from "node:fs/promises";
import { resolve, sep, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

/** Stop only fixture processes and disposable data whose registration and sentinel agree. */
export async function cleanupFixtures(output) {
  if (process.platform !== "linux") return { stoppedPids: [], removedData: [] };
  let registrations;
  try {
    registrations = await readdir(resolve(output, "owned-servers"));
  } catch (error) {
    if (error.code === "ENOENT") return { stoppedPids: [], removedData: [] };
    throw error;
  }
  const temporaryRoot = await realpath(tmpdir());
  const owners = [];
  for (const file of registrations) {
    const owner = JSON.parse(
      await readFile(resolve(output, "owned-servers", file), "utf8"),
    );
    try {
      if (
        typeof owner.data !== "string" ||
        typeof owner.token !== "string" ||
        !owner.token ||
        dirname(owner.data) !== temporaryRoot ||
        !/^blueoffice-ui-[A-Za-z0-9]+$/.test(basename(owner.data))
      )
        continue;
      if (
        (await lstat(owner.data)).isSymbolicLink() ||
        (await realpath(owner.data)) !== owner.data
      )
        continue;
      const sentinel = JSON.parse(
        await readFile(resolve(owner.data, ".verification-owner.json"), "utf8"),
      );
      if (sentinel.token === owner.token) owners.push(owner);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const stoppedPids = [];
  for (const pid of await readdir("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const argv = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
      const fixturePeer =
        argv.some((arg) => arg.endsWith("/tests/fixtures/rpc_peer.py")) &&
        owners.some((owner) =>
          argv.some((arg) => arg.startsWith(owner.data + sep)),
        );
      let fixtureServer = false;
      if (
        owners.some((owner) => owner.pid === Number(pid)) &&
        argv.includes("server/main.ts") &&
        argv.includes("--fixture")
      ) {
        const env = (await readFile(`/proc/${pid}/environ`, "utf8")).split(
          "\0",
        );
        fixtureServer = owners.some(
          (owner) =>
            owner.pid === Number(pid) &&
            env.includes(`BLUEOFFICE_DATA=${owner.data}`),
        );
      }
      if (fixturePeer || fixtureServer) {
        process.kill(Number(pid), "SIGKILL");
        stoppedPids.push(Number(pid));
      }
    } catch (error) {
      if (!["ENOENT", "ESRCH", "EACCES"].includes(error.code)) throw error;
    }
  }
  for (const pid of stoppedPids) {
    const deadline = Date.now() + 2_000;
    while (true) {
      try {
        const stat = await readFile(`/proc/${pid}/stat`, "utf8");
        if (stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z")) break;
      } catch (error) {
        if (error.code === "ENOENT") break;
        throw error;
      }
      if (Date.now() > deadline)
        throw new Error(
          `Owned fixture ${pid} did not exit; its data was retained`,
        );
      await delay(25);
    }
  }
  const removedData = [];
  for (const owner of owners) {
    // Revalidate immediately before removing this run's disposable root.
    if ((await realpath(owner.data)) !== owner.data)
      throw new Error("Fixture data root changed during cleanup");
    const sentinel = JSON.parse(
      await readFile(resolve(owner.data, ".verification-owner.json"), "utf8"),
    );
    if (sentinel.token !== owner.token)
      throw new Error("Fixture data ownership changed during cleanup");
    await rm(owner.data, { recursive: true, force: true });
    removedData.push(owner.data);
  }
  return { stoppedPids, removedData };
}
