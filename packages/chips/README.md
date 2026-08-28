# Chips domain

English | [简体中文](README.zh-CN.md)

This directory is reserved for hardware-specific plugins such as RTL-to-formal fidelity certificates, sequential equivalence tasks, simulator replay, and hardware protocol semantics.

It intentionally contains no executable plugin yet. The current implementation proves a frozen Lean model against a frozen Lean specification; it does not provide an end-to-end RTL-fidelity adapter. FDIV inputs and results belong under `benchmarks/` and `experiments/`, not in Core Optimizers or generic Formal prompts.

A future `rtl-lean-equivalence` package must define its trust contract and provenance before this Bundle can claim `rtl-vs-spec` coverage.
