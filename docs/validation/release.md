# Historical local beta release evidence

**Historical scope:** this evidence concerns PR #37 and its tested revision. It does not accept the later room-first scene or override the user’s decision to close v1 as a [concept prototype](../V1-PROTOTYPE.md). No new release acceptance is claimed by that closeout.

This is the acceptance index for issue #18 and final integration PR #37. A release is complete only when the source-bound release command and both required GitHub checks pass. The selected distribution is the local source application with procedural room furniture, original synthesized notifications, neutral fallback avatars and separately imported character packs. Private representative character captures establish the recorded visual behavior; they do not grant redistribution rights.

## Supported versions and capabilities

| Surface        | Supported evidence                                                                           | Limit                                                                               |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Host           | Linux, Node.js >=22.13, Python 3, trusted `hermes --print-runtime-command` discovery         | Other operating systems and untested runtime layouts are not admitted               |
| Hermes         | `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`, revision/source-gated protocol readers           | Unknown revisions fail capability checks until probed                               |
| Providers      | CLIProxyAPI loopback; GLM Chat Completions and Muse Responses                                | Current local live admission is required; model names alone grant nothing           |
| Ownership      | Independent owned profiles and runtimes; explicit adopt/recover                              | Observed external sessions have no live takeover                                    |
| History        | Readonly native public messages/tools/available usage; explicit owned Resume                 | Unknown pricing/outcomes remain unavailable; external Resume unsupported            |
| Characters     | Reviewed versioned local packs, independent rigs, mapped clips and compatible seated profile | No private character geometry/textures are bundled; no final public roster          |
| Motion         | Short validated routes, mapped walk/reaction, static work pose, default-off lounge/sound     | No invented typing or natural sit/get-up animation                                  |
| Graphics       | WebGL room with independent DOM supervision, reduced motion and Retry                        | Measured ordinary/reduced modes; provisional ordinary 60 FPS remains an explicit limitation (see performance.md)            |
| Child activity | Native evidenced lineage, observed-only grouped history                                      | #21 passed independent review, combined native/browser checks and required CI; merged in PR #36. No child control or avatars |

## PRD evidence map

Evidence describes the exercised boundary. Synthetic native providers prove protocol behavior, browser fixtures prove UI behavior, and neither is labeled a live-provider or visual pass.

| Requirement          | Implementation and evidence                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R01 café room        | `avatar-proof.md`, `seated-work.md`, `layout-history-review.md`; representative native-character captures at both target viewports; named-hardware measurements and explicit provisional FPS limitation in `performance.md` |
| R02 stable identity  | `owned-chat.md`, `history-resume-contract.md`; new/resume/restart and duplicate-character browser cases                                                            |
| R03 furniture/editor | `layout14.md`, `seated-work.md`, `layout-transfer.md`; validated rotated assemblies, undo/redo, revision persistence and café review                               |
| R04 configuration    | `profile-settings.md`, `setup-transfer-review.md`; create/adopt, placement reservations, unknown-key retention and native readback                                 |
| R05 lifecycle        | `owned-chat.md`, `recovery.md`; actual owned native interrupt/stop, exact process lease and unrelated-runtime isolation                                            |
| R06 public chat      | `owned-chat.md`, `clarification.md`; native streaming/public tools, durable command receipts, refresh without replay                                               |
| R07 clarification    | `clarification.md`; native exact request/turn continuation, batch lock/tail semantics, browser refresh/answer                                                      |
| R08 approval         | `approval.md`; actual native denial prevents sentinel execution, explicit allow-once and exact browser controls                                                    |
| R09 truthful state   | `live-office.md`, `scene-motion.md`; shared reducer, unknown/failed freshness and completion keyed to real turn                                                    |
| R10 overview         | `setup-transfer-review.md`; eight-agent roster/counts, exact requests, inventory and unassigned identities                                                         |
| R11 Activity         | `history11.md`, `layout-history-review.md`; source filters, public tools, pinned inspection, native pricing provenance                                             |
| R12 continuation     | `history-resume-contract.md`, `conversation-motion-review.md`; exact owned history, fresh binding, passive-resume guard and stale-epoch rejection                  |
| R13 persistence      | `recovery.md`, `layout14.md`, `layout-transfer.md`; restart, corruption recovery, stale revision refusal and exact references                                      |
| R14 routing          | `model-routing.md`; both API families, native foreground/tool/auxiliary/delegation, server-only key and configuration preservation; fresh GLM/Muse live release calls passed at candidate `5cac1eb` with proxy configuration unchanged |
| R15 recovery         | `recovery.md`, `history11.md`; exact request reconciliation, unknown delivery, no replay, observed-control refusal                                                 |
| R16 failures         | `tests/e2e/release-failures.spec.ts`, `scene-accessibility.md`; quota/proxy/RPC/asset distinctions, secret-canary redaction and independent request usability      |
| R17 accessibility    | `scene-accessibility.md`, `conversation-motion-review.md`; keyboard selection/reply/deny, exact attention, reduced motion and actual graphics-loss recovery        |

## Seven success scenarios

| Scenario                             | Current evidence boundary                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two independent agents               | The distinct-avatar release browser scenario uses different blue/orange GLB bytes, hashes and reviewed references with separate profiles, exact requests, cross-agent refusal, settings isolation and reload identities. Shared-avatar regressions remain. The native suite verifies independent processes and foreign-target refusal |
| Refresh and answer                   | Browser question/batch replay plus actual installed-Hermes structured clarification, exact answer and same-turn continuation                                            |
| Deny approval                        | Browser exact denial plus actual native prevention of the disposable sentinel action                                                                                    |
| Interrupt then Stop                  | Native runtime remains after interrupt and exits after Stop; owned leases isolate unrelated runtimes                                                                    |
| Explicit historical Resume           | New browser transition scenarios plus settled native two-route resume, exact stored/live provenance, no passive inference or crash replay                               |
| Rotated layout reload                | Editor/import browser scenarios and representative native-character quarter-turn/Locate captures                                                                        |
| Quota/disconnect/unsupported control | Separate fixture quota/proxy failures, RPC exit/reload retaining other requests, observed history disabled with reasons                                                 |

The combined candidate `5cac1eb` passed every automated gate in `artifacts/verification/2026-10-09T03-11-17.161Z-release-e646686e/report.json`: offline checks, all 39 browser scenarios and seven installed-Hermes suites. The initial release command correctly returned `needs-acceptance` until separate reviewed records are supplied. Final release acceptance must bind those records to the final source fingerprint and rerun the gate; a prior green manifest is not substituted for that command.

At that candidate, normal `npm start` served the built client, refused a duplicate data-directory owner, and restarted with the same journal and no implicit runtime launch (`artifacts/release/startup-smoke-1791515564705.json`). The actual-key scan found zero matches in tracked source, built files and ordinary logs; no private model files were bundled (`artifacts/release/source-audit-1791515571503.json`). Native/configuration and browser fixtures separately cover unknown-key retention, structured redaction and layout privacy. The scan does not claim to discover arbitrary unknown secrets.

Both actual live routes passed text, streaming, tools, auxiliary and delegation at `artifacts/release/routes-admission/routes.json`; the real CLIProxyAPI configuration was byte-identical before/after. The direct route launcher now canonicalizes a symlinked Node executable without expanding the namespace mount scope. The earlier failed launcher attempt is retained and did not make a live call.

The source-bound final evidence index is `artifacts/release-acceptance.json`, with separate product, visual, performance and live-route reviews and SHA-256 digests. The final PR records its passing release manifest and required CI checks. These local artifacts include private review evidence and are not bundled as public character assets.

## Distribution and unresolved items

- Room geometry and notification oscillators are original implementation; dependencies retain their package licenses. Character packs are local separate imports with their own provenance fields and unresolved private asset redistribution.
- The unchanged logo was generated by the project owner using BlueArchive-Style Logo Generator; source, output hash, generator MIT license and its credited-font boundary are recorded in [asset-provenance.md](asset-provenance.md). No generator font files or private character models are bundled.
- Research/capture images are reference material, not runtime default character packs; any chosen public source-package distribution needs its own accurate attribution review.
- Audits, startup, hardware and live-route results retain their source/environment identities. The final acceptance index and release command establish freshness; the provisional ordinary FPS miss and the measurement boundaries remain explicit.
- Classroom/world selection, secretary routing, autonomous dispatch, hosted management, child avatars/control, natural seated transitions and unverified provider/runtime variants remain outside this release scope.


## Independent product review

An independent Astra High reviewer audited issue #18, the R01–R17 map, all seven success scenarios, native/fixture/visual evidence boundaries, startup smoke and local asset provenance. The only new product-evidence gap was the missing distinct-avatar variant; `tests/e2e/release-scenarios.spec.ts` now supplies it while retaining the shared-avatar regressions. The reviewer verified different material bytes and hashes and inspected the unchanged-source scoped passing browser record from worker `1ea0593` (integrated as `397ea0e`). This clears all identified product gaps, subject to the final combined source gates.

The same review found no additional asset-provenance blocker within the selected local distribution: the owner-generated raster logo is accurately attributed without treating the generator's software license as a font/trademark grant, and private character/font files are not bundled. Actual hardware, live routing and audit evidence are recorded above and in `performance.md`. No source-review statement substitutes for those measurements.

An independent Astra High reviewer inspected all four current 1280×720 ordinary/reduced seated and exact-question captures in `artifacts/release/small-viewport-candidate-v2/` at `5cac1eb`, alongside the 1440×900 actual-character captures. Café/workstation framing, native material appearance, seated alignment and exact attention remain intact. Eight independent skeletons and stable per-agent geometry are recorded; immutable geometry sharing is expected. The accepted limits are small/rear-facing overview avatars and scrollable roster/chat; the small question captures show the lower card portion, not its complete text simultaneously. This is actual-asset visual evidence with synthetic task state, not live-provider proof.

The first small-viewport attempt is retained: its capture script incorrectly required unique immutable geometry UUIDs. The corrected assertion requires distinct skeletons and stable geometry instead. No application behavior was changed to satisfy it.
