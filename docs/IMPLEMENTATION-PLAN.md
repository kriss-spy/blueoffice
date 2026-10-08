# BlueOffice implementation and validation plan

Status: proposed backlog, 2026-10-08. This session has completed research/specification only. No item below is claimed implemented or tested.

## First build target

One office-owned Hermes assistant, one intended chibi character, one modern desk/computer/chair assembly in an open room with a simple café counter, and a working side chat. Use [the supplied recording capture](references/modern-office/START-HERE.md) for workstation presentation. A structured pending question produces a question mark; replying to that card resumes the same Hermes turn. Browser refresh preserves the request. Interrupt task and Stop agent have different, verified effects. A standing engineering fallback is temporary; final visual acceptance requires validated seated computer work.

This slice answers the hardest integration and visual questions together. Expand to the editor/roster only after it works. An offline fixture can precede the live adapter so early rendering checks do not consume model quota.

## Phase 0 — evidence-to-contract spikes

| Spike | Concrete work | Exit evidence | Fallback if it fails |
|---|---|---|---|
| S01 Runtime/protocol | Discover trusted interpreter; temporary isolated profile; stdio handshake and session creation using mocked provider. Verify source revision and required methods. | Redacted launch/event trace, supported-method matrix, graceful idle exit, no unrelated service changes. | Evaluate authenticated existing-dashboard WS owner; do not switch to terminal scraping by default. |
| S02 Human input | Single/batch clarification, approval, cancellation/expiry; retain frame id plus inner approval id; reply and refresh/reconnect. | Same task continues; stale/duplicate/cross-agent replies rejected; pending request restored after browser reload. | Narrow supported request types with explicit unsupported UI; must solve clarification before v1. |
| S03 Model routing | Isolated text + tool + streaming round trip for GLM Chat Completions and Muse Responses; auxiliary/delegation routes. | Redacted endpoint/API-family evidence; no provider bypass; quota fixture stops retrying. | Choose verified model route for initial usage, keep other route visibly unsupported until fixed. |
| S04 Profile/config | Two distinct profiles; persona/tools/model/cwd; partial saves, readback, external edit, active-turn changes. | Isolation, revision conflict, no secret leak, correct apply-now/next-turn/restart distinction. | Limit advanced settings to verified native operations; safe restart for critical changes. |
| S05 Avatar/material | Load one usable intended GLB, idle/walk/reaction and duplicate rig instances under default camera. | Render capture, clip inventory, validation report, independent animation, correct face/halo/transparency. | Normalize materials/asset; use original placeholder for engineering only while target pack is resolved. |
| S06 Workstation | One desk/computer/chair, canonical coordinates, approach/seat/work anchors, standing/seated work pose. | Rotated workstation remains aligned; no foot drift/chair clipping; fallback works when clip missing. | Standing focused pose for integration slice; authored seated typing for visual completion. |
| S07 Recovery/history | Replay truncation, process epoch replacement, uncertain prompt admission, CLI/automation/child history. | No duplicate task submission; old request cannot target new epoch; historical unfinished sessions show unknown. | Restrict unmanaged history resume/control while retaining observation. |
| S08 Resource budget | 1/4/8 owned Python runtimes; 8 avatar/40 furniture scene with chat; hidden tab and WebGL loss. | Measured CPU/RSS/GPU/frame/load/recovery figures on named hardware/browser. | Reduce decorative animation/resolution/avatars rendered; evaluate shared owner only if isolation stays correct. |

These are bounded technical proofs, not broad production implementation. Prefer mocked providers/temporary profiles for protocol and failure testing; live routing probes should be small and intentionally initiated during implementation. Do not use the user's working conversations as test data.

## Phase 1 — usable vertical slice

Deliver:

- Local server/UI launch with installed-Hermes discovery and explicit capability diagnostics.
- Persistent one-agent identity and profile association.
- Owned runtime supervisor; create/resume/prompt/interruption/stop.
- Normalized state/request registry and snapshot/event replay.
- One-room camera and one avatar/workstation; status/bubble mapping.
- Side chat with actual clarification and approval cards.
- Minimal settings for workspace/model/API family/persona/tools.

Exit: the first build target works end to end; false completion, approval, duplicate submission, and wrong-session reply fixtures pass. Basic lifecycle must work with scene disabled. Save redacted evidence and any narrowed capability decisions.

## Phase 2 — daily-use office

Deliver 1–8 configured agents, durable avatar/desk assignments, office overview, session activity/source filters, history detail and supported explicit resume, config readback/conflict handling, error classes, and attention queue. Add the selected roster only after per-character QA. Integrate model routing without editing proxy configuration.

Exit: two agents execute independently; questions/config/stop cannot cross profile boundaries; refresh/restart preserve identity/layout/history associations; quota and disconnect cases remain understandable.

## Phase 3 — furniture and café fidelity

Deliver catalog placement, grid/occupancy, move/rotate/undo/save, workstation assemblies/anchors, simple approach pathfinding, cohesive modern open-office furniture including the café counter/coffee props/stools, correctly supported seated work motions, reduced motion, bubble collision rules, WebGL fallback, and import diagnostics.

Exit: visual slice reviewed from default camera; editable workstation preserves alignment/assignment after reload; dense-office benchmarks meet measured budget or document a deliberate quality mode. No restricted asset is silently embedded in a release/export.

## Phase 4 — optional expansion

After the local v1 is reliable: child-task helpers, optional sound packs, layout import/export GUI, an optional private secretary office, remote observation through authenticated adapters, or an embedded Hermes dashboard plugin. A small classroom alternate world is explicitly deferred until the user accepts office mode as good enough; do not plan its implementation before that gate. Multiplayer, autonomous dispatch, and hosted process management each require a new product scope.

## Suggested backlog

| Work item | Result | Dependencies |
|---|---|---|
| B01 Contract fixtures | Installed Hermes RPC/request/event examples, version capabilities | S01–S02 |
| B02 Office domain | Stable identities, session binding, lifecycle/attention reducer | B01 |
| B03 Supervisor | Per-profile launch, ownership, shutdown, epochs | S01, B02 |
| B04 Profile settings | Create/adopt, field scopes, readback, conflict handling, proxy route | S03–S04, B03 |
| B05 Chat/requests | Prompt stream, pending cards, exact replies, errors | B01–B04 |
| B06 Asset registry | Validated pack manifests and per-character clip mappings | S05–S06 |
| B07 Room/status | Default camera, avatars/workstations, truthful bubbles/motions | B02, B06 |
| B08 Replay/persistence | Durable snapshots, request recovery, command outcomes | B02–B05, S07 |
| B09 Office/Activity | Agent and furniture views; session sources/history/lineage | B04, B08 |
| B10 Layout editor | Grid occupancy, assemblies, undo/revision save | B06–B07 |
| B11 Daily-use polish | Keyboard/reduced motion, attention collisions, fallback, quality modes | B05, B07–B10, S08 |
| B12 Release audit | Content provenance, compatibility matrix, startup guide, measured targets | All required gates |

## Requirement traceability

| PRD requirement | Owning work | Required validation |
|---|---|---|
| R01 Default 2.5D | B07 | S05, framing with chat and reset |
| R02 Avatar identity | B02, B06–B08 | Session change/restart/duplicate character |
| R03 Furniture office | B06, B10 | Occupancy, rotation, anchors, undo/save/load |
| R04 Agent configuration | B04 | S04, partial apply, external edits |
| R05 Lifecycle | B03, B05 | S01/S07, interrupt vs stop vs background tool |
| R06 Live chat | B05, B08 | Streaming, uncertain admission, refresh |
| R07 Clarification | B01, B05, B07–B08 | S02, exact single/batch reply and expiry |
| R08 Approval | B01, B05, B08 | S02, deny/stale/cross-agent cases |
| R09 Truthful status | B02, B07 | Reducer sequence; tool failure vs turn outcome |
| R10 Office overview | B09 | Counts, assignments, locate/control capability |
| R11 Activity overview | B09 | S07, automation/source/lineage and missing metrics |
| R12 Resume | B03, B05, B09 | S07, live/stored id binding, explicit context switch |
| R13 Persistence | B08, B10 | Restart, corruption/revision restoration |
| R14 Model routing | B04 | S03, both API families plus auxiliary routes |
| R15 Recovery | B08 | S07, replay truncation/epoch/request reconciliation |
| R16 Failure visibility | B02, B05, B11 | Quota/proxy/asset/RPC fixture set |
| R17 Accessibility | B05, B09, B11 | Keyboard-only, reduced motion, no-WebGL |
| R18 Café life | B06–B07, B11 | Clip suitability/preemption and workstation QA |
| R19 Import/export | B06, B10–B12 | Missing assets, path validation, reference-only export |
| R20 Child activity | B01, B09; later avatar expansion | Source lineage and missing-id behavior |

## Test strategy

Focus tests on boundaries that can send a task/reply to the wrong session, misreport state, damage config, or lose control across restart. Use captured/redacted protocol fixtures and synthetic profiles/history. Renderer snapshots alone cannot prove correct agent state.

Critical fixtures: new question while a tool is active; multiple batch questions; duplicate reply in two tabs; request.cancel; approval versus secret; tool failure followed by successful turn; disconnect during uncertain submission; process epoch restart; event replay gap; partial config save; external edit; missing clip; reused rig; desk edit during pending input; genuine quota exhaustion.

Browser end-to-end checks cover selection→chat→prompt→question→answer→resume→completion, separate interrupt/stop, history resume, layout reload, and keyboard operation. Benchmark once after relevant visual changes and repeat only when regression or new assets justify it.

## Rough effort and risks

Planning range for one experienced developer: approximately 1–2 weeks for the integrated slice and 4–8 weeks total for a useful polished local v1, assuming usable character permissions, compatible models, and a small furniture set. These are order-of-magnitude estimates, not a schedule commitment. Authored workstation animations and rights/asset sourcing can extend the timeline independently of engineering; estimate again after S01–S06.

| Risk | What would reveal it | Mitigation |
|---|---|---|
| Internal Hermes protocol drift | Contract fixture fails after update | Pin/test supported revisions, expose version diagnostics. |
| Another owner uses the profile | Discovery/adoption conflict, duplicate control | Dedicated office profiles, ownership checks, single-writer management. |
| Pending requests do not recover | Replay/epoch tests | Server-owned request registry; exact replay; expire old epochs. |
| GLB differs from game appearance | First render/clip review | Per-character material/clip normalization before roster expansion. |
| No seated typing clip | Workstation spike | Author small pose/clip set; permit accurate standing integration fallback. |
| Model distribution basis unclear | Provenance inventory | Separate importable pack; select content based on actual intended distribution. |
| Process/renderer resource cost | S08 measurement | Fewer rendered animations, quality modes; investigate shared owner only with isolation proof. |
| Full configuration races external tools | S04 concurrent-edit test | Dedicated managed homes; detected conflicts; explicit limitation for noncooperating writers. |

## Definition of done for the planning session

Research findings cite primary owners/source, local Hermes version is distinguished from current upstream, all user requirements map to work and acceptance, asset formats/animations/permissions are distinguished, build-vs-fork and renderer/integration choices are documented, and remaining unknowns have concrete validation paths. Application execution and visual/performance validation remain future work.
