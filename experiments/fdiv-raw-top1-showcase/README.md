# FDIV raw-top1 optimizer showcase

[简体中文](README.zh-CN.md)

This experiment family studies whether parallel proof rollouts, verifier-backed
Loss, persistent text parameters, and comparative reflection can discover a
proof architecture from a single top-level FDIV obligation.

The executable starting Case is
[`fdiv-r14-raw-top1-audited-rebaseline-v1`](../../benchmarks/fdiv-r14-raw-top1-audited-rebaseline-v1/).
Unlike the earlier 9/14 parity pilot, it contains no fourteen-obligation
decomposition, prior proof frontier, proof API, route recommendation, or
completed target proof.

The first successful result is documented in
[`results/2026-09-13-deepseek-v4-flash`](results/2026-09-13-deepseek-v4-flash/README.md).
The reference proof is published with that result rather than inside the Case,
so the Runtime does not materialize it into the Prover workspace.

This is a public case study and regression target. Because its reference proof
is published, it must not be represented as a contamination-free blind model
benchmark.
