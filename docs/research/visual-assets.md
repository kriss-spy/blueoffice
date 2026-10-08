# BlueOffice: café reference, visual architecture, and asset feasibility

Research date: **2026-10-08**, Asia/Shanghai. Scope: establish a practical way to create the requested Blue Archive café-like office, with real chibi avatars, furniture, status motion, and a default 2.5D camera. This is research and a proposed production pipeline; no game models, game audio, or artwork were copied into this repository, and no runtime or asset-generation service was installed or run.

Evidence labels used below: **verified** means read from a first-party policy, tool documentation, asset creator page, repository, or live UI; **observed** means visible in a reference image/UI; **proposed** means our product or implementation recommendation; **unverified** identifies an unresolved capability or permission. Community sites are primary evidence about their own offerings, not authoritative permission from the game's IP owners.

## 1. Recommendation

Build the office as a **real 3D diorama inside a conventional web application**, rendered with Three.js / React Three Fiber, with an oblique orthographic camera as the default. Place the chat, agent overview, activity overview, and attention queue in normal HTML beside and over the scene. Treat the character pack and furniture pack as replaceable content, separate from agent identity and runtime state.

The supplied model reference is considerably more useful than a generic 3D marketplace search: a community repository already contains GLB character exports, and inspected Yuuka metadata includes café idle, walk, and reaction clips. This removes an important technical unknown. It does **not** establish a reuse or redistribution license. Specific office actions, especially sitting at an arbitrary desk and typing on a keyboard, still need compatibility work or newly authored animation.

Use the intended Blue Archive character mapping as the target experience. Keep a separately packaged avatar provider so the same office can also load user-provided authorized packs, commissioned models, or original chibi placeholders. A fallback is an engineering contingency; it should not silently replace the user's requested characters.

## 2. What the café reference actually establishes

The official Nexon café guide describes furniture catalog placement, an Edit mode, layout presets, tapping students, overhead gift reaction icons, character-specific furniture interactions with special animations, and an interaction toggle. Its screenshots show a bounded oblique room, visible floor and rear walls, chibi figures, bright pale surfaces, and compact screen-edge controls. The room occupies the main view while functional menus overlay it. These are verified features and observed composition. The guide's live footer says its information is current to 2026-09-15. [Official café guide](https://forum.nexon.com/bluearchive-en/board_view?board=3222&thread=2523171)

We did **not** measure the game's projection matrix, camera elevation, pan limits, collision logic, or full animation timing. Calling its appearance “2.5D” describes the desired presentation, not a verified statement that the game uses a particular orthographic camera implementation.

Proposed adaptation:

| Reference quality | BlueOffice requirement | Implementation consequence |
|---|---|---|
| Oblique furnished room | Office as the dominant default view | 3D floor, two rear walls, desks, monitors, chairs, small props; camera looks into an open corner |
| Recognizable chibi characters | One stable avatar per Hermes agent | Agent identity owns avatar configuration; sessions reuse that identity |
| Overhead expressions | Agent attention/state readable at a glance | Anchored question mark, approval symbol, tool badge, error marker; text status available in HTML |
| Character/furniture interaction | A workstation feels occupied | Furniture exposes authored seat/work/standing anchors and animation capabilities |
| Furniture editing and presets | Personal office configuration | Separate Edit mode, footprint snapping, rotate, undo, save preset; ordinary clicks select agents |
| Bright compact UI | Side chat and useful overviews | Pale surfaces, restrained cyan accents, generous text contrast, concise labels |

Do not transfer game economy mechanics into productivity requirements. Comfort, gifts, rank, visitor scheduling, and earned currency are not prerequisites for the office.

## 3. Supplied resources: usefulness and limits

### 3.1 Character GLBs: a concrete technical route

The [community Models page](https://bluearchive.wiki/wiki/Models) explicitly describes its contents as models from the game, warns that viewer rendering can differ from in-game colors, and points to [lihaohong6/BlueArchiveModels](https://github.com/lihaohong6/BlueArchiveModels). The pinned snapshot below contains **295 `.glb` files and `models.json`**; no README or license file appeared in its complete, non-truncated tree. [Pinned repository tree API](https://api.github.com/repos/lihaohong6/BlueArchiveModels/git/trees/525ae0faeb0a89f54ef4023f3be3692dcb529e51?recursive=1)

**Read-only metadata inspection:** HTTP ranges read the GLB header and JSON chunk into memory; no mesh/texture asset was saved. `Yuuka.glb` is glTF 2.0, **5,083,936 bytes**, with 11 meshes, 3 skins, 14 embedded images, and 38 animation clips. Its generator identifies `blue-archive model_viewer/export_models.py`. Clip names include `Cafe_Idle`, `Cafe_Walk`, `Cafe_Reaction`, `Formation_Idle`, `Formation_Pickup`, `Victory_Start`, `Victory_End`, and `Public01`. The metadata also contains morph targets and separate body, face, hair, mouth, weapon, calculator, and halo materials. [Pinned inspected Yuuka file](https://github.com/lihaohong6/BlueArchiveModels/blob/525ae0faeb0a89f54ef4023f3be3692dcb529e51/Yuuka.glb)

Reproducibility record: commit `525ae0faeb0a89f54ef4023f3be3692dcb529e51` (committed `2026-10-03T08:09:21Z`); Yuuka Git blob `9cd4936e8e77e85f9e368a878a6a0be26047766c`. The tree returned 296 blobs without truncation. Against the commit-pinned raw URL, both range requests returned HTTP 206: `bytes=0-19`, then `bytes=20-1971067`. The first 20 bytes were unpacked as little-endian `<4sIIII` (magic, version, total length, JSON-chunk length, chunk type); the JSON length was 1,971,048 bytes and type `0x4e4f534a`. JSON inspection used `asset`, array lengths of `meshes`/`skins`/`images`/`animations`, `animations[].name`, `materials[].name`, `skins[].joints`, and `meshes[].primitives[].targets`. No binary geometry, texture bytes, or animation samples were requested. Raw-file ETag: `227db6ec09bb37d5b1fc0408d2c43cf95fc972708d128847c9149f0989059736`.

This proves that at least this supplied export has skeletons and meaningful café animation tracks. It does not prove the clips render correctly in our renderer, that they are suitable for every agent status, or that every character has the same clips. A clip called `Public01` should remain unmapped until visually inspected. Morph targets existing in the file do not prove a complete expressive face-control API.

Proposed content integration:

1. A character registry provides `characterId`, variant, thumbnail, pack/version, and available capabilities.
2. A per-character binding maps semantic actions (`idle`, `walk`, `react`, `celebrate`, `work`) to inspected clip names.
3. Cache each loaded model once; create separate skeletal instances and animation mixers for separate avatars.
4. Place animation inside a parent transform owned by the office. Navigation changes the parent; clip root motion cannot unexpectedly move the workstation or overwrite office positioning.
5. Validate character materials, eyelashes/hair transparency, mouth variants, halo orientation, prop visibility, scale, and facing direction in the actual camera view.
6. Load only selected characters and variants, rather than the entire roster. A 295-character library is a catalog, not an initial download requirement.

Three.js documents skeleton-aware cloning and an individual mixer for each cloned character; `AnimationAction` supports looping, one-shot playback, clamping, and crossfades. These are suitable building blocks for the binding above. [Three.js character game example](https://threejs.org/manual/pages/game.html), [AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)

### 3.2 Official fan kit

The live [official Japanese fan kit](https://bluearchive.jp/fankit) presents wallpapers and stamps; its own terms define the kit as wallpapers, stamps, and icons. It is **not verified as a source of rigged 3D characters or furniture**. Its terms allow private personal use and limited use on websites/blogs/SNS, prohibit commercial use and certain transfers, substantial modification, advertising unrelated products/services, and removal of copyright/trademark notices. Permission is limited to the designated kit. [Fan-kit precautions](https://bluearchive.jp/fankit/Precautions)

Use this kit as an official reference and as a possible narrowly permitted UI asset source after matching the intended use to the terms. Do not assume it authorizes an office's complete character pack.

### 3.3 Schale DB and café wiki

[Schale DB](https://schaledb.com/home) is a live unofficial reference for character, item, and furniture data. Its homepage explicitly states that game artwork, information, and assets belong to their respective authors and that it is not affiliated with Nexon, Nexon Games, or Yostar. Its older [SchaleDB/SchaleDB repository](https://github.com/SchaleDB/SchaleDB) is archived as of 2025-06-03. Useful for selecting character names, variants, furniture motifs, and interaction targets; it is not a verified furniture GLB pack or an authoritative reuse license.

The supplied [café wiki](https://bluearchive.wiki/wiki/Cafe) can supplement game-mechanic research. Use the official café guide for the core behavioral evidence above. A furniture catalog picture or name is insufficient to implement a 3D furniture object: a renderer still needs geometry, textures, dimensions, footprint, and interaction anchors.

### 3.4 Character voice lines

The supplied [Yuuka audio page](https://bluearchive.wiki/wiki/Yuuka/audio) catalogs café, login, lobby, victory, and other voice lines, with playable recordings and transcriptions. It warns that some lines are unused/inaccessible and that some transcription/translation can be inaccurate. It is useful as a reference for character flavor. It supplies neither a general permission to redistribute recordings nor runtime status semantics.

Proposed MVP: no bundled character voice or game music. Add optional user-controlled sound packs later, separate from the GLB registry, with independent provenance and mute controls. Recorded dialogue must not replace the actual agent question or describe progress that did not occur.

### 3.5 Logo generator and supplied logo

[symbolon.pages.dev](https://symbolon.pages.dev/) is a Blue Archive-style logo generator with text/color inputs, transparency, halo/cross positioning, and Save/Copy. Its linked [nulla2011/bluearchive-logo repository](https://github.com/nulla2011/bluearchive-logo) is MIT-licensed, while the hosted tool names specific main, Korean, and fallback fonts. A code license should not be treated as clearing every bundled font, trademark, or generated mark. The existing `BlueOffice-logo.png` can remain a user-provided branding input; record its creation/source rather than inferring permission from its filename.

### 3.6 KDE theme

[Sadowski-Krystian/Blue-Archive-Theme-KDE-Plasma](https://github.com/Sadowski-Krystian/Blue-Archive-Theme-KDE-Plasma) is useful for studying a fan implementation of the bright UI style. Its README expressly limits GPL-3.0 to source/scripts/configuration; artwork, official assets, and trademarks are excluded. It also says wallpaper permission is exclusive to that KDE theme and prohibits reproduction, republication, and AI training. Therefore it is a design reference, **not a general-purpose asset pack**. No installation is needed for this research.

### 3.7 Image-blaster

The supplied [neilsonnn/image-blaster](https://github.com/neilsonnn/image-blaster) is an MIT-licensed image-to-world workflow using World Labs and FAL. Its README describes dynamic-object `.glb`/`.obj`, static-environment `.spz` Gaussian splats, and `.mp3` sound outputs. It describes default 50,000-face generated objects and provider-dependent image/model generation. The repository source inspected here was last pushed 2026-05-15. No specific “renewed” fork URL was supplied or conclusively identified, so no claim is made that an unspecified fork is better.

**Assessment:** potentially useful for background concepts or unique original decorative props, but a weak default for an editable office. A static splat does not automatically provide movable furniture entities, walkable topology, editable floors/walls, authored character rigs, or workstation interaction anchors. Generated objects also require scale/topology/material review. It cannot be assumed to produce consistent animated Blue Archive characters from a café screenshot. Keep it optional and outside the first implementation's dependency chain; do not upload game screenshots or user data to generation providers as part of this research.

## 4. Furniture sources and production options

| Route | Verified supply | Fit for this office | Open question / next step |
|---|---|---|---|
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | Owner page: 3D pack, 140 files, CC0, interior/table/chair assets | Fast neutral furniture seed and blockout | Inspect actual archive before claiming a particular computer model or runtime format is present; normalize selected objects |
| [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits) | Creator page: 50+ low-poly models; CC0; OBJ/FBX/glTF; common gradient atlas. Paid extra tier advertises 20 additional gaming-setup assets; source tier includes `.blend` | Cohesive stylized office base; glTF makes web ingestion practical | Inspect the selected tier's contents; do not assume every monitor/keyboard lives in the free tier |
| Commission or author a small office set | Proposed work | Best control over café-like proportions and workstation interactions | Contract for geometry, texture, editable sources, runtime redistribution, and interaction-anchor deliverables |
| User-provided furniture pack | Proposed importer | Supports the user's preferred assets | Inspect permission, file formats, dependencies, actual contents, and scale |
| Exact in-game furniture exports | Not verified in supplied resources | Closest visual match if authorized | Permission and acquisition remain unresolved; not required to prove office functionality |

Recommended initial set: desk, monitor/computer, keyboard, chair, small plant, shelf, lamp, whiteboard, sofa, meeting table, rear walls, floor, and doorway. This list is a proposed asset brief. Desks and computers should form a **workstation composition** that can be assigned to an agent, while individual pieces remain rearrangeable in Edit mode.

Avoid mixing an arbitrary high-detail realistic desk with tiny bright chibi figures. Normalize material roughness, outlines, texture resolution, saturation, and world scale. Furniture polish and lighting coherence matter more than total prop count.

## 5. Asset rights: findings and product consequences

The official Japanese [derivative-work guideline](https://bluearchive.jp/fankit/guidelines), read in the live browser, permits certain noncommercial derivative works by individuals or unincorporated groups for publication/distribution in Japan. It calls for advance contact for corporations and activities outside the guideline. It prohibits low-creativity direct content reuse through copying, sampling, scanning, or tracing, as well as misleading official affiliation and other infringing content. These are policy observations; they do not establish that this project, its location, or any specific model use is permitted.

Nexon's Korean [Blue Archive operation policy](https://m.nexon.com/terms/634) states that the company owns game characters/items and includes unauthorized use/disclosure of extracted client files among restricted conduct. It is a regional game-operation policy, not a universal statement of law or a license assessment for this office.

A creator's fan model can have stricter conditions than expected: the [POWER Hibiki MMD listing](https://booth.pm/en/items/6136068) offers PMX files, prohibits redistribution and commercial use, restricts conversion/runtime use, and permits some conversion for rendered stills/video. It is full-body MMD, not verified as a café chibi asset, and is not automatically suitable for a web runtime.

Proposed consequence: distinguish **technical availability**, **private local configuration**, and **permission to bundle/publish**. The software can have an avatar-provider/import interface while a distributable default pack uses assets with clear provenance. A user importing a file does not itself establish rights to that file. Before bundling specific Blue Archive meshes, textures, audio, icons, or furniture, record applicable permission and intended use. This documentation task can proceed fully while that decision is unresolved; no permission request, asset ripping, or external contact is necessary to write the PRD.

Minimum asset provenance fields:

```text
assetId, packId, version, sourceUrl, creator, rightsOwner,
licenseOrPermissionReference, intendedUse, redistributionAllowed,
attributionText, sourceChecksum, inspectedAt, localPath
```

The flag is a recorded assessment with supporting evidence, not a user-clicked warranty. Default “unknown” where no permission evidence exists.

## 6. Runtime format and renderer choice

Use **glTF 2.0 / GLB** as the normalized runtime format. Keep source `.blend`, FBX, OBJ, PMX, textures, and licenses outside the runtime bundle. GLB is a delivery container, not a guarantee that shaders, bone layouts, or animations are compatible. Three.js's official loader supports glTF 2.0, skins/animation data, and named compression/material extensions. [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)

| Renderer | Verified capabilities | Assessment for BlueOffice |
|---|---|---|
| Three.js + React Three Fiber | R3F renders Three.js through React; native scene interaction and ecosystem integration. React 18/R3F 8 and React 19/R3F 9 must be paired correctly. [R3F introduction](https://r3f.docs.pmnd.rs/getting-started/introduction) | Recommended: scene and data-rich HTML side panels share the application's state and component structure |
| Babylon.js | Official glTF loader, skinning, asset containers, handedness conversion; codec resources can be hosted locally. [Babylon glTF documentation](https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF/) | Viable alternative if the team prefers an integrated engine; same content/provenance problem remains |
| Godot | Official scene importer, advanced import settings, inherited scenes, and runtime loading. [Godot import pipeline](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/index.html) | Good for a game-focused native application; additional integration work for rich web chat/session panels makes it less attractive for the first office |

The recommendation is a fit judgment, not a benchmark showing R3F is faster. Choose stable compatible versions during implementation. Do not require experimental WebGPU to prove this product.

### Camera contract

Proposed default: orthographic projection, oblique elevation around 30–40 degrees, looking into a room corner; azimuth and elevation fixed during ordinary use, bounded pan and zoom, Reset View action. These angles are starting parameters to tune, **not measured game values**. Perspective mode or free orbit can be a later optional feature.

Orthographic projection preserves rendered object size with distance, making a room overview easier to read. [Three.js OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)

Fit the room to the **remaining viewport after the side panel**, not the full browser width. Opening chat should not crop the selected avatar or collapse its bubble. Keep avatars selectable in dense furniture; cut away or fade occluding walls, while urgent questions remain visible in the HTML attention list.

### Character and furniture content contract

Proposed canonical coordinate system: meters, Y-up, feet at local origin, declared facing direction. Importers apply a normalization wrapper rather than changing the underlying agent position. Each model declares a bubble anchor, click bounds, locomotion speed, and supported action clips. Each furniture type declares a footprint plus interaction anchors, entry positions, capacity, and action capability.

```text
CharacterDefinition
  id, modelUri, scale, forwardAxis, bubbleAnchor, selectionBounds
  capabilities: idle / walk / reaction / seated / typing / celebration
  clips: semanticAction -> clipName + loopMode + transition

FurnitureDefinition
  id, modelUri, footprint, walkBlocking, allowedRotations
  interactions: anchorId, localTransform, entryPoint, capacity, action

WorkstationAssignment
  agentId, furnitureInstanceId, anchorId
```

Do not infer agent status from avatar motion. Hermes status chooses presentation; the scene's animation completion does not mark a session complete. Furniture placement should not change session execution or cancel a live task.

## 7. Status presentation proposal

This mapping is product design, not a claim that Hermes already exposes every state. The integration adapter must determine which states are actually observable.

| Semantic state | Avatar behavior | Overhead cue | Persistent HTML counterpart |
|---|---|---|---|
| Idle | Café idle; occasional subtle turn | Usually none | Idle label |
| Generating / working | Authored typing if supported; otherwise restrained idle/focus reaction | Small ellipsis or work badge | Running session and current phase |
| Tool running | Continue working pose | Small tool symbol + concise action label | Tool name, start time, result |
| Pending question | Stop wandering; face toward viewer/desk edge | Persistent `?` | Attention queue entry with actual question and response controls |
| Approval needed | Calm waiting pose | Approval icon distinct from `?` | Dedicated approval card with exact action |
| Completed | One short approved celebration clip, then idle | Brief check marker | Completion event/result |
| Error | Brief restrained reaction, then wait | Persistent error marker | Error details and valid recovery actions |
| Disconnected / unknown | Idle or reduced motion | Connection icon | Last known state + stale timestamp |

Never substitute “thinking” motion for evidence of actual progress or expose fabricated thought text. Bubbles should show short actual status/question snippets, with the full content in the side panel. Critical pending questions persist; ordinary completion speech fades. Keep the question visible even if another session belonging to the same agent is active. Give each avatar a stable name label or on-selection identity, and show session counts so one agent with multiple sessions does not masquerade as several people.

Use one base locomotion/pose action, one transient reaction layer, and separate icon/text overlays. A question or approval overrides ambient wandering. Debounce rapid tool-state changes so the avatar does not constantly restart clips. Honor reduced-motion preference and retain text/icon status when motion is disabled.

Drei's `Html` projects HTML to a scene object and provides occlusion control, useful for bubbles; use untransformed DOM text for legibility and maintain an HTML attention list independent of occlusion. [Drei Html](https://drei.docs.pmnd.rs/misc/html)

## 8. Proposed import and validation pipeline

1. **Inventory and provenance:** record source, intended distribution, creator terms, checksums, and pack version.
2. **Technical inspection:** enumerate meshes, textures, skins, bones, morph targets, clips, duration, bounds, and material dependencies.
3. **Normalize:** correct up/facing axis, feet/pivots, scale, texture color space, transparency, and hand/seat anchor conventions.
4. **Author missing interactions:** sit/stand and typing clips fitted to the character proportions and workstation; do not assume generic humanoid retargeting fits chibi heads/arms.
5. **Validate glTF:** use the Khronos validator during implementation; preserve its report. [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)
6. **Visual QA:** idle/walk/reaction from the default camera; face/halo/props; floor contact; turn transitions; chair clipping; desk reach; bubble position; avatar duplication; resize and panel open/close.
7. **Optimize and version:** remove unused battle props/clips only when permitted and verified; reduce texture sizes and use supported compression after visual comparison; preload the selected avatar, then background-load others.
8. **Runtime QA:** unsupported/missing clip fallback, missing model fallback, context loss, resource disposal, reconnect/stale status, motion preference, and interrupted one-shot animation.

Do not make archive filenames into public API semantics. The normalized registry decouples the office from renamed files and variant-specific clips.

## 9. Research spikes before committing implementation scope

| Spike | Small concrete test | Decision it resolves |
|---|---|---|
| Avatar rendering | One appropriately authorized chibi asset, its idle/walk/reaction, default camera, and bubble; confirm material fidelity | Can the selected pack supply the intended café feel? |
| Workstation animation | One character, desk/computer/chair, sit/stand/typing anchors; compare supported clip vs authored addition | Is “working at computer” realistic for MVP or a later art milestone? |
| Room editor | Twelve props, grid snap, rotate, blocked footprint, undo, save/load | Are furniture placements editable without entangling agent state? |
| Dense office | Proposed trial: 8 unique animated agents and 30 props, open chat, overlapping pending questions | Establish measured rendering/memory/readability budgets on the user's machine |
| Event presentation | Simulated running/tool/question/error/completion/disconnect sequence | Do animations accurately communicate state and preserve attention? |

Provisional performance goals may be set in the PRD, but no FPS, memory, device support, or import compatibility result is claimed by this research. Useful measurable acceptance checks: independent duplicate-avatar animation; a question remains actionable without the canvas; room fits after panel opening; no desk/chair overlap during a supported interaction; missing clips degrade to idle plus accurate status; layout reload reproduces transforms and workstation assignments.

## 10. Unresolved decisions to carry into the PRD

The follow-up [café showcase reference sheet](cafe-showcase-references.md) includes visually inspected study/desk, classroom, and technology-palette screenshots. The user's later [recording capture](../references/modern-office/START-HERE.md) takes priority for workstation interaction. The default direction is a modern open office with computer desks and an actual café bar; the study is optional for a secretary office, and classroom mode is deferred. The supplied close-up verifies seated avatars and a monitor, not the full office/bar layout.

- Intended distribution: private local office, publicly downloadable fan project, or commercial product. This affects content selection; it does not block documenting the architecture.
- Initial character roster and variants; this determines animation/QA/art work, not just a name list.
- Permission basis for Blue Archive meshes, textures, icons, voice, and furniture, separately.
- Whether seated typing is required in the first usable release, or standing café-style working poses are acceptable during the first integration milestone.
- Whether user-provided packs need a GUI importer at MVP, or a documented local manifest is sufficient.
- Maximum active avatar population and treatment of multiple sessions per agent.
- Exact “renewed image-blaster fork” URL, if the user wants that option compared in detail.

**Overall feasibility:** a café-like 3D office and expressive status avatars are technically tractable. The supplied community GLBs materially reduce model-format and café-motion uncertainty. The main remaining visual work is coherent office furniture, workstation-specific animation, rendering fidelity, and explicit asset provenance. None of those requires modifying the Blue Archive game client or coupling Hermes execution to a game engine.
