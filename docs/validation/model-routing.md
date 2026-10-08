# Model routing verification — ticket #4

Verified 2026-10-08 against installed Hermes `f1247d2e0146bbd8edd4e510b9e67e0d259509a4` and the local CLIProxyAPI service. Node.js 22.17.1; Chromium 153.0.8010.12. The [live report](model-routing/live-report.json) and [mock report](model-routing/mock-report.json) contain only request metadata and source fingerprints, never request bodies, headers, credentials or response text.

## Results

| Route | Native transport | Live evidence |
|---|---|---|
| `glm-5.3-flash` | Named custom provider, `chat_completions` | Five successful HTTP requests, all `/v1/chat/completions` |
| `muse-spark-1.3-contributor` | Named custom provider, `codex_responses` | Five successful HTTP requests, all `/v1/responses` |

Both routes use `http://127.0.0.1:8317/v1`. For each, the suite observed public streamed text; a native clarification tool call; the exact answer delivered into the same turn; subsequent completion; an actual native auxiliary compression-client call; and an actual native delegated-child call. The live models both chose a one-question batch, which the probe answers using its exact question ID. Each route's fifth call completes the delegated child. This tests delegation's native route construction and execution, not the later Activity UI (#21).

The foreground tests use the production Office/HermesRuntime, profile provisioner, process wrapper and RPC transport. The test-only HTTPX observer rejects other hosts, ports, models or API families and records only allowlisted metadata. The native auxiliary and child clients use the same generated profile. Synthetic tests run in a private network namespace. Explicit `--live` shares host networking to reach CLIProxyAPI while keeping disposable profiles and a read-only allowlist of sources/dependencies; the key is mounted read-only and resolved server-side. No existing conversation is used as test input. Proxy configuration SHA-256 was unchanged across the live run; intentional cooling/image settings were not edited.

## Admission and runtime policy

A model name alone does not enable a route. The registry requires local evidence marked live, completed, config-preserving and passed for the matching model, endpoint, API family, Hermes revision and BlueOffice routing-contract version, including all five required checks. Missing, corrupt, synthetic or incompatible evidence leaves both HTTP admission and browser model choices disabled with the verification command shown. Evidence is local and is not admitted from the published reports automatically.

Before launch, a native configuration helper verifies the selected model, named provider transport, proxy endpoint, `BLUEOFFICE_PROXY_KEY` credential reference, auxiliary/delegation pins and retry policy, then resolves the effective route through Hermes itself. The real key comes from `~/.cli-proxy-api/.api-key`; it is never stored in generated profile configuration or browser snapshots. Changing the configured endpoint is rejected before launch. Auxiliary transports, fallback chains, credential overrides and request-body overrides are also rejected; native auxiliary task resolution is checked for every configured task. Delegation request overrides are rejected. This milestone selects a model at agent creation; broader settings editing remains #5.

The generic `custom` provider intentionally ignores a Responses override for a non-OpenAI endpoint in this Hermes revision. Named providers are therefore required for Muse. All configured text auxiliary tasks and delegation are pinned to the selected route. Automatic title upgrades and background review are disabled to keep background calls explicit; optional multimodal facilities are not claimed verified.

## Failures and retries

Both synthetic routes verify distinct quota, authentication, invalid-route and unavailable-service diagnostics. Quota (`usage_limit_reached`), authentication and invalid-route cases each made exactly one HTTP request. There is no automatic turn resubmission, provider fallback or post-exhaustion recovery cycle. GPT `usage_limit_reached` remains a real quota condition; nothing treats it as a transient proxy error or rotates around it.

Hermes Chat Completions performs one bounded non-streaming diagnostic re-issue after an initial streaming 5xx, before any delta. The synthetic 503 case therefore made two GLM calls and one Muse call. This is the pinned runtime's `chat_completion_helpers._unmask_server_error_with_nonstreaming`; it does not run on quota failures. Once the failure reaches BlueOffice, retry requires an explicit new user submission. Tool failure remains separate from terminal turn failure, covered by the owned-runtime tests.

Provider error bodies are classified into safe user-facing copy instead of persisted verbatim. Known proxy-key values are redacted at the RPC boundary. Possible credential prefixes are buffered across deltas before publication, preventing a key split across stream frames from reaching snapshots or storage; harmless trailing prefixes are preserved at completion. Raw child stderr and raw provider exception diagnostics are not forwarded to ordinary server logs or browser payloads. Synthetic secret canaries are absent from persisted snapshots.

## Commands

```sh
npm test
npm run build
python3 -m unittest discover -s tests -v
npm run verify:routes                 # synthetic only; does not admit live routes
npm run verify:routes -- --live        # synthetic failures, then small real probes
```

The full verifier passed and published evidence to `.blueoffice/routes.json`. Current automated checks: 20 TypeScript tests and 10 Python tests pass; strict typechecking and production build pass. The strengthened preflight passed a fresh synthetic native run after review fixes; the earlier live evidence uses the same generated routing configuration and no additional live calls were needed. [Browser evidence](model-routing/browser-report.json) covers model selection, disabled unverified routes, the complete owned-chat workflow, keyboard replies/denials, mobile layout and zero page errors. Screenshots show [the selected Muse route](model-routing/chat-1280.png), [mobile chat](model-routing/chat-mobile.png), [a pending question](model-routing/question-1440.png) and [disabled admission](model-routing/unverified.png). Independent [Standards and Spec review](model-routing-review.md) cleared the corrections. A private byte scan found no real proxy-key value in tracked files, published evidence or the built client. The overall beta still requires the remaining tickets and release gates.
