# Codex Development Instructions

[English](AGENTS.md) | [简体中文](AGENTS.zh-CN.md)

## Purpose

This file tells Codex how to develop this repository. It does not define the prompts or behavior of experimental Prover, Reflector, or Consolidator agents.

These instructions apply to the repository root and every descendant unless a nearer `AGENTS.md` provides more specific instructions.

## Start Here

Before changing code:

1. Inspect `git status` and preserve unrelated changes.
2. Read `README.md`, `CONTRIBUTING.md`, and the nearest applicable `AGENTS.md`.
3. Inspect the affected package, its public contracts, and its tests before designing a change.
4. Read the relevant architecture decision under `docs/` when the change crosses package or trust boundaries.

## Current Repository State

The repository is an npm/TypeScript workspace of independent Core, Formal, Lean, Tool, and Bundle packages targeting DSH `0.1.1-rc.2`. `packages/core/optimization` owns the token-optimizer seam; Bundles contain composition rather than domain implementation. Use Node.js `^22.19` or `>=24`.

The following repository commands have been executed successfully:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run check
npm run pack:check
```

Run focused tests first while developing, then `npm run check` before committing. Revalidate `npm run pack:check` whenever exports, the Bundle patch, or package files change.

## Repository Map

- `packages/`: DSH plugins, runtime libraries, and verifier adapters.
- `benchmarks/`: versioned research cases with per-case provenance and licensing.
- `experiments/`: reproducible protocols, manifests, ablations, and analysis.
- `docs/`: theory, architecture, ADRs, guides, and research results.

Add nested `AGENTS.md` files only when a directory has development rules that materially differ from this file.

## Architecture Rules

- Keep scientific domain contracts and state transitions independent from DeepSeek Harness APIs.
- Keep `packages/core/` independent from Formal, Lean, Chips, and benchmark packages; dependencies point from domains toward Core.
- Register replaceable optimization algorithms through `ctx.optimization`; Formal Runtime must select them by stable id rather than import a concrete Optimizer.
- Integrate with DSH through documented plugins, services, events, tools, and agent presets.
- Do not fork or patch the official DSH Agent Loop unless an accepted ADR demonstrates that no public extension point can meet the requirement.
- Reuse the official DSH Code Agent, session log, tool execution, context management, and trajectory UI where they satisfy the requirement.
- Keep model-facing prompts, skills, and experimental policies versioned and separate from implementation code where practical.
- Do not put benchmark-specific solutions or proof hints into generic plugins, skills, prompts, or development instructions.
- Do not modify a frozen benchmark input in place. Create a new version or case with explicit provenance.
- Treat model success claims as untrusted data. Only verifier evidence may advance trusted progress.
- Prefer explicit interfaces between the orchestrator, verifier, textual-state store, update policy, consolidator, and DSH adapter.

## Development Workflow

1. Define the observable behavior or contract being changed.
2. Make the smallest coherent implementation that preserves package boundaries.
3. Add or update focused tests for the changed behavior.
4. Run the narrowest relevant checks first, then repository-level checks when shared contracts change.
5. Update public documentation and examples when behavior or configuration changes.
6. Review the diff for credentials, personal paths, benchmark leakage, generated artifacts, and unrelated edits.

Do not silently weaken a test, verifier, theorem, expected verdict, or semantic contract to make a change pass.

## Documentation Languages

All human-facing project documentation must have English and Simplified Chinese versions.

- Chinese is the primary authoring and maintainer-review language.
- English is the default GitHub and international-community language.
- A documentation change is incomplete until both versions are updated in the same pull request.
- Keep the two versions semantically equivalent; a translation must not introduce new technical claims.
- Do not translate code identifiers, API names, commands, file paths, structured log fields, or mathematical notation.
- Use English for code comments, public identifiers, schemas, commit subjects, and machine-readable interfaces.

Use paired files such as `README.md` and `README.zh-CN.md`. Under `docs/`, use mirrored `docs/en/` and `docs/zh-CN/` paths once those trees are introduced.

Official legal texts such as `LICENSE` and `DCO` remain in English. Chinese legal summaries must be marked non-binding.

## Security and Licensing

- Never commit API keys, access tokens, private repository URLs, private source code, personal email addresses, or credential-bearing traces.
- Keep secrets in DSH credential providers, the operating-system keychain, or ignored local configuration.
- Preserve third-party licenses, notices, and benchmark provenance.
- Follow the repository license boundaries documented in `NOTICE` and `CONTRIBUTING.md`.

## Definition of Done

A development task is complete when:

- the requested behavior is implemented without unrelated changes;
- focused tests pass and appropriate broader checks have been run;
- public contracts, configuration, and failure modes are documented;
- English and Chinese documentation are synchronized;
- no secrets, local paths, or unlicensed materials are present;
- the working tree and final diff have been reviewed;
- commits intended for contribution include DCO sign-off.
