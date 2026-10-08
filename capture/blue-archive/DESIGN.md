# Visual and interaction contract

Evidence IDs resolve in [evidence/index.json](evidence/index.json); claims have canonical status records in [evidence/claims.json](evidence/claims.json). `Observed` here means inspected in a still image or source document, not played. Proposed numbers in `tokens.json` are adaptation defaults, not sampled game values.

## Composition

**C01 — observed, E01/E03.** The café is a room viewed obliquely into a rear corner. The floor is a large continuous plane; two visible walls establish a bounded stage. Furnishings and students occupy that plane. The bottom-left tool strip groups Edit, Gifts, Furniture, Presets, and Store All; bottom-right dark cards show Comfort and Earnings. A top bar holds back/navigation and resources. Preserve the room as the dominant area, rather than reducing it to a thumbnail beside large dashboard cards.

E01 is intentionally dimmed and annotated by the publisher. Its large outlined explanatory text, glow, and arrows are tutorial markup, not persistent in-game chrome. Do not reproduce that overlay in the normal office.

**C02 — inferred, E01/E03.** A fixed oblique orthographic camera is a practical way to reproduce the diorama relationship. The original projection type, lens, elevation, and world scale cannot be established from these pictures. Specimen uses an explicit affine isometric-style projection, documented in `game-config.json`; production Three.js camera settings still need visual comparison.

## Character and object hierarchy

**C03 — observed, E03/E09.** Heads are large relative to bodies, faces remain legible at reduced scale, costume/hair silhouettes separate students, and halos float independently above them. Furniture uses simplified forms and clear edges. Anchor reactions above the head/halo with enough separation to avoid hiding identity. Sort feet and furniture by depth; let foreground objects occlude occupants consistently.

Replacement brief: model original chibi occupants with a large head, compact body, distinct hair silhouette, simple clothing contrast, and an independent halo node. Provide idle/walk/reaction and seated work clips. These are art requirements, not an assertion that a source export supplies a typing clip.

## Color, material, and typography

**C04 — observed, E02/E04/E05/E07.** White and very pale blue panels carry dense information; navy carries labels and icons. Cyan identifies active/install actions. Yellow emphasizes selection or a consequential claim action. Background triangles/diagonal geometry sit below content contrast. Furniture imagery occupies the middle of cards, with labels/counts/actions in predictable bands.

Use warm pale flooring against cooler walls/UI, then saturated character accents against that quieter setting. Avoid applying vivid cyan to every object: contrast should reserve attention for actors and decisions. The screenshots do not establish exact shader, lighting, outline width, material roughness, or color-management settings.

**C05 — unknown font; proposed fallback.** Exact English/Japanese game typefaces were not identified. Use system sans-serif for the specimen; medium/bold headings and tabular numbers establish roles. Browser fallback metrics will differ from the client. A supplied logo or a font used by a fan logo generator does not identify the UI font.

## Screen families

**C06 — observed, E02/E07.** Inventory is a large modal: category rail on the left, filters above the cards, item image, rarity/interaction badge, ownership count, inspect and Install actions. Selected furniture has local manipulation controls. These views are functional collections rather than decorative character cards.

**C07 — observed, E04/E05/E08.** Information and confirmation use pale panels with centered headings, a small yellow underline, top-right Close, and large footer actions. Statistics are grouped into labeled columns/cards. E08 pairs a furniture object with a video confirmation dialog; it does not supply video playback timing.

**C08 — observed, E09/E10.** Formation moves chibi students to the foreground: unit tabs at left, four Striker positions across the stage, Special cards beneath, management actions at right. The sampled screen has one vacant Striker and one vacant Special slot. Halos/costumes carry identity; readable labels remain necessary.

**C09 — observed, E11/E12.** Combat reference crops show high-contrast impact flashes, damage numbers, HP information, and different attack footprints. A full clean combat HUD was not captured. Preserve encounter readability first; effects must not erase target or state information.

**C10 — observed text, S04.** Global lobby/campaign/recruitment UI changed in the August 2026 update; a default night lobby was added. This package has no verified clean image of that new layout. Formation E09 is a newer starting-skill illustration, whereas E10 retains an older instructional composition. Keep those dates separate.

## Motion and feedback

**C11 — source-documented, S01/E03/E07.** Tapping/gifting a visitor and character-specific furniture interactions are distinct activities; gift preference appears as overhead reactions. Still images establish feedback location, not motion duration or sound. Source walk speed, reaction cadence, transition easing, camera movement, click sound, and audio concurrency remain unknown.

**Proposed browser adaptation:** use brief local reactions, subtle idle movement, and interruptible selection. Reduce cosmetic motion for `prefers-reduced-motion`; retain explicit text status and targeting indicators. Keep camera and modal animation from moving hit targets during interaction. Every displayed specimen timing is provisional.

## BlueOffice translation

Reuse room hierarchy, stable occupants, furniture anchors, compact controls, and anchored attention cues. Agent selection opens real session information; questions retain exact runtime identities. Café ranks, AP, gifting, and monetization are game references, not office requirements. The specimen's café/combat loops are for studying the source and do not implement Hermes integration.
