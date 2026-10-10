# Lessons from the first prototype

The user rejected the result as far from the intended office experience. Technical
issue closure and substantial automated evidence did not make the scene or product
acceptable. The complete implementation and original closeout are in the
[archive](ARCHIVE.md).

- **Validate the central feeling early.** A playable room and one convincing
  interaction should receive user judgment before broad feature implementation.
- **Use coherent assets.** Original furniture and character motion are engineering
  dependencies. Procedural substitutes and a static seated pose failed to establish
  the intended visual quality.
- **Apply references to the running result.** Collecting screenshots or design
  documents is insufficient without comparing actual composition and behavior.
- **Develop difficult components independently.** BlueCafe isolates scene authoring;
  bluemotion isolates motion and furniture interactions. Their outputs must still
  meet in an early integration proof.
- **Design room interactions deliberately.** Putting old management forms in floating
  windows does not finish conversation, attention or first-use design.
- **Keep trustworthy runtime semantics.** A disconnected or uncertain task remains
  uncertain. Decorative motion cannot establish actual progress or completion.
- **Separate verification from acceptance.** Compile/tests, native integration,
  rendered fidelity, performance and user approval establish different things.
- **Expand after an accepted loop.** Broad parallel implementation previously
  outran validation of the experience and consumed time without meeting expectations.

These lessons guide future work; they do not approve an engine, a new implementation
or the archived prototype.
