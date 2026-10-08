# Workstation editor verification (#14)

The editor controls local office placement and assignment state. It has no reference to Hermes, model routes, runtime commands, or chat actions. `POST /api/layout` uses the browser's existing CSRF session and an explicit base layout revision.

## Acceptance coverage

| Requirement | Implementation and evidence | Status |
| --- | --- | --- |
| Catalog, footprint ghost, select/place/move/delete, quarter-turn rotation, Undo/Redo, Save/Cancel | `LayoutEditor.tsx` supplies a floor plan, coordinate controls and the workstation catalog; scene previews draft placements. Tracked browser move/rotate/undo/redo/save/reload and invalid ghost/Cancel scenarios. | Offline checks pass; browser verification pending integration. |
| Bounds, overlap, interaction slots and blocked approach | `validateLayout` checks reserved rotated footprints, room furniture, approach cells and unique complete assigned workstations. `tests/layout.test.ts`. Failures use workstation IDs and readable reasons. | Deterministic checks pass. |
| Coherent desk/chair/computer/keyboard assembly, anchors carried by movement/rotation | All four children remain under one rotated origin in `Room.tsx`; assigned avatar and label positions use `worldAnchor`. Detachment updates component completeness and safely unassigns occupants. | Deterministic rotation/detachment checks pass; visual and seated alignment require combined pose review. |
| Live agent deletion/editing preserves execution and pending requests | `writeLayout` changes only `deskId` on the latest persisted agent body and writes assignment events in the same transaction. Root synchronizes only in-memory desk references. A reserved standing zone separates unassigned avatars from workstation footprints. | Store tests preserve exact live request data. Tracked browser test additionally compares every fixture command frame before/after editing. |
| Transactional versioned persistence and conflict detection | Durable schema-v1 layout revisions and agent references share a SQLite transaction. Revision comparison occurs inside `BEGIN IMMEDIATE`; assistant creation also versions assignment changes. | Store save/reload/stale-edit tests pass. Cross-tab browser test pending integration. |
| Previous valid revision recovery; undo sends no model commands | Every revision passes schema, geometry and assignment validation. Recovery writes a new monotonic revision with `recoveredFrom` and restores references while preserving agent request fields. Bad legacy desk references become unassigned. | Store corruption/legacy tests pass. Tracked browser corruption and frame equality tests pending integration. |
| Saved furniture inventory and Locate | Inventory lists saved/draft placements, rotation, completeness and assignee. `layoutInventory` counts functional components and six fixed room furniture instances. Locate passes a selected placement target to the camera. | Inventory implementation present; actual camera focus awaits combined pose changes/browser evidence. |

## Density accounting

The default room has eight workstation assemblies containing 32 functional furniture components (eight each of desk, chair, computer and keyboard), plus one cafe counter, three bar stools and two floor plants: 38 furniture instances. Decorative cups, mouse buttons, key rows, trim and mesh parts are excluded. Assemblies are the current editable catalog entry; independent free-standing furniture types remain future scope.

## Review scenarios

1. Start Hina, submit a fixture task that asks a question, and leave it unanswered. Enter Edit, remove unused workstations, move Hina's workstation, rotate it, undo/redo, save and reload. The same agent/session/turn/request must remain; fixture model-command frames must be identical.
2. Try an out-of-bounds or cafe-overlapping ghost. Read the placement failure. Detach the assigned chair: Hina must remain live and appear safely unassigned. Undo restores placement/assignment; Cancel discards the draft.
3. Open two editors. Save one, then Save the other: the latter must display a conflict and retain the newer room unchanged.
4. In disposable fixture data only, corrupt the latest layout row and reload. The previous valid revision and assignment must be restored visibly, with an increased revision and the unchanged open request.
5. Locate a saved rotated workstation through inventory. The elevated camera must center its world origin while keeping the same assistant selection and conversation.

## Worker evidence

- First offline gate: `artifacts/verification/2026-10-08T14-34-05.660Z-check-840d56a5/report.json`, passed.
- Legacy/reference follow-up gate: `artifacts/verification/2026-10-08T14-36-48.449Z-check-b0c640b4/report.json`, passed.
- Revision/reference audit gate: `artifacts/verification/2026-10-08T14-39-48.390Z-check-b853d8e8/report.json`, passed.
- Latest focused tests: ten layout/store tests pass; typecheck passes.

These records apply to the worker trees they fingerprint. Parent integration changes require fresh combined gates. Browser, camera and actual visual checks are explicitly outstanding until observed evidence is appended.
