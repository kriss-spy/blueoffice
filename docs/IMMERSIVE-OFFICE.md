# Final v1 prototype: room-first office

The home screen is a full-viewport café office. Agent rosters, chat, history, setup, and office settings open only through explicit interaction. Chat and the roster are movable in-room windows; opening them does not resize the canvas. The existing workflow forms are retained inside windows for a later interaction-design pass.

## Reference decisions

- The local `capture/blue-archive/DESIGN.md` and café screenshots establish the room-dominant composition, warm flooring, cool lower walls, small edge controls, and overhead character reactions. Publisher tutorial annotations are not persistent interface elements.
- [KDE Blue Archive Theme](https://github.com/Sadowski-Krystian/Blue-Archive-Theme-KDE-Plasma): inspected README, window-decoration SVG source, and repository structure. Its pale cyan/white controls and diagonal window treatments informed the direction. No source artwork was copied. Its README expressly excludes official artwork/wallpapers from the source-code GPL grant and restricts wallpaper permissions to that theme.
- Asset discovery also checked the Blue Archive Models reference, Schale-Archive, and a creator's [Schale desk/chair model](https://booth.pm/ja/items/6422715). This iteration does not contain extracted game furniture. Room meshes are authored in this repository, keeping workstation and navigation coordinates intact.

## Presentation contract

- The initial view has no open information windows or sidebars. Icon buttons have accessible names and hover labels. A small Demo indicator identifies synthetic fixture mode.
- Clicking a character or choosing an assistant opens its conversation. Closing and reopening preserves an unfinished draft for that selected assistant. Escape closes the topmost game window unless a modal interaction is active.
- The room remains interactive around nonmodal windows. Window dragging is bounded to the viewport, and resizing resets the window to its centered position.
- Furniture uses warm timber, blue cushions, parquet, window frames, a paneled café counter, and softer daylight. Decorative geometry is reduced with the existing quality option.
- Real character clips crossfade and nearby presentation transforms ease into their target. Compatible characters face the computer in the existing seated work pose; finished actors return to standing. Reduced motion and paused state settle directly into the authoritative pose.

## Limits and acceptance

The private Yuuka pack used for local screenshots is not bundled with this change. Its seated work clip is an authored static skeletal pose, not a native sit-down or typing animation. Crossfading improves transitions but does not supply missing animation art.

This is the final visual experiment preserved in the [closed v1 concept prototype](V1-PROTOTYPE.md). The user classified the result as a concept; this is not aesthetic approval or a request for another implementation pass. Previous beta visual/performance attestations do not accept this changed scene. Automated browser checks exercise navigation and runtime contracts; fixture footage is not evidence of live-provider routing or user aesthetic approval.
