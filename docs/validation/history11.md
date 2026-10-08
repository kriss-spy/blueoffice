# Activity history acceptance evidence

Issue: [#11](https://github.com/kriss-spy/blueoffice/issues/11). Installed Hermes revision: `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`; history schema: `30`.

The reader uses trusted native profile discovery, exact stored identifiers, a schema gated read-only SQLite metadata query and native `SessionDB(read_only=True)` public display projection. Native `session.list` excludes internal automation/tool sources, so that listing cannot satisfy All/Automation. The fallback does not start a gateway, access a provider, import a foreign transcript, write history or change any foreground session. An unsupported revision/schema fails with scoped safe diagnostics.

Run the installed synthetic reader probe with `python3 scripts/history_probe.py`. It uses bubblewrap private network/PID/IPC namespaces, immutable installed runtime/source mounts and a disposable profile. There is no unisolated fallback and no real provider call. Per-run evidence lives in `artifacts/history-probe/<attempt>/`. Passing attempt `1791470286147230986` verifies public native projection, distinct exact stored identity, CLI/cron source inclusion, cross-profile row rejection, removal of system/reasoning/hidden/metadata/tool-result secrets, compact redacted tool labels, unknown tool outcome, unavailable cost, the actual reader CLI/discovery boundary and unchanged database bytes. Two earlier failed attempts are retained: an invalid native title creation argument and the split projection helper's required native rebinding were corrected.

The helper is rebound through Hermes' own `session_history.register` seam with its pure display dependencies. This does not import the complete gateway or replace agent/provider behavior. Only public user/assistant text and compact tool name/context/identity/time leave the boundary. Raw tool arguments/results, system prompts, reasoning sidecars and arbitrary display metadata are excluded. Known managed proxy credentials are additionally removed at the runtime boundary.

The integrated worker browser run `npm run verify:ui -- tests/e2e/history.spec.ts` passed all three scenarios in `artifacts/verification/2026-10-08T14-50-07.831Z-ui-0da1df29/report.json`. A fourth regression scenario emits eight public deltas spaced beyond the list debounce and asserts that semantic status/binding updates, rather than every token/revision, determine history reads. Source choices are retained across filtered results.

The three-scenario run exercised the parent-authenticated endpoints and modal, explicit local-time filtering, keyboard selection, public search, immutable foreground identifiers and no new RPC commands from inspection, separate attention with pinned history, and scoped malformed/missing diagnostics without paths or secret canaries. The earlier integrated browser run retained its failed traces: two test locator defects (implicit select labeling and ambiguous list/detail alert text) were corrected before the passing retry.

## Criterion accounting

| Issue criterion | Evidence | Worker acceptance status |
|---|---|---|
| Agent/profile/source/start/last activity/state listing; Chats/Automation/All; agent/profile/source/time/attention/error filters; supported public search | `tests/history.test.ts`; native source probe; `tests/e2e/history.spec.ts` browser scenarios | Service/native and integrated browser verified |
| Office/live/stored identity correlation including lazy rows; no history database writes | Service tests with distinct live/stored IDs and an appearing persisted row retain the same opaque selection key; native probe exact stored addressing and byte hash | Verified in isolated service/native fixtures |
| Public conversation/tool timeline, provenance/ownership/capabilities/metrics and unavailable cost | Service detail tests; native public detail artifact; browser scenario | Native/service and visible detail verified |
| Unknown unfinished outcome; observed external history; disabled unsupported controls | Service and native tests; browser scenario checks no runtime command frames from inspection | Service and integrated browser verified |
| Selecting history preserves foreground and pin on live events; new attention separate | Service read never mutates office; browser pin/new live clarification scenario | Service and integrated browser verified |
| Keyboard selection and actionable malformed/missing history without secrets | Invalid opaque-key/path rejection, malformed reader fixture tests; keyboard and malformed browser scenarios | Service and integrated browser verified |

Mechanical gate: `npm run check` passed for increment `bf23d26`, evidence `artifacts/verification/2026-10-08T14-38-06.861Z-check-2f057b43/report.json`. Parent integration changes require new combined checks. The worker merged parent wiring in `e03daff` and its combined mechanical check passed at `artifacts/verification/2026-10-08T14-47-47.327Z-check-09f1d88b/report.json`. Parent owns authenticated endpoints, mounting, final combined full browser/integration gates and independent acceptance. The worker evidence accounts for #11 criteria; final acceptance and release completion remain parent responsibilities.

## Dependent contract findings

For #12, the existing installed protocol probe proves cold owned resume produces a fresh live ID with `resumed`/`session_key` retaining the stored binding. Native can reuse an already-live session, can resolve a compression tip, and restores stored model/provider overrides. Those behaviors require explicit office ownership/busy checks, fresh runtime admission and preserved requested/resolved stored provenance. Native cold resume may also auto-continue a crash marker by default (`desktop.auto_continue.enabled` defaults true); the office must prove and enforce suppression before treating resume as a passive context action. No new/resume capability is advertised yet.

For #21, the schema contains `parent_session_id`, but its edges cover compression/branch/reset as well as actual delegated children. The Activity reader advertises lineage unsupported until captured source events and edge typing are proved. No transcript heuristic or agent/avatar creation establishes parentage.
