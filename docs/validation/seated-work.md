# Authored seated workstation evidence for issue #15

This worker authors a real static skeletal seated computer-work pose in the private normalized Yuuka GLB. It does not rename a battle animation. `Office_SeatedWork_v1` stores the sampled native café idle baseline, authored leg/arm/skirt/rear-hair rotations and root correction. Every new channel has identical endpoints at 0 and 2 seconds, so the work pose loops without root or foot drift. It has no finger-typing animation and no authored sit-down/get-up sequence. State changes switch immediately between the seated pose and the existing café clips; attention must stay independent in the office controller.

Source: the exact normalized source hash `a93f46c9f39c5bc51047f7301811e0affafebb8eac966fe30cac6e5e97f255ca`, derived by the existing preparation workflow from source hash `9986383537011aca594b5ce8129ef87e325f559583ed77d975170127f5fecc64`, source commit `525ae0faeb0a89f54ef4023f3be3692dcb529e51`. The original asset, texture bytes, native materials, original animation channels and provenance/permission fields are retained. Redistribution permission remains unknown. Character bytes and render/video evidence remain ignored under `artifacts/seating/`.

## Reproduction

```sh
npm ci
node scripts/prepare-seated-work.mjs /absolute/path/Yuuka.normalized.glb artifacts/seating /absolute/path/normalized/character-pack/manifest.json
```

The third argument is optional when the source's sibling `character-pack/manifest.json` exists. Preparation rejects any other source hash. It appends the authored clip and emits a new immutable manifest, SHA-256, glTF Validator report, anatomical markers, shoe bounds and exact indexed-triangle/cushion/back intersection measurements. A transient texture-free copy is used only for Node geometry measurements; emitted GLB materials/images are untouched. The initial 30 new redundant skinned-mesh TRS warnings were corrected; final validation has zero errors and warnings.

`SeatingLab` is a dedicated review fixture rather than a production route. The local ignored entry imports it, fetches the prepared local GLB/manifest and uses the actual Avatar and OfficeLighting components. It supports quarter turns, seated/idle/walk/reaction, timeline sampling, real mixer playback and incompatible tags. The parent integrates the actual office, library loader and furniture.

## Measured contract

The optional manifest `seating` contains compatibility tags plus contact/pelvis/hand/foot markers in normalized avatar meters and a quarter-turn facing correction. The identifier `blueoffice.seated-work.v1` describes the measured interaction, never the character's name. Avatar accepts local `seating: { seat, keyboard, compatibility }`; seated Avatar `position` is the workstation placement origin, with its existing quarter-turn rotation. Character loaders copy `manifest.seating` to AvatarAsset. A missing profile, missing actual seated clip, incompatible tags, mismatched seat height or unreachable keyboard uses the validated standing idle. Parent callers must place that fallback at the standing anchor.

Final private asset SHA-256: `1a0a7918e45260b43bf9f5920aa98ff29fabed523854d70171443758b09186ae` (verify emitted `alignment.json` before importing). The GLB is 7.8 MB; final hash in the output manifest is authoritative.

| Measurement | Normalized pose / workstation meters |
|---|---|
| Contact marker | `[0, .263, 0]` aligned to workstation `[0, .263, .72]` |
| Pelvis | `[0, .35, 0]`, placed at `[0, .35, .72]` |
| Wrists | `[±.115, .65, .23]`, facing toward keyboard at `[0, .65, .38]` |
| Ankles | `[±.105, .06865, .24]` |
| Shoe sole minima | left `.000948`, right `.000009`; under 1 mm above floor |
| Chair cushion | center `[0, .218, .81]`, size `[.55, .09, .20]` |
| Chair back panel | center `[0, .585, 1.16]`, size `[.55, .33, .07]` |
| Desk / keyboard | desk top `.62`, keyboard top approximately `.66`, anchor `.65` |
| Seated facing | quarter turn `2`, toward local `-Z` |
| Mesh clipping | zero indexed triangle intersections with the specified cushion/back boxes |

The original workstation's .48 m chair and .83 m keyboard could not fit this chibi anatomy. Standing pelvis is .500 m, thigh .234 m, calf .215 m, shoulder .824 m and full arm .323 m. The final furniture is scaled to the measured anatomy. A deeper cushion intersects bent calves; a closer/high back intersects the native long hair. The fixture's back panel needs coherent slim side supports in the production Room. Triangle measurements cover the declared cushion/back volumes, not every production prop. Furniture changes require rerunning the pose/geometry measurement against the final geometry.

## Observed evidence and acceptance limits

`artifacts/seating/browser-report.json` records actual clip names, bone signatures, mixer time, placement diagnostics and screenshot filenames; it reports zero page errors. `video/` records actual mixer playback. `1440x900-front.png`, `1440x900-side.png`, `1440x900-office.png`, `1280x720-office.png` and `rotation-1/2/3.png` show the actual pose and compatible geometry. `idle/walk/react-playback.png`, `reaction-to-seated.png`, `incompatible-fallback.png` show original semantic clips, immediate switching and truthful fallback.

Worker inspection: recognizable native face and halo remain visible; the hands rest over the keyboard, knees bend under the desk, boots remain flat on the floor, and clothing sits over the bent legs. Front/side evidence reveals the cushion and hair-aware back spacing. Comparison with `docs/references/modern-office/video-00.5s.png` confirms seated chibi silhouettes, visible faces/halos and computer engagement; our desk is deliberately lighter/simpler than the ornate source reference. This lab cannot accept whole-room camera scale, open circulation, café visibility or chat composition. Those criteria require the parent’s representative office at both target resolutions and an independent review.

Automated checks: focused seating tests cover contact alignment under all four workstation turns and refuse incompatible tags, wrong seat heights, missing profiles and either unreachable wrist. `npm run check` passed all mechanical/TypeScript/Python/build gates; `npm run verify:ui` passed all four existing request/lifecycle browser tests. Both are rerun for the final tracked tree before the implementation commit. Existing browser fixture tests cover live request/lifecycle behavior; their passing does not establish art acceptance.

Issue criteria still requiring parent evidence: final Room support geometry and its collision review; office camera/reference composition with chat open at both resolutions; café bar visibility; immediate actionable attention in the integrated office during motion changes; independent native material and original clip review; representative-scene acceptance. Permission remains unresolved, and no full-roster art expansion is accepted by this worker evidence.
