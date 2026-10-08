# Exact permission requests

Verified 2026-10-08 against installed Hermes `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`. [Native evidence](approval/native-report.json), [browser evidence](approval/browser-report.json), [desktop](approval/desktop.png), [mobile](approval/mobile.png).

Approval has its own `hermes.approval.v1` schema and shield/lock card. The adapter preserves the exact RPC frame ID and type, inner approval ID, owner, epoch and live session. It accepts only advertised `once`, `session`, `always`, or `deny` choices. Unknown choices, missing identifiers, duplicate choices and contradictory grant capabilities become unsupported input with no grant controls. It projects only public description and upstream-redacted command context; private metadata and pattern keys are excluded. Hermes forces command credential redaction before emitting the request, and BlueOffice additionally redacts its known proxy key.

A decision records its exact choice, command ID, timestamp and pending/delivered/unknown delivery state before transmission. “Decision recorded: Deny” survives browser reload and durable snapshot readback. It is separate from verified request closure: a response frame has no native admission acknowledgement, so attention remains until native replay confirms absence or a resolution/expiry event arrives. Native `request.cancel` reason `resolved` is resolution, not expiry. No locally recorded decision is inferred for an externally resolved request. A supervisor restart marks an admitted-but-unconfirmed decision's delivery unknown and never resends it.

Only a permission button invokes the exact structured reply. Generic chat cannot submit while attention is pending; malformed reply shapes, broad `all` responses, wrong session/agent/epoch, duplicate commands and closed requests are rejected. A repeated identical command returns its previous receipt without another response. Selecting attention focuses the request container; it does not focus or activate a grant. Keyboard decision activation returns focus to the outcome. Ordinary scene selection and timers do not invoke a reply.

Secret, sudo and vault input remain explicitly unsupported. Their private fields are omitted from ordinary snapshots, transcripts and diagnostics; the card offers interruption to end the wait. BlueOffice does not collect or echo those values.

Verification:

- Native Hermes with a synthetic provider inside a disposable network/profile/filesystem namespace: a real terminal permission contains redacted credential-shaped test text. Deny preserves the sentinel file; a subsequent Allow once removes only the disposable sentinel, and each exact decision persists. This proves action outcomes rather than only observing an RPC write. No host credentials, proxy configuration edits or live model calls.
- Independent RPC process fixtures: every supported choice, immutable command IDs, concurrent duplicates, wrong epoch/session/agent, cancellation/expiry, external resolution, delayed closure, lost reply acknowledgement, restart before confirmed delivery, unknown schemas, long exact inner IDs, and secret/sudo/vault suppression.
- Visible Chromium: distinct shield card, actual advertised controls, two-tab rejection with visible error, Deny readback after reload, keyboard Allow once and attention focus, expiry/interruption without approval, private-input unsupported path, unknown transport and mobile width 390 without overflow. No page errors.

Commands: `npm test`, `npm run test:protocol`, `npm run build`, `python3 scripts/hermes_probe.py --suite office --output artifacts/approval`.

Limit: decision delivery and native closure are reported separately; neither a local click nor a successful pipe write alone proves the permitted action ran. Cross-process replay/resume remains #8/#12. Session/permanent scope is controlled by Hermes and exposed only when advertised; these tests do not claim persistence of every native tool-specific allowlist pattern.

Final checks: 38 TypeScript tests, 19 Python tests and the production build pass. [Independent reviews](approval-review.md) report zero Standards findings and zero Spec findings.
