# V1 concept prototype: closeout and lessons

Closed 2026-10-09 at the user's direction: “it's a concept”. This checkpoint preserves the experiment and ends the current implementation effort. It is not a v1 product release, a declaration of visual acceptance, or a commitment to a second version.

## What we learned

1. **Ticket completeness did not establish product quality.** The original 21 issues closed with substantial technical evidence, yet the user experienced another SaaS app instead of being inside an office and playing a game. We optimized the functional checklist before validating the central feeling. Future acceptance must include early user judgment of an actual interactive scene.

2. **The room must be the primary interface.** Persistent sidebars, overview tables and forms made the office feel like a decorative viewport. The final experiment gives the room the full viewport, hides management UI initially, and opens movable windows through deliberate actions. This is a useful direction, but placing old forms in windows does not finish their interaction design. Agent interaction, agent overview, chat and office overview need their own considered windows if work resumes.

3. **Reference collection is not reference application.** The Blue Archive capture and KDE theme were available before the rejected demo. Their existence in research did not ensure that scene occupancy, camera framing, control density and window behavior informed implementation. The redesign inspected the local café capture and KDE window-decoration sources. Next time, compare an early playable scene directly against the references before expanding management workflows.

4. **Art and motion are central engineering dependencies.** A chibi character beside procedural furniture is not automatically a convincing game scene. Coherent furniture scale, materials, lighting, workstation anchors and authored sitting/standing/typing motion determine the result. The current seated-work asset is a static skeletal pose. Crossfades and eased positioning help, but cannot create the missing animation. Native-looking work and idle transitions remain unfinished.

5. **The browser engine was sufficient for the concept.** React Three Fiber/Three.js demonstrated an interactive room, imported rigs, camera controls and HTML windows. This work did not establish a need for Unity. Better art production and a tighter interaction prototype should precede an engine migration; Blender or another animation tool may help produce the missing assets.

6. **Less visible text still needs clear interaction.** Small controls and progressive disclosure protect the atmosphere. Accessible names, keyboard routes, focus return and explicit errors remain necessary. A newcomer should learn the room through a small number of obvious actions, rather than reading a management dashboard. That first-use experience has not been validated as finished.

7. **Windows have state, not just styling.** Independent review exposed lost drafts, Escape/focus problems and transcript-position problems. Closing a conversation must preserve its unfinished draft and reading position; reopening an exact request must focus that request. These behaviors gained targeted regressions. They are part of the experience, even when the window is invisible.

8. **Keep the useful runtime foundation.** Persistent assistant identity, exact request/permission targeting, isolated profile ownership, explicit stop/interrupt, history inspection and supported resume are meaningful results. Unknown delivery or disconnected state must stay unknown rather than becoming fictional character progress. Presentation can evolve without discarding those contracts.

9. **Verification layers prove different things.** Deterministic tests, browser fixtures, native integration, real-provider probes, performance measurements and visual reviews are separate evidence. More fixture tests cannot establish aesthetic quality. The final scene passed local browser tests but failed the GitHub browser run; neither that local pass nor older beta attestations justify merging through required checks or claiming product acceptance.

10. **Parallel implementation needs an early experience checkpoint.** Separate worktrees and file ownership helped room, motion and UI work progress independently. Review caught concrete behavior defects. The expensive mistake was allowing broad implementation to outrun validation of the core interaction. A future effort should prove one polished loop with the user before scheduling the rest of the feature list.

## What is preserved

- Earlier integrated runtime and ticket work: main at PR #37, merge commit `c323c6dde133a18a958d6fb7a126bccc84b91a67`.
- Final room-first application experiment: `4fff38f28c089943e7ba38d06bd6724e613b71b8`, followed only by these closeout documents; branch `codex/immersive-office`, checkpoint tag `v1-prototype`.
- [PR #38](https://github.com/kriss-spy/blueoffice/pull/38): preserved as a closed, unmerged experiment. No required check is bypassed. The existing package version is historical metadata, not a new beta release claim.
- Reproducible startup and fixture instructions in the [README](../README.md); presentation details in [IMMERSIVE-OFFICE.md](IMMERSIVE-OFFICE.md).
- Local before/after demo videos and screenshots, with hashes below. These ignored artifacts remain in this workspace; a Git clone does not contain them. The later demo uses private imported character art and synthetic agents, not live model execution.

| Local artifact | SHA-256 |
|---|---|
| `artifacts/immersive-office/BlueOffice-room-preview.mp4` | `56b1fa4d15f5b2bd2ba30da9b34c53979c3787a9a8e5e652fff63d22a7a35dce` |
| `artifacts/immersive-office/home.png` | `53e65cc7090aa6328e63b41499b5075419b206f1ebbc5ab5398ba6d0b2cf6c86` |
| `artifacts/demo-video/BlueOffice-demo.mp4` (earlier design) | `ac42ab8e202b6a6441a3e1c23288636f1e1026d9ac1c039f148163a9b38099b6` |

## Verification disposition

The following records describe the application before documentation closeout. They are not fresh release attestations for the checkpoint commit.

| Evidence | Result and boundary |
|---|---|
| Local `check`, `artifacts/verification/2026-10-09T04-27-28.001Z-check-2dd1a944/report.json` | Passed with an unchanged working-tree fingerprint, before the application commit. |
| Local `verify:ui`, `artifacts/verification/2026-10-09T04-28-11.194Z-ui-b247da5b/report.json` | 42 browser scenarios passed at `4fff38f`; fixtures only. |
| Local `verify:integration`, `artifacts/verification/2026-10-09T04-28-43.850Z-integration-df37f2de/report.json` | Seven installed-Hermes suites passed at `4fff38f`; synthetic provider transport. |
| [GitHub run 37884057642](https://github.com/kriss-spy/blueoffice/actions/runs/37884057642) | Offline checks passed. Fixture browser flows had multiple scenario failures and reached the overall timeout. The cause is unresolved; do not classify it as only a slow runner. Failure log preserved in `artifacts/immersive-office/closeout/github-browser-failure.log`. |
| Product/visual acceptance | User classified this as a concept. The revised furniture, motion, first-use experience and performance have no new release acceptance. |

The documentation-only closeout runs `npm run check` again and preserves its normal report under `artifacts/verification/`. Closing an unmerged experiment does not require pretending its integration gates passed. If this work is later resumed for integration, fix and verify the CI failures, rerun applicable combined-branch gates, and obtain current evidence for every claimed acceptance criterion. `npm run verify:release` and its product, visual, performance and live-routing gates remain unchanged.

## Asset provenance and remaining limits

The user made the BlueOffice logo with the [BlueArchive-Style Logo Generator](https://symbolon.pages.dev/). This records the supplied source; it is not a blanket redistribution-rights attestation. The final room furniture is authored in this repository, not extracted from the game. KDE theme sources informed reference study; no theme artwork was copied. Its source-code licensing does not automatically cover game artwork. The private Yuuka import used in captures remains separate from the distributable source.

This prototype does not settle production art rights, native sit/stand/typing animation, final visual quality, newcomer usability or the revised scene's performance budget. Existing management forms are functional material for future redesign. Older performance and visual reports retain their original scope and limitations.

## If a later version is requested

Start with one polished loop: enter the office, notice one assistant working, click the character, use a short conversation window, watch a task begin with a convincing seated work transition, see completion return the character to standing idle, then close the window and remain in the room. Validate this with the intended art and with the user before expanding setup, history or overview UI. These are lessons for a possible future effort, not active assignments.
