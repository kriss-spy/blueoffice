# Character pack verification — #13

Date: 2026-10-08. Runtime integration is offline; no model calls are needed for importing or assigning presentation assets. This evidence does not substitute for the later performance, seated-work or release gates.

## Implemented and selected

The initial usable roster is explicitly **Yuuka (Original)**, asset `yuuka.original`, version `525ae0fa-normalized-v1`. The native normalized file SHA-256 is `a93f46c9f39c5bc51047f7301811e0affafebb8eac966fe30cac6e5e97f255ca`; its manifest reference is `13cc8829ab2e477cced3dc41a7f1f7d3633c3fdd0a50d200c54113acedfe510e`. The manifest includes canonical coordinates, offset/scale, feet/nameplate anchors, standing capability, exact café clip mappings, source attribution, unknown rights and explicit limitations. The [user guide](../character-packs.md) explains preparation and review.

Local registration and local visual suitability are distinct from redistribution permission. All character files and screen captures remain under ignored `artifacts/` or temporary local data roots. No GLB, source textures, or captured character images enter the repository or built web assets.

## Automated verification

- `npm test`: 61 tests pass. New registry/HTTP cases cover immutable metadata and content, exact restoration, complete review, persistent registry, local BIN dependency validation, missing versions and hash mismatch. Attacks include traversal, remote/encoded URIs, scripts/unsupported extensions, hash/size mismatch, malformed GLB, invalid accessors, missing clips and oversized texture headers. Invalid imports leave the registry and existing live agent snapshot unchanged.
- The HTTP scenario starts an independent fixture process, opens a question, assigns a reviewed pack, and compares the entire agent snapshot except its avatar fields. Profile/session/turn/message/request/receipt fields remain unchanged. Rejected replacements do not change even the avatar binding. Two assignments survive reopening the database. A separate real supervisor stop/start also retained both exact agent IDs and asset references.
- Resolver regression: native `react`, `walk`, `seated` or `Absent_Clip` animations cannot be selected without explicit mappings; absent capabilities fall back to mapped idle with a diagnostic.
- `npm run test:protocol`: 19 tests pass.
- `npm run build`: typecheck and production build pass. The existing ~988 KB shared scene bundle warning remains the separate #17 performance work.

## Actual-browser evidence

Visible Chromium at 1440×1000 and 1280×720 used a separate offline office. [Machine-readable result](character-packs/browser-summary.json).

1. Imported the actual normalized Yuuka pack through the file picker. It remained unassignable until a local visual review was saved.
2. Previewed every mapped clip: `Cafe_Idle`, `Cafe_Walk`, and `Cafe_Reaction`, with the same orthographic camera and lighting components as the office. Inspected full cycles and normal/close framing, native face layers and mouth masks, hair, body and halo; no material replacement, face hiding or transparency override was applied. Standing feet and nameplate anchors match the office. The known limitations explicitly exclude seated/typing behavior and automatic walking.
3. The two previews share geometry but have different skeleton IDs; changing the first clip leaves the duplicate playing idle. Assigned the same pack to two named agents in the live office.
4. During an open question, cleared and restored one agent's character. Its entire agent snapshot returned exactly to the original snapshot, including the unanswered request. Its mixer remained paused while the other agent's mixer advanced. Nameplates and exact attention controls stayed distinct.
5. Browser reload restored both versioned assignments and the pending request. Removing the on-disk character file produced labeled placeholders while question/status remained available. Restoring the file and refreshing the library recovered both avatars without changing the pending snapshot.
6. Imported an additional **unreviewed validation version** with a nested `models/avatar.glb` and local `models/payload.bin` through the folder picker. It rendered through declared local dependencies, remained unassignable without review, and left existing assignments/requests unchanged. This test version is not an additional initial-roster selection.

Captures: ignored `artifacts/character-packs/review-{idle,walk,react}.png`, `review-close.png`, `assigned-two.png`, `pending-assignment.png`, `reload.png`, `missing-file.png`, `1280x720.png`, `external-buffer.png`. Initial browser harness retries corrected a too-low accessor-count limit and a reload wait racing the lazy scene mount; the final pass is recorded above.
