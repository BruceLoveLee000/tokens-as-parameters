# FDIV raw-top1 end-to-end optimizer convergence

[简体中文](README.zh-CN.md)

## Result

On 2026-09-13 (Asia/Shanghai), the formal-proof Bundle closed the single frozen
top-level theorem in seven Epochs. Two Prover lanes, dual Lean plus white-box
Loss, persistent textual parameters, and six comparative reflections produced
two independently accepted final candidates. The Controller promoted lane r1
as the trusted result.

This is the first repository case study in which `relative-reflection` actually
ran across multiple Epochs and changed both future tasks and selected Git parent
states. It is strong mechanism evidence, but one Run with a mutable provider
model alias is not a statistical proof that the Optimizer caused the success or
that this framework outperforms SpecRefine.

## Frozen question and claim boundary

```lean
theorem rtlEquivSpec (a b : BitVec 32) :
    rtl_comb a b = fdiv a b
```

- Starting progress: `0/1`; the target body was `sorry`.
- Claim scope: complete equality of all six Lean Model and Lean Spec result
  fields for every pair of 32-bit inputs.
- The Run did not receive the earlier fourteen-obligation decomposition,
  completed proof, proof API, or helper frontier.
- The theorem does not universally certify the Verilog-to-Lean transcription.
- The arithmetic profile includes the documented tiny-result FTZ behavior, not
  full IEEE-754 gradual underflow.
- The audited Spec rebaseline is an accepted experimental input; this Run does
  not prove a universal equivalence between the older and revised Spec forms.

## Configuration

| Item | Value |
|---|---|
| Framework source | `2ac0663245d6c8368a69c688a52c459de9c32168` |
| Executed local Case manifest | `194d8f2f628ea04444dcdb147c721e0b0e6125b042ce19cba2a3995b97d32247` |
| Portable public Case manifest | `29b40bc26ab71ca174b04f6e99e8d337a8fdeeaa39f3662fd314dd7418f806b7` |
| DSH target | `0.1.1-rc.2` |
| Provider / model alias | `deepseek-official` / `deepseek-v4-flash` |
| Reasoning effort | `max` |
| Prover / Loss / Optimizer | `formal-code-agent` / `lean-dual-check` / `relative-reflection` |
| Rollouts / parallelism | 2 / 2 |
| Per-lane depth | 64 model steps per Epoch |
| Per-lane cumulative compatibility budget | 20,000,000 tokens |
| Reflection | enabled; 32 steps; 500,000-token soft-submit threshold |
| Loss Judge | 24 steps per candidate |
| Total limit | 300,000,000 tokens / 12 hours |

`deepseek-v4-flash` is a provider alias rather than a content-addressed model
snapshot. The provider may update the served weights or inference stack without
changing that alias; this is a material confound for future comparisons.

The two Case-manifest hashes differ because the public package replaces a local
FloatSpec path with the same pinned Git commit, adds redistribution metadata,
and locks model-facing documents/tests. The mathematical Model, Spec, RTL,
proof shell, and theorem signature are unchanged. The published reference proof
was rebuilt successfully against the portable public Case.

## Aggregate metrics

| Metric | Observed value |
|---|---:|
| Verdict | `PROVED 1/1` |
| Epochs | 7 |
| Comparative reflections | 6 |
| Wall time | 2:52:24.636 |
| Total LLM steps | 1,166 |
| Prover / Loss Judge / Reflector steps | 838 / 285 / 43 |
| Input tokens | 4,045,961 |
| Output tokens | 2,294,655 |
| Cache-read tokens | 123,862,272 |
| Total tokens including cache | 130,202,888 |
| Trusted candidate | `e290975eceb1c45a9e278a2f1e3414bb4957800e` |
| Second accepted candidate | `d5b6360712b5a3f4a0b44c85920a33df05eca040` |
| Reference proof | 2,632 lines; 189 theorem/lemma declarations |

Reasoning-token telemetry is a subset of output accounting and is therefore not
added to the total. Cache traffic is 95.1% of the reported total; comparisons
should report output, fresh input, steps, and wall time separately rather than
treat every cache-read token as newly generated work.

## Convergence trace

Public obligation progress remained `0/1` until the final dispatch closed. The
helper frontier below is verifier-attested internal structure, not additional
public obligations.

| Epoch | Verifier-backed state transition | Optimizer consequence |
|---:|---|---|
| 1 | Both candidates invalid: one altered/deleted the target and one left useful mathematics only in uncompiled Scratch. | Reflection classified the failure as process discipline rather than proof impossibility and separated special/control work from divider work. |
| 2 | One lane committed useful special/control lemmas in a red tree; the other produced a sound but orphaned divider module outside the build closure. | Reflection demanded green commits and build-closure evidence. |
| 3 | First accepted helper frontiers: 76 special/control declarations in r1; divider invariant and operand/exponent bridges in r2 after diagnosing a namespace audit issue. | The next tasks explicitly preserved and combined complementary evidence. |
| 4 | r1 assembled the special and divider halves; r2 added subnormal normalization and the p=26 GRS branch. An apostrophe in a declaration name exposed an axiom-probe parser defect. | The route memory prohibited fragile names and retained both mathematical halves. |
| 5 | The audit-name defect was avoided; r2 commit `2f5b0124…` became the first broad verified checkpoint and added the complete RNE layer. | Both next lanes were based on that trusted union instead of restarting. |
| 6 | r1 commit `05b9ba27…` held the `mant_b ≤ mant_a` (`ge`) block; r2 commit `e8d1d7f…` held the complementary `mant_a < mant_b` (`lt`) consumer cascade. Both passed Lean and white-box checks but retained the target `sorry`. | Reflection selected different parent commits and assigned each lane the missing complementary half. It also corrected an earlier misdiagnosis: many apparent recursion failures were Boolean precedence errors, while genuine recursion came from unfolding projection-heavy Spec definitions. |
| 7 | Both lanes imported the missing half, completed the normal-path assembly and special/normal dispatch, and independently reached `1/1`. | Controller accepted r1 after repeating the trusted Lean check; r2 independently supplied corroborating evidence. |

The decisive Epoch-6-to-7 transition is consistent with the intended
gradient-like mechanism: verified differences and failure evidence changed
persistent text parameters and parent-state selection, which changed the next
rollouts. The observation does not isolate causal contribution from model
sampling, model capability, prompt quality, or accumulated proof code.

## Trust result

For the promoted candidate:

- `lake build` exited 0 and built `FdivProof`;
- all locked-input hashes and the target signature matched;
- the public obligation counter was `1/1` and `finalAccepted` was true;
- no `sorry`, `admit`, custom axiom, `unsafe`, or `native_decide` occurred in
  the accepted proof;
- the transitive top-theorem axiom set was exactly `propext`,
  `Classical.choice`, and `Quot.sound`;
- the white-box Judge returned approved / low risk and found no weakened target,
  hidden premise, vacuous dispatch, theorem shadowing, or obligation-accounting
  trick.

One structural limitation remains: `mkState` and `rtl_comb` are defined in the
editable `FdivProof.lean` rather than separately hashed as locked inputs. Both
accepted candidates kept that prelude byte-identical and the white-box review
checked it, so the observed result is not affected. A future Case revision
should move or hash those bodies so this property is enforced mechanically.

FloatSpec emits `sorry` warnings while its full default target is replayed, but
the declaration-scoped axiom audit shows that none enters `rtlEquivSpec`'s
transitive proof cone. The public Case pins FloatSpec commit `eef09dc…` under
Apache-2.0 and replaces the original machine-local path with a portable Git
dependency.

## What this result supports

Supported:

1. the packaged Prover/Loss/Optimizer Runtime can solve this nontrivial Case;
2. verifier-gated Git states and text-parameter updates persisted useful work
   across seven Epochs;
3. comparative reflection identified complementary branches and scheduled
   different parent states before closure;
4. the final result survived deterministic Lean and independent white-box
   reward-hacking review.

Not yet supported:

1. that the new framework statistically outperforms SpecRefine;
2. that reflection, width, or any one plugin caused the success;
3. that the provider's current model is identical to an earlier
   `deepseek-v4-flash` deployment;
4. that the Verilog RTL is universally equivalent to the Lean Model;
5. that a third party will reproduce the same search cost or trajectory.

An aligned comparison requires the same frozen Case, model snapshot or dated
provider deployment, prompts, tools, skills, budgets, stop policy, and repeated
seeds. The primary metrics should be success rate, median and quantile
steps/tokens to first trusted proof, output/fresh-input cost, wall time, and
white-box rejection rate.

## Published evidence

- [`reference/FdivProof.lean`](reference/FdivProof.lean): promoted reference
  proof, SHA-256 `da1074579691416e2bb71811f742d589eabd46fd10151aed0755b0c6936f4926`.
- [`receipt.json`](receipt.json): path-free summary of the final Controller and
  verifier receipt.
- The raw Session trace is not committed because it contains machine-local
  paths and unnecessarily large cached model context. The durable local trace
  remains available for future sanitized event-level publication.

Publishing the reference solution makes this a transparent Case study and
regression target. Future blind evaluations need a held-out Case or a model
environment that cannot retrieve the published proof.
