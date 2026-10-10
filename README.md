# BlueOffice

A planned local, game-like office for AI assistants, developed under
[Millennium-GDD](https://github.com/Millennium-GDD).

**Main is a clean project baseline.** The earlier implementation is archived;
there is no runnable application or product release on this branch.

## The three projects

| Project | Responsibility | Current relationship |
| --- | --- | --- |
| **BlueOffice** | The office experience, assistant interaction and runtime integration | Integrates components after their focused proofs are accepted |
| **BlueCafe** | Room construction using original game furniture and materials | Independent scene authoring project; planned for the same organization |
| **bluemotion** | Native character and furniture interaction motion | Independent asset research and playback project; planned for the same organization |

The room should feel like an office the user inhabits. Scene quality, character
performance and interaction design are central dependencies. Development proceeds
through small playable milestones reviewed by the user before broader feature work.

Read [project direction](docs/DIRECTION.md), [prototype lessons](docs/PROTOTYPE-LESSONS.md)
and [verification](docs/VERIFICATION.md) before implementation.

## Previous implementation

The complete prototype, runtime foundation, reference captures and historical
verification evidence remain on
[`codex/archive-v1-prototype`](https://github.com/Millennium-GDD/blueoffice/tree/codex/archive-v1-prototype).
See [archive notes](docs/ARCHIVE.md) for checkpoints and recovery instructions.
Historical test results do not establish acceptance of a future office.

## Check this baseline

Python 3 and Git are sufficient:

```sh
python3 scripts/verify_baseline.py
```

This checks the tracked baseline and its local document links. It does not run
an application, Unity playback, browser fixtures or model requests.
