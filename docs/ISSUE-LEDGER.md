# BlueOffice remaining-ticket ledger

All original acceptance criteria remain authoritative. Start of this orchestration run: 2026-10-08 22:19 Asia/Shanghai; three-hour checkpoint: 2026-10-09 01:19. Initial estimate: 4–7 hours, with seated-work quality and performance as uncertain gates. Main includes verification PR #32. Required **Offline checks** and **Fixture browser flows** must pass before integration; release additionally requires reviewed product, visual, performance and live-route evidence.

| Ticket | Owner | Dependencies | Implementation | Current evidence | PR / closure |
|---|---|---|---|---|---|
| #5 Setup | Orchestrator | #14 assignments | Existing profile flow; setup avatar/workstation selectors remain | Prior #25 evidence; new selectors unverified | #25 merged; open |
| #10 Overview | Orchestrator, next available worker | #5, #14 inventory | Basic roster only; full overview queued | Existing two-agent foundation only | Open |
| #11 History | `implement_history` (Sol Medium) | Completed #3 | Implementing source-aware read-only history and pinned Activity | Native contract inspection underway | Open |
| #12 New/resume | `implement_history`, Astra contract review | #11 | Queued behind history | Prior probe only; application unverified | Open |
| #14 Editor | `implement_layout` (Sol Medium) | Completed #9 | Implementing layout validation, revisions, editor and assignments | New tests/browser scenarios pending | Open |
| #15 Seated work | `implement_seated` (Sol Medium), Astra visual review | Completed #9 | Measuring/authoring actual seated pose and generic compatibility | Standing proof exists; seated gate unverified | Open |
| #16 Accessibility | Next available worker | #10, #12, #14 | Queued; existing DOM fallback is partial | Dense/context-loss/keyboard acceptance outstanding | Open |
| #17 Performance | Next available worker, orchestrator measurements | #10, #14, #15, #16 | Queued | Named-hardware 1/4/8 runtime and dense scene measurements outstanding | Open |
| #18 Release | Orchestrator, independent Astra reviewers | #12, #17 and all P0 gates | Workflow merged; product release unaccepted | `verify:release` must pass with genuine current attestations | #32 workflow merged; #18 open |
| #19 Café motion | Next available worker | #14, #15 | Queued | Routing/pose/preemption/sound evidence outstanding | Open |
| #20 Layout transfer | Layout worker after #14 | #13 completed, #14 | Queued | Transactional round-trip/privacy evidence outstanding | Open |
| #21 Child activity | History worker after #11 | #11 | Queued | Installed lineage capability and dedup evidence outstanding | Open |

## Contracts and ownership

Workers have separate managed worktrees under `~/.codex/worktrees/blueoffice-{layout,history,seated}/blueoffice`. They own disjoint modules and tracked tests. The orchestrator owns `server/office.ts`, `server/http.ts`, `server/main.ts`, `shared/office.ts`, `shared/events.ts`, `src/App.tsx`, setup/overview integration and this ledger. Layout owns the store/editor/room geometry; history owns runtime adapters and history modules; seating owns avatar/scene primitives and optional manifest compatibility. Contract changes are coordinated before crossing these boundaries.

Each complete increment receives focused tests, applicable combined-branch `check`, `verify:ui`, `verify:integration`, independent review against issue scenarios, and required CI. Worker evidence alone does not prove a later combined branch. No fixture pass is treated as live-provider or visual acceptance. Progress reports include merged/closed tickets, active workers, blockers and revised estimate every 30 minutes.
