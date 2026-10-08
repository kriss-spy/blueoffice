# v1 beta implementation status

Goal: solve all 21 GitHub tickets, including the P1 tickets. Source of scope: [PRD](PRD.md), [implementation plan](IMPLEMENTATION-PLAN.md), and the live GitHub acceptance criteria. A passing harness does not establish a finished beta.

| Ticket | Current implementation evidence |
|---|---|
| #1 Hermes RPC contract | Isolated installed-runtime harness, synthetic wire fixtures and [capability report](validation/hermes-contract.md). Reviewed and published in [PR #22](https://github.com/kriss-spy/blueoffice/pull/22). Awaiting merge. |
| #2 Avatar/workstation proof | Not implemented. Intended-character permissions and seated-work visual gate remain required. |
| #3 Owned runtime/chat | Implemented React DOM roster/chat, owned process supervision, durable identities and command receipts, loopback protection, and safe restart. [Verification](validation/owned-chat.md) covers actual installed Hermes and independent fixture/browser tests. Reviewed and published in [PR #23](https://github.com/kriss-spy/blueoffice/pull/23), stacked on #22. Awaiting merge. |
| #4 Model routing | Implemented named native providers, proof-gated model selection, effective-route validation, and classified failures. [Live and synthetic evidence](validation/model-routing.md) passes both API families, tools, auxiliary and delegated-child calls. Review/publication pending. |
| #5 Profile configuration | Native operations probed in #1; application settings/conflict handling not implemented. |
| #6 Clarification / #7 Approval | Basic browser cards and exact response registry implemented. Full multiselect, partial batch locks, expiry/replay matrix, and permission persistence remain open. |
| #8 Recovery | Durable office snapshots/receipt registry and browser SSE reconnect implemented. Full normalized event journal, replay-gap reconciliation, and resume recovery remain open. |
| #9 Live office / #10 Overview | Basic DOM roster/attention summary implemented; live room and full overview behavior remain open. |
| #11 History / #12 Explicit resume | Native owned-history resume probed in #1; application views and capability policy not implemented. |
| #13 Asset import / #14 Editor / #15 Seated-work gate | Not implemented. |
| #16 Accessible fallback / #17 Performance / #18 Release verification | Not implemented. |
| #19 Café motion / #20 Layout transfer / #21 Child activity | Not implemented. Remain in the requested all-ticket scope. |

Verification commands for implemented foundations are in the capability report. Keep this ledger factual as application work lands; do not close visual, performance, or release gates on fixture-only evidence.
