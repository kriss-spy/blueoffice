# Gameplay and behavior capture

## Evidence boundary

Global English guides describe behavior; publisher screenshots demonstrate representative states. No client was played, no input replay was captured, and no combat equation or animation duration was measured. S01–S04 are source documents; E01–E12 are local image evidence. See `evidence/index.json` and `behavior/transitions.json`.

## Café loop — C12, observed documentation, S01

Visit → furnish → increase comfort → accrue/claim earnings; interact with visitors → relationship progress. Furniture supports Edit, presets, set effects, and character-specific animations. Gifts expose preference reactions above students. Rank changes comfort/storage limits. Café No.2 is separate and does not produce AP. Visitors refresh twice daily; taps have a three-hour interval and normal invitations a twenty-hour interval. This is a noncombat mode: there is no evidenced death/failure loop. Invalid placement and exhausted items are specimen interaction failures, not source loss conditions.

Source economy tables, relationship increments, footprint rules, set arithmetic, pathfinding, invitation probabilities, and exact persistence behavior are unresolved. These rules must not be invented as verified values.

## Formation and battle — C13, S02; C14, S03

Formation supports up to four active Strikers and rear support from Special students. The sampled formation shows two Special slots (E10). Starting skills are configurable; the current guide permits five for normal modes and nine for Final Restriction Release. Combat asks the player to choose roles, attack/defense affinities, and terrain suitability, then time manual skill use alongside autonomous student movement/attacks. AUTO can take over skills. Different weapon families have different range/area behavior. Character investment can change encounter difficulty.

Typical game-level loop, **inferred C15 from S02/S03**: prepare → enter encounter → observe autonomous combat → command skills → clear or fail → adjust formation/growth → retry. Exact skill deck rotation, cost regeneration, aim input sequence, cancellation behavior, timer rules, damage, targeting/collision order, and mode-specific victory conditions were not verified by controlled play. The specimen supplies a simplified interpretation below.

## Specimen: executable interpretation

All numerical defaults and original placeholder content are canonical in [game-config.json](game-config.json). The schema puts the status and units beside each parameter. For source-unknown parameters, `source_value: null` keeps the original unknown while `value` supplies the proposed fallback.

### Café

Room coordinates are integer tile origins `(x,z)` with half-open rectangular footprints. Two rectangles overlap iff `a.x < b.x+b.w && a.x+a.w > b.x && a.z < b.z+b.d && a.z+a.d > b.z`. Rotation swaps width/depth. A placement is valid iff in bounds, nonoverlapping, and inventory is available. Preview changes do not change placed furniture. Commit changes inventory, placement, and comfort together; Cancel/Escape changes none of these.

Comfort = min(cap, sum of placed item comfort). Proposed specimen earnings rate = base + comfort × factor, in credits per simulation second. Bank = min(storage, bank + rate × dt). Claim transfers floor(bank) to wallet and leaves the fraction. Visitor tap increases demo relationship if its cooldown expired. Gift selection makes preferences visible; recipient click spends one gift and increments relationship according to demo preference. These quantities are accelerated, original demo choices.

### Combat

Four placeholder Strikers attack automatically; two Special roles are represented through Heal/Shield commands. The specimen has one aggregate team HP pool and one enemy at a time. This abstraction does not reproduce separate student HP, cover, pathfinding, or the source skill deck. Cost regenerates to a cap. Select Burst → click enemy to spend cost and damage; select Heal/Shield → click team to spend cost and recover HP/enable shielding. Escape cancels before spending. Invalid/insufficient commands spend nothing. AUTO uses Heal below its health threshold, otherwise Burst when affordable.

For each tick: advance clock/cost; execute due automatic attacks; apply damage with shield multiplier; resolve team defeat first, then enemy defeat/wave advance, then timeout. An enemy defeat restores the next wave's HP, not team HP. Victory requires all waves; defeat occurs at zero team HP or timeout. Restart returns a fresh initial battle state. The ordering and all damage amounts are proposals.

### Time, presentation, and inputs

Use a fixed simulation step independent of rendering. Hidden tabs freeze; clear the accumulator on resume. Pause freezes both progression and cost. Long frame gaps are capped. No random mechanics; restart is repeatable for the same input schedule. Café projection maps `(x,z,h)` to `screenX = originX + (x-z)*tileX`, `screenY = originY + (x+z)*tileY - h`. `h` is in SVG drawing units, not game meters.

Pointer/touch: explicit tool selection, floor/actor targeting. Keyboard: Tab/Enter for controls and SVG target buttons, Escape to cancel, R to rotate placement, P to pause combat. The browser uses click-to-place and click-recipient as accessible alternatives to source gift drag/drop (E03). The code does not claim to reconstruct drag timing. Scene SVG scales uniformly; HTML controls wrap on small screens. Load config before enabling controls; show a visible load error if unavailable. Silence is intentional: source audio remains uncaptured.

## Proposed short encounter timeline

Start with cost available and four visible students. Wave 1 introduces Burst aiming; wave 2 increases incoming pressure; wave 3 requires healing/shielding or timely damage. Victory/failure stops progression and shows Restart. With no skills, incoming damage is intended to defeat the team. Exact wave stats, intervals, timer, and feedback durations are in the config; they are not Blue Archive encounter data.
