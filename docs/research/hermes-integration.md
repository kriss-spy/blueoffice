# Hermes integration research for BlueOffice

Research date: 2026-10-08, Asia/Shanghai. Scope: a local browser office with persistent character avatars, full agent management, a side chat, and session activity. This is source research, not a runtime integration test. No real agent sessions, provider requests, installation changes, or configuration changes were performed.

## Recommendation

Build a local server that supervises Hermes and translates its native protocol into an office-specific state model. Use Hermes's existing TUI JSON-RPC protocol for controlled sessions: it already carries chat, tool events, delegation, interruptions, and explicit questions to the user. The browser must connect to our local server, not read credentials or launch Hermes itself. Give each persistent office agent its own Hermes profile and an office UUID; store character, desk assignment, and layout in our own database.

For the first implementation, supervise one stdio TUI gateway process per **office-managed profile**, with one active task at a time per avatar. This keeps profile ownership, lifecycle, and pending-request routing clear. An authenticated connection to an existing Hermes dashboard's `/api/ws` is a viable alternative if the product instead wants to share Hermes Desktop's live session owner. Do not simultaneously launch another owner for the same profile/session. The choice must be confirmed by the lifecycle spike below, rather than assumed from a successful chat demo.

Hermes already offers three integration transports; a new fork or terminal-screen parser is unnecessary. Our renderer, identity mapping, furniture model, aggregate presence, replay journal, and local management API would be new product components. [Official integration overview](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration), [installed TUI launch implementation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/ui-tui/src/gatewayClient.ts#L441).

## Evidence and version boundary

| Evidence | Revision / date | What it establishes |
|---|---|---|
| Installed source, `/home/krisspy/.hermes/hermes-agent` | `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`, author date 2026-09-24T19:25:16-05:00 | Actual integration surface available in this installation; source inspected read-only |
| Upstream `main` at research start | `cfb9ae4f86e221ca1763fff256a44317f2cb5dcb`, author date 2026-10-08T00:09:50-04:00 | Current source snapshot; selective raw files inspected in addition to official live docs |
| Official live documentation | Retrieved 2026-10-08 | Intended public usage; may describe features newer than the installation |
| User-provided AGENTS instructions | Current session | CLIProxyAPI endpoint/model restrictions; these are local requirements, not claims about default Hermes behavior |

The installed launcher at `/home/krisspy/.local/bin/hermes` delegates to `/home/krisspy/.hermes/hermes-agent/.hermes/bin/hermes`. Do not hard-code an old `.venv/bin/python` from blog posts. Hermes's TUI trusts the launcher-provided `HERMES_PYTHON`, deliberately avoiding a different stale interpreter. The runtime interpreter and source root need explicit discovery and a version check in our adapter. [Interpreter selection](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/ui-tui/src/gatewayClient.ts#L69).

Important compatibility finding: installed September source has approval observer hooks, but **does not contain** `on_human_input_request` / `on_human_input_resolved`. Current October source does. Pending-question support for our MVP should therefore use existing JSON-RPC request frames, not assume that installing an observer hook from the newest docs will work locally. [Installed hook registry](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/plugins.py#L108), [current human-input helper](https://github.com/NousResearch/hermes-agent/blob/cfb9ae4f86e221ca1763fff256a44317f2cb5dcb/tools/human_input_hooks.py).

## Domain model: who gets an avatar?

Hermes distinguishes a profile (persistent home), a running agent, a conversation/session, a messaging bot account, and a delegated subagent. They are not interchangeable. Named profiles contain separate configuration, secrets, memory, skills, session database, and gateway state. A child subagent has a fresh conversation; that does not automatically create a new persistent profile. [Source documentation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/website/docs/user-guide/profiles.md).

Recommended office entities:

- `OfficeAgent`: office UUID, runtime connection, canonical Hermes profile binding, user-facing name, avatar asset ID, workstation ID, desired lifecycle, and current presence.
- `Session`: stable stored Hermes session ID plus profile/connection; source channel, title, workspace, lineage, timestamps, and history. It belongs to a profile, not to a desk.
- `RuntimeSession`: process-local live session ID plus owner/generation. A create/resume result includes the persistent `stored_session_id`; keep both addresses.
- `Turn`: office run ID, accepted user input, terminal outcome, streaming state, and tool calls. A completed turn does not mean its profile has stopped.
- `PendingRequest`: exact transport request frame ID, method, owning live session, optional Hermes approval request ID, question schema, and open/resolved/cancelled state.
- `Delegation`: parent session, subagent ID, optional child session ID, goal, depth, and terminal status.

Default: one visible persistent avatar per office agent/profile. Several stored sessions appear under that avatar in the activity panel; selecting a session changes the side chat. Delegated children should appear as temporary helpers or activity cards unless the user explicitly assigns them durable office identities. An office UUID avoids using a changeable profile display name as a primary key. Hermes profile metadata includes canonical `name`, presentation `display_name`, and `previous_names`, making rename reconciliation possible. [Profile metadata fields](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/profiles.py#L583), [session create contract](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/sessions.py#L101).

## Transport comparison

| Surface | Existing features | Fit / limits |
|---|---|---|
| TUI gateway stdio JSON-RPC | Sessions, saved history, submit/steer/interrupt, model/tool/profile management, explicit clarify/approval requests, tool/delegation events | Best fit for office-owned local agents. Our server owns child process and event journal. Internal Python module launch must be version-pinned. |
| TUI gateway WebSocket `/api/ws` | Same dispatcher as stdio; multiple attached clients, reconnect replay, questions | Best fit for attaching to a Hermes dashboard/backend owner. Dashboard authentication, Host/origin guards, token/ticket flow must be respected. |
| API server HTTP + SSE | OpenAI-compatible chat/responses; session CRUD/history/fork/chat; runs with status/approval/steer/stop | Good language-neutral automation interface, but not verified to provide generic clarify-answer control. Do not promise parity with TUI questions. |
| ACP stdio | Protocol-driven sessions, prompts, streaming, tool calls, permission requests, cancellation | Good if we adopt ACP client infrastructure; Hermes-specific settings/office management still need another surface. |
| Python `AIAgent` embed | Callbacks and full core access | Strongest coupling to implementation and process state; more work than existing gateway contracts. |
| Dashboard UI plugin | Custom tab/page, shell slots, backend FastAPI routes | Could reduce work by reusing existing administration and live session ownership. Less independent shell/control than the proposed standalone application; the user confirmed a local browser app, so plugin delivery is not excluded by their request. |

The WebSocket transport explicitly shares the same dispatcher; the existing browser client uses `@hermes/shared` and auth URL helpers. Reuse or learn from those components, but do not assume they are a separately supported, published SDK package. The repository includes generated TypeScript/OpenRPC contracts; retain a compatibility fixture against the chosen Hermes revision. [WebSocket source](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/ws.py), [browser client](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/web/src/lib/gatewayClient.ts), [generated contract](https://github.com/NousResearch/hermes-agent/blob/cfb9ae4f86e221ca1763fff256a44317f2cb5dcb/apps/shared/src/gateway-contract.generated.ts).

The dashboard extension system supports a built JavaScript plugin and optional backend `plugin_api.py`, with themes separately controlling the shell. This could host a cafe canvas without forking Hermes. It remains a useful alternative delivery mode, and could precede a standalone MVP if a bounded spike proves the required shell and per-agent lifecycle controls fit. It was not exercised during research. [Dashboard extension source documentation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/website/docs/user-guide/features/extending-the-dashboard.md).

## Concrete local launch and control surface

### Platform-adapter alternative (follow-up, 2026-10-08)

The [official platform-adapter guide](https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters) recommends third-party platform plugins registered through `ctx.register_platform`, without modifying core. An office could become a gateway messaging destination through such a plugin. Installed `BasePlatformAdapter` supports `send_exec_approval`, `send_clarify`, typing, message editing, and tool/message formatting; clarification resolution uses exact `clarify_id` and approval uses the gateway approval resolver. [Installed adapter source](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/gateway/platforms/base.py#L2808).

This is a technically credible chat/attention route, particularly for gateway-native scheduled or service delivery. It does not eliminate the need for office runtime/profile administration, history aggregation, browser event transport, and request recovery. The existing TUI protocol remains the recommended first control interface because those required management/request/replay surfaces were directly inspected together. A platform plugin could replace the conversation transport if those additional responsibilities are deliberately implemented; never run two owners over the same conversation. This alternative was source-inspected, not runtime-tested. The initial research omitted an explicit comparison; ADR 0001 now records it.

The existing TUI starts its backend using a child process equivalent to:

```text
<verified Hermes runtime Python> -m tui_gateway.entry
```

It passes `PYTHONPATH` containing the source root, `HERMES_PYTHON_SRC_ROOT` set to that root, and a controlled cwd. Our supervisor must also explicitly preserve the profile's `HERMES_HOME`, sanitize inherited provider environment to avoid overriding that profile, and consume stdout exclusively as newline-delimited JSON-RPC. Diagnostics belong on stderr. This is not a `hermes --mode rpc` flag; the official docs explicitly say that flag does not exist. [TUI launch](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/ui-tui/src/gatewayClient.ts#L441), [profile bootstrap](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/main.py#L579).

Use a launcher/runtime probe; do not run arbitrary installation Python imports inside the browser. Starting the gateway can initialize background facilities such as MCP discovery and an orphan sweep, so a probe is not completely equivalent to reading a version string. The actual launch/stop spike should use temporary profiles and mocked provider fixtures, outside this research session. [Backend entry](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/entry.py#L270).

| User action | Existing Hermes mechanism | Product rule |
|---|---|---|
| Add office agent | `profiles.create` or `hermes profile create <name>` | Create a distinct profile; avoid copying messaging tokens/cron/session history. Bind office UUID afterwards. |
| Start agent | Supervised backend process; `session.create`/`session.resume` | Report starting until gateway/session readiness; starting need not spend tokens. |
| Start task / chat | `prompt.submit` with live session ID and text | Persist office command ID, admission state, and selected session before sending. |
| Steer task | `session.steer` | Show accepted guidance separately from final assistant output. |
| Stop task | `session.interrupt` | Cooperative interruption; show stopping until terminal evidence arrives. |
| Stop agent | Drain/interruption plus owned process shutdown | Preserve profile and history; confirm actual child exit. Never stop unrelated Hermes messaging gateway. |
| List profiles | `profiles.list` | Query metadata without exposing raw secrets. |
| Discover saved sessions | `session.list`; dashboard profile/session REST | Profile-scoped, paginated; include automation sources explicitly. |
| Switch live session | `session.activate` or `session.resume` | `active_list` only represents this gateway process, not all installed Hermes activity. |
| Set model / persona / tools | `profiles.configure`, `config.set`, `tools.configure` | Apply correct persistent/session scope; inspect per-section success and deferred changes. |
| Set workspace | `session.cwd.set` for live idle session, create-time cwd, persistent `terminal.cwd` | Validate absolute existing directory; refuse change while busy or require restart. |

Critical distinction: `process.stop` kills registered background tool processes; it **does not stop the Hermes gateway process**. Backend stopping belongs to our supervisor. `entry.py` handles SIGTERM and attempts session finalization within a grace window. [Process-stop contract](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/tools_commands.py#L53), [signal shutdown](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/entry.py#L112), [session interrupt contract](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/sessions.py#L550).

## Pending questions and avatar states

Hermes TUI sends `clarify`, `approval`, `sudo`, `secret`, and other server-to-client requests as JSON-RPC **requests**, not ordinary notification events. The browser side panel must render an actionable request card and answer with the same JSON-RPC frame ID. A clarify supports a single answer or question-ID-keyed batch answers. Approval choices may include once/session/always/deny, but render only the choices the particular request permits. Never auto-answer a request merely to animate the avatar. [Installed server-request schema](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/server_requests.py).

For WebSocket clients, after `gateway.ready` advertise `client.capabilities` with `server_requests: true`; unadvertised request support fails fast on this installed revision. Clear a prompt only when its exact request is resolved or a matching `request.cancel` arrives. A cancelled prompt is not the same as a denied approval. Reconnect results supply `open_requests` and an `inflight` snapshot. Retain outer JSON-RPC frame ID separately from approval `params.request_id`. [Capability handshake](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/methods_voice.py#L434), [request and inflight shapes](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/sessions.py#L16).

Proposed office presence reducer:

| Office state | Evidence | Avatar / bubble |
|---|---|---|
| Offline | Owned runtime confirmed stopped | Empty desk or resting character; offline label |
| Starting | Supervisor launch admitted, no ready session yet | Arrival animation and spinner |
| Idle | Ready, no active turn or pending request | Sit/idle variation |
| Working | Turn accepted; stream/tool/status activity | Typing at computer; short factual status |
| Needs answer | Open `clarify` request | Question mark and answer card |
| Needs approval | Open `approval` request | Exclamation/permission icon and explicit decision card |
| Needs secret | Open sudo/secret/vault request | Locked icon; secret input only in panel |
| Stopping | Interrupt/shutdown admitted, terminal evidence pending | Paused action and stopping label |
| Completed | Terminal success for the selected turn | Brief success motion, then idle |
| Failed | Terminal error/outcome | Error icon; expandable cause |
| Disconnected / unknown | Event owner unavailable or stale | Connection indicator; do not infer idle |

Priority should be explicit: pending human input overrides working; disconnected overrides uncertain activity; turn completion is a short-lived notification, not a forever state. Bubble text should come from sanitized status/tool metadata or an actual assistant message; do not manufacture agent thoughts. Display no raw reasoning stream by default. These visual states are **our proposed model**, not existing Hermes enums.

`message.complete` includes optional status/error/partial fields. `tool.complete` has a result and summary but no universal success boolean; a tool error does not necessarily mean the whole turn failed. Delegation events carry optional stable subagent/child-session/parent IDs; older emitters can omit them. Do not identify children from goal text or assume each child gets an independent controllable avatar. [Event contracts](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/events.py#L183), [subagent events](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/events.py#L455).

## Activity overview and recovery

Hermes persists sessions/messages in a profile-scoped SQLite database with lineage, source, workspace metadata, token and cost fields. The default is obtained through `get_hermes_home()` rather than hard-coding `~/.hermes/state.db`. Sessions can come from CLI, messaging, cron, API, ACP, or batch; some standard chat pickers hide automation sources. The office activity view needs its own Chats / Automation / All filters and source labels. [Storage source documentation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/website/docs/developer-guide/session-storage.md), [stored-session contract](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/common.py#L102).

Use native RPC/REST history APIs first. Avoid direct database writes entirely. For reading unmanaged external history, prefer Hermes's read-only profile fanout routes; a Python `SessionDB` constructed in the wrong mode can run schema reconciliation rather than merely observe. Database `is_active`/unfinished flags are not sufficient proof that a task is currently executing. Join historical records with owner/liveness information and indicate unknown when evidence is missing. [Read-only fanout implementation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/web_routers/profiles.py#L255), [process-local active list](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/methods_session.py#L1006).

For owned sessions, `session.events.since` returns events after a watermark, `latest_seq`, `truncated`, an epoch, and `open_requests`. The current replay ring is bounded and in-memory: 512 events per session, per-session/process byte bounds, and at most 64 rings. Epoch changes after restart. Our local server should journal normalized critical events and provide its own durable sequence/cursor to browser clients. On Hermes replay truncation or epoch change, refetch history, inflight state, and open requests, then reconcile. Browser disconnection must not itself terminate an agent. [Replay implementation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/event_replay.py), [RPC response](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/methods_session.py#L2326).

Do not assume `prompt.submit` has universal durable idempotency. If connection loss occurs after delivery but before admission acknowledgement, show uncertain admission and reconcile stored input before retrying. The HTTP run API has its own idempotency store; that does not automatically extend to TUI submissions. [Run-idempotency implementation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/gateway/platforms/api_server_run_idempotency.py).

## Full agent configuration

Prefer existing Hermes operations for normal settings:

- `profiles.configure` updates selected profile sections: model/provider, SOUL, description, disabled skills, enabled toolsets, enabled MCP servers, and UI metadata. It reports individual `applied` outcomes, so a partial save is possible and must be surfaced. UI metadata supports per-key compare-and-swap revisions; general YAML settings do not gain this protection automatically.
- `config.get` with `key: full` reads profile configuration; adapter must sanitize it because resolved values/inline credential fields are not suitable for the browser. `config.set` supports a **limited** catalog, including model, cwd/workdir, reasoning, persona, approvals, and display settings; it is not a generic dotted-key writer.
- `tools.configure` enables/disables toolsets or `server:tool` targets and can rebuild the identified session's agent. A profile-level tool configuration is distinct from the browser's visual furniture capabilities.
- Dashboard `GET /api/config`, `/api/config/defaults`, `/api/config/schema` and `PUT /api/config` provide broader administration. Profile-scoped PUT deep-merges incoming settings over strictly readable existing YAML and calls Hermes `save_config`, which preserves env-reference templates and writes atomically. This is preferable to raw YAML replacement.

[Profile configure contract](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/profiles_vault_complete_foreign_subagents.py#L265), [config getters](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/methods_config.py#L202), [limited setters](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/methods_config_set.py#L465), [tool configuration](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/tui_gateway/contracts/tools_mcp_plugins.py#L74), [config REST](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/web_routers/config_env.py#L85), [save semantics](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/hermes_cli/config.py#L2439).

If we choose pure stdio supervision with no dashboard, use these native RPC operations for the MVP settings. For settings outside their catalog, add a narrowly scoped local companion calling Hermes's own config helpers under explicit profile binding. Do not expose an unrestricted shell or arbitrary file-write endpoint. Our adapter needs its own revision token, serialized writes, diff validation, and detection of external edits; the inspected full-config REST contract does not include an ETag or expected general configuration revision. Avoid claiming cross-process atomic compare-and-swap when only an in-process lock exists.

The product must distinguish persistent profile defaults, current session overrides, and changes deferred until the next turn/restart. Model changes during an active turn may be deferred by existing setters; workspace mutation is an idle-session operation. Save success should mean the effective setting was re-read and matches the request, not merely that a file write returned.

## Local CLIProxyAPI requirements

All model inference must retain the user-provided route `http://127.0.0.1:8317/v1`, with credentials sourced server-side from the established local key mechanism. Do not send the API key to the browser or rewrite CLIProxyAPI configuration as part of office installation.

Two named Hermes custom providers can point at the same proxy while choosing different wire protocols:

```yaml
# Proposed template only; not written to the user's installation.
providers:
  office-proxy-chat:
    api: http://127.0.0.1:8317/v1
    key_env: CLIPROXY_API_KEY
    transport: chat_completions
    default_model: glm-5.3-flash
  office-proxy-responses:
    api: http://127.0.0.1:8317/v1
    key_env: CLIPROXY_API_KEY
    transport: codex_responses
    default_model: muse-spark-1.3-contributor
```

`CLIPROXY_API_KEY` is a **proposed injected variable**, not evidence that it already exists. The local server resolves the established `~/.cli-proxy-api/.api-key` privately at launch or uses an existing credential command. Never log the value. The Hermes transport label `codex_responses` selects the Responses wire; it is not a reason to change the user's chosen upstream routing provider. Named provider schemas explicitly support different transports and key-env/credential commands. [Provider documentation in installed source](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/website/docs/integrations/providers.md#named-custom-providers).

Route `glm-5.3-flash` through Chat Completions and `muse-spark-1.3-contributor` through Responses only. Configure delegation and auxiliary title/compression/approval models explicitly so their fallback paths also respect the proxy and model transport. Test both a simple turn and tool-call round trip, not only `/v1/models`. Preserve `disable-cooling` and `disable-image-generation`; they are intentional. Classify GPT `usage_limit_reached` as genuine ChatGPT Plus exhaustion and show an actionable quota state rather than looping authentication/retries. These restrictions come directly from the user's AGENTS instructions; compatibility with Hermes has not yet been exercised.

## Hooks for external sessions

Our managed-session protocol is authoritative for control. Hooks are an optional later observation path for sessions started elsewhere. Installed plugins support tool/LLM/session/stream/subagent/approval observers; outbound webhooks wrap those hooks in signed HTTP deliveries. The implementation uses a bounded queue and two delivery attempts, so it is best effort rather than an audit log or guaranteed event bus. Verify HMAC, deduplicate delivery IDs, redact payloads, and reconcile with saved sessions. A webhook cannot by itself answer a pending question in the originating CLI process. [Outbound implementation](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/agent/outbound_webhooks.py).

October's human-input observer wraps clarify/sudo/approval waits, emits matching request/resolved IDs, force-redacts prompts, and never sends the typed answer/password. This enables an external office observer to put a question icon above an avatar after an upgrade. It does **not** create a generic cross-process answer API. Treat full interaction with sessions owned by another CLI/gateway as an explicit unsupported capability until an attachment/control path is proved. [Current helper](https://github.com/NousResearch/hermes-agent/blob/cfb9ae4f86e221ca1763fff256a44317f2cb5dcb/tools/human_input_hooks.py).

## Acceptance spikes before implementation commitment

1. **Runtime handshake and lifecycle:** temporary profile, installed runtime interpreter, stdio launch, gateway ready, capability advertisement, session creation, idle stop, active interruption, graceful process shutdown. Pass when no orphan child/MCP/tool process or unintended profile write remains and a later launch restores history.
2. **Pending question round trip:** mocked provider produces single and batch clarify plus dangerous-command approval. Pass when request appears in panel and avatar within one event delivery; only exact request can be answered; cancellation and denied/expired/replayed requests resolve correctly.
3. **Routing:** test both named proxy transports with a text response, tool call, streamed completion, auxiliary task, and delegated child in an isolated profile. Pass when all requests use CLIProxyAPI and Muse never reaches Chat Completions. Include quota exhaustion fixture without repeated retries.
4. **Version contract:** fixture replay from installed and selected supported Hermes revision, including optional fields and unknown events. Pass when unsupported capabilities disable controls with a clear reason and no silent protocol mismatch.
5. **Reconnect:** browser reload during streaming, disconnect with open approval, reconnect beyond ring limit, backend crash. Pass when transcript has no duplicated input, question does not disappear or falsely resolve, and state becomes unknown until reconciled.
6. **Profile isolation/configuration:** two temporary profiles with distinct model/tool/cwd/SOUL settings, concurrent sessions, profile rename and external config edit. Pass when actions affect only the chosen profile; partial failures are reported; credentials never appear in browser/API/logs; external edit creates a conflict rather than being overwritten.
7. **Historical activity:** synthetic CLI, automation, API, parent/child and compacted sessions. Pass when counts/source filters/lineage remain correct and unfinished historical sessions do not masquerade as working avatars.
8. **Stop semantics:** stop task vs stop agent vs stop background tool process. Pass when each UI action has the intended effect, saved session remains readable, and unrelated Hermes services remain running.

## Remaining decisions and unknowns

- Exact installed runtime Python executable and whether it exposes all required optional dependencies: discover without starting real user sessions, then test in the lifecycle spike.
- Whether to share an existing dashboard owner or create isolated office-owned stdio owners: decide after testing profile/session ownership and user preference for Hermes Desktop coexistence.
- Whether installed gateway sessions can be observed/responded to across owners: source confirms process-local TUI controls; universal remote control is not established.
- Provider-specific tool/stream/auxiliary behavior behind CLIProxyAPI, especially Muse Responses: untested; must not be inferred from the generic custom-provider schema.
- Resource use of one Python process per profile versus one multiplexed owner: benchmark 1/4/8 idle and working agents; no reliable per-agent memory estimate was established.
- Stable complete-schema version negotiation: available generated contracts and selected capability flags help, but not every RPC has a discovered machine-readable compatibility promise.
- The office avatar/furniture asset pipeline and licensing are separate from Hermes runtime integration. No character assets are supplied by Hermes's protocol.

## Source index

- [Upstream repository](https://github.com/NousResearch/hermes-agent), [installed revision](https://github.com/NousResearch/hermes-agent/commit/f1247d2e0146bbd8edd4e510b9e67e0d259509a4), [upstream snapshot](https://github.com/NousResearch/hermes-agent/commit/cfb9ae4f86e221ca1763fff256a44317f2cb5dcb).
- [Programmatic integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration), [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [ACP internals](https://hermes-agent.nousresearch.com/docs/developer-guide/acp-internals).
- [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles), [sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions), [dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard), [hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks).
