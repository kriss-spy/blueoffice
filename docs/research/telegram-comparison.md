# BlueOffice versus Hermes Telegram integration

Follow-up research: 2026-10-08. BlueOffice is a planned product; Telegram is an existing integration. Comparison uses official live docs plus installed source revision `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`. No Telegram account/bot was accessed and no runtime was changed.

## Existing Telegram capabilities

Hermes Telegram supports interactive clarification choices/free text and approvals, typing/progress/streaming presentation, and independent conversation topics. The current documentation also describes user-managed topic creation/restoration. These are existing features, not BlueOffice inventions. [Telegram guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram)

Messaging commands include new/resume/session search, status/usage, interruption via `/stop`, model selection among configured providers, and gateway restart. Admin session listing can span origins. `/start` is a reachability/first-contact command; it does not launch a stopped local agent service. Adding a new provider/API key is directed to terminal setup. [Slash-command reference](https://hermes-agent.nousresearch.com/docs/reference/slash-commands/)

Installed Telegram implementation includes draft streaming, clarification and native approval rendering. [Adapter source](https://github.com/NousResearch/hermes-agent/blob/f1247d2e0146bbd8edd4e510b9e67e0d259509a4/plugins/platforms/telegram/adapter.py#L4118). Version-specific behavior must still be tested; current website documentation can be newer than the installation.

## Planned additional office capabilities

| BlueOffice requirement | Existing Telegram experience | Nature of the difference |
|---|---|---|
| Interactive 2.5D room, character rigs, motion and furniture placement | Messages, media, reactions, buttons and topics | Ordinary bot chat does not offer an arbitrary interactive scene/layout editor. Requires a custom web UI. |
| Persistent avatar/desk/profile mapping across conversations | Bot identity and topic/session associations | BlueOffice adds durable spatial identity/configuration; Telegram topics already provide session separation. |
| Simultaneous roster/status/attention view across configured agents | Chat/topic-specific progress, notifications and status commands | Unified office-wide dashboard is planned, absent from the inspected stock chat UI. A custom bot dashboard could approximate it. |
| Create/adopt/configure profiles and individually start/stop owned runtimes | Session commands, model changes, task interruption and gateway restart | An owned-process supervisor and administration UI add scope; not equivalent to `/stop` or `/restart`. Custom backend commands could add this to Telegram too. |
| Rich activity view: profiles, sources, time/status filters, transcript/tool detail and lineage | Session list/search/resume, usage/insights and chat history | Adds a coordinated visual history browser rather than new session-memory or inference capabilities. |
| Room + selected side chat + exact attention form all visible together | Switch between chats/topics and individual message cards | Custom multi-panel composition; ordinary chat does not directly provide it. |
| Browser refresh restores complete office snapshot and open requests | Message history/cards plus gateway-specific pending state | BlueOffice needs its own state/replay contract. Telegram retaining a message is not identical to an office state snapshot; Telegram already maintains genuine pending-request identities. |
| UI/control operates locally without Telegram connectivity | Bot communication depends on Telegram transport | Local app removes that transport dependency; model providers may still require internet. |

These are product/interface judgments against the inspected stock integration, not proof that Telegram could never be extended. The most important functional additions are aggregate state and managed-runtime administration. Café visuals, layout editing, and simultaneous panels require the custom renderer/UI regardless of the agent transport.

## What “cannot” means

Normal Telegram chat cannot directly become the specified arbitrary 3D office/editor just by adding bot messages. But Telegram supports JavaScript/HTML5 Mini Apps, so a custom office could be embedded inside Telegram. [Official Mini Apps documentation](https://core.telegram.org/bots/webapps)

That would still require building the scene, office state service, management APIs, authentication/routing and synchronization. It would be BlueOffice delivered through a Mini App, not functionality obtained automatically from the stock Hermes Telegram adapter. WebGL/device compatibility and access to a local Hermes server would require separate validation.

Likewise, individual runtime creation/stopping and cross-profile administration are not inherent Telegram prohibitions: a custom service or plugin can expose them. They are outside the stock integration scope reviewed here. Do not describe Telegram as unable to ask questions, obtain approval, handle parallel sessions, show progress, interrupt work, or resume history.

## Consequence for integration choice

This comparison does not prove an office platform plugin is inadequate. It could reuse gateway messaging capabilities much as Telegram does, adding structured office events, snapshots and management operations. TUI RPC remains the current provisional recommendation because the required session/profile/request/replay contracts were inspected together. Validate the amount of additional code for each route before committing; do not justify RPC using capabilities Telegram already has.

See [ADR 0001](../decisions/0001-local-office-architecture.md) and [Hermes integration research](hermes-integration.md).
