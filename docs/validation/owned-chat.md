# Owned runtime and chat verification — ticket #3

Recorded 2026-10-08 on Linux, Node.js 22.17.1, Python 3.12.3 and Chromium 153.0.8010.12. This verifies the DOM control loop with the scene disabled. It does not pass character, workstation, room, or full-release gates.

## Installed Hermes integration

`python3 scripts/hermes_probe.py --suite office --output artifacts/office-runtime` passed using installed Hermes revision `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`. The [report](owned-chat/installed-runtime-report.json) records source fingerprints and synthetic provider call metadata.

The test drives the production TypeScript Office, SQLite store, HermesRuntime profile provisioning and owned Python gateway through the actual installed interpreter/gateway. Bubblewrap exposes only disposable profiles and a synthetic provider on private loopback port 8317. No real credential or live model is used. It checks:

- New canonical profile, exclusive process lease, readiness/capability handshake, distinct live and stored session bindings.
- Public stream, native clarification frame, exact reply, same-turn completion and foreground release.
- Native approval with distinct frame/inner IDs, denial, and observed request resolution.
- Native interruption with interrupted outcome while the runtime stays ready, followed by actual owned child exit on Stop.

This caught and fixed a snapshot/event race: a snapshot sampled before native foreground release could arrive after the settled `session.info` and overwrite `busy=false`. Terminal reconciliation now only releases busy state; it cannot restore an older busy value.

## Automated isolation and failure checks

`npm test`: **11 passed**. Covers one foreground turn, duplicate command IDs, stable identity/new epochs, public-only projection, tool failure versus turn success, interrupt versus stop, exact human-input admission and cross-agent/stale/two-tab rejection, unsupported private input, startup failure, unexpected exit, unrelated-process protection, lost acknowledgement, startup deadline, forced stop, and crash recovery.

`python3 -m unittest discover -s tests -v`: **10 passed**. Includes actual wrapper tests for the profile lease and parent-death termination, and the server data lease surviving exec into Node. After killing the owned test supervisor, the orphan child releases its kernel lease. A duplicate server is rejected before opening the database. Existing protocol/evidence regression tests pass.

`npm run build`: strict TypeScript and Vite production build passed. HTTP tests verify Host, Origin, same-origin session/cookie, CSRF, body schemas and authenticated snapshot/SSE access. No process-name lookup or saved-PID signal path exists.

## Browser checks

Visible Chromium against the explicitly labeled offline RPC fixture passed with no page errors. The [browser report](owned-chat/blueoffice-browser-report.json) records create/start, browser close preserving the same runtime epoch, prompt/tool/completion, refresh of the same pending question, keyboard reply/denial, interruption and stop. Mobile width 390 has no horizontal overflow. Hidden reasoning, system prompts and raw tool result canaries remain absent.

Screenshots: [question at 1440](owned-chat/blueoffice-question-1440.png), [chat at 1280](owned-chat/blueoffice-chat-1280.png), [mobile](owned-chat/blueoffice-chat-mobile.png).

## Implementation boundaries

Office identity, public transcript, requests and receipt registry persist separately from native Hermes data. Browser SSE reconnect obtains the durable current snapshot without replaying commands. Server restart marks prior ownership/request delivery unknown; it does not adopt or signal a saved PID. Explicit Start attempts the canonical lease and creates a new runtime epoch/conversation. The previous runtime must release its lease first.

Advanced request multiselect/partial locks (#6), permission persistence (#7), complete normalized event replay and gap recovery (#8), native history/resume (#11/#12), and provider-route verification (#4) remain open. The single-turn installed test validates the adapter against a synthetic Chat Completions provider; it does not claim real GLM or Muse connectivity. Character/desk references are persisted but intentionally unassigned until the asset and room workflows exist.
