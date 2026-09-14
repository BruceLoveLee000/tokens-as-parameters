# FDIV R14 9/14 aligned ablation (local pilot)

English | [简体中文](README.zh-CN.md)

## Conclusion

On 2026-09-02 (Asia/Shanghai), the DSH Bundle locally reproduced 14/14 on the same frozen 9/14 FDIV Case used by the SpecRefine control. SpecRefine and all four new-framework conditions reached `PROVED`. Every final Controller receipt recorded a successful Lean build, intact locked inputs, an intact top-theorem signature, 14/14 closed obligations, and no forbidden axioms. Candidates evaluated by dual Loss also passed white-box review.

This is an aligned-condition mechanism pilot, not statistical evidence for Optimizer effectiveness. Every Run terminated in Epoch 1, so `relative-reflection` never ran. The experiment therefore does not measure cross-trajectory reflection or externalized GRPO gains.

## Proof boundary

- Case: `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1`;
- initial state: 9/14, with `rtlEquivSpec`, `rtlEquivSpec_normal_struct`, `rtlEquivSpec_normal_value`, `flag_iff_overflow`, and `flag_iff_underflow` open;
- claim scope: `lean-model-vs-spec`;
- the top result is equality of all six Lean Model and Lean Spec outputs for every pair of 32-bit inputs;
- this experiment does not certify original RTL-to-Lean-Model fidelity and is not an end-to-end RTL proof;
- this is a warm start containing the historical 9/14 proof state and proof scaffolding, not a from-zero run.

## Aligned conditions

| Item | Fixed value |
|---|---|
| Case source commit | `092ddf5765067775ce0a5d6838075d57b340945e` |
| Case manifest SHA-256 | `5b5ccc36da1f27f73c3cd2b526874b6bcb8e5c9cda3267a19a97addc8bd836d1` |
| Top-signature SHA-256 | `b68d1d991a5e0fb586ab1be0315190d8f28486e34143f25e7a8ffb7852376287` |
| DSH | `0.1.1-rc.2` |
| Provider / Model | `deepseek-official` / `deepseek-v4-flash` |
| Reasoning effort | `max`, verified from actual request headers |
| Prover per-request output cap | 64,000 tokens |
| Rollouts / concurrency | 2 / 2 except Single |
| Whole-run guard | 300,000,000 tokens / 43,200 seconds |
| Forbidden | `sorry`, `admit`, custom/forbidden axioms, `unsafe`, locked-input changes, signature changes |

SpecRefine used a 20,000,000 cumulative-token and 7,200-second boundary per lane. The new Runtime used 120 model steps as its active depth boundary; its 20,000,000-token field was compatibility metadata only. This is a real stopping-policy difference and must not be presented as an identical hyperparameter. Both lanes in the closest Independent Run remained below 20,000,000 actual tokens.

The SpecRefine Judge had a 16,000 per-request output cap and the new Runtime used 32,000. Their observed maximum single responses were 5,077 and 13,248 tokens respectively, both below 16,000, so the difference did not truncate this experiment. SpecRefine overlapped some new-framework Runs on the same machine; wall time is resource-confounded, making tokens and steps the primary comparison.

## Results

“First candidate” means the first candidate accepted by deterministic Lean, lock, signature, and axiom checks. Its token count is cumulative across all active Provers at that time. Candidate time starts at the Prover phase; final time starts at Run creation.

| Condition | Effective mechanism | Prover steps | Judge steps | First-candidate time | First-candidate tokens | Final time | Final tokens | Result |
|---|---|---:|---:|---:|---:|---:|---:|---|
| SpecRefine control | 2 lanes; review selected lane only | 50 / 75 | 7 | 49:04 | 14.087M | 1:44:35 | 23.070M | `PROVED 14/14` |
| DSH Rule-only | 2 lanes; rule Loss; no Judge | 57 / 79 | — | 24:05 | 24.573M | 33:04 | 27.939M | `PROVED 14/14` |
| DSH Dual Loss | 2 lanes; per-lane dual Loss; reflection inactive | 80 / 113 | 21 / 18 | 24:36 | 23.818M | 49:04 | 46.260M | `PROVED 14/14` |
| DSH Single | 1 lane; dual Loss; reflection disabled | 51 | 25 | 19:11 | 8.525M | 26:45 | 14.347M | `PROVED 14/14` |
| DSH Independent | 2 lanes; dual Loss; reflection disabled | 79 / 56 | 19 / 17 | 25:37 | 17.717M | 42:19 | 37.662M | `PROVED 14/14` |

| Condition | Input | Output | Cache read | Reasoning (subset of output) | Prover tokens | Judge tokens |
|---|---:|---:|---:|---:|---:|---:|
| SpecRefine control | 0.390M | 0.292M | 22.388M | 0.241M | 22.598M | 0.472M |
| DSH Rule-only | 0.351M | 0.267M | 27.320M | 0.219M | 27.939M | 0 |
| DSH Dual Loss | 0.836M | 0.341M | 45.083M | 0.252M | 38.187M | 8.073M |
| DSH Single | 0.410M | 0.126M | 13.811M | 0.101M | 8.525M | 5.822M |
| DSH Independent | 0.871M | 0.336M | 36.455M | 0.277M | 30.036M | 7.627M |

The closest framework comparison is SpecRefine control versus DSH Independent. In this single observation, the new framework used 25.8% more tokens to the first candidate and 63.3% more final tokens. Observed wall time was 47.8% and 59.5% shorter respectively, but machine contention confounds wall time and prevents a reliable speedup claim. One explicit source of the final-token difference is that the new framework reviewed both candidates (7.627M Judge tokens), while SpecRefine reviewed only the selected candidate (0.472M).

Single found a solution with only 8.525M Prover tokens in this sample. Random trajectory variance is therefore large enough to dominate the width difference on this Case. One Single sample cannot show that multiple lanes are useless, just as successful two-lane Runs cannot establish that width is always better.

## Trust and artifact evidence

| Condition | Run ID | Final candidate commit | `FdivProof.lean` SHA-256 | Lines | Versus 9/14 baseline |
|---|---|---|---|---:|---|
| SpecRefine control | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901144434-847879a4` | `53674247796bfd8e96536055a70b383f16fd618c` | `441e1d9759b063edde328bcbc2e17bae441cfbb9a980997be0975bd1d7a33299` | 4,251 | +345 / -27 |
| DSH Rule-only | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901151440-eec9302c` | `9366161f9f6dac5974e0974cdd64738f32118ae5` | `4a379682b6aeb2878cfd78b84168ada4b43dfac7856f88e25b1e76eb5de6f566` | 4,261 | +360 / -32 |
| DSH Dual Loss | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901155742-e42416c6` | `42d89838962e2c1afd31fc3630555c3954742f01` | `d887736fb3d9b250affe7896b1857d1f29609ca282cf017f029709abd4696dce` | 4,216 | +315 / -32 |
| DSH Single | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901165519-e1648493` | `58998f3e3f7d9e90b596a3f3bf4b03fc8059faa7` | `ff5e641134f720428073a9857a40fbee1cdb2b4c983ffa1654b82caa78ed906d` | 4,350 | +444 / -27 |
| DSH Independent | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901172416-83160439` | `4766dbc7c0d3c984d0ffa43654bba09ad100bfa8` | `088f3a6778be76a5d46a920899fae8a26f93ff3c2aeef34d373d708237a7a82d` | 4,285 | +383 / -31 |

Every final receipt reported only `propext`, `Classical.choice`, and `Quot.sound` in its axiom closure. White-box Judges found no reward hacking; findings were informational, stale comments, duplicated lemmas, or lint/hygiene issues. In the Dual Loss Run, R1 produced an intermediate candidate containing `native_decide` generated axioms. The deterministic checker rejected it, after which the Prover replaced it with kernel `decide` and passed again. The process gate therefore exercised a real rejection.

Fourteen obligations do not represent fourteen independent hard problems. White-box review noted that `rtlEquivSpec_normal_struct` and `rtlEquivSpec_normal_value` are corollaries of stronger normal-path or top-level bit equality. The substantive work remains the normal-path bridge across the 28-stage divider, GRS, RNE, exponent, mantissa, and flags, plus exhaustive assembly of special-value branches.

## Ablation interpretation

1. **The Prover/Runtime reproduction succeeded.** Across four new-framework Runs, all seven Prover lanes independently reached 14/14 within 120 steps. The rebaselined interface is solvable by the official DSH Code Agent.
2. **White-box Loss did not change a final verdict in this batch.** The rule checker already rejected the `native_decide` intermediate candidate. On the final candidates that passed white-box review, the Judge added audit evidence but found no cheating missed by deterministic gates.
3. **Separate online Rule-only and Dual Runs are not a clean causal Loss ablation.** They resampled stochastic Prover trajectories. Loss runs only after candidate generation in Epoch 1, so search-token differences cannot be attributed to Loss. A clean test should replay the same candidate commits through both Loss providers.
4. **The Optimizer was not tested.** Dual, Independent, and Rule-only all completed in Epoch 1. No `OptimizationDecision`, text-parameter update, or parent-state reselection occurred; the reflection switch was inactive on these trajectories.
5. **Per-lane Judge cost is material.** The new framework offers stronger process audit evidence but currently waits for all lanes and reviews each one. For objectives where any fully trusted proof terminates the task, streaming Loss—review a candidate immediately and cancel remaining lanes after the first approval—should be tested as a separate policy rather than hard-coded as the only behavior.

## Next experiment

- Use a harder aligned 8/14 or 0/14 Case that cannot close in Epoch 1, then compare Single, Independent, and Group Relative with at least one actual Reflector execution.
- Repeat each condition at least three times and report success rate plus median/quantiles of tokens-to-first-trusted-proof.
- Replay one immutable candidate set through `lean-rule-only` and `lean-dual-check` to isolate Loss cost and classification value.
- Ablate “wait for the whole group” against “stop after the first dual-Loss approval”.
- Keep the full Case, proof, and Session trace in the restricted local evidence store until its license permits redistribution. The public repository contains only hashes and statistics, so this is a trusted local reproduction, not a third-party downloadable reproduction.

## Version identity

- Tokens as Parameters: `6c60a5ec8cf6132b74587d2d4f4a61f61f26ec42`;
- SpecRefine: `a3bb467bbd7ce5bb0891cf6c4f4546b2639d0fa5`;
- Case repository: `092ddf5765067775ce0a5d6838075d57b340945e`;
- external FloatSpec/fspec: `eef09dc52b20c00c378e3ee25fabdac23bf65ac9`.

