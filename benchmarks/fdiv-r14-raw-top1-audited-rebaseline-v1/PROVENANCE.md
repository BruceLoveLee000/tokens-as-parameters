# Provenance

[简体中文](PROVENANCE.zh-CN.md)

## Original material

The FDIV specification, Lean model, proof shell, Verilog RTL, test programs,
and engineering notes in this Case are original AI-assisted research material
commissioned, selected, reviewed, and contributed by Bruce Lee. The contributor
represents that they were not copied from proprietary chip RTL or another
restricted benchmark. To the extent copyright or other licensable rights exist
in the generated material, the contributor releases those rights under
Apache-2.0. The repository DCO applies to the contribution.

The public Case is derived from a frozen local research snapshot at commit
`22fdb9ad12c83d2196dfa581e277f46e3dfb12fa`. The private repository location is
intentionally not published. Public packaging replaces its machine-local
FloatSpec path with the exact Git dependency below; the arithmetic Model, Spec,
RTL, theorem signature, proof shell, tests, and model-facing engineering notes
are otherwise preserved.

## External dependency

`FloatSpecBridge.lean` refers to FloatSpec, which is not vendored in this Case.
Lake retrieves it from the public
[Beneficial-AI-Foundation/FloatSpec](https://github.com/Beneficial-AI-Foundation/FloatSpec)
repository at commit `eef09dc52b20c00c378e3ee25fabdac23bf65ac9`.
That checkout contains an Apache-2.0 `LICENSE` and no `NOTICE` file. The
benchmark's final top theorem does not depend on FloatSpec declarations, but the
bridge remains part of the frozen build surface because it was present in the
executed Case.

## Audit and claim boundary

- Expected verdict: `PROVED`.
- Claim scope: the supplied Lean `FdivModel` equals the supplied Lean
  `FdivSpec` for every pair of 32-bit inputs, including all six result fields.
- The result does not prove the Verilog-to-Lean transcription universally.
- The arithmetic profile uses round-to-nearest-even and the documented
  flush-to-zero behavior for tiny nonzero outputs; it is not full IEEE-754
  gradual underflow.
- The audited Spec rebaseline has source review, executable regression, and
  historical proof evidence, but no universal old-Spec/new-Spec equivalence
  theorem is claimed.

## Public reference solution

The starting Case intentionally contains only `sorry` for the one public
obligation. A successful 2026-09-13 reference proof is published separately
under `experiments/fdiv-raw-top1-showcase/`; it is not materialized into a Run
workspace by the Case catalog. Because the solution is public, this Case is a
reproducible showcase and regression target, not a contamination-free blind
benchmark for models that can read the repository or the Internet.
