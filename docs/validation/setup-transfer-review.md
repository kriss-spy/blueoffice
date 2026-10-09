# Setup, overview and portable layout independent review

Two independent Astra High reviewers inspected the frozen diff `f953ef9...ec6f6e4`, originating GitHub issues #5/#10/#20, repository verification requirements, and actual evidence. Both inspected the matching clean fingerprint in the passing offline, installed integration and 22-scenario browser manifests from 2026-10-08 15:40–15:41 UTC.

## Specification

All seven #5 criteria and all seven #10 criteria were supported: complete setup and assignments, independent canonical profiles, explicit single-writer adoption, native partial readback, unknown-key/revision preservation, stopped-runtime settings, durable stable identities, overview counts/actions/inventory/Locate, duplicate character identity, two-assistant task/request/stop/configuration isolation, and safe unassignment.

Two #20 blockers were independently reproduced with disposable data: a bound unavailable desk was retained in storage but lost on export; 64 imported foreign references plus an unrepresented local assistant produced a 65-entry export rejected by the schema.

## Standards

No additional hard documented-standard or security violation was identified. Review covered strict schemas, relative paths, own-property bindings, exact asset hashes, separate preview/assigned caches, authenticated endpoints, setup reservations, durable adoption and preservation of latest runtime state. No material additional Fowler smell was reported.

## Corrections and evidence

Commit `9cd3dd6` integrates the worker correction: reference capacity covers local plus portable identities, export self-validates, and missing desk references survive fallback/unrelated saves until an actual assignment supersedes them. Root adds creation/adoption/recovery capacity reservations before profile side effects. Seventeen focused setup/transfer tests pass, including concurrent final-capacity admission, adoption with zero helper writes, repeated transfer generations and missing/incomplete workstation preservation.

The CI browser attempt had a 240-second runner timeout, not an assertion failure; it remained failed. The suite now has a bounded 600-second budget and existing per-test limits. Cleanup tolerates a normal teardown removing its root first, while refusing to remove an existing unowned root. Seven runner checks pass. Final combined gates, targeted independent re-review and both required GitHub jobs are still required before merging or closing #20. These records do not assert fresh live-provider, visual, performance or release acceptance.
