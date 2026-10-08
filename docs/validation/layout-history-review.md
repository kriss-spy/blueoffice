# Layout, Activity and seated-work independent review

PR [#33](https://github.com/kriss-spy/blueoffice/pull/33), base `7752cd74410c0ab23614b2c9ac443a6e148334b4`. Two independent Astra High reviewers reviewed the originating issues, concrete user scenarios and `7752cd7...71aca2b`. Corrections were independently rechecked at `e0bba15dbb8ec90b384a1ff3024f13e939cbf396`.

## Standards and correctness

No hard documented-standard violation, demonstrated authentication bypass, external-process takeover or layout transaction defect was found. The reviewer identified stale live metadata in pinned Activity detail: another tab could change Ready to waiting/stopped while detail retained Ready. The correction refreshes semantic metadata while retaining the selected history and its transcript; the new browser scenario verifies another-tab question and Stop. A possible duplicated inventory projection was removed in favor of shared `layoutInventory`.

## Specification

The reviewer reproduced a native pricing defect using installed Hermes' actual SQL writer: absent pricing with one API call becomes numeric estimated cost zero. The reader now requires native pricing status/source; unknown stays Unavailable, evidenced actual zero remains actual, and included subscription zero is explicitly labeled. The updated isolated native probe exercises actual native usage updates. Independent recheck found no remaining actionable #11 defect.

All six #11 criteria and all seven #14 criteria have implementation, native/service or browser evidence in [history11.md](history11.md) and [layout14.md](layout14.md). Review covered pinned inspection versus foreground ownership, missing/unknown metrics, malformed history, pending-input layout edits, safe unassignment, revision conflicts, corruption recovery, assembly anchors, normal selection and actual Locate behavior. Independent review does not replace final combined gates.

## Representative visual acceptance for #15

The independent reviewer accepted the inspected private Yuuka asset (`1a0a7918e45260b43bf9f5920aa98ff29fabed523854d70171443758b09186ae`), saved 180-degree workstation and Locate composition against all seven issue criteria:

- Measured seated pose, keyboard contact, grounded boots and final chair clearance are supported by geometry records and side rendering.
- Generic anchors/tags and quarter-turn renders maintain alignment; documented immediate transitions work.
- Both target resolutions retain recognizable character/workstation engagement, café furniture and circulation with chat open.
- Close renders preserve native face/materials/halo. The reviewer sampled the 34.64-second video and observed actual idle, walk and reaction movement.
- Question/permission captures show separate attention and actionable controls; incompatible assets visibly use standing fallback.
- Asset versions, playback, measurements and unresolved permission decisions are recorded.
- Acceptance uses actual seated character art, not placeholders.

Limits: default overview avatars are smaller than the reference and default desk orientation shows their backs. The accepted representative uses rotation and Locate. Static work/snapping is accepted; typing fingers and natural sitting transitions remain absent. Redistribution remains unresolved; this does not approve full-roster expansion or release completion.

The original independent record is `artifacts/reviews/spec-e0bba15-visual15.json`, SHA-256 `18908be52cfad421f30a453e286c93f789cbcb4375df92c96c21a598befe1ded`. Private render/playback evidence and reproducible measurements are indexed in [seated-work.md](seated-work.md). Restricted character bytes are not committed.

## Current automated evidence

Combined frozen source `e0bba15` passed `npm run check`, `npm run verify:ui` (14 browser scenarios) and `npm run verify:integration`. Reports: `artifacts/verification/2026-10-08T15-09-17.423Z-check-0bb82c23/report.json`, `2026-10-08T15-09-46.488Z-ui-b8ae5f3f/report.json`, and `2026-10-08T15-09-17.424Z-integration-a28d8f31/report.json`. Documentation changes require fresh final reports and both required GitHub checks before merging. No release, dense-office performance or current live-route acceptance is inferred from these fixtures.
