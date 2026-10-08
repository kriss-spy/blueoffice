# Structured clarification

Verified against installed Hermes `f1247d2e0146bbd8edd4e510b9e67e0d259509a4` on 2026-10-08. [Native report](clarification/native-report.json), [browser report](clarification/browser-report.json), [desktop](clarification/desktop.png), [mobile](clarification/mobile.png).

Only a structured `clarify` frame creates an answerable question. The adapter preserves the exact frame ID and type, owning agent, runtime epoch, session, question IDs, option text and supported response schema. Malformed or unknown schemas become an unsupported-input card, with no coerced or truncated answer controls. The installed Hermes contract explicitly permits Other/free text; approvals retain their separate advertised-choice validator.

Single questions use `{answer}`; multi-select answers use a JSON array encoded as a string, as Hermes expects. Batches support either a final `{answers}` response or individual `clarify.lock` calls. Each acknowledged question is persisted and locked in the office UI; a final response contains only the remaining answers. BlueOffice deliberately makes confirmed questions immutable, although Hermes itself permits replacing a partial lock. The last native lock has an explicit acknowledgement that resolves the batch.

Final response frames have no native admission acknowledgement. Local delivery remains separate from closure: attention stays present while the authoritative native open-request snapshot still lists that exact ID. Cancellation events are processed before absence is interpreted as closure. Transport loss and supervisor recovery retain the known open request with unknown freshness, disable sending, and never resend an uncertain command. Explicit replacement of the runtime retires that old request, which remains visible in chat with its reason. This does not implement reconnect/resume reconciliation across process epochs (#8/#12).

The server persists command admission before delivery. A concurrent second submission, changed command fingerprint, wrong agent/session/epoch, unknown question ID, expired request or attempt to overwrite a locked answer is rejected visibly. A retry of the identical admitted command returns its receipt without another RPC. Question replies and locks never call `prompt.submit`.

Verification:

- Installed Hermes in a disposable network/profile namespace: single reply, batch partial lock and persisted readback, multi-select final tail, final-lock resolution, same-turn continuation, approval regression, interrupt and confirmed stop. The namespace uses a synthetic local provider; no host credentials or live model calls.
- Independent RPC process tests: numeric frame IDs, question while a tool is active, duplicate commands and competing submissions, foreign identity, malformed schema, ordinary prose, cancellation/expiry, delayed upstream closure and lost lock acknowledgement. Durable snapshots preserve confirmed and uncertain progress.
- Visible Chromium: keyboard selection/confirmation, two-tab conflict, reload with confirmed lock, multi-select tail, free-text Other, same-turn continuation, cancellation/expiry, unknown attention after disconnect, mobile width 390 without overflow and no page errors.

Commands: `npm test`, `npm run test:protocol`, `npm run build`, and `python3 scripts/hermes_probe.py --suite office --output artifacts/clarification`.
