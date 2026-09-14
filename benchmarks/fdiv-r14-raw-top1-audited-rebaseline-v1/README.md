# FDIV audited from-zero top-level proof benchmark

[简体中文](README.zh-CN.md)

This Case tests autonomous proof-architecture discovery. It starts with one
public obligation and no trusted proof progress:

```lean
theorem rtlEquivSpec (a b : BitVec 32) : rtl_comb a b = fdiv a b
```

The proving Agent receives no fourteen-obligation decomposition, proof API,
proof view, Model-to-Spec bridge, prior helper frontier, route recommendation,
or difficulty label. It may revise `formal/FdivProof.lean` and add new
verifier-audited proof-side Lean modules, so intermediate structure must emerge
from the rollout and Optimizer rather than from the benchmark author.

## Why this is `0/1`

The earlier fourteen statements were one possible proof decomposition, not
fourteen independent user requirements. Publishing them here would preload a
proof architecture. This Case therefore reports named progress as `0/1` until
the top theorem closes. Kernel-checked helper commits, Loss evidence, Insights,
and Git states remain visible to the Optimizer even when the public-obligation
counter stays at zero.

## Audited representation boundary

The arithmetic semantics use the second source-reviewed `FdivSpec.lean`
rebaseline. It inlines problematic normal-path projections into a shallower
reduction surface. The same locked Model, audited Spec, and top theorem were
previously closed by a 14/14 Kernel-checked candidate, but neither that proof
nor `FdivProofAPI.lean` is included here.

“Audited” is intentionally narrow. The rebaseline preserves the intended
arithmetic expression and has historical build, axiom-audit, white-box, and
2,014-vector RTL/oracle evidence. It does not have a universal Lean theorem
equating the toxic old representation with the revised one, because restating
the old symbolic form triggers the Kernel recursion pathology.

## Trust boundary

The Case locks `FdivSpec.lean`, `FdivModel.lean`, `FloatSpecBridge.lean`, RTL,
toolchain, dependency identity, and the top-theorem signature. Acceptance
requires a successful Lean build, no `sorry`/`admit`, no forbidden or
compiler-generated axioms, intact locked inputs, and white-box reward-hacking
review.

The claim scope is only the supplied Lean Model versus the supplied Lean Spec.
It does not certify the RTL-to-Lean transcription. The semantic profile is
binary32 round-to-nearest-even with the documented flush-to-zero handling for
tiny nonzero outputs, not full gradual-underflow IEEE-754.

## Reproducible checks

From the Case root:

```sh
cd formal && lake build
cd .. && sh tests/check_all.sh 2000
```

The initial build is expected to succeed with exactly one `sorry`, belonging
to `rtlEquivSpec`.

The public packaging pins FloatSpec to Git commit `eef09dc…`; the first build
requires network access and can use `lake exe cache get` before `lake build`.
See [PROVENANCE.md](PROVENANCE.md), [NOTICE](NOTICE), and [LICENSE](LICENSE).
The successful reference proof and bounded result analysis are published
outside this input directory under
[`experiments/fdiv-raw-top1-showcase`](../../experiments/fdiv-raw-top1-showcase/README.md).
