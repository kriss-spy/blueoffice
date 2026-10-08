# BlueOffice remaining-ticket ledger

All original acceptance criteria remain authoritative. Start of this orchestration run: 2026-10-08 22:19 Asia/Shanghai; three-hour checkpoint: 2026-10-09 01:19. Initial estimate: 4–7 hours, with seated-work quality and performance as uncertain gates. Main includes verification PR #32. Required **Offline checks** and **Fixture browser flows** must pass before integration; release additionally requires reviewed product, visual, performance and live-route evidence.

| Ticket | Owner | Dependencies | Implementation | Current evidence | PR / closure |
|---|---|---|---|---|---|
| #5 Setup | `implement_setup` (Sol Medium) | #14 assignments | Setup selectors, adoption identity and reservations integrated | Worker offline/browser/native integration pass; combined verification/review pending | #25 merged; open |
| #10 Overview | Orchestrator / setup worker | #5, #14 inventory | Overview integrated: counts, inventory, exact requests and direct agent actions | Eight-agent counts plus two-agent task/question/deny/stop/config isolation pass; independent acceptance pending | Open |
| #11 History | `implement_history` (Sol Medium) | Completed #3 | Source-aware read-only Activity implemented; review fixes complete | Combined gates pass, 5 history browser cases, native cost/read-only probe, independent review clear | #33 merged; closed |
| #12 New/resume | `implement_history`, Astra contract review | #11 | Astra contract accepted; native/runtime implementation started | Auto-continuation and stored route override proofs required | Open |
| #14 Editor | `implement_layout` (Sol Medium) | Completed #9 | Transactional editor, recovery, inventory and Locate complete | Combined gates pass; 4 editor browser cases; both independent reviews clear | #33 merged; closed |
| #15 Seated work | `implement_seated` (Sol Medium), Astra visual review | Completed #9 | Measured seated pose integrated and representative scene accepted | Native playback/video, final chair clearance, both resolutions and independent review | #33 merged; closed; private import only |
| #16 Accessibility | `implement_seated` (Sol Medium) | #10, #12, #14 | Implementing dense attention and recoverable WebGL | Dense/context-loss/keyboard acceptance outstanding | Open |
| #17 Performance | Next available worker, orchestrator measurements | #10, #14, #15, #16 | Queued | Named-hardware 1/4/8 runtime and dense scene measurements outstanding | Open |
| #18 Release | Orchestrator, independent Astra reviewers | #12, #17 and all P0 gates | Workflow merged; product release unaccepted | `verify:release` must pass with genuine current attestations | #32 workflow merged; #18 open |
| #19 Café motion | `implement_seated` (Sol Medium) | #14, #15 | Queued | Routing/pose/preemption/sound evidence outstanding | Open |
| #20 Layout transfer | `implement_layout` (Sol Medium) | #13 completed, #14 accepted | Versioned manifests, explicit bindings, atomic import and reviewed-asset loading integrated | Offline passes; 6 browser scenarios and independent review pending | Open |
| #21 Child activity | History worker after #11 | #11 | Queued | Installed lineage capability and dedup evidence outstanding | Open |

## Contracts and ownership

Workers have separate managed worktrees under `~/.codex/worktrees/blueoffice-{layout,history,seated}/blueoffice`. They own disjoint modules and tracked tests. The orchestrator owns `server/office.ts`, `server/http.ts`, `server/main.ts`, `shared/office.ts`, `shared/events.ts`, `src/App.tsx`, setup/overview integration and this ledger. Layout owns the store/editor/room geometry; history owns runtime adapters and history modules; seating owns avatar/scene primitives and optional manifest compatibility. Contract changes are coordinated before crossing these boundaries.

Each complete increment receives focused tests, applicable combined-branch `check`, `verify:ui`, `verify:integration`, independent review against issue scenarios, and required CI. Worker evidence alone does not prove a later combined branch. No fixture pass is treated as live-provider or visual acceptance. Progress reports include merged/closed tickets, active workers, blockers and revised estimate every 30 minutes.

## 22:49 progress checkpoint

No additional PR merged or issue closed in this run yet. Three Sol Medium implementation workers active. Baseline after PR #32 integration passed all three automated gates. The combined implementation passed offline checks (78 TypeScript tests); eight-agent overview and all four worker layout browser scenarios pass. Full combined browser/integration attempts were invalidated by a commit during the run and are not integration evidence; rerun on a frozen commit. History selector corrections and stream-triggered native read reduction remain in flight. The three-hour target remains unlikely; initial four-to-seven-hour total estimate stands.

Critical path: seated whole-office/reference acceptance → accessibility and dense-scene/runtime measurement → release evidence. Parallel path: history → independently reviewed passive owned resume/lineage. Layout transfer follows editor review. No private GLB bytes enter Git; local review does not grant redistribution rights.

## 23:23 merge checkpoint

PR #33 merged as `f953ef9bd8c35dade246a34c0d97cac392f894c1` with both required checks successful. GitHub confirms #11, #14 and #15 closed. Final combined gates at `bd7b940` passed offline, 14 browser scenarios and installed synthetic integration. Independent review and honest visual/private-asset limits are recorded in [layout-history-review.md](validation/layout-history-review.md). Nine tickets remain. Revised estimate after one hour: three to five hours total; three-hour target remains at risk.

The next integration branch is `beta/setup-layout-transfer`, based on merged main, with setup/overview and portable-layout increments. Resume owns native/runtime/Office transition work; accessibility/motion owns scene modules; the orchestrator owns HTTP/App integration. Required checks are never bypassed.
