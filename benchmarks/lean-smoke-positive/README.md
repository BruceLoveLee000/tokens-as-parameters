# Lean smoke positive

[简体中文](README.zh-CN.md)

This is the smallest runnable positive case for validating the experiment-mode infrastructure. The proof starts with one `sorry`; the expected theorem follows from the definitions and should be accepted only after the controller-owned Lean and axiom checks pass.

The Lake package registers every source module as an explicit library root, and the Case contract builds the `Smoke` target by name. A successful build therefore cannot be an empty default-target build.

It is an infrastructure smoke test, not evidence for long-horizon proof-search quality.
