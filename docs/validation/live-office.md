# Live 2.5D office (#9)

The default application now renders the validated R3F room beside the existing chat. The HTML roster, room nameplates, chat header and current Activity summary all use `presentAgent` over the same normalized agent snapshot. Camera/avatar infrastructure is shared with `/?scene=fixture`; actual geometry, depth, lighting and the café counter remain intact.

## State and interaction contract

- Lifecycle, work, attention and freshness remain independent. A working tool can coexist with a pending question; both labels remain visible. Provider limits, failed work, stopped/starting/stopping and unknown/disconnected states are explicit. Unknown state retains pending requests and pauses decorative motion.
- Clicking an avatar, its nameplate or its assigned workstation selects the same stable agent. A nameplate with attention focuses its first exact request; individual question/lock chips focus their own request IDs. Chips remain available when the avatar is outside the camera frame. Selection and attention navigation send no model command or reply.
- Questions/permissions preempt motion until authoritative resolution or expiry. Completion reactions require matching terminal epoch/turn evidence, current freshness and no pending request. Initial history, repeated terminal events and reconnect do not replay cues. Each active cue carries the terminal key and is permanently discarded when attention, freshness or connectivity interrupts it. Neither a later request resolution nor a brief reconnect can reactivate it.
- Scene text uses deterministic state labels. It does not generate dialogue or render hidden reasoning, private tool arguments or raw tool results. Existing public tool lifecycle records remain in chat/Activity.
- Each new agent receives an available persistent default desk ID. Legacy null assignments are migrated without taking a desk already assigned to another agent. Runtime/session restart preserves the binding. Placement editing remains #14.

## Assets and boundaries

The original procedural room and diagnostic placeholders are available immediately. **Character preview** loads the exact locally normalized Yuuka proof from #2 into the live camera/lighting without uploading it. The UI explicitly identifies it as a temporary local preview; it does not silently change saved character assignments. Reload retains agent/desk/work/request identity and shows the missing-asset diagnostic placeholder until a character is loaded again. General versioned pack import and persistent character assignment remain #13.

The common avatar renderer falls back to standing idle with a diagnostic for an unavailable reaction clip; absent required idle produces an explicit scene failure while HTML supervision remains. The focused clip test covers these paths, and #2's missing-clip fixture uses that same renderer. The live view additionally lists missing mapped clips and directs the user to reload a validated pack. Seated work, approved character distribution and performance remain #15/#18/#17; this ticket does not close those gates.

## Browser evidence

[RPC fixture browser report](live-office/browser.json) records the real local server/UI flow with two independently owned fixture agents. Visible Chromium tested:

1. Nameplate, actual workstation geometry and actual avatar geometry all select the same agent.
2. Default framing at 1440×900 and 1280×720, including room, café and chat. No horizontal overflow. Both keyboard and pointer chat resizing preserve the camera target and position; fitting changes scale without panning. Reset returns to the elevated diagonal orthographic view.
3. A running tool plus a structured question remains paused and visible. Exact request focus survives selecting another agent and panning/zooming the waiting avatar outside the frame. Selection/focus does not send POST commands.
4. Terminal completion plays a reaction, a new turn cancels it, and replay/reload does not replay it. A completion arriving while its request is still pending is consumed without a reaction.
5. A lock marker focuses the exact permission form without granting it. An explicit Deny resolves it; reload preserves identities and desk assignments. Missing assets preserve labels and chat actions.
6. No hidden-reasoning, private-system or sensitive-tool fixture canaries appear. Zero page errors.

The [UI state matrix](live-office/state-matrix.json) injects explicit normalized snapshots and transport loss in a separate browser session. It verifies room/list/header/Activity agreement for ready, tool, failed, provider-limited, stopped, starting, stopping, interrupted and unknown states. It also verifies pending-resolution/new-turn cue identity, repeated terminal suppression, and exact request navigation during unknown/disconnected freshness. This is deterministic UI evidence, separate from the RPC and live-model flows.

Local character captures and SHA-256 values are indexed in [captures.json](live-office/captures.json); files remain under ignored `artifacts/live-office/`. Default framing, both resized layouts, pending tool/question, out-of-frame attention and permission captures were visually inspected. The only known console warning is the upstream R3F/Three deprecated Clock; the roughly 988 KB shared scene bundle still triggers Vite's size advisory.

## Controlled live conversation

[Live evidence](live-office/live-conversation.json) uses installed Hermes revision `f1247d2e0146bbd8edd4e510b9e67e0d259509a4` through the production supervisor and the previously verified `glm-5.3-flash` Chat Completions route at CLIProxyAPI. An isolated office database and new owned profile were used. Terminal/file tools were disabled; only the clarification tool group was enabled because current profile settings require one group. The prompt requested a short exact reply and no tools.

The model replied **“BlueOffice live scene verified.”** The room, chat and Activity moved through working to completed using the real normalized event stream. There were zero tool calls, zero human-input requests and zero page errors. The agent was explicitly stopped afterward. No automatic retry or provider fallback was used. This one live conversation is separate from all deterministic tests.

## Regression checks

The full TypeScript suite, all 19 Python protocol/ownership/settings tests and the production build pass. Focused tests cover all state dimensions, terminal-turn cue identity, replay/attention suppression, independent rig ownership/disposal, clip fallback and persistent desk assignment including legacy migration. Independent review results are recorded separately once complete.
