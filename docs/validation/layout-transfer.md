# Portable layout transfer (#20)

The version-1 manifest is a reference-only allowlist: format/schema/workstation version, placement origins and quarter turns, workstation component completeness, source agent IDs and desk/character bindings, and exact asset IDs/versions/SHA-256. Optional package paths are plain relative paths; they are informational and never used to load files. Export omits paths by default and excludes character bytes, names, profile paths, workspace, credentials, configuration, sessions, questions and transcripts.

## Import semantics

Preview validates the entire document before any application: strict fields, supported versions, IDs, relative paths, footprints, bounds, approach/standing cells and declared exact assets. Character references cannot omit a version or digest. Missing, mismatched or unreviewed exact packs produce a placeholder diagnostic; another version is never substituted and import does not bypass character review.

Every source agent reference has a visible explicit binding to an existing local assistant or remains unresolved. Unknown source IDs default to unresolved and never create or start an assistant. Unresolved source references persist through reload and re-export. Rebinding requires a fresh preview, and target IDs must be current and unique. The preview explicitly reports local assistants that will become unassigned because their workstation is removed or occupied by an explicit imported binding. Unbound locals keep their characters and current tasks.

An unresolved source ID that also identifies a current local assistant would make portable export ambiguous. Export returns a readable conflict asking the user to explicitly bind that reference instead of silently dropping either binding. Missing workstation references remain diagnostic references; a bound assistant uses safe standing until a complete workstation exists.

Apply uses the editor's base revision and one SQLite transaction for placements, assignments, character references, durable unresolved references and assignment events. All current runtime/request/message fields are copied from the latest stored agent state; there are no runtime/model calls. Stale, malformed or invalid application rolls back. Revisions preserve exact character bindings, while ordinary character reassignment versions the newer binding so later layout save/recovery retains it. Source refs bound to local assistants re-export the local assistant's current desk/character reference; unresolved refs preserve their source values.

## Evidence

- Eight deterministic transfer tests passed in the worker's required offline gate: `artifacts/verification/2026-10-08T15-13-49.384Z-check-988aef47/report.json`.
- Tests cover private-field exclusion, rotated assigned round trip, exact missing/mismatched/unreviewed diagnostics, unresolved-agent persistence, malformed/version/traversal/bounds rejection, explicit binding conflicts and displacement reporting, stale application, and import A → ordinary character B → save → corrupt-layout recovery retaining B.
- Four tracked fixture browser scenarios are written in `tests/e2e/layout-transfer.spec.ts`: real downloaded JSON/privacy and rotated missing-character round trip during pending input; invalid previews; competing editor revision; unknown references across reload/re-export.
- Browser execution and assigned-character loader review enforcement remain pending root endpoint/UI integration. This document does not claim issue or release acceptance.

## Review scenario

Start Hina and leave a fixture question unanswered. Export the manifest and inspect its keys and asset references. Import a rotated workstation with an unavailable exact character; read the preview, apply and reload. Hina's exact agent/session/turn/question identity must remain and a diagnostic placeholder must preserve the exact character reference. Repeat with a foreign agent ID: no assistant is created and the reference survives re-export. Change a binding, refresh its displacement report, and compete with a second editor before Apply to verify the stale revision cannot replace the newer office.
