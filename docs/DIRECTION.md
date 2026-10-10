# Project direction

BlueOffice is a local office that the user inhabits, with characters representing
independent AI assistants. The room is the primary experience. Clicking a
character opens its conversation; attention and controls remain understandable
without turning the room into a decorative dashboard viewport.

## Dependencies

**BlueCafe** constructs coherent rooms from original furniture assets, with stable
furniture identities, editable layouts, materials and reproducible composition.

**bluemotion** investigates and reproduces native character/furniture interactions.
It must account for character rigs, furniture hierarchies, animation synchronization,
placement and facial/event behavior. Asset discovery alone is not observed playback.

**BlueOffice** composes those results with assistant identity, conversation, exact
question/permission routing and reliable runtime ownership. Its rendering engine
and packaging remain open until a small integration proof resolves compatibility.

## Development sequence

1. Review an intended office composition built with BlueCafe's actual assets.
2. Review native character/furniture motion in bluemotion at normal room framing.
3. Prove that the approved scene and motion work together in the chosen office
   renderer, preserving material appearance, hierarchy and independent instances.
4. Build one playable office loop with scripted assistant events: enter the room,
   select a character, converse, begin work, notice and answer a question, then
   close the conversation and remain in the office. Obtain user judgment early.
5. Connect that accepted interaction to the smallest necessary runtime foundation.
   Verify exact targeting, ownership and recovery before expanding management UI.

Scripted events support repeatable experience iteration without model calls.
They must be visibly distinguished from live execution when presented as a demo.

## Reusable foundations

The archive contains useful profile/runtime ownership, exact request routing,
interrupt/stop, history and recovery work. Extract it when needed, with current
contract checks and independent acceptance scenarios. The previous UI, procedural
furniture and static seated workaround are historical experiments.

## Open decisions

- Rendering engine, desktop/browser delivery and scene/motion interchange.
- The first intended character and compatible workstation interaction.
- Native playback fidelity, alignment and supported fallback behavior.
- Final interaction design, accessibility and resource budgets.

There is no active feature-completeness checklist or release claim on main.
