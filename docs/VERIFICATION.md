# BlueOffice verification workflow

Main currently contains project direction and archive documentation, plus a small
baseline checker. It has no application, dependency manifest, browser fixture suite
or release. The previous verification workflow remains with the archived source.

## Current baseline

Before implementation and before reporting completion, select checks for the actual
change and account for its acceptance criteria.

Run:

```sh
python3 scripts/verify_baseline.py
```

This checks that the tracked tree contains the intended project baseline, that
required documentation is present, that local Markdown links resolve, and that the
prototype application/captures/dependency manifests have not returned to main.
GitHub Actions runs the same command as the required **Project baseline** check.
There are no path filters or passing placeholders for retired application tests.

For a repository cleanup or transfer, additionally confirm:

- The complete prior implementation is reachable through its archive branch.
- The published default branch is main and its tracked tree is the clean baseline.
- The GitHub repository identity, existing history and archive refs survived transfer.
- The local origin points to the intended organization repository.
- The current required CI check ran and passed before integration.

## Future implementation

When accepted implementation work begins, extend the checker/workflow for its real
scope rather than silently accepting an arbitrary application tree. Add actual
compile, behavior and integration checks appropriate to the selected stack.

User-visible behavior requires observed interaction evidence. Scene/material quality,
native motion, furniture alignment and performance require real rendered evidence;
asset inventories and deterministic tests cannot establish those criteria.

Use disposable profiles and synthetic histories for runtime tests. Run live model
calls only when live routing acceptance is required. Preserve source versions,
fingerprints, failures and the limits of each result.

Before reporting completion, map every criterion to a check, observed result or
explicitly unverified status. Historical evidence from the prototype cannot approve
changed code. No product release is claimed by baseline CI.
