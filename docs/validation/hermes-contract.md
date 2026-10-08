# Installed Hermes contract evidence

Issue: [#1](https://github.com/kriss-spy/blueoffice/issues/1). Tested revision: `f1247d2e0146bbd8edd4e510b9e67e0d259509a4`.

This is the protocol foundation for v1 beta. It is not an application or a release acceptance result. The room, browser control loop, durable office state, model routes and other tickets still need implementation.

## Reproduce

On Linux with the installed Hermes launcher, Python 3.10+ for the runner, and `bubblewrap`:

```sh
python3 scripts/hermes_probe.py
python3 scripts/save_probe_evidence.py
python3 -m unittest discover -s tests -v
```

The runner obtains the trusted interpreter and source root using `hermes --print-runtime-command`, reads the installed PM dependency selection and effective profile home with native helpers, and records the Git revision and gateway source hashes. It does not guess a `.venv` path. The discovered home is recorded only in private evidence and replaced with `$PROFILE_HOME` when publishing. This read-only discovery does not launch that profile. Other launcher/dependency layouts fail with a diagnostic until supported.

Hermes and a deterministic HTTP mock run together inside a private network, PID and IPC namespace. Only runtime/source/dependency directories are mounted read-only; temporary profiles and workspaces are created from scratch. The host Hermes data directory and CLIProxyAPI configuration/key are not mounted. Environment variables are allowlisted and the only provider key is synthetic. The mock exercises actual Hermes agent/tool/streaming code; it does not replace `AIAgent` or the RPC dispatcher. Lazy dependency installation is disabled. There is no unisolated fallback.

`artifacts/hermes-contract/` contains the full synthetic trace, stderr and machine-specific report. Each attempt invalidates old success evidence before discovery and locks its output directory against concurrent runs. Publication requires both passing checks and confirmed successful runner exit. The publication script writes a compact trace and redacted report to [the revision-specific fixtures](../../fixtures/hermes/f1247d2e0146/). It excludes repeated activation snapshots and full configuration replies from the trace; system prompts and reasoning fields are redacted. Installed source paths are replaced with tokens. These fixtures contain synthetic prompts, not user conversations.

## Capability matrix

| Capability | Evidence | Adapter decision |
|---|---|---|
| Readiness and server-request advertisement | Real `gateway.ready` and `client.capabilities` round trip | Wait for readiness and advertise before accepting tasks. Ready payload does not advertise every method. |
| Create / prompt / public stream / tool / complete | Real stdio RPC and mocked Chat Completions SSE | Preserve admission separately from turn outcome. |
| Single clarification | Actual clarify tool → request → exact answer → tool result → completion | Reply by frame ID with `{answer}`. Prose questions grant no request authority. |
| Batch clarification | Actual two-question tool call, `clarify.lock`, replay, final partial `{answers}` | Preserve `qid` and locked answers; final result merges existing locks. Unknown qid errors; stale lock returns `expired`. |
| Approval | Actual terminal dangerous-command gate; separate frame/inner IDs; replay and denial | Use advertised choices; reply by outer frame ID. Denied sentinel remains on disk. Never infer permission from timeout. |
| Interrupt | Pending clarify cancelled, terminal status `interrupted`, process still alive | Interrupt is distinct from stop. Match cancellation ID/reason; ignore late responses. |
| Expiry | Clarify deadline emits `request.cancel` with `timeout` | Clear only the matching request. Hermes can then finish according to its own tool timeout policy. |
| Replay | `session.events.since` returns current open requests and sequence/epoch | Open requests are authoritative alongside event history. Changed epoch requires reconciliation. Durable browser replay is future work. |
| Profile isolation | Two actual gateways concurrently ask questions; cross-owner reply ignored; foreign stored resume rejected | Bind every browser command to an office owner/profile/epoch. Native drop has no positive response acknowledgement. |
| Profile management | Native create with credential copying disabled; native configure/readback | Explicitly set `mirror_credentials: false`, `share_auth: false`, `no_alias: true`; defaults are inappropriate for independent office profiles. |
| Partial config application | Stale UI metadata revision fails while description is applied | Read each `applied` section and re-read effective config. General config has no proven cross-process compare-and-swap. |
| Config preservation | Native reasoning set/readback retains synthetic unknown section | Native setters cover a catalog, not arbitrary dotted keys. Adapter must validate and redact. |
| History and cold resume | List synthetic history; stop; new process resumes and completes another turn | `session.create` returns `stored_session_id`; cold resume returns `resumed` and `session_key`, and a new live `session_id`. |
| Owned shutdown | Each real child handles SIGTERM and returns zero without forced kill | Only signal the exact owned Popen handle. Do not use `process.stop` to stop the gateway. |
| Missing capabilities / duplicate / reordered replies | Installed request-registry module boundary and synthetic subprocess transport tests | Fail closed; keep unanswered IDs distinct; duplicate results must not become new work. |
| Shutdown failure | Independent peer ignores SIGTERM; harness kills that child and reports force | Forced shutdown is a failure, not graceful success. |

The report separates `wire_proven_methods` from `source_declared_methods`. A name in the source catalog alone does not establish a supported office capability. Module-level request tests replace only the event/frame sinks; they are separately identified from the full gateway/provider tests.

## Findings that affect implementation

1. **Completion precedes foreground release.** `message.complete` can arrive while `session.activate.running` remains true. An immediate next prompt may be queued. The office must not infer that the composer can submit a new foreground turn solely from the completion event.
2. **Validation is not uniformly strict.** This revision accepted `session.create` with numeric `cwd: 42`, normalizing it to a string. Malformed JSON and unknown methods return errors, but BlueOffice must validate every browser input itself.
3. **Cold-resume ID fields differ.** The adapter must preserve the stored ID used in the explicit resume request and reconcile `resumed`/`session_key`. Requiring `stored_session_id` on every response loses the binding.
4. **Plain response frames have no admission acknowledgement.** The native server drops stale/foreign frame IDs. BlueOffice needs its own once-only reply admission and reconciliation registry to give the user a meaningful response.
5. **Profile saves can partially succeed.** `profiles.configure` reports per-section outcomes; treating the entire response as a single successful save hides conflicts.

## Scope limits

No real GLM/Muse call, CLIProxyAPI route validation, browser recovery, eight-runtime resource benchmark, asset permission review or visual approval is claimed here. The mock serves only Chat Completions. Responses and auxiliary/delegation route checks belong to #4. These probes validate one installed Linux revision; untested revisions require running the harness again.

The native request-registry tests prove missing-capability behavior at its module seam; a full WebSocket client handshake is not exercised because v1 uses owned stdio. Source-declared foreign history, lineage and controls remain unverified until their respective tickets. This work does not take over any external CLI/gateway session.
