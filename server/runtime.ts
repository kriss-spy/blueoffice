import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { OfficeAgent } from "../shared/office.js";
import { RouteRegistry, routingConfig, HERMES_REVISION } from "./routes.js";
import { type ModelId, type RouteStatus } from "../shared/routes.js";
import type { Launch } from "./rpc.js";

const execute = promisify(execFile);
export interface RuntimeFactory {
  mode: "live" | "fixture";
  routes(): RouteStatus[];
  prepare(
    id: string,
    workspace: string,
    model?: ModelId,
  ): Promise<{ profileName: string; profileHome: string }>;
  launch(agent: OfficeAgent): Promise<Launch>;
}
export interface Installation {
  source: string;
  python: string;
  runtime: string;
  profile_root: string;
  revision: string;
}
export class HermesRuntime implements RuntimeFactory {
  mode = "live" as const;
  private installation?: Promise<Installation>;
  constructor(
    private readonly testInstallation?: Installation,
    private readonly keyPath = join(homedir(), ".cli-proxy-api/.api-key"),
    private readonly registry = new RouteRegistry(
      undefined,
      !!testInstallation,
    ),
  ) {}
  routes() {
    return this.registry.statuses();
  }
  private discover(): Promise<Installation> {
    if (this.testInstallation) return Promise.resolve(this.testInstallation);
    return (this.installation ??= execute(
      "python3",
      [resolve("scripts/runtime_discovery.py")],
      { timeout: 25_000, maxBuffer: 1_000_000 },
    )
      .then(({ stdout }) => {
        const info = JSON.parse(stdout) as Installation;
        if (info.revision !== HERMES_REVISION)
          throw new Error(
            "This Hermes revision has not passed the BlueOffice protocol harness. Run the compatibility probe before enabling it.",
          );
        return info;
      })
      .catch(() => {
        this.installation = undefined;
        throw new Error(
          "Hermes discovery failed. Check the installed launcher and the supported revision in docs/validation/hermes-contract.md.",
        );
      }));
  }
  async prepare(
    id: string,
    workspace: string,
    model: ModelId = "glm-5.3-flash",
  ) {
    this.registry.require(model);
    if (!workspace.startsWith("/") || !(await stat(workspace)).isDirectory())
      throw new Error("Choose an existing absolute workspace directory.");
    const installation = await this.discover();
    const profileName = `blueoffice-${id}`;
    const parent = join(installation.profile_root, "profiles");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const profileHome = join(await realpath(parent), profileName);
    await mkdir(profileHome, { mode: 0o700 });
    await writeFile(
      join(profileHome, ".blueoffice-agent.json"),
      JSON.stringify({ agentId: id }),
      { mode: 0o600, flag: "wx" },
    );
    await writeFile(
      join(profileHome, "config.yaml"),
      JSON.stringify(
        {
          ...routingConfig(model),
          terminal: { cwd: workspace, backend: "local" },
          approvals: { mode: "manual" },
          platform_toolsets: { cli: ["terminal", "file", "clarify"] },
          mcp_servers: {},
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    return { profileName, profileHome };
  }
  async launch(agent: OfficeAgent): Promise<Launch> {
    this.registry.require(agent.model);
    const installation = await this.discover();
    const canonical = await realpath(agent.profileHome);
    const marker = JSON.parse(
      await readFile(join(canonical, ".blueoffice-agent.json"), "utf8"),
    );
    if (marker.agentId !== agent.id)
      throw new Error("Profile ownership does not match this office agent.");
    let key: string;
    try {
      key = (await readFile(this.keyPath, "utf8")).trim();
    } catch {
      throw new Error(
        "CLIProxyAPI key is unavailable. Restore ~/.cli-proxy-api/.api-key before starting.",
      );
    }
    if (!key || key.includes("\n"))
      throw new Error("CLIProxyAPI key file is invalid.");
    const env = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LANG: "C.UTF-8",
      HERMES_HOME: canonical,
      HERMES_PYTHON_SRC_ROOT: installation.source,
      HERMES_DISABLE_LAZY_INSTALLS: "1",
      HERMES_TUI_GATEWAY_SHUTDOWN_GRACE_S: "1",
      BLUEOFFICE_PROXY_KEY: key,
      OPENAI_BASE_URL: "http://127.0.0.1:8317/v1",
    };
    try {
      await execute(
        installation.python,
        [
          "-B",
          "-I",
          resolve("scripts/check_route.py"),
          installation.source,
          agent.model,
        ],
        { env, timeout: 20_000, maxBuffer: 100_000 },
      );
    } catch {
      throw new Error(
        "The profile's effective model, API family, credential path or retry policy no longer matches its verified BlueOffice route. Restore its managed routing settings before starting.",
      );
    }
    return {
      executable: installation.python,
      args: [
        "-B",
        "-I",
        resolve("scripts/owned_gateway.py"),
        installation.source,
        canonical,
        agent.epoch!,
        agent.id,
      ],
      options: {
        cwd: agent.workspace,
        detached: true,
        env,
      },
    };
  }
}
