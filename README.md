# BlueOffice — v1 concept prototype

An exploration of a local, game-like office for independent Hermes assistants. **V1 is closed as a concept prototype as of 2026-10-09.** The runtime foundation works, but the experience, furniture and character motion are not a finished product. Read the [lessons and closeout](docs/V1-PROTOTYPE.md) before continuing development.

The final room-first experiment is preserved on `codex/immersive-office` and the `v1-prototype` checkpoint, separately from main. Its draft [PR #38](https://github.com/kriss-spy/blueoffice/pull/38) is being closed without integration because required browser CI did not pass. Historical beta evidence does not approve this changed design. The instructions below reproduce the prototype; they do not establish release readiness.

## Prerequisites and startup

Use Linux, Node.js 22.13 or newer, Python 3, and the supported installed Hermes revision `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`. BlueOffice discovers the trusted interpreter/source using `hermes --print-runtime-command`. An unsupported installation fails with a diagnostic. Bubblewrap is required for isolated native verification.

```sh
npm ci
npm run build
npm run verify:routes -- --live
npm start
```

Open the printed loopback URL, normally `http://127.0.0.1:4310`. `BLUEOFFICE_PORT` changes the port; `BLUEOFFICE_DATA` selects a private data directory, default `.blueoffice`. Always use `npm start`: the launcher holds an exclusive office database lease. A second server using the same data directory is refused.

Live route verification makes small real calls through CLIProxyAPI at `http://127.0.0.1:8317/v1`: GLM uses Chat Completions and Muse uses Responses. It reads the proxy key server-side, verifies foreground/tool/auxiliary/delegation routes and stores admission evidence in the selected office data directory. Model options remain disabled without matching evidence. It does not edit CLIProxyAPI configuration or remove intentional cooling/image-generation settings. A GPT `usage_limit_reached` result is a real quota error.

## Use the office

**Add an assistant** creates an independent native profile. Choose an existing absolute workspace, an admitted model/API family, persona, tool groups, approval policy, a reviewed character or placeholder, and a free workstation or explicit unassigned state. New profiles do not copy credentials, schedules or history. **Adopt an existing profile** inspects its canonical home and requires acknowledgement that BlueOffice will be its sole writer. Stop other owners first.

Use **Agent settings** while the runtime is stopped. Name changes appear immediately; profile defaults apply at the next start. Readback reports each section, including partial success. A stale revision or external edit requires Reload and review. Saving managed settings also disables automatic continuation of interrupted native turns; older incompatible profiles receive explicit stopped-settings guidance.

Tasks, answers and permission decisions target one exact assistant/session/request. Interrupt ends its task; Stop releases its runtime. Closing a tab keeps owned runtimes alive. A browser reconnect restores state; a supervisor crash marks uncertain activity unknown and does not replay commands. Recover ownership explicitly before issuing new work.

**New conversation** and **Activity → Inspect → Resume** deliberately create a fresh owned live binding while retaining assistant, profile, character and desk identity. Busy or uncertain transitions are refused. Inspecting history is read-only. Observed external sessions and child tasks do not grant control. Resume can initialize native model metadata; it never resubmits an old task automatically.

**Edit room** supports validated workstation movement, quarter-turn rotation, undo/redo and revision-checked saves. Invalid or stale drafts cannot overwrite the current office. **Export layout** downloads references and placements only. **Import layout** previews exact asset versions and explicit assistant bindings. Missing content keeps diagnostic references; imports never create assistants or bundle character bytes.

**Characters** imports a manifest and its declared local files. Preview every mapped clip, inspect materials/coordinates and limitations, then record the local visual review before assignment. A missing or incompatible pack uses a diagnostic placeholder. Local review does not establish redistribution permission; private intended-character assets remain separate imports.

Keyboard assistant/request controls remain usable when the room is occluded or WebGL fails. Retry 3D rebuilds the scene from current state without restarting assistants. Reduced motion preserves status and attention. Optional lounge motion and original notification sound default off.

## Offline demonstration and verification

```sh
BLUEOFFICE_DATA=/tmp/blueoffice-demo npm start -- --fixture
npm run check
npm run verify:ui
npm run verify:integration
```

Fixture mode is visibly labeled and uses no models. Try “question”, “batch”, “approval”, or “slow task”; “fail quota”, “fail proxy” and “exit” demonstrate distinct failure states. It is never an automatic fallback for live failures.

Follow [VERIFICATION.md](docs/VERIFICATION.md). Native probes use disposable profiles, private namespaces and synthetic providers. Run build-producing gates sequentially within a worktree. `npm run verify:release` additionally requires current reviewed product, visual, performance and live-route evidence; `needs-acceptance` means the release is unfinished.

See [profile configuration](docs/validation/profile-settings.md), [runtime capabilities](docs/validation/hermes-contract.md), [routing](docs/validation/model-routing.md), [asset policy](docs/ASSET-PIPELINE.md), [PRD](docs/PRD.md) and [implementation status](docs/STATUS.md).
