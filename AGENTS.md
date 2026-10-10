# BlueOffice

Main is a clean project baseline. The old application lives on
`codex/archive-v1-prototype`; do not restore its implementation wholesale.

Before implementation and before reporting completion, read
[the verification workflow](docs/VERIFICATION.md).
Read [project direction](docs/DIRECTION.md) and
[prototype lessons](docs/PROTOTYPE-LESSONS.md) before proposing architecture.

BlueCafe owns scene construction. bluemotion owns character/furniture motion.
Validate those dependencies and one user-reviewed playable loop before broad
BlueOffice implementation. Reuse archived runtime contracts deliberately and
verify them against the actual integration; old evidence does not accept new code.

Keep downloaded game content, private conversations, credentials and local
verification payloads outside distributable source. Preserve asset provenance.
Do not invent substitute furniture or motion when the intended native assets
are available. Do not choose the final rendering engine before a real integration
proof establishes the relevant asset and playback compatibility.
