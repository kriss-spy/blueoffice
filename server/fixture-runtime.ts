import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OfficeAgent } from "../shared/office.js";
import type { RuntimeFactory } from "./runtime.js";
import type { Launch } from "./rpc.js";

/** Opt-in offline mode. Never selected as a fallback after a live failure. */
export class FixtureRuntime implements RuntimeFactory {
  mode = "fixture" as const;
  constructor(
    private root: string,
    private scenario = "normal",
  ) {}
  async prepare(id: string, _workspace: string) {
    const profileHome = join(this.root, "profiles", id);
    await mkdir(profileHome, { recursive: true, mode: 0o700 });
    await writeFile(
      join(profileHome, ".blueoffice-agent.json"),
      JSON.stringify({ agentId: id }),
      { mode: 0o600 },
    );
    return { profileHome, profileName: `fixture-${id}` };
  }
  async launch(agent: OfficeAgent): Promise<Launch> {
    return {
      executable: "python3",
      args: [
        "-u",
        resolve("tests/fixtures/rpc_peer.py"),
        agent.profileHome,
        this.scenario,
      ],
      options: {
        cwd: agent.workspace,
        detached: true,
        env: { PATH: process.env.PATH, BLUEOFFICE_FIXTURE: "1" },
      },
    };
  }
}
