# ADR 0001 — local browser office with supervised Hermes RPC

Date: 2026-10-08. Status: accepted by the user. Hermes TUI JSON-RPC is the selected v1 integration; implementation spikes still validate compatibility, ownership, and recovery.

## Context

The user wants Blue Archive café presentation, character models, status motion/questions, side chat, office/session overviews, and full Hermes management in a local browser. The workspace has resources/logo but no existing application architecture. Installed Hermes already provides structured TUI RPC and profile/session controls. Its version predates some current human-input hooks.

## Decisions

1. Build a new focused application. Existing Pixel Agents, Miniverse, and Agent Office provide useful patterns but their rendering/provider/workflow scope does not match closely enough to justify a wholesale fork.
2. React + Three.js/R3F renders a 3D room with a locked oblique orthographic default. Accessible DOM owns panels and request controls. Select compatible stable versions during scaffolding.
3. A local server supervises one stdio Hermes child per managed office agent/profile, with one foreground run per avatar in v1. This is an isolation policy, not a Hermes concurrency limitation.
4. Stable office identities own avatars/desk assignments. Sessions and turns are separate records; live and stored Hermes ids are preserved.
5. Exact human-input requests drive attention. No transcript heuristic, generated dialogue, or decorative motion grants approval or clears a pending question.
6. Keep GLB packs and manifests separate from code. Use supplied character-source evidence plus an explicit import/provenance workflow; use coherent permitted furniture. Seated typing needs its own validation/art work.
7. Persist office state separately from Hermes data. Prefer native history/config APIs; no direct writes to Hermes session databases or proxy configuration.

## Consequences

We own small path/occupancy, animation, asset registry, supervisor, event journal, and office-domain modules. That is more product code than a dashboard plugin, but keeps the proposed independent office experience coherent. The user confirmed local browser delivery, not a mandatory standalone process architecture. Internal Hermes RPC creates a version-support obligation. Separate Python children may cost memory; measure before accepting an 8-agent budget.

## Alternatives retained

- Authenticated existing-dashboard WebSocket owner if lifecycle testing shows coexistence or shared ownership is preferable.
- Hermes dashboard plugin as an alternate delivery mode; consider it before v1 if a small spike proves the full office shell and lifecycle controls fit, avoiding duplicate administration work.
- Babylon.js if an actual asset/material spike demonstrates a practical advantage.
- Shared RPC owner only if profile isolation and shutdown/request ownership remain correct.

## Platform-adapter option — follow-up evaluation

The user's linked [platform-adapter guide](https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters) describes adding a messaging/service channel to the Hermes gateway. Its recommended third-party path is a `kind: platform` plugin implementing `BasePlatformAdapter`; it does not require a Hermes core fork. This is distinct from a dashboard UI plugin.

An office platform plugin is viable: browser messages could reach an office bridge, then its adapter, then GatewayRunner/AIAgent. It would integrate naturally with gateway message routing and scheduled delivery. Installed [base adapter source](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/gateway/platforms/base.py#L2808) already includes approval rendering and `send_clarify` with exact clarification ids and resolution hooks. It also has typing, message editing, tool/message formatting, and session-processing interruption facilities. Do not reject this option as incapable of interactive questions.

The remaining office responsibilities would include profile/runtime lifecycle and settings administration, aggregate session history, structured event transport to the browser, durable request snapshots/reconnect behavior, and identity/layout state. The documented platform interface alone does not establish that full management/replay contract; we would have to implement or connect those pieces. No platform-plugin runtime test was performed.

Decision remains **existing TUI JSON-RPC for the first full-management office**, because the inspected contract already combines session/profile controls, exact pending requests, and replay. Consider an office platform plugin if making the office a native gateway destination for cron/service/channel delivery becomes a priority. If that route is chosen, gateway owns the corresponding conversations; do not also submit those conversations through a second TUI owner.

## Validation and sources

See [Hermes research](../research/hermes-integration.md), [asset research](../research/visual-assets.md), [technology/precedents](../research/technology-and-precedents.md), and S01–S08 in [the implementation plan](../IMPLEMENTATION-PLAN.md). The user selected RPC after comparing the platform-adapter approach. Source inspection supports the decision; runtime compatibility and benchmarks remain unverified.
