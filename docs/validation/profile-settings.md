# Profile settings and adoption — ticket #5 progress

Verified 2026-10-08 against installed Hermes `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`, Node.js 22.17.1 and Chromium 153.0.8010.12. This implements profile setup, editing and adoption. Catalog-backed avatar/workstation selection is now integrated with #13/#14; final combined review is pending.

## Implemented behavior

New-profile setup collects the name, workspace, verified model/API family, persona/SOUL, tool groups and command-approval mode. Profiles are created independently, with an empty credential environment and no copied history, schedules or authentication. The settings dialog reads the selected profile's allowlisted values; arbitrary configuration, credential values and private persona text do not enter ordinary office snapshots. Native profile configuration is read and atomically saved through Hermes' own configuration primitives, with semantic unknown-key preservation. SOUL is published separately and read back.

All runtime-affecting profile changes require a stopped owned runtime. Starting and saving cannot race inside the supervisor, and the same canonical-profile kernel lease guards filesystem writes and runtime ownership. The name updates immediately; profile defaults apply at the next start. No session override is presented as a saved profile default. Model changes repin the verified foreground, auxiliary and delegation routes.

Revision fingerprints cover configuration, persona, profile metadata, environment/authentication files and ownership. A stale browser editor or detected external edit is rejected with reload guidance. Each save reports actual readback by section, including partial success. A persona changed during configuration publication is preserved and reported as a conflict. Config revision records and name/model/workspace changes survive server reload.

Adoption first inspects the canonical home, existing office ownership, kernel lease, current-user Hermes processes and default multiplexer. The form requires acknowledgement of the managed single-writer policy. Adoption changes selected profile settings and routing while retaining that profile's private credentials/history; it does not copy them into another profile. A durable SQLite adoption intent precedes the filesystem claim. If a database write or helper response is lost, startup can restore the association only when the marker matches that intent's owner ID, without replaying the configuration operation. Unclaimed or unreadable intents remain visible for explicit inspection/retry.

Manual approvals reject a profile `.env` or `.op.env` definition of `HERMES_YOLO_MODE` before saving/adopting and again at launch. Enabled external environment sources remain unsupported for manual approvals until their effective policy can be verified. Disabled native source defaults are allowed. The child starts with `HERMES_YOLO_MODE=0` so a source-checkout fallback cannot silently enable it. Credential files are never rewritten to remove a conflict.

## Evidence

- [Native report](profile-settings/native-report.json): actual native configuration read/save/readback, unknown-section preservation, stale/external edit rejection, real Hermes launch and synthetic turn, active-runtime rejection, second-profile adoption, model-route change, native dotenv approval conflict rejection and duplicate-owner rejection. The suite runs in a private network/process namespace with disposable profiles and one synthetic provider call; no live credentials, models or existing conversations are used.
- TypeScript: 25 tests pass, including settings persistence/reload, stale editors, lifecycle races, explicit adoption, and injected database/response-loss recovery. Python: 19 tests pass, including section-level failure, concurrent persona edits, approval overrides, canonical aliases, ownership conflicts and linked-file rejection.
- [Browser report](profile-settings/browser-report.json): setup/readback, model/name/persona changes, runtime-disabled saving, external conflict/reload, two-editor conflict, explicit adoption, retained private credentials, browser refresh, mobile overflow and keyboard close. Zero page errors. [Desktop](profile-settings/saved-desktop.png) and [mobile](profile-settings/mobile.png) screenshots were inspected.
- Strict typechecking and production build pass. [Independent review](profile-settings-review.md) cleared the implementation corrections.

## Limits and next work

The editor intentionally exposes only the proved model routes and the terminal/file/clarification tool groups; unsupported inherited settings require explicit selection before saving. Native general configuration writes have no cross-process compare-and-swap. BlueOffice serializes its own writers and rejects observed revision conflicts; the adoption policy requires other editors/runtimes to be stopped and does not interlock arbitrary external editors that ignore it. Linked managed settings files are rejected rather than followed. Setup now collects an exact reviewed character (or a diagnostic placeholder) and a complete free workstation (or explicitly unassigned). A reservation precedes asynchronous profile writes, including adoption recovery, and concurrent layout edits are refused during setup. Invalid character references fail before profile writes. This is not release acceptance.

```sh
npm test
npm run build
python3 -m unittest discover -s tests -v
python3 scripts/hermes_probe.py --suite profiles --output artifacts/profiles
```

## Assignment completion evidence

`tests/setup.test.ts` covers reservations and failed-setup release, independent reused-avatar identities, restart persistence, recovery after lost adoption response, and HTTP character validation before profile writes. `tests/e2e/setup.spec.ts` exercises new and adopted setup through native browser selectors. `tests/e2e/setup-overview.spec.ts` demonstrates independent prompts, question/denial, stop and configuration with two assistants sharing one reviewed fixture character. The combined offline and installed integration gates passed on `0dc2cf5`; the initial full browser attempt passed 21 of 22 scenarios and identified a portable-import focus escape, corrected separately. Final combined gates and independent acceptance are required before closure.
