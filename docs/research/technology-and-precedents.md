# Technology and agent-office precedents

Research date: 2026-10-08, Asia/Shanghai. This is a feasibility study, not a running benchmark. All product choices below are recommendations. User-confirmed target: local browser application with full Hermes agent management.

## Recommendation

Build a small, purpose-built React/TypeScript application with React Three Fiber (R3F), Three.js, and a local TypeScript server supervising Hermes processes through structured RPC. Render a real 3D room through a locked orthographic camera to produce the requested 2.5D presentation. Keep chat, configuration, office inventory, and session history in ordinary accessible HTML panels.

The expensive uncertainties are asset conversion/material fidelity, safe multi-profile process ownership, and reliable pending-request recovery. None requires replacing Hermes or implementing a language-model loop. Validate these before investing in room decoration.

## Renderer evidence

| Question | Primary evidence | Design consequence |
|---|---|---|
| Can a browser render the desired perspective? | Three.js [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html) preserves apparent object size with distance. | Use an orthographic default. Exact Blue Archive camera values remain a visual calibration task. “2.5D” is the presentation, not a requirement for flat sprites. |
| Can the React UI and 3D scene coexist? | [R3F introduction](https://r3f.docs.pmnd.rs/getting-started/introduction) describes a React renderer for Three.js and React-major compatibility. | Use React for both the scene composition and panels. At implementation, pin a compatible stable pair; do not select the v10 alpha just for WebGPU. |
| Can models contain animations? | [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) loads glTF 2.0 and exposes animation clips. [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) defines skins, transform animation, and morph targets. | Normalize runtime assets to GLB. Embedded clips do not provide status semantics; a manifest must map them to office actions. |
| Can identical characters animate independently? | [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) supports an independent player per object. [SkeletonUtils source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/utils/SkeletonUtils.js) clones skeleton/bone associations while sharing geometry/material references. | Clone each rig correctly, create a mixer per avatar, and clone only materials needing individual changes. Ordinary scene cloning alone is insufficient for independent rigs. |
| Can transitions be soft? | [AnimationAction](https://threejs.org/docs/pages/AnimationAction.html) supports fading between clips and loop control. | Crossfade compatible poses; do not blend across incompatible seated/standing origins without a transition. |
| Can bubbles stay legible? | [Drei Html](https://drei.docs.pmnd.rs/misc/html) projects HTML from scene objects and supports occlusion. | Start with projected DOM status/bubble anchors. Keep important requests available in an unobstructed panel even if the character is behind furniture. |
| Can it stay economical while idle? | [R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) documents demand rendering; [performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) advises imperative frame updates and resource sharing. [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) exposes tab visibility changes. | Use demand mode when all visual motion rests; schedule frames while mixers/transitions run. Suspend decorative rendering when hidden while the server keeps agents alive. |
| Can malformed conversions be detected? | [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) produces validation reports and asset statistics. | Save a validator report for every shipped asset. Also inspect visually: structural validity does not prove correct shader, pose, scale, or permissions. |

## Alternatives

These judgments are specific to a control dashboard with a game-like center, not general engine rankings. No comparative performance measurements were run.

| Option | Strength for this project | Cost or uncertainty | Decision |
|---|---|---|---|
| Three.js + R3F + DOM | Direct React integration; orthographic scene; GLB rigs; normal web chat/config UI. | Need our own pathfinding, furniture anchors, and animation controller. | Recommended. These are small, bounded systems for one room. |
| Plain Three.js + DOM | Same rendering foundation; full imperative control. | Additional scene lifetime/state integration code. | Valid fallback if a renderer owner prefers imperative code; not a reason to rewrite the product. |
| Babylon.js + React/DOM | Engine tooling and asset containers; [loader docs](https://doc.babylonjs.com/features/featuresDeepDive/importers/loadingFileTypes/) cover GLB and animation imports. [camera docs](https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction/) cover target-centered controls. | Another scene API; still needs the same Hermes adapter and UI/domain rules. | Strong second choice if the asset spike finds better material support or team familiarity. No evidence it is required. |
| Godot web export | Dedicated game editor and animation authoring workflow. | [Official export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) require WebAssembly/WebGL 2, describe web limitations, and restrict Godot 4 web rendering to Compatibility. | Better if this becomes a substantial game. For a web management tool, DOM integration and another export pipeline add work. |
| Unity web build | Natural ecosystem for Unity-origin game assets. | Original shaders, engine dependencies, and redistribution are not solved by choosing Unity; web shell integration must still be built. | Do not choose solely because the reference game uses Unity. No Unity proof of concept was evaluated. |
| Canvas 2D/Pixi-style sprites | Simple static room and small sprite animations. | Directional sprite generation; 3D furniture placement/occlusion becomes manual; loses the user's requested character-model workflow. | Reserve for degraded rendering or a future lightweight mode. |

## Existing offices: reuse patterns, avoid a wholesale fork

### Pixel Agents

The [owner repository](https://github.com/pixel-agents-hq/pixel-agents) documents a standalone browser CLI, animated agents, furniture/layout persistence, and a typed provider boundary. Its current reference provider is Claude Code. Hooks and transcript heuristics normalize into events; the scene uses Canvas 2D. Repository code is MIT, but bundled/external artwork has separate provenance.

Useful pattern: separate provider integration, normalized domain state, transport, and visual behavior. Its sprite renderer and Claude-specific observation do not satisfy Blue Archive GLB avatars or Hermes control. Forking would require replacing two central subsystems. Recommendation: study its boundaries and layout editing UX; write our own smaller Hermes adapter and 3D room.

### Miniverse

The [owner README](https://raw.githubusercontent.com/ianscott313/miniverse/main/README.md) documents HTTP heartbeats, state-driven citizens, and speech actions. It distinguishes an in-world speech bubble from delivery to another agent's inbox.

Useful pattern: cheap semantic status drives animation. For this product, passive heartbeat status is insufficient: an unanswered Hermes clarification must retain an exact request identity and a real reply path. Do not turn a bubble into a pretend message channel.

### Agent Office

The [owner repository](https://github.com/AgentSystemLabs/agent-office) is a 3D agent workplace with desk workers and shared terminals. Its [architecture](https://raw.githubusercontent.com/AgentSystemLabs/agent-office/main/docs/how-it-works.md) includes PTY supervision, provider hooks, and ACP request-based status. Its [package manifest](https://raw.githubusercontent.com/AgentSystemLabs/agent-office/main/package.json) uses React, Three.js, Vite, and a Node server; its code license is MIT.

Useful pattern: a server owns agent processes, while the browser owns the room; exact permission/question events are more useful than terminal appearance. Its multiplayer, voice, project floors, service tunnels, and shared shell scope exceed our first version. Replacing its workflows and character pipeline would be an architectural migration, not a theme change.

### Build-versus-fork conclusion

Use a new application with narrow modules rather than fork any of these products. Reconsider only after a small code-reuse audit shows an isolated module that saves measurable effort, including its license and tests. Similar screenshots are weak evidence of backend compatibility.

## Local context and its evidentiary limits

The workspace initially contains `RESOURCES.md` and `BlueOffice-logo.png`, with no application or Git repository. “BlueOffice” is used as a working product name; it is not a branding decision requiring implementation now.

The user's notes supplied precedent links, not authoritative capabilities. Retrieved read-only via CloudNotes:

- **Pixel Agents**, `study/AI/explore AI/agent/multi agent/agent offices/Pixel Agents.md`, created 2026-10-03.
- **Miniverse**, `study/AI/explore AI/agent/multi agent/agent offices/Miniverse.md`, created 2026-10-03.
- **Agent Office**, `study/AI/explore AI/agent/multi agent/agent offices/Agent Office.md`, created 2026-10-03.

Capabilities above were checked against owner repositories. Private credentials and unrelated vault content are excluded from project documents. Remote integration remains outside the user-confirmed local first version.

## What this research has not proven

No room was rendered, no agents were launched, no benchmark was run, and no furniture or character pack was incorporated. Technology compatibility is supported by documentation and source; performance and visual fidelity require the spikes in [the implementation plan](../IMPLEMENTATION-PLAN.md). The actual model-format and animation findings live in [visual/assets research](visual-assets.md); Hermes protocol/version evidence lives in [Hermes integration research](hermes-integration.md).
