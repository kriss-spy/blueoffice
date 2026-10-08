# BlueOffice verification workflow

Use this workflow to verify a change, integrate a worker branch, or prepare a release. The command definitions in `package.json` are authoritative. Product acceptance criteria remain in the GitHub issues and [implementation status](STATUS.md).

## Select the verification surface

| Command | Evidence | When required |
|---|---|---|
| `npm run check` | Formatting, mechanical lint rules, deterministic TypeScript/Python tests, typechecking and production build | Before committing or integrating code |
| `npm run verify:ui` | User-visible fixture flows in a real browser, with isolated server/data ownership | UI changes and final integration |
| `npm run verify:integration` | Installed Hermes protocol, owned runtime, profile settings and synthetic routing probes | Runtime, request, recovery, configuration or routing changes |
| `npm run verify:release` | Required automated gates plus explicit release acceptance | Before calling a release complete |

During implementation, run the affected test files and typecheck to shorten feedback. Run the required gates on the combined branch before integration. Repeat broader checks when changes, failures, or unresolved concerns justify them. The production build includes typechecking; a separate typecheck is useful during editing but redundant inside the final build gate.

## Setup and isolation

Install dependencies with `npm ci`. Use the Node and Python versions declared by the project and CI workflow. Install the test browser with `npx playwright install chromium`; CI installs its system dependencies too. `npm run verify:ui -- --headed` makes local browser checks visible.

Fixture browser checks start their own server on an available loopback port, use a fresh temporary data directory, wait for readiness, and clean up their owned processes. Each worktree runs with its own dependencies and evidence. Tests must operate on disposable profiles and synthetic histories; working office conversations are not test data.

Installed-Hermes verification requires the trusted installed launcher, the supported runtime dependencies, and Linux bubblewrap. A missing prerequisite is an unverified integration and a failed command, rather than a passing skip. These probes use a synthetic provider and private namespaces.

Live route admission remains an explicit, separate operation:

```sh
npm run verify:routes -- --live
```

It makes deliberately small real calls through CLIProxyAPI. Run it only when live routing acceptance is required. An offline browser or synthetic routing pass does not admit a live model route.

## Evidence and freshness

Each attempt creates a unique directory under `artifacts/verification/`, containing `report.json`, command logs and applicable browser/probe artifacts. The report records commands, exit statuses, elapsed time, runtime versions, Git commit, and a fingerprint of tracked and nonignored uncommitted files. Inspect the saved logs and browser artifacts when a check fails. Keep failed attempts available for diagnosis; a successful retry does not erase a flaky failure.

Success evidence is valid only for the tested code and environment. Changes during a run invalidate that attempt. Merging or rebasing a worker branch changes the combined tree: rerun the applicable gates before accepting the integration. A worker report locates useful evidence, but cannot establish that a later combined branch passes.

CI runs the offline and browser gates for PRs and pushes. Preserve result manifests, logs and failure traces as workflow artifacts. Once the workflow is established, require its named checks before merging to `main`. Each required job must actually run its checks; path filters or skips must not turn missing coverage into a reassuring status.

## Independent acceptance

Give the reviewer the originating issue, the current diff and a concrete user scenario. Derive assertions from the acceptance criteria rather than mirroring private implementation details. Useful scenarios include:

- Two agents wait for input. Answer one and reload; the other remains unanswered and neither task is resubmitted.
- A pending permission is denied. The exact decision persists across reload and another tab cannot replace it.
- Interrupt cancels the task but retains the runtime; Stop releases that agent's runtime.
- A disconnect preserves unknown attention and disables uncertain replies; recovery never replays an uncertain command.
- Avatar reassignment preserves profile, session and pending request identity; a missing asset gives a diagnostic.

Automated tests establish the behaviors they exercise. Visual material quality, seated workstation alignment, real-provider acceptance, dense-office resource budgets and usability need their own evidence. A successful fixture suite does not close those gates. Read the status ledger and relevant issue before reporting any release criterion passed.

## Completion

Before reporting a ticket complete, account for every acceptance criterion with a test, an observed result, or an explicit unverified status. Run the applicable commands and inspect their result manifests. Review specification fidelity and user-visible behavior independently of mechanical lint/type checks. Fix demonstrated failures and verify the correction; identify any remaining blocker precisely.

The verification workflow improves the evidence available for BlueOffice work. It does not itself declare the unfinished beta tickets or release accepted.

## Release acceptance

`npm run verify:release` runs the offline, browser and installed-Hermes gates. It remains nonzero with `needs-acceptance` until product scope, visual quality, performance and live routing have reviewed evidence. That is the expected result while the relevant beta gates remain open.

After those criteria are actually satisfied, copy [the deliberately unapproved example](release-acceptance.example.json) into `artifacts/release-acceptance.json` and provide the reviewed evidence:

```sh
npm run verify:release -- --acceptance artifacts/release-acceptance.json
```

The record binds the review to the `source.fingerprint` in a verification report. Each entry under `criteria` identifies `passed`, `reviewedBy`, a local `evidence` file under `artifacts/`, and its `evidenceSha256` for `product`, `visual`, `performance` and `liveRoutes`. A stale fingerprint, missing or changed evidence, escaped path or incomplete criterion fails acceptance. Record the originating requirements, observed behavior, measurements and limits in the referenced files.

These entries are explicit review attestations. The runner checks their presence and freshness; it cannot establish aesthetic quality or the truth of a reviewer assertion automatically. Mark a criterion passed only after inspecting its actual evidence against the issue or release requirements.
