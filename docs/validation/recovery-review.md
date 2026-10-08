# Recovery review

Fixed baseline: `074d5ba2d1cf13fb6bc0afc14fba1745d8580ba3`. Final reviewed implementation: `a306361`. Standards and Spec were reviewed independently.

## Standards

The reviewer found a P1 credential-prefix leak at a native snapshot boundary. The fix sanitizes unfinished cumulative text before persistence and retains redactor state into subsequent deltas. The reviewer verified every split boundary of the synthetic credential, normalized journal/snapshot privacy, and the active-message binding. The follow-up checks also cover the cumulative-tail separation described below.

Final Standards report: “Zero new Standards or privacy findings in `a306361`.” The reviewer independently checked all 19 credential split boundaries after a completed interim segment; each preserved that segment and produced `Hello [redacted] world`.

## Spec

The reviewer identified three related recovery errors: inferring a task outcome from a completed interim segment; duplicating a recovered active prefix at terminal replacement; and reopening a sealed interim when native cumulative text included it. Fixes persist explicit terminal-turn evidence, retain an independent active-message association, and derive the unfinished tail without reopening sealed segments.

Final Spec report: “Resolved in `a306361`. Recovery now separates sealed interim text from the unfinished cumulative tail before redaction, preserves sealed messages, and continues only the active segment. All seven focused recovery tests pass, including both tool-boundary cases. The earlier false-completion fix remains intact. No remaining demonstrated Spec findings from this review.”

Final result: Standards 0 remaining findings; Spec 0 remaining findings.

No live model calls were made by either reviewer. Regression cases are committed in `tests/office.test.ts` and `tests/replay.test.ts`.
