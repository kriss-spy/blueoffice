# Accessible scene and graphics recovery (#16)

The room now keeps a native assistant selector and an exact pending-request queue outside the Canvas. Each request button identifies its assistant, kind and request ID. Pending requests remain listed when agents are unassigned, their labels are occluded, WebGL cannot initialize or its context is lost. The queue includes unknown freshness instead of reporting uncertain requests as resolved.

Projected labels receive deterministic screen-space offsets, prioritizing pending attention and then the selected assistant. When expanded labels do not fit, compact icons retain request counts and their accessible names. The separate DOM queue is the exact request surface even on exceptionally small viewports. Keyboard focus has a visible outline.

A graphics initialization error or context loss exposes an explicit retry control. Retry recreates only the Canvas and its local resources; it uses current agent and saved layout state. It does not reconnect, send a task, answer a request or alter runtime ownership. Reduced motion and document visibility pause decorative avatar playback while text and request controls remain available. Camera commands are immediate; no animated refit is introduced.

## Evidence

`tests/scene-markers.test.ts` verifies stable packing for eight coincident labels, including distinct compact indications and attention priority. `tests/e2e/scene-accessibility.spec.ts` verifies a keyboard question answer and permission denial with WebGL initialization deliberately unavailable, access to Settings/Office/Activity, and successful graphics retry without changes to epoch, session, request identities or runtime command frames. Its second scenario verifies eight exact pending requests, all agents unassigned, reduced motion, real `WEBGL_lose_context`, and retry preserving requests and ownership.

The focused browser run passed both scenarios (26.1 seconds). An earlier run failed because the test expected an accessible dialog name that the existing settings dialog does not expose; selecting the visible Agent settings heading corrected that assertion. No graphics product failure was concealed by the retry.

Full verification reports are under the worktree's ignored `artifacts/verification/` directory. The parent must rerun applicable gates on the integrated tree. Session-list keyboard improvements and additional button naming belong to #12; their final combined scenario is still required. These tests do not establish dense-office performance or visual material acceptance. Existing asset diagnostics and transport/proxy/quota taxonomy are retained without altering server or history logic.
