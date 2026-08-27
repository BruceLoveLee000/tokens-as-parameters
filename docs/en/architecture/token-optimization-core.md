# Token-optimization Core

[简体中文](../../zh-CN/architecture/token-optimization-core.md)

## Decision

`packages/core/` is the inference-time learning kernel of Tokens as Parameters. Formal proof, Lean, and hardware verification are consumers of this kernel, not part of its optimization semantics.

The architecture borrows stable training-framework boundaries without claiming that text updates are differentiable tensor updates:

| Weight training | Token optimization |
|---|---|
| tensor parameter | versioned prompt, route, memory, Skill policy, or tool policy |
| forward pass | Agent Rollout through tools and an environment |
| loss | external Evaluator/Checker record |
| gradient | numeric or semantic relative update signal |
| `Optimizer.step()` | evidence-driven textual parameter update |
| optimizer state | persistent insights and cross-Epoch update state |
| checkpoint | Parameter Set, solution state, optimizer state, and provenance |

Not every observed token is a parameter. The Core distinguishes:

- **Parameter Set**: retained text or structured policy that influences future Rollouts;
- **Solution State**: task artifacts such as Lean code and trusted Git commits;
- **Optimizer State**: information retained by one optimization algorithm;
- **Trajectory**: an observation of execution, not automatically a retained parameter.

## Implemented packages

- `core-optimization` owns `ParameterSet`, `OptimizationLane`, `EvaluationRecord`, `OptimizationPlan`, the `TokenOptimizer` contract, and the `ctx.optimization` registry.
- `optimizer-relative-reflection` registers the `relative-reflection` implementation. It compares a same-base Rollout group, explores evidence through bounded read-only callbacks, and emits one common update plus one route per Rollout.
- `core-state-git` persists explicit Insight and optimization state transitions as Git nodes.
- `core-telemetry` projects DSH Session events into bounded trajectories and exact token dimensions.

The first implementation intentionally keeps advantage estimation and parameter-update generation inside one agentic Optimizer. The contracts keep the Evaluator input and Optimization output distinct so later experiments can split those stages without changing Formal or Chips packages.

## Optimizer provider contract

An Optimizer package is a Cordis plugin that injects `optimization` and registers exactly one stable optimizer id:

```ts
export const inject = ['optimization']

export function apply(ctx: Context) {
  return ctx.optimization.register(new RelativeReflectionOptimizer())
}
```

A conforming provider:

1. consumes a versioned `ParameterSet`, a same-Epoch Rollout group, structured evaluations, and bounded evidence access;
2. never promotes a task result to trusted status;
3. returns a textual `OptimizationPlan` covering every requested Rollout exactly once;
4. treats evaluator evidence as authoritative and model prose as hypotheses;
5. responds to cancellation and engine-owned budget boundaries;
6. exposes no benchmark-specific solution or hidden task hint;
7. leaves persistence, scheduling, Rollout execution, and final verification to their owning services.

The Core does not require a scalar advantage. An implementation may consume scalar rewards, structured metrics, textual comparisons, or a combination. This preserves the central hypothesis that a language model can consume a higher-bandwidth semantic update even when no useful differentiable gradient exists.

## Dependency rule

Core packages cannot import Formal, Lean, Chips, or benchmark packages. Domain packages adapt their receipts to `EvaluationRecord`; for example, Formal maps trusted obligation counts and the complete Lean receipt into an optimization lane. This direction makes optimizer ablations possible without changing the proof task or verifier.

Future Core packages such as a scheduler, checkpoint service, or alternative optimizer should be introduced only with an implemented consumer and a conformance test, not as empty framework-shaped scaffolding.
