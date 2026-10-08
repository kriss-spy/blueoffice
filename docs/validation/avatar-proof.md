# Avatar/workstation technical proof (#2)

The offline `/?scene=fixture` route renders the intended Yuuka GLB with two independent rigs, two coherent workstations and an original modern café counter. React/R3F renders real geometry with depth, shadows and an elevated diagonal orthographic camera. HTML nameplates, fixture controls and chat remain separate from the canvas. This proof unblocks scene engineering; it does **not** pass #15 seated computer work or #18 approved public character distribution.

## Reproduce locally

```sh
npm ci
mkdir -p artifacts/avatar-proof/source
curl -fL https://raw.githubusercontent.com/lihaohong6/BlueArchiveModels/525ae0faeb0a89f54ef4023f3be3692dcb529e51/Yuuka.glb -o artifacts/avatar-proof/source/Yuuka.glb
node scripts/prepare-avatar-proof.mjs artifacts/avatar-proof/source/Yuuka.glb artifacts/avatar-proof/normalized
npm run build
BLUEOFFICE_DATA=/tmp/blueoffice-scene-proof BLUEOFFICE_PORT=0 python3 scripts/run_server.py --fixture
```

Open the printed loopback URL with `/?scene=fixture`, then choose `artifacts/avatar-proof/normalized/Yuuka.normalized.glb` using **Open proof GLB**. The browser reads the file locally; this route sends no office API commands. Right-drag pans, wheel zooms, and the camera buttons provide equivalent operations and Reset view. Individual selection, pause and sample-time controls allow deterministic clip inspection. Re-run the focused structural/rig checks with `npx tsx --test tests/scene.test.ts`.

## Asset identity and permission assessment

[Inventory](avatar-proof/inventory.json) records all 38 clips and 15 materials. Source: [lihaohong6/BlueArchiveModels, pinned Yuuka file](https://github.com/lihaohong6/BlueArchiveModels/blob/525ae0faeb0a89f54ef4023f3be3692dcb529e51/Yuuka.glb). Source SHA-256: `9986383537011aca594b5ce8129ef87e325f559583ed77d975170127f5fecc64`; normalized v1 SHA-256: `a93f46c9f39c5bc51047f7301811e0affafebb8eac966fe30cac6e5e97f255ca`.

On 2026-10-08, GitHub's repository API returned `license: null`; the pinned root tree contains no license or README. The uploader is identified, but geometry/texture authorship, applicable rights holder, permission reference and public redistribution permission remain unverified. Technical availability is established; no affirmative distribution claim follows. Model bytes and character captures remain in ignored local `artifacts/`. The application package contains original procedural furniture and source code, with no bundled character pack. No neutral character substitute is presented as fulfilling the intended-character requirement. #18 must obtain the actual permission basis before public character-pack release.

## Structural validation and normalization

The untouched 5,083,936-byte source contains 11 meshes, three skins and 14 embedded PNG images. Khronos `gltf-validator@2.0.0-dev.3.10` reports 181 errors: 146 animation input/output accessor usage conflicts and 35 non-normalized quaternion accessor errors. The pinned-source preparation script separates animation input accessors and normalizes 42,098 quaternion value samples; it preserves geometry, texture bytes, native materials and clip identity. It writes a separate 7,705,780-byte GLB and validates it before acceptance.

The normalized result has **zero errors and zero warnings**. [Validator summary](avatar-proof/validator-summary.json) retains the source failures and normalized informational findings. Unused original accessors remain intentionally; the full local report caps informational messages at 1,000. The loader accepts only this exact normalized hash, rejects external resources before parsing, and retains the previous valid asset after malformed or unpinned file selection. This narrow proof loader is not the general asset importer requested by #13.

## Render and motion inspection

Visible Chromium captures were inspected at 1440×900 and 1280×720, plus enlarged clip samples. Pale wood flooring, white/cyan desks, monitors, keyboards, chairs, coffee machine, cups and three bar stools remain legible with a 340-pixel HTML chat column. Both viewports frame the complete room and café at reset. At 1280×720 the canvas is 940×510 and chat is 340×644 with its own vertical scroll; there is no horizontal overflow.

The character retains native violet hair, white/black clothing, face/eyebrow layers, cyan details and halo geometry. Native opaque body/face/hair/halo materials and masked mouth layers are preserved, including their morph-driven expression switching. No blanket transparency, texture replacement, hidden mouth layers or fabricated typing animation is applied. Enlarged idle/walk/reaction samples show facial features and halo without observed flicker or missing faces. This checks the supplied GLB under Three.js lighting; it does not claim exact game-shader fidelity.

| Clip | Measured duration | Inspected behavior |
|---|---:|---|
| `Cafe_Idle` | 3.2000 s | Standing idle with subtle body/hair motion; selected standing compatibility. |
| `Cafe_Walk` | 1.2667 s | Alternating legs/arms, looping in place. Decorative proof only; no navigation claim. |
| `Cafe_Reaction` | 3.0000 s | Body/head/arm reaction, plays once and holds its end. No work semantics inferred. |

Samples at 0, 0.75, 1.5 and 3 seconds record actual bone-pose hashes and world bounds in the [browser summary](avatar-proof/browser-summary.json). Both instances share geometry/materials but own cloned skeletons and separate mixers. The browser verified distinct bone identities, equal geometry identities, an unchanged paused A pose/time while B advanced, and independent status selection. A synthetic rig regression separately verifies material reuse and independent bones/mixers.

The native idle bounds are `[-0.243919, 0.001360, -0.250332]` to `[0.294755, 1.074492, 0.211589]`. Feet-centered normalization uses scale `1.39777753` for a 1.5-meter overall height including halo, with Y up and +Z facing. Idle sampled foot-height variation is about 0.2 mm; walking samples range approximately −16 mm to +11 mm relative to idle-ground normalization. Walking floor-contact/root correction remains future interaction work; it is not a verified walking path or seated pose.

## Workstation and seated-work contract

`shared/scene.ts` declares meter units, Y-up, +Z-forward, a 2.4×2.5-meter furniture footprint centered at local `[0,0,0.38]`, and desk/monitor/keyboard/chair/approach/standing/seat/work anchors. All visual furniture children rotate under one workstation group. The same transform rotates the avatar's standing anchor and facing; numerical tests cover every anchor and inverse rotation. A 90-degree render with footprints and anchors verifies the assembly visually. Approach and standing locations are interaction anchors, not a claim that the character's full moving silhouette fits the furniture footprint.

The clip inventory does not establish seated typing. Battle kneeling and unclassified `Public01` are not relabeled as desk work. The chair and seat anchor are available, but pelvis/hand/keyboard alignment and a compatible seated clip remain missing. `compatibility.seated` is explicitly false; the fixture displays this limitation. #15 must author/source and inspect proper seated computer work against the supplied reference before beta visual completion.

## Verification evidence

The automated browser run passes idle/tool/question/approval/error fixtures, missing-clip fallback, malformed/unpinned asset rejection, retained valid rendering, camera bounds/reset, duplicate rig independence and both viewport captures. It records zero page/console errors, zero external requests and zero office API requests. The only console warning is R3F's upstream deprecated `THREE.Clock` use. Button and native pointer camera checks are recorded separately. Local screenshots and their hashes are indexed in the browser summary; the continuous capture is in `artifacts/avatar-proof/browser/video/`.

The lazily loaded fixture scene bundle is approximately 996 KB minified (265 KB gzip); Vite flags its size. It is not loaded on the normal chat route. Optimization, frame pacing and larger-roster memory gates remain #17 rather than being inferred from this two-character proof.
