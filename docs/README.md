# BlueOffice documentation

**Current disposition: v1 concept prototype, closed 2026-10-09.** Start with [the lessons and closeout](V1-PROTOTYPE.md) and [status](STATUS.md). The planning pack below is retained as historical context; its proposed milestones are not an active work order.

Research/specification completed 2026-10-08, Asia/Shanghai. Working name: BlueOffice. Target: local browser office for Hermes agents, inspired by Blue Archive café, with full agent management.

## Recommended approach

Use React + Three.js/React Three Fiber for a real 3D office viewed through a fixed oblique orthographic camera. Use GLB character packs and a coherent stylized desk/computer kit. A local server owns isolated Hermes profile processes through existing structured TUI JSON-RPC, translates their public events/questions into office state, and serves chat/overviews in HTML panels.

The user selected RPC for v1 after comparing it with Hermes platform adapters. See [ADR 0001](decisions/0001-local-office-architecture.md) for the accepted decision and remaining validation.

The selected room is a modern open office with computer workstations and an actual café bar. [The supplied showcase capture](references/modern-office/START-HERE.md) records workstation/avatar reference frames and the revised visual direction. An independent secretary office is optional; a classroom alternate world is deferred until office mode is good enough.

Persistent agents own avatars; sessions belong under them. This prevents each conversation from spawning a different “employee.” Questions/approvals retain exact request identities, and browser refresh does not end the agent or clear its waiting state.

## Read in this order

| Document | Purpose |
|---|---|
| [Verification workflow](VERIFICATION.md) | Repeatable commands, isolated browser/integration checks, evidence freshness and completion gates. |
| [PRD](PRD.md) | Confirmed requirements, scope, status semantics, acceptance and open decisions. |
| [Experience](EXPERIENCE.md) | Screen wireframe, camera, chat, bubbles/motions, office/activity views and editing. |
| [Architecture](ARCHITECTURE.md) | Runtime supervision, RPC boundaries, identity/event/storage/configuration/recovery design. |
| [Asset pipeline](ASSET-PIPELINE.md) | Sources, runtime manifests, normalization, furniture anchors, animation and provenance QA. |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Spikes, vertical slice, phases, backlog, tests, estimates and requirement traceability. |
| [Architecture decision](decisions/0001-local-office-architecture.md) | Build-vs-fork, renderer and integration choices, alternatives and consequences. |
| [Hermes integration research](research/hermes-integration.md) | Commit-pinned installed/upstream APIs, profiles, requests, session history, model routing and limits. |
| [Visual/assets research](research/visual-assets.md) | Official café reference and resource-by-resource audit, GLB/clip metadata, furniture and policy sources. |
| [Technology/precedents research](research/technology-and-precedents.md) | Renderer comparison and Pixel Agents/Miniverse/Agent Office patterns. |
| [Telegram comparison](research/telegram-comparison.md) | Existing Telegram abilities versus planned office additions; stock-interface gaps versus platform limitations. |

## Strongest findings

- Installed Hermes has usable session/profile/configuration RPC plus exact clarification/approval requests. A new agent loop or terminal parser is unnecessary. The installation lacks newer human-input hooks found in current upstream; v1 should use the verified RPC request path.
- The supplied Models resource links to 295 character GLBs at the inspected snapshot. Yuuka metadata includes rigging and 38 clips, including café idle, walk, and reaction. This is metadata evidence, not a rendered compatibility result.
- Kenney/KayKit offer creator-declared CC0 furniture paths. The actual chosen archive/tier needs inspection; a complete monitor/keyboard/workstation cannot be assumed from a catalog label.
- The official fan kit supplies 2D material; it is not an established 3D pack. Model repository availability does not establish redistribution permission.
- Seated computer work is the main art/animation gap. Exact camera, materials, work poses, and performance require representative-scene validation.

## Original planned milestone (historical)

For the source game's visual and interaction reference, see the [Blue Archive capture](../capture/blue-archive/START-HERE.md), including its screen atlas, proposed parameters, source manifest, and isolated browser study specimen.

One controlled Hermes agent at one workstation: chat → real question → question-mark bubble → exact answer → resumed work, with refresh recovery and distinct interrupt/stop behavior. Validate one intended avatar and desk alignment at the same time, then expand to 8 agents, furniture editing, and activity/office views.

At the original planning checkpoint, no runtime/configuration/proxy changes, model calls, application implementation, or game-asset incorporation had been performed. Implementation subsequently progressed as recorded in STATUS.md. Planning artifacts preserve the supplied `RESOURCES.md` and logo. The research reports link the primary evidence; future integration results should record revision, environment, redacted traces, and measured outcomes.
