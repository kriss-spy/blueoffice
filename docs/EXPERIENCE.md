# BlueOffice experience and interaction specification

Historical proposal, 2026-10-08. Its persistent sidebar composition was rejected in user feedback. The final v1 experiment uses a full-viewport room and explicitly opened windows; see [the presentation contract](IMMERSIVE-OFFICE.md) and [prototype lessons](V1-PROTOTYPE.md). Retain the following as design history, not the current screen specification. The [visual research](research/visual-assets.md) separates observed café features from these proposed office behaviors. This document is a wireframe specification, not a visual mockup or captured game UI.

## Screen composition

Desktop baseline: 1440×900. Home is the room with the selected agent's chat on the right, initially about 360–420 px wide and resizable. The header holds Home, Office, Activity, connection state, and settings; Edit office belongs to the room toolbar. Office opens the agents/furniture overview and Activity opens the sessions overview over the room area, preserving the selected chat. Attention appears near the header, outside the 3D occlusion system. At 1280×720 keep chat useful and reduce the room's framing/zoom; below the agreed desktop size, use a drawer/list-oriented adaptation.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ BlueOffice    Home   Office   Activity      Needs you: 2   Connected │
├───────────────────────────────────────────────┬─────────────────────┤
│                                               │ Agent / session     │
│         elevated diagonal office              │ Current status      │
│                                               ├─────────────────────┤
│  rear wall / shelves                          │ Public conversation │
│       [?] Yuuka      [tool] Hoshino             │ Tool activity       │
│        desk             desk                  │                     │
│                                               │ Question or approval│
│    lounge              workstation             │ card, when pending  │
│                                               ├─────────────────────┤
│  Zoom −/+   Reset     Agent list toggle        │ Composer / controls │
└───────────────────────────────────────────────┴─────────────────────┘
```

Character names above illustrate avatar choices, not a final roster. Agent names remain separate: an assistant named Research can use Yuuka without pretending the model is an in-universe character.

## Camera and visual direction

The confirmed direction is a modern open office with computer workstations and an actual café bar. Use [the supplied recording capture](references/modern-office/START-HERE.md) for seated character/furniture scale, desk props, monitor presentation, and overhead reaction quality. The recording is a workstation close-up; the full open floor plan and bar come from the user's requirements.

Organize the room into an open work area and a shared café edge: low desk clusters with monitors/chairs, clear aisles, and a visible rear/side counter with coffee equipment, cups/display, and stools or café seating. An optional sofa or café table complements the bar. Keep tall shelving/partitions out of central sightlines. Prefer simple modern surfaces and coherent furniture rather than copying the ornate library furnishings.

The earlier library/study is retained as a possible independent office for a main secretary agent. A classroom-like alternate world is deferred until office mode is accepted as good enough; the attached classroom image is not the default office reference. The existing homepage concept predates this refinement and demonstrates navigation rather than the final room art direction.

Use a real 3D cutaway diorama with an orthographic default and fixed diagonal azimuth. Start calibration around 30–40° elevation; tune against the official café reference, not a claim about the game's exact projection. Allow bounded pan/zoom and Reset View. Opening chat refits the available room viewport with a short transition that respects reduced motion. Do not zoom automatically away from a pending question.

Favor bright but restrained materials: pale floor/walls, soft daylight, clear chibi faces, cyan UI accents, subtle ground shadows, rounded furniture edges. Preserve native character textures initially; inspect color space, transparency, halos, and face layering before changing materials. Uniformity between furniture and characters matters more than postprocessing. Keep text on normal high-contrast HTML surfaces.

The supplied logo remains a branding reference. Wallpapers, game icons, fonts, voice lines, and music have separate sourcing terms; they are not implicitly part of the runtime pack.

## Selection and navigation

- Avatar/nameplate click: select the persistent agent and show its foreground or last-viewed session.
- Assigned workstation click in normal mode: same agent selection.
- Question marker click: select agent/session and focus the exact pending question card.
- Permission marker click: focus the distinct permission decision card.
- Activity session click: inspect that history without replacing the live foreground session. Resume is an explicit supported action.
- Background drag: pan. Pointer wheel: bounded zoom. Dragging the chat resize handle never pans the room.
- Keyboard list navigation offers all these actions. Canvas hover should not be a prerequisite.

Selection is shared across Office, Activity, and chat. Preserve a pinned session view if the user is reviewing history; a new event adds an attention marker instead of unexpectedly replacing what they are reading. Multiple avatars with the same character are distinguished by persistent nameplates and selection rings.

## Onboarding and full management

First launch shows the room shell and an Add agent action. Read-only discovery reports installed Hermes revision, profile availability, and proxy reachability without spending model tokens. Missing protocol/model-route requirements have precise diagnostics.

Agent setup gathers name, new/adopted profile, workspace, model/API family, persona/SOUL choice, tool/approval settings, avatar, and workstation. Existing profile adoption explicitly identifies it as external configuration and checks for another live owner. Newly created profiles do not inherit messaging credentials, scheduled tasks, or histories by accidental directory copying.

Settings separate profile defaults from current-session overrides. Show the effective model/provider/API family and whether a change applies now, next turn, or after restart. Surface partial configuration success at the field/section level. Use “Start agent,” “Interrupt task,” and “Stop agent” labels consistently. An offline assistant's history/settings remain accessible.

## Chat panel

Header: agent name, avatar thumbnail, runtime status, session picker, and effective model. Conversation: public user/assistant messages and collapsible tool activity; streaming text is batched so the panel remains responsive. Composer is scoped to the displayed session. During busy work, show only verified steering/queue behavior; otherwise disable Send with the reason and provide Interrupt task.

Pending clarification lives in a persistent card above the composer, containing actual question text, options if supplied, and a free-text answer when allowed. Batch questions retain separate progress. Answer submission has pending/delivered/resolved/stale states; clicking twice does not send twice. The question marker remains until resolution/expiry evidence arrives.

Approvals show the actual permitted choices and redacted action context. A general assistant sentence asking “shall I continue?” does not acquire permission authority. Sensitive secret/sudo requests use a dedicated private form or a clear handoff state; their content is excluded from room bubbles and ordinary transcripts.

Errors distinguish invalid configuration, proxy unavailable, tool failure, turn failure, quota reached, and transport disconnected. A failed tool may be recovered by Hermes in the same turn; do not show a permanent agent failure merely because one tool errored.

## Status motion and dialogue

| Semantic state | Preferred motion | Fallback | Bubble/marker |
|---|---|---|---|
| Idle | Inspected café idle | Stable pose | Name/status only |
| Moving to desk | Inspected walk, with office navigation | Short reposition transition | Status still current |
| Working | Verified workstation typing or focused work loop | Café idle/attentive pose | Ellipsis or tool icon, factual label |
| Question pending | Looking-up/reaction followed by restrained waiting pose | Idle | Persistent `?` and exact question preview |
| Approval pending | Waiting pose | Idle | Distinct shield/lock |
| Completed turn | Short inspected success/reaction | Small nameplate success cue | Brief “Finished” marker; transcript is authoritative |
| Failed/limited | Restrained reaction | Static warning | Error class label |
| Stopped | Resting pose/frozen idle | Stable pose | Muted “Stopped” |
| Disconnected | Suspend uncertain visual work | Last safe pose | Connection/unknown label |

Clip mappings are per character; `Cafe_Reaction` is a candidate that must be inspected. Do not assume it expresses confusion or approval. A clip's name alone cannot establish emotional suitability.

Motion is presentation only. A character arriving at a desk does not start a model turn. A completion animation does not mark success. New attention appears immediately even during a walk/animation, and can preempt a decorative transition. Decorative reactions are brief; unresolved attention persists without repeated jumping or alarming loops.

Bubble policy: at most one expanded excerpt per selected/attention agent, with compact markers for others. Keep excerpts roughly one or two short lines, avoid raw commands/paths by default, and expose the full content in chat. Use public output or deterministic labels, not an extra LLM generating fictional status dialogue. Resolve screen collisions through offsets/collapse; never hide the final indication of an unanswered request. All pending items also exist in the attention queue.

## Office overview

Agents tab contains name/avatar/profile, runtime state, foreground task excerpt, attention count, character/workstation, and Start/Interrupt/Stop/Configure actions subject to capabilities. Counts distinguish “8 configured,” “3 running,” and “2 need input.” A registered assistant with no desk appears in an unassigned list and a visible standing/reception slot.

Furniture tab contains pack/category/count, placed instance list, linked workstation/agent, and Locate/Edit actions. Occupancy and agent assignments are separate: empty furniture remains after an assistant stops. Deleting an occupied workstation requires an explicit reassignment or leaves that agent visibly unassigned; it never terminates its session.

## Activity overview

Session list columns: agent, title, source, start/last activity, outcome/live freshness, and usage when supplied. Filters: agent/profile, Chats/Automation/All, source, time, attention/error, and text search where supported. Group delegated child activity only when lineage identifiers exist.

Detail view presents public conversation, tool timeline, session/run identifiers in an advanced section, provenance/owner capability, and available metrics. Missing cost is “Unavailable,” not zero. Historical unfinished state is “Unknown outcome” without proof of current execution. “Resume” and live controls remain disabled when the adapter lacks the required ownership/capability.

## Furniture editing

Edit mode exposes a catalog, grid, footprint ghost, rotate, select/move/delete, undo/redo, and Save/Cancel. Rotation is initially in 90° steps. Invalid room bounds, overlapping occupied footprints, and blocked workstation approach cells show why placement fails.

A workstation is an assembly: desk, chair, computer/keyboard, and interaction anchors. Moving/rotating the assembly carries its children and assigned avatar target. Moving an individual component explicitly detaches it or updates the assembly and revalidates compatibility. Save does not change current agent work; standing/waiting pose can be used during visual relocation. Undo changes room placement, not Hermes commands.

## Accessibility and failure states

Provide accessible agent/session lists, keyboard focus, persistent request cards, status text, and reduced-motion controls. Never rely on a bubble's color or a face expression alone. When WebGL/assets fail, keep overviews/chat/control usable and show the affected asset diagnostic. Context loss should recreate the scene from layout/state while the backend remains connected.

Verify dense-room cases: simultaneous requests, selected avatar behind furniture, open chat reducing viewport, character without a work clip, reused character models, and background tab returning to a newly completed turn. These checks belong to the validation gates in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).
