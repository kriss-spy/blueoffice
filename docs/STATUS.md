# v1 beta implementation status

Goal: solve all 21 GitHub tickets, including the P1 tickets. Source of scope: [PRD](PRD.md), [implementation plan](IMPLEMENTATION-PLAN.md), and the live GitHub acceptance criteria. A passing harness does not establish a finished beta.

| Ticket | Current implementation evidence |
|---|---|
| #1 Hermes RPC contract | Isolated installed-runtime harness, synthetic wire fixtures and [capability report](validation/hermes-contract.md). Reviewed and published in [PR #22](https://github.com/kriss-spy/blueoffice/pull/22). Merged; ticket closed. |
| #2 Avatar/workstation proof | Offline R3F cutaway, intended native GLB normalization/validation, independent duplicate rigs, coherent anchors, camera and fixture chat implemented. [Technical and browser evidence](validation/avatar-proof.md) passes; independent reviews pending. Seated-work and public distribution gates remain #15/#18. |
| #3 Owned runtime/chat | Implemented React DOM roster/chat, owned process supervision, durable identities and command receipts, loopback protection, and safe restart. [Verification](validation/owned-chat.md) covers actual installed Hermes and independent fixture/browser tests. Reviewed and merged in [PR #23](https://github.com/kriss-spy/blueoffice/pull/23). Merged; ticket closed. |
| #4 Model routing | Implemented named native providers, proof-gated model selection, effective-route validation, and classified failures. [Live and synthetic evidence](validation/model-routing.md) passes both API families, tools, auxiliary and delegated-child calls. Reviewed and merged in [PR #24](https://github.com/kriss-spy/blueoffice/pull/24). Merged; ticket closed. |
| #5 Profile configuration | Implemented setup persona/tools/approvals, stopped-profile settings, revision conflicts, native readback, explicit adoption and durable adoption recovery. [Verification](validation/profile-settings.md) passes native, synthetic and browser checks; independent reviews cleared corrections. Avatar/workstation selectors still depend on #13/#14; #5 remains open. Published in [PR #25](https://github.com/kriss-spy/blueoffice/pull/25). |
| #6 Clarification | Structured schema validation, multi-select, durable individual batch locks, final-tail replies, exact once-only admission, visible expiry and unknown attention. [Native, RPC and browser evidence](validation/clarification.md). Independent reviews cleared the replay correction; merged in [PR #26](https://github.com/kriss-spy/blueoffice/pull/26); ticket closed. |
| #7 Approval | Implemented distinct supported schema/shield controls, durable exact decisions, keyboard attention focus, native resolution/expiry and uncertain-delivery handling. [Native action outcomes and RPC/browser evidence](validation/approval.md) pass; independent Standards and Spec reviews are clear. Merged in [PR #27](https://github.com/kriss-spy/blueoffice/pull/27); ticket closed. |
| #8 Recovery | Ordered normalized journal, consistent checkpoints, native replay/open-request reconciliation, safe gap recovery, browser reauthentication and scroll/selection restoration implemented. [Native, adversarial and browser evidence](validation/recovery.md) passes. Independent reviews are clear; merged in [PR #28](https://github.com/kriss-spy/blueoffice/pull/28); ticket closed. Explicit stored-history resume remains #12. |
| #9 Live office / #10 Overview | Basic DOM roster/attention summary implemented; live room and full overview behavior remain open. |
| #11 History / #12 Explicit resume | Native owned-history resume probed in #1; application views and capability policy not implemented. |
| #13 Asset import / #14 Editor / #15 Seated-work gate | Not implemented. |
| #16 Accessible fallback / #17 Performance / #18 Release verification | Not implemented. |
| #19 Café motion / #20 Layout transfer / #21 Child activity | Not implemented. Remain in the requested all-ticket scope. |

Verification commands for implemented foundations are in the capability report. Keep this ledger factual as application work lands; do not close visual, performance, or release gates on fixture-only evidence.
