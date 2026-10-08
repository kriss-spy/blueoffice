# Ticket #4 review

Fixed point: `ccfdd1c82b6919c4120586f6bfe6b548e77826a9`. Initial implementation: `08b560c`. Corrections: `8762488`. Two independent reviewers followed the code-review skill’s Standards and Spec axes.

## Standards

Initial findings: (1) auxiliary fallback chains could bypass the pinned route after a failure; (2) a proxy key split across streamed deltas could evade per-frame replacement and reach storage or browser snapshots. The fixes reject auxiliary transport, fallback, credential and request overrides, inspect native task resolution, and buffer possible credential prefixes before publication.

Re-review: “Both findings are resolved in `8762488`.” “No remaining correctness issue found in the fixes under the original Standards scope.” The reviewer independently reran all 20 TypeScript tests successfully, including streamed snapshots, persistence, every split boundary and session isolation. No live calls were made during review.

## Spec

Initial finding: auxiliary API-family and fallback overrides were accepted without verification, violating the required proxy routing and disabled-unverified-route behavior. The fix checks all configured native auxiliary resolutions and rejects route-changing overrides, with synthetic installed-runtime rejection tests for both models. Delegation request overrides are rejected as well.

Re-review: “Original #4 finding is resolved in `8762488`.” “No remaining demonstrable Spec finding in this targeted re-review.” The reviewer confirmed the synthetic positive and rejection evidence and streaming-prefix coverage. No live calls were made during review.

Initial findings: Standards 2, Spec 1, with overlapping route findings counted separately. Remaining findings: Standards 0, Spec 0. Verification details and limitations are in [model-routing.md](model-routing.md).
