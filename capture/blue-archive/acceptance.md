# Acceptance and verification

## Capture completeness

**Reference coverage:** 12 unmodified publisher guide images, source/claim IDs, source dates, SHA-256 hashes, café feature loop, formation composition, cropped combat impacts, student detail composition, asset provenance, and known update differences. All bundled source images were visually inspected. Metadata inspection of a pinned Yuuka GLB confirms 38 named clips, including café idle/walk/reaction, 11 meshes, three skins, and 14 image records. It does not validate rendered models or clip behavior.

**Not captured:** direct game input, videos/replays, exact installed build, clean current lobby, full combat HUD, loading/errors, navigation transition timing, exact camera, audio, all gameplay modes, furniture geometry, or client formulas. Do not describe this as an exact reconstruction or a complete game capture.

## Implementation completeness

The specimen runs locally with original SVG placeholders. It implements café furnishing with inventory/bounds/overlap validation, rotation, cancellation, gifting/tap feedback, capped accelerated earnings, and collection. Its combat demonstration implements autonomous attacks, aimed skills, resource guards, healing/shielding, AUTO, pause, victory, defeat, timeout, and restart.

There is no game account, progression save, gacha, actual game asset runtime, per-student combat model, furniture animation, 3D renderer, or Hermes integration. The evidence gallery is separate from the playable scene.

## Automated verification

Run from this folder:

```sh
node specimen/verify.mjs
```

Verified on Linux with Node.js **v22.17.1**, 2026-10-08. Fourteen model scenarios passed: transactional bounds rejection, overlap rejection, rotated footprint, storage cap/claim without duplicate transfer, tap cooldown, gift exhaustion, store all, target/cost guards, pause freeze, no-input defeat, AUTO clear, terminal freeze, restart initialization, and timeout defeat.

Under the fixed 1/60-second proposed simulation, no-input defeat occurred at **22.50 simulation seconds**; AUTO cleared at **43.02 simulation seconds**. These are measured specimen outcomes, not Blue Archive timings. No performance benchmark or source-equivalence tolerance is claimed.

## Browser checks

Browser: Codex in-app browser on Linux, default viewport approximately 1265 × 713 CSS pixels. Results are recorded in [evidence/verification.json](evidence/verification.json). Checks include observed placement rejection with unchanged comfort, gift spending/reaction, claim feedback, manual Burst targeting/cost, pause, and console output. Saved specimen screenshots document the tested states; their art is original placeholder art.

Keyboard targets preserve focus during periodic scene redraws. Reduced motion disables decorative bobbing through the media query. Hidden-tab handling clears the accumulator and skips progression. These code paths are implemented; full screen-reader, touch-device, reduced-motion, and hidden-tab interactive tests remain unrun unless the verification record states otherwise.

## Fidelity acceptance for the next implementation

| Dimension | Scenario / expected result | Compare with | Current status |
|---|---|---|---|
| Room composition | Floor and rear walls dominate; controls remain near screen edges | E01, E03 | Relationships demonstrated; projection/art approximate |
| Character readability | Distinct silhouette, face and halo readable at room scale | E03, E10 | Generic placeholders; identity not reproduced |
| Inventory | Categories, ownership, interaction indication, install action | E02, E07 | Documented and gallery-visible; simplified specimen item strip |
| Selection/reaction | Input gives local overhead feedback | E03 | Demo feedback exercised; source cadence unknown |
| Statistics | Comfort/earnings remain readable as a paired resource view | E04, E05 | Simplified readouts and claim exercised |
| Combat decisions | Autonomous action plus deliberate skill targeting | S03, E11 | Simplified functional loop; exact rules unverified |
| Motion and sound | Match idle/walk/react, selection, loading and transition cadence | Missing recording | Not verified; collect short client recording |
| Performance | Measure target hardware with intended 3D assets and occupant count | No source benchmark | Not run; SVG specimen proves no production 3D budget |

Acceptance is based on observable relationships, not fabricated pixel/timing tolerances. Establish tolerances only after clean reference frames and a recorded interaction sequence exist. Keep source uncertainty visible while replacing the generic art.
