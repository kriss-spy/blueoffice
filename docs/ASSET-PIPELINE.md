# BlueOffice asset pipeline and content brief

Status: proposed workflow, 2026-10-08. Source findings and policy evidence are in [visual/assets research](research/visual-assets.md). No meshes, textures, voice files, or furniture archives were incorporated during research.

## Asset path

The Models link in `RESOURCES.md` leads to a concrete character GLB collection, with at least one inspected rig containing café clips. Use GLB as the runtime format rather than write a Unity asset extractor. A source pack may need offline normalization; the running application only accepts a validated, versioned manifest and runtime assets.

The initial office furniture should use a coherent permitted pack such as [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) or [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits), then supplement missing desk/computer components through authored assets. Both creator pages declare CC0 for the identified packs; exact archive/tier contents still need inspection. Exact game furniture exports were not verified in the supplied resources.

Character model technical availability is established for the supplied community collection; redistribution permission is unresolved. Keep characters as a separate importable pack and record the applicable basis for each intended use. A local import is not itself a rights determination. Public downloadable defaults require evidence for the actual geometry/textures. Use neutral placeholders for engineering if needed, while retaining Blue Archive characters as the product target.

## Minimum content brief

| Content | Initial need | Validation |
|---|---|---|
| Room shell | Floor, two rear walls, open camera corner, door | Readable from default camera; no blocking foreground wall. |
| Workstation | Desk, computer/monitor, keyboard, chair | Compatible heights/proportions and validated approach/seat/work anchors. |
| Office props | Shelf, plant, lamp, whiteboard, sofa, meeting table | Shared visual treatment, footprint, no accidental navigation blockage. |
| Characters | One representative first, then selected roster/variants | Idle/walk/reaction; independent rigs; faces/halos/materials readable. |
| Status graphics | Question, approval, tool, error, connection, completion | Original simple UI icons with text alternatives. |
| Character work motion | Standing focused work or authored seated typing | Pose and workstation alignment; no clipping/foot sliding. |
| Sound | Optional original notification cue later | User controlled, quiet by default; independent provenance. |

Pick one desk set and one character for the fidelity spike before expanding the catalog. Each added variant multiplies visual/animation QA. Battle weapons and unrelated props may be hidden only through permitted, validated asset configuration; do not destructively edit the only source file.

## Normalization contract

- Runtime: GLB/glTF 2.0, locally resolved dependencies; initially prefer embedded resources.
- Canonical coordinates: meters, Y-up, X/Z floor, character origin at feet for standing; declared forward direction normalized to +Z.
- Furniture pivot: declared placement origin, integer-grid footprint, surface/approach/interaction anchors in local space.
- Character animations: per-character semantic mappings; declared loop/one-shot behavior, root-motion strategy, and pose family.
- Materials: verified color spaces, alpha modes, skinning/morph support, face ordering, halo visibility; retain a reference image from the selected camera.
- Versions: immutable asset id/version/hash; provenance, original source hash, conversion tool versions, validator report, and known limits.
- Optimization: measure triangle/material/texture count and decoded memory. Compress only after comparing faces, outlines, and animation quality; keep codecs local.

Do not assume OBJ includes rigged animation, FBX exports retain the original shader, or PMX-to-GLB conversion is allowed or automatic. Normalize those formats offline only after evaluating the actual source/terms. glTF stores animation tracks, not the office's behavior controller. [Khronos specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

## Proposed manifest example

This illustrates the BlueOffice contract; values are placeholders, not an imported Yuuka pack or permission assessment.

```json
{
  "schemaVersion": 1,
  "assetId": "character.example",
  "version": "1",
  "kind": "avatar",
  "model": "models/example.glb",
  "sha256": "record-after-import",
  "coordinates": {"unit": "meter", "up": "Y", "forward": "+Z"},
  "capabilities": ["idle", "walk", "react"],
  "clips": {
    "idle": {"name": "Cafe_Idle", "loop": true, "pose": "standing"},
    "walk": {"name": "Cafe_Walk", "loop": true, "rootMotion": "in-place"},
    "react": {"name": "Cafe_Reaction", "loop": false}
  },
  "anchors": {"bubble": [0, 1.5, 0]},
  "provenance": {
    "sourceUrl": "record-source",
    "creator": "record-creator",
    "rightsOwner": "record-owner",
    "permissionReference": null,
    "redistributionAllowed": null
  }
}
```

Relative asset paths must stay inside the registered pack; placeholders and `null` permissions cannot pass a public-pack release check. Heights/anchor coordinates are measured per asset, not copied from this example.

Furniture/workstation records additionally need `footprint`, `allowedRotations`, `surfaceAnchors`, `approachCells`, `interactionSlots`, and compatibility tags. The registry derives an interaction result from both furniture and character capabilities, not from a hard-coded character name. A seated pose needs an authored root correction per interaction; a standing feet origin alone does not define a correct seated pelvis/hand position.

## Import and QA steps

1. Inventory the source and intended use. Record source/commit/hash, license or permission evidence, creator/owner, redistribution assessment, attribution, and original file locations.
2. Inspect format metadata, animation names, rig hierarchy, materials, morph targets, and required extensions before conversion. Reject remote/script dependencies and invalid resource paths.
3. Normalize in a repeatable offline workflow, keeping original files untouched. Export GLB, textures if needed, manifest, and conversion log. No asset-generation provider is mandatory.
4. Run [glTF Validator](https://github.com/KhronosGroup/glTF-Validator). Resolve structural errors and record remaining warnings with rationale.
5. Review in the actual renderer: default room camera, neutral light, native textures, transparency, halo, facial layers, prop visibility, scale/facing, and every mapped clip.
6. Test duplicate avatars with different mixers. Check clip transitions, root drift, looping, one-shots, interrupted reactions, and disposal after removal.
7. Author/adjust workstation anchors and poses. Verify seat/standing position, hand/keyboard reach, chair clipping, rotation, approach route, and departure.
8. Measure load time, decoded/GPU memory, draw calls, and frame behavior with the planned roster; establish budgets from actual assets.
9. Publish only the approved runtime pack, its manifest, required attribution, and validation summary. Layout exports reference assets; they do not automatically redistribute their bytes.

## Movement and workstation interaction

Use simple grid A* for short routes around furniture; a full physics/navigation engine is unnecessary for one flat room. Reserve approach/standing cells deterministically and queue or choose another slot when occupied. Furniture footprints and walkable cells come from manifests, not visible triangle intersections.

Model state and semantic work state stay separate. A working agent can remain stationary at its desk. Walking is decorative and cannot delay a question. At the destination, switch to a compatible pose/clip; without a seated work clip, use a verified standing pose and accurate status. Never relabel a battle attack as “typing” because it moves the arms.

Furniture editing revalidates occupancy/anchors. If a chair is detached or a desk becomes incompatible, mark the workstation incomplete and use a safe standing position. Agent execution continues.

## Fidelity gate

The visual gate is a real rendered modern open-office slice with one recognizable intended character, coherent desk/computer/chair, a visible café counter with coffee equipment and bar seating, default 2.5D framing, actual café idle/walk/reaction playback, correct seated computer work pose, and legible question marker alongside chat. Compare character/furniture scale and seating against [the supplied video capture](references/modern-office/START-HERE.md). Source the counter, coffee props, and stools as part of the same coherent kit or normalize them to its palette/scale. These specific assets and clips remain unverified. Approve that slice before spending time on the complete roster.

The main unresolved art tasks are seated typing/desk compatibility and shader fidelity. Image-blaster may help original prop concepts, but static splats do not replace editable furniture/anchors, and generated chibi likeness does not guarantee a usable rig. Detailed resource-by-resource findings remain in the research report.
