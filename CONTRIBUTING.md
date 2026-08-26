# Contributing

Tokens as Parameters is a research system. Contributions must preserve both software quality and experimental integrity.

## Developer Certificate of Origin

All commits must be signed off under the Developer Certificate of Origin 1.1:

```bash
git commit -s -m "describe the change"
```

The sign-off certifies that you have the right to submit the contribution under the repository's applicable license. See [DCO](DCO).

## License of contributions

Unless explicitly stated otherwise in a file or directory:

- code contributions are submitted under Apache-2.0;
- documentation contributions under `docs/` are submitted under CC BY 4.0;
- benchmark contributions retain their declared per-case license and provenance.

## Research integrity

Changes that affect an experiment must identify:

- the hypothesis and comparison being tested;
- model, runtime, verifier, benchmark, and budget versions;
- whether the change modifies the task, checker, prompt, tools, or stopping policy;
- immutable input hashes and expected verdicts where applicable;
- raw evidence needed to reproduce reported metrics.

Do not mix trusted proof progress with unverified search state. Do not weaken a theorem, checker, or semantic contract to improve a score.

## Benchmark provenance

Do not contribute proprietary or ambiguously licensed RTL, specifications, traces, datasets, or model outputs. Every benchmark case must satisfy the structure described in [benchmarks/README.md](benchmarks/README.md).

## Secrets and personal data

Never commit API keys, access tokens, private repository URLs, private source code, personal email addresses, or unredacted run logs containing credentials.
