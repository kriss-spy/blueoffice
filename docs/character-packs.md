# Local character packs

The explicitly selected initial roster is **Yuuka (Original)**, asset `yuuka.original`, version `525ae0fa-normalized-v1`. This is one character that may be assigned to several independently animated agents. Other source files are not approved roster entries. The roster choice is based on the [native material and animation proof](validation/avatar-proof.md); seated work remains #15.

No character bytes ship with BlueOffice. Source permission remains unknown: the inspected repository has no license evidence, its uploader is not established as the creator or rights owner, and local import does not grant redistribution permission. Imported metadata can record a permission claim, but no import or visual-review action promotes content into a public release. Release verification remains #18.

## Prepare and import Yuuka

Follow the pinned-source acquisition instructions in [the avatar proof](validation/avatar-proof.md), then run:

```sh
node scripts/prepare-avatar-proof.mjs artifacts/avatar-proof/source/Yuuka.glb artifacts/avatar-proof/normalized
```

Open **Characters** in the office. Choose the generated `artifacts/avatar-proof/normalized/character-pack` folder, or select its `manifest.json` and `Yuuka.normalized.glb` together. Do not select the parent folder containing technical reports. Files are copied into the configured `BLUEOFFICE_DATA/characters` content store; registry metadata and assignments live in the office database. Original files are not edited.

Select the imported pack, preview each mapped clip for a full cycle, and check the native face, halo, transparency, scale, feet and nameplate at normal framing and close zoom. The left character plays your selection; the second keeps its independent idle animation. Inspect the documented limitations, complete the review checks, and save the review. Only then can the character be assigned to the selected assistant, including while it is awaiting input. Changing a character does not restart Hermes or answer a question.

Use **Use placeholder** to clear a binding. A missing, corrupt or version-mismatched pack shows a diagnostic and retains the agent's status and identity. Reimport the exact pack and use **Refresh library** to recover missing files. Reloading checks saved assets again.

## Manifest contract (schema version 1)

The generated manifest is a complete example. The canonical JSON digest pins all metadata and file hashes. Assignments record `{assetId, version, sha256}`. IDs and versions use lowercase letters, digits, dots, underscores and hyphens; once imported, changing content or metadata requires a new version. Reimporting identical content is idempotent and can restore missing bytes.

Required fields are `schemaVersion`, `assetId`, `version`, `name`, `model`, `files`, `coordinates`, `anchors`, `capabilities`, `clips`, `provenance` and `knownLimitations`. `files` declares every file's relative `path`, SHA-256 and exact byte size. Local buffers and PNG/JPEG images may be dependencies of the GLB. Paths use plain safe segments; parent traversal, absolute paths, backslashes, encoded paths, URLs, data URIs and scripts are rejected. The folder picker supports nested dependencies.

Coordinates are meters, Y up, +Z forward. The normalization is `scale * (sourcePosition + offset)`. Feet are anchored at `[0,0,0]` after this transform. Nameplate anchors use normalized meters. All packs support standing idle; walk/reaction/seated mappings are optional but must name unique existing animations. Declaring seated capability requires a seated mapping; the current office continues to use standing placement until the #15 workstation/pose gate passes.

Provenance records source, creator, rights owner, permission evidence (or null), and redistribution permission (`true`, `false`, or null). Unknown people/rights must be recorded as unverified. A `true` permission claim requires evidence text. Known limitations are required and shown before review. Reviews are bound to the exact manifest hash and stored separately from immutable pack metadata.

Limits: 32 files and 32 MB per pack, 16 MB per file, textures at most 4096px per dimension and 32 million combined pixels, 128 meshes, 2,048 nodes, 128 animations, 20,000 accessors, 2 million entries per accessor and 128 MB combined expanded accessor data. Only core glTF 2.0 plus `KHR_materials_unlit` is accepted. Khronos validation must finish without errors or truncation; unused-object informational notices are ignored. Compressed assets requiring decoders are currently unsupported.
