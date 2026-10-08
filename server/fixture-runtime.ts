import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OfficeAgent } from "../shared/office.js";
import type { RuntimeFactory } from "./runtime.js";
import { RouteRegistry, routingConfig } from "./routes.js";
import type { Launch } from "./rpc.js";
import { profileOperation } from "./profiles.js";
import type { ProfileDefaults, ProfileRequest } from "../shared/settings.js";
import type { ModelId } from "../shared/routes.js";

/** Opt-in offline mode. Never selected as a fallback after a live failure. */
export class FixtureRuntime implements RuntimeFactory {
  mode = "fixture" as const;
  routes() {
    return new RouteRegistry(undefined, true).statuses();
  }
  constructor(
    private root: string,
    private scenario = "normal",
  ) {}
  async profile(request: ProfileRequest) {
    return profileOperation(
      { source: "fixture", python: "python3", profile_root: this.root },
      request,
    );
  }
  async prepare(
    id: string,
    workspace: string,
    model: ModelId = "glm-5.3-flash",
    defaults?: ProfileDefaults,
  ) {
    const profileHome = join(this.root, "profiles", id);
    await mkdir(profileHome, { recursive: true, mode: 0o700 });
    await writeFile(
      join(profileHome, ".blueoffice-agent.json"),
      JSON.stringify({ agentId: id }),
      { mode: 0o600 },
    );
    await writeFile(
      join(profileHome, "config.yaml"),
      JSON.stringify({
        ...routingConfig(model),
        terminal: { cwd: workspace, backend: "local" },
        platform_toolsets: {
          cli: defaults?.toolsets ?? ["terminal", "file", "clarify"],
        },
        approvals: { mode: defaults?.approvalMode ?? "manual" },
      }),
    );
    await writeFile(join(profileHome, "SOUL.md"), defaults?.soul ?? "");
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
