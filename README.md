# BlueOffice

A local browser office for Hermes agents, inspired by Blue Archive's in-game café. The first runnable slice provides a persistent agent roster, chat, task controls, and question/permission cards. The 2.5D room and character workflows are still being built; see the [v1 beta status](docs/STATUS.md).

## Run

Requires Linux, Python 3, Node.js 22.13+ (tested with 22.17.1), and the supported installed Hermes revision listed in the [compatibility report](docs/validation/hermes-contract.md).

```sh
npm ci
npm run build
npm run verify:routes -- --live
npm start
```

Open the loopback URL printed by the server (default `http://127.0.0.1:4310`). Add an assistant with an existing absolute workspace directory, start it, and send a task. `BLUEOFFICE_PORT` changes the port; `BLUEOFFICE_DATA` changes the office data directory (default `.blueoffice`). Always start through `npm start` so the server holds its exclusive data lease.

Live mode creates a dedicated native Hermes profile per agent. It reads `~/.cli-proxy-api/.api-key` server-side through named Hermes provider `key_env` configuration. Choose verified `glm-5.3-flash` (Chat Completions) or `muse-spark-1.3-contributor` (Responses), both through `http://127.0.0.1:8317/v1`. It never edits CLIProxyAPI configuration. Closing the browser keeps agents running; Ctrl-C stops the server and its owned runtimes. Restarting after a crash marks prior activity unknown and never resends commands. A new start creates a new native conversation; explicit history resume is a later ticket.

Route verification runs synthetic failure tests first, then five deliberately small live calls per model (text, tool continuation, auxiliary, and delegated-child work). It stores local admission evidence in the selected office data directory. Without matching live evidence, model options stay disabled. See [routing evidence and limits](docs/validation/model-routing.md). `npm run verify:routes` without `--live` uses no real credentials or models and cannot admit a route.

Use **Agent settings** to edit a stopped profile and read back each saved section. Name changes appear immediately; model, workspace, persona, tool and approval changes apply at the next start. **Adopt an existing profile instead** inspects ownership and requires the single-writer acknowledgement before changing settings. Conflicting edits require a reload. See [profile settings evidence and limits](docs/validation/profile-settings.md).

For an offline, visibly labeled demonstration with no model calls:

```sh
BLUEOFFICE_DATA=/tmp/blueoffice-demo npm start -- --fixture
```

Try “check the workspace”, “ask question”, “ask batch”, “ask approval”, or “slow task” followed by Interrupt. Fixture mode is explicit and is never a fallback for live failures.

## Verify

The [verification workflow](docs/VERIFICATION.md) defines the required checks, isolated test environments, evidence freshness and release acceptance. Use the standard gates:

```sh
npm run check
npm run verify:ui
npm run verify:integration
```

`check` and `verify:ui` run without live model calls. Installed-Hermes integration requires Linux bubblewrap and the supported installation. `npm run verify:release` additionally accounts for outstanding release acceptance; passing automated checks alone does not establish a completed beta.

Individual checks and probes remain available for focused work:

```sh
npm test
npm run build
python3 -m unittest discover -s tests -v
python3 scripts/hermes_probe.py
python3 scripts/hermes_probe.py --suite office --output artifacts/office-runtime
python3 scripts/hermes_probe.py --suite profiles --output artifacts/profiles
```

The installed-runtime probes require bubblewrap. They use disposable profiles and a synthetic provider inside a private network/process namespace, with no live model calls. See [owned runtime/chat evidence](docs/validation/owned-chat.md) and [native protocol evidence](docs/validation/hermes-contract.md). Advanced human-input handling, durable replay, visual gates, and release verification remain open.

Start with the [planning-pack index](docs/README.md), [PRD](docs/PRD.md), and [implementation plan](docs/IMPLEMENTATION-PLAN.md). Original references: [RESOURCES.md](RESOURCES.md). The [Blue Archive capture](capture/blue-archive/START-HERE.md) contains design research and an isolated study specimen.
