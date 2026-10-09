# Asset provenance and local distribution

The selected release is the local BlueOffice application. This record describes supplied/generated materials and separate imports; it does not claim a cleared commercial character roster.

## BlueOffice logo

- Files: `BlueOffice-logo.png` and runtime copy `public/blueoffice-logo.png`; bytes match.
- SHA-256: `415628162de34e09f266ed6b44cae483c1497237861447224d3d6190cf87eaf7`.
- Creator/source: the project owner stated on 2026-10-09 that they made this image for themselves using [BlueArchive-Style Logo Generator](https://symbolon.pages.dev/). The owner supplied it for this project; it remains unchanged.
- The generator links to [nulla2011/bluearchive-logo](https://github.com/nulla2011/bluearchive-logo). Its [MIT license](https://github.com/nulla2011/bluearchive-logo/blob/master/LICENSE) identifies copyright 2023 nulla. This is the generator software's license; it is not described here as a separate font or trademark grant.
- The generator page credits RoG2 Sans Serif Std B, Gyeonggi Cheonnyeon Title and Wêlai Glow Sans. The linked upstream README credits a modified RoG2 and Wêlai Glow Sans. BlueOffice includes the owner's raster output, not the generator code or font files. Its interface uses system fonts (`public/fonts.css` has no remote imports).
- The creation date, generator deployment revision and exact font selection were not retained. No unrelated authorship or exclusive rights claim is added.

## Room, audio and character assets

The café/workstation geometry is procedural BlueOffice implementation. Notification sound is original synthesis in `src/scene/scene-sound.ts`, using oscillators rather than samples. Neutral diagnostic avatars and engineering test geometry are implementation-generated.

The intended Yuuka representative is a separately imported private pack. Its exact hashes, mapped native clips, authored seated profile, measurements and visual-review limits are recorded in `seated-work.md` and `scene-motion.md`. No GLB, glTF, FBX or PMX character file is tracked or copied into the built default client. Local visual review is not a redistribution grant; public character downloads are not included.

Images under `capture/blue-archive/` and `docs/references/` are identified research references. Validation screenshots record the application. They are outside Vite's runtime public asset tree; they must not be described as newly authored or licensed character source packs. Existing source/reference records retain their attribution context.

Runtime dependencies retain their respective package licenses. The release audit records exact installed versions/licenses and the actual built-file inventory. Fresh source/client scans also check that private model bytes and the real proxy-key value are absent.
