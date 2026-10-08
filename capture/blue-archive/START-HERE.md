# Blue Archive capture

Captured **2026-10-08, Asia/Shanghai** from public online resources. Target: a portable design and behavior reference for BlueOffice, with the café as the primary reference and formation/combat as supporting context.

## Scope and status

**Buildable interpretation with a tested illustrative specimen.** This is an online reference capture, not a recording of a running game client. Global English Nexon guides form the main evidence; their illustrations span 2024–2026. The café guide states that its information is current to 2026-09-15. An exact installed game build is unknown. Japanese fan-kit resources are identified separately.

The package includes 12 original guide images, their origins and hashes, visual rules, café and combat behavior, proposed numerical defaults, an asset manifest, and a dependency-free browser specimen. Its character drawings are original placeholders. Actual game models, furniture geometry, voice, music, and exact animation timing are not bundled.

## Read and run

1. [DESIGN.md](DESIGN.md): what makes the reference recognizable.
2. [GAMEPLAY.md](GAMEPLAY.md): decisions, loops, and source boundaries.
3. [SCREEN-ATLAS.md](SCREEN-ATLAS.md): original images and screen coverage.
4. [behavior/transitions.json](behavior/transitions.json), [tokens.json](tokens.json), [game-config.json](game-config.json): machine-readable contracts. Only these files define specimen numerical parameters.
5. [assets/manifest.json](assets/manifest.json): supplied evidence, reference-only assets, and replacement briefs.
6. [acceptance.md](acceptance.md): verification and unresolved fidelity.

From this folder, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the specimen](http://127.0.0.1:8765/specimen/). Requires Python 3 for serving and a modern browser supporting SVG, ES modules, Fetch, and structuredClone. No npm installation, backend, account, model call, or remote media load is required. Evidence remains under `evidence/images/` and is displayed only in the reference gallery; it is not used as playable scenery.

## Signature qualities, in priority order

1. Characters inhabit a furnished oblique room; the room is the main surface, and menus sit at its edges.
2. Chibi silhouettes, expressive faces, and separate floating halos make occupants recognizable at room scale.
3. Pale geometric panels, navy text/icons, cyan actions, and restrained yellow emphasis unite dense menus with the room.
4. A small gesture produces feedback at the character, close to the player's attention.
5. Autonomous activity and deliberate commands coexist. Café furnishing and relationship interactions create a quiet loop; combat asks for team composition and timed skill decisions.

First implementation milestone: one room, one properly rendered authorized avatar, one interactive furniture object, selection/reaction, and explicit Edit mode. Compare against E01/E02/E03 before adding roster size or decorative complexity. The specimen demonstrates these relationships with placeholders and also includes a simplified combat decision loop.

## Limits that require further capture

Obtain a short recording of café entry → idle/walk → tap → gift → furniture interaction → Edit/placement → earnings/return. For combat, record formation → deployment → manual skill targeting/cancel → damage → victory and failure/retry. Exact motion, camera controls, targeting slowdown, pathfinding, damage formulas, and sound mix remain unknown. A clean post-August-2026 lobby screenshot is also needed. Do not treat annotated guide composites as raw client screenshots.
