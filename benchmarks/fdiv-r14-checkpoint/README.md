# FDIV R14 checkpoint adapter

English | [简体中文](README.zh-CN.md)

This directory reserves the public adapter boundary for the FDIV R14 checkpoint experiment. It intentionally contains no RTL, Lean specification, generated proof, or historical trace yet.

The source case currently lives in a separately versioned private benchmark repository. It must not be copied here until every input has explicit provenance, redistribution permission, immutable hashes, and a per-case license. This guard prevents a software refactor from silently publishing unrelated benchmark material.

When the provenance gate is complete, this directory will contain a clean `0/14` or declared checkpoint case conforming to [`benchmarks/README.md`](../README.md). Until then, developers can point `proof_run_start.case_root` at their authorized local checkout and follow the [reproduction protocol](../../experiments/fdiv-reproduction/README.md).
