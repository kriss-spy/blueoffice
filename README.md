# BlueOffice

A planned local browser office for Hermes agents, inspired by Blue Archive's in-game café: chibi avatars, desk/computer furniture, default 2.5D view, live status bubbles/motion, side chat, office overview, and session activity.

Implementation has started with a reproducible, isolated installed-Hermes protocol harness. The browser application is not yet implemented; see the [v1 beta status](docs/STATUS.md).

Run the foundation checks on Linux with Hermes and bubblewrap installed:

```sh
python3 scripts/hermes_probe.py
python3 -m unittest discover -s tests -v
```

The harness uses disposable profiles and a mock provider inside a private network/process namespace. It makes no live model call. See the [compatibility evidence and limitations](docs/validation/hermes-contract.md).

Start with the [planning-pack index](docs/README.md), then the [PRD](docs/PRD.md) and [implementation plan](docs/IMPLEMENTATION-PLAN.md). Original references: [RESOURCES.md](RESOURCES.md).

The [Blue Archive capture](capture/blue-archive/START-HERE.md) adds an online design/behavior reference, 12 publisher guide images, asset metadata, and an isolated runnable study specimen. Its placeholder café/combat demonstrations are research artifacts; the BlueOffice application is not yet implemented.
