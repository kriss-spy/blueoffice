# Previous implementation archive

The entire prototype is preserved on
[`codex/archive-v1-prototype`](https://github.com/Millennium-GDD/blueoffice/tree/codex/archive-v1-prototype)
at commit `0809c434e98604b0bdfef7c630440a7bc936172b`. This includes the latest local
resource notes, the room-first experiment and its runtime foundation.

| Checkpoint | Meaning |
| --- | --- |
| `c323c6dde133a18a958d6fb7a126bccc84b91a67` | Former main after the earlier integrated implementation |
| `v1-prototype` / `172635aa712b0f0d015b2afe276da96158a21b75` | Original concept closeout |
| `0809c434e98604b0bdfef7c630440a7bc936172b` | Complete archive including later BlueCafe resource notes |

The archived implementation contains the old source, dependency manifests,
fixtures, tests, captures, original specifications, validation reports and startup
instructions. Private ignored assets and local evidence are not part of a Git clone.

To inspect it without replacing the clean checkout:

```sh
git fetch origin
git worktree add --detach ../blueoffice-prototype origin/codex/archive-v1-prototype
```

Follow the archive's own instructions when running its application or checks.
Main's baseline verification does not validate the archived application.

The clean baseline is a normal commit after former main. Existing Git history,
issues, pull requests and the prototype tag remain available; no history rewrite
is required. Historical prototype test passes are not a current product approval.
