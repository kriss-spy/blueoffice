# BlueOffice — product requirements

Version: 0.2, research-backed draft with confirmed modern-office direction. Date: 2026-10-08 (Asia/Shanghai).

## Product

BlueOffice is a local browser application for operating Hermes agents inside a modern open office inspired by Blue Archive's in-game café. Computer workstations share an open room with an actual café bar. Each configured Hermes agent has a persistent Blue Archive chibi avatar and an assigned workstation. The room provides an immediate view of who is working, who needs an answer, and which task completed. Side panels provide precise chat, session history, furniture inventory, and configuration controls.

This session produces planning documents. The application, asset import, runtime integration, and performance claims still require implementation and validation.

## Confirmed user requirements

- Local browser app.
- Full management: start, stop, and configure Hermes agents.
- Blue Archive café character/furniture presentation translated into a modern open office with desks, computers, and an actual café bar.
- The supplied Discord showcase recording is the primary workstation/character-interaction reference. The earlier study suits an optional private office for a main secretary agent. A classroom alternate world is deferred until office mode is good enough.
- Default 2.5D camera.
- A corresponding Blue Archive character model for every Hermes agent.
- Dialogue bubbles and avatar motions reflect real status; a question mark represents a pending question.
- Side chat panel.
- Office overview covering agents and furniture.
- Activity overview covering Hermes agent sessions.
- Investigate the approach deeply and deliver a PRD plus supporting documents before building.

The actual character collection and furniture sourcing workflow come from [RESOURCES.md](../RESOURCES.md). A character's availability in a repository is distinct from permission to bundle or redistribute it; record that evidence in the asset registry. Supporting neutral assets can unblock engineering, but do not satisfy the final Blue Archive visual requirement.

## User and problem

Primary user: one person running several Hermes assistants on a local Linux computer. Today, switching between sessions, terminals, and settings obscures which agent needs attention. The office should make daily supervision pleasant while retaining the accuracy of a conventional dashboard.

Core jobs:

1. Create a named assistant, assign its character and workstation, configure it, and start it.
2. Give it a task through chat and see work begin in the room.
3. Notice a question, select the question bubble, answer the exact pending request, and see work resume.
4. Distinguish permissions, errors, provider limits, and ordinary completed turns.
5. Review recent sessions, resume supported history, interrupt a task, or stop an owned runtime.
6. Arrange furniture and avatars without changing or losing live agent work.

## Product vocabulary

| Entity | Meaning |
|---|---|
| Office agent | Persistent named assistant configured in BlueOffice, associated with a Hermes profile/home and avatar assignment. |
| Avatar | Visual representation of an office agent. It survives session changes and runtime restarts. |
| Runtime | Office-owned Hermes child process, identified by a generation/epoch. |
| Session | One conversation with Hermes; many historical sessions may belong to one office agent. Live and stored Hermes session identifiers may differ. |
| Run/turn | One submitted task or continuation within a session. |
| Pending request | An exact Hermes clarification or approval needing a response. Ordinary assistant prose ending in a question is not automatically a pending RPC request. |
| Workstation | A desk assembly with a chair/standing slot, computer, and avatar interaction anchors. |
| Observed session | Session discovered outside an office-owned runtime; history/observation capabilities may be available without live control. |

Subagents are not automatically new permanent office agents. The first version shows parent/child relationships in activity when supported by source events; separate temporary avatars are a later feature.

## Scope

The first useful release includes one editable modern open office with computer workstations and a café bar, persistent agent/avatar/desk assignments, Hermes profile management, controlled process launch/stop, live chat and requests, history browsing, office overview, activity overview, and local persistence. The default workload is 1–8 configured agents, up to one foreground run per agent, and roughly 40 furniture instances. These are design targets, not measured limits. The bar is part of the room furniture; it does not require a barista agent, café economy, or an ordering system.

A classroom-like alternate world is deferred until the user accepts office mode as good enough. Do not add a world selector or classroom implementation to v1. An independent secretary office is an optional later visual extension, not an inferred task-routing feature.

Keep multiplayer, hosted access, remote VPS lifecycle management, autonomous task dispatch, a virtual economy, combat, character gacha, and elaborate multi-floor worlds outside v1. Imported external sessions may be observed and resumed where verified, but v1 does not promise live takeover of arbitrary CLI/Telegram sessions. The capability distinction must be visible.

## Experience

The office is the default screen. A fixed elevated diagonal camera shows a modern open cutaway room, soft-lit modular computer desks, a recognizable café counter with coffee equipment/bar seating, and recognizable chibi silhouettes. Pan, zoom, and reset are available; free camera orbit is not the default. Chat stays in a resizable right panel. Office and Activity are switchable views/drawers that preserve the selected agent and room state. The [supplied reference capture](references/modern-office/START-HERE.md) separates observed workstation presentation from the proposed whole-room layout.

Selecting an avatar, its workstation, or an agent row opens the same assistant/session context. Selecting a pending question focuses its answer form. A visible attention queue reaches agents obscured by furniture or bubble overlap. Inventory editing is an explicit mode; clicking a desk during ordinary supervision selects its assistant rather than moving furniture.

## Requirements and acceptance

Priority P0 means required for the first useful release. P1 improves the experience after the control loop is reliable.

| ID | Priority | Requirement | Acceptance |
|---|---|---|---|
| R01 | P0 | Default café-like 2.5D room | On initial load/reset, elevated diagonal orthographic camera; room remains framed with chat open at 1440×900 and at 1280×720. Furniture and avatars use actual depth/occlusion. |
| R02 | P0 | Stable identity and character assignment | Every configured agent has one avatar mapping; starting a new session or restarting runtime preserves name, character, and desk. Same character may be reused with a distinct nameplate. |
| R03 | P0 | Modern office and café bar | Default room has modern desk/computer/chair workstations, open circulation, and an actual café counter with coffee equipment and bar seating. Place/rotate furniture, validate occupancy, undo/redo, save/reload. Workstations expose coherent seat/standing/approach anchors; the bar remains visible with chat open. |
| R04 | P0 | Agent creation/configuration | Create or explicitly adopt a profile, select workspace/model/API family/tool permissions, choose character and desk. Validate before launch; secrets are masked. Existing unknown config sections survive changes. |
| R05 | P0 | Start/stop lifecycle | Start launches only an owned runtime. Interrupt cancels a foreground task; Stop agent waits for actual child exit. Failed startup/exit is visible. Controls cannot signal unrelated Hermes processes. |
| R06 | P0 | Real-time chat | Send a prompt to a specified agent/session, display streamed public output/tool activity, distinguish pending/accepted/failed submission. Refresh does not resubmit messages. |
| R07 | P0 | Pending clarification | Structured clarification creates a persistent question-mark bubble and attention entry. Exact question/options open in chat. Reply resolves the same request once; stale/duplicate replies are rejected visibly. |
| R08 | P0 | Pending approval | Approval has a distinct lock/shield visual and structured approve/deny form. No ambient animation, timeout, generic chat send, or room interaction grants approval. |
| R09 | P0 | Truthful visual status | Room, agent list, chat header, and activity use the same reduced state. Tool execution, completion, error, disconnected, and stopped have distinct readable labels. Missing evidence displays unknown, not invented activity. |
| R10 | P0 | Office overview | Lists configured agents, runtime/attention state, assigned desks/characters, furniture inventory, and unassigned agents. Count labels distinguish configured, running, and awaiting input. |
| R11 | P0 | Activity overview | Lists sessions by agent/profile/source/time/state; filters and session detail show public transcript, tool timeline, and available usage metrics. Live/stored ids are correlated correctly. |
| R12 | P0 | Session continuation | New conversation and supported history resume retain avatar identity. Selecting history alone never switches a running foreground session. Resume has an explicit action and capability check. |
| R13 | P0 | Persistent office | Agent mappings, layouts, config revision records, and session associations survive server/browser restart. Offline avatars retain their desk; corrupted layout can restore a previous valid revision. |
| R14 | P0 | Local model routing | Hermes uses CLIProxyAPI at `http://127.0.0.1:8317/v1`. `glm-5.3-flash` uses Chat Completions; `muse-spark-1.3-contributor` uses Responses. Proxy key remains server-side. Preserve intentional proxy settings. |
| R15 | P0 | Recovery and capabilities | Browser reconnect restores session and pending requests without duplicate work. Process restart distinguishes lost/live/expired requests. Externally discovered history is marked observed with unsupported controls disabled. |
| R16 | P0 | Failure visibility | Provider quota, unavailable proxy, malformed asset, launch error, and RPC failure show actionable context. Real GPT `usage_limit_reached` is displayed as quota, not treated as a transient cooling error. |
| R17 | P0 | Accessible supervision | Keyboard agent/session selection and all pending reply controls work without canvas. Status has text/icon, not color alone. Reduced motion keeps states legible. WebGL failure preserves a usable list/chat interface. |
| R18 | P1 | More café life | Walk-to-workstation, short reaction/completion clips, lounge idle behavior, and quiet optional sound when actual state changes. Agent-specific desk motions require compatible validated clips. |
| R19 | P1 | Import/export | Layout manifests include asset IDs and versions; importing reports missing assets and restores via placeholders without losing agent references. Restricted assets are not embedded in exports. |
| R20 | P1 | Child activity | Where Hermes exposes lineage, child tasks appear grouped under the parent and can later receive temporary avatars. No invented child status. |

## Status contract

Status has independent axes: runtime lifecycle, foreground work phase, attention requests, and telemetry freshness. A single flat animation enum is insufficient: an agent can have active background work while awaiting a foreground answer.

| Condition | Room presentation | Panel behavior |
|---|---|---|
| Stopped | Resting/frozen avatar, muted nameplate | Start; browse history; configure. |
| Starting | Small loading marker | Startup diagnostics; chat disabled until ready. |
| Ready/idle | Café idle or appropriate workstation idle | Composer ready. |
| Running/model request | Attentive work pose; ellipsis badge | Streaming public messages; label “Working” unless a finer phase is explicitly observable. |
| Tool in progress | Work pose with small tool icon | Tool name, start time, result; do not claim the model is thinking during a tool call. |
| Clarification pending | Question mark; pause/looking-up reaction if compatible | Persistent question form and options. |
| Approval pending | Lock/shield marker | Approve/deny structured request. |
| Turn completed | Brief success reaction, then idle | Result and unread completion marker. Completion does not stop the agent. |
| Turn failed/limited | Error/warning reaction and badge | Explain error class; retry is an explicit action, quota stays visible. |
| Telemetry disconnected | Connection indicator and “Unknown” freshness overlay | Disable uncertain controls; reconnect/reconcile; never infer task completion. |
| Stopping | Lifecycle progress marker | Exit acknowledgement; timeout diagnostic if required. |

Requests remain visible until resolved or expired. Bubble text is a concise excerpt of public agent output or a deterministic tool/status label; do not generate fictional dialogue or expose hidden reasoning. Do not show raw terminal commands or sensitive tool arguments over avatars by default.

## Functional boundaries

Full management applies to agents created or explicitly adopted and launched through BlueOffice. Importing historical sessions is not ownership of the process that originally wrote them. One foreground run per avatar is a deliberate first-version product policy, not a claim that Hermes cannot run multiple sessions. New prompts during a busy turn require a verified queue/interrupt mechanism or a visible busy response; no implicit rerouting to a different session.

Profile edits affecting provider/tools are applied at a safe boundary with an explicit restart-needed indicator where applicable. The office does not mutate CLIProxyAPI's `disable-cooling` or `disable-image-generation`, or reinterpret a real account quota as something it can bypass.

## Quality targets

Targets are provisional until tested on this user's Linux machine and recorded with hardware/browser/asset versions.

- At 1440×900 with 8 avatars/40 furniture instances, target 60 FPS in ordinary operation and at least 30 FPS in reduced quality; prioritize responsive chat over decorative effects.
- From server receipt of a structured pending event to visible marker: p95 under 500 ms in a local test. Provider/network latency is excluded.
- Browser refresh/reconnect restores current selection and pending-request state within 3 seconds when backend is healthy.
- Chat and pending-request controls remain usable with the scene disabled.
- Config edits preserve unknown keys and fail on concurrent incompatible edits.
- Lifecycle/attention/session correlation has no false “done” or approval resolution in the adversarial fixtures.
- No office secret appears in client bundles, asset manifests, exported layouts, URLs, or ordinary logs.

## Success scenarios

1. Configure two agents with different avatars/profiles; launch both, give each a task, and see independent chat/status. Neither can change the other's configuration or resolve the other's question.
2. A real structured clarification produces a question mark. Refresh the browser, answer once, and verify the same task continues with an idle/working transition based on Hermes events.
3. A permission request produces a distinct control. Deny it and verify the server records denial rather than silently treating the request as a prompt.
4. Interrupt a run; then stop the agent. Runtime exit is confirmed; other local Hermes services remain running.
5. Reopen a historical session and resume it explicitly; the same character remains assigned.
6. Move a workstation, rotate it, save, reload, and preserve seated/standing alignment and agent assignment.
7. Simulate provider quota, backend disconnect, and unsupported external control; each remains understandable without inspecting a terminal.

## Open decisions and release gates

- Which initial characters should ship/be imported? Candidate collection has model/clip evidence; no final roster selected.
- Exact assets' permissions and distribution scope remain unresolved. Local import and public bundling require separate evidence.
- Exact café camera/material match needs a representative scene review.
- Profile adoption, default model/API-family settings, and config refresh behavior need local protocol tests.
- Existing external sessions: observation/history is planned; live takeover is not guaranteed.
- Typing/seated interaction assets are not yet verified. Ship correct standing work poses if acceptable for the first engineering slice; retain seated desk work as the visual completion gate.

See [architecture](ARCHITECTURE.md), [experience specification](EXPERIENCE.md), [asset pipeline](ASSET-PIPELINE.md), and [implementation plan](IMPLEMENTATION-PLAN.md) for concrete decisions, validation work, and requirement traceability.
