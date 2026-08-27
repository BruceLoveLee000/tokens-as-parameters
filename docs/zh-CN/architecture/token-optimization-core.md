# Token Optimization Core

[English](../../en/architecture/token-optimization-core.md)

## 决策

`packages/core/` 是 Tokens as Parameters 的推理时学习内核。形式化证明、Lean 与硬件验证都是这个内核的消费者，不属于优化语义本身。

该架构借鉴训练框架的稳定边界，但不声称文本更新等价于可微 Tensor 更新：

| Weight Training | Token Optimization |
|---|---|
| Tensor Parameter | 版本化 Prompt、Route、Memory、Skill Policy 或 Tool Policy |
| Forward Pass | Agent 通过工具和环境执行 Rollout |
| Loss | 外部 Evaluator/Checker 结果 |
| Gradient | 数值或语义形式的相对更新信号 |
| `Optimizer.step()` | 由证据驱动的文本参数更新 |
| Optimizer State | 持久化 Insight 与跨 Epoch 更新状态 |
| Checkpoint | Parameter Set、Solution State、Optimizer State 与来源信息 |

并非所有被观察到的 Token 都是参数。Core 明确区分：

- **Parameter Set**：被保留并影响后续 Rollout 的文本或结构化策略；
- **Solution State**：Lean 代码、受信 Git Commit 等任务产物；
- **Optimizer State**：某个优化算法保留的信息；
- **Trajectory**：执行过程的观测，不会自动成为持久参数。

## 已实现的 Package

- `core-optimization` 定义 `ParameterSet`、`OptimizationLane`、`EvaluationRecord`、`OptimizationPlan`、`TokenOptimizer` 契约以及 `ctx.optimization` 注册中心。
- `optimizer-relative-reflection` 注册 `relative-reflection` 实现。它比较从同一基线生成的一组 Rollout，通过受限只读接口自主探索证据，并生成一条公共更新和每路各一条 Route。
- `core-state-git` 把显式 Insight 和优化状态转移持久化为 Git 节点。
- `core-telemetry` 将 DSH Session Event 投影为有界轨迹，并保留精确的 Token 消耗维度。

第一版有意让同一个 Agentic Optimizer 同时完成 Advantage 估计与参数更新生成。契约仍然把 Evaluator 输入和 Optimization 输出分开，以便后续实验拆分这两个阶段，而无需修改 Formal 或 Chips Package。

## Optimizer Provider 契约

Optimizer Package 是一个注入 `optimization` 并注册唯一稳定 Optimizer ID 的 Cordis Plugin：

```ts
export const inject = ['optimization']

export function apply(ctx: Context) {
  return ctx.optimization.register(new RelativeReflectionOptimizer())
}
```

符合规范的 Provider 必须：

1. 消费版本化 `ParameterSet`、同一 Epoch 的 Rollout Group、结构化 Evaluation 与有界证据访问接口；
2. 绝不能把任务结果提升为受信状态；
3. 返回覆盖每个指定 Rollout 恰好一次的文本 `OptimizationPlan`；
4. 把 Evaluator 证据视为权威，把模型文字视为待验证假设；
5. 响应取消信号和由 Engine 管理的预算边界；
6. 不包含 Benchmark 专属答案或隐藏任务提示；
7. 将持久化、调度、Rollout 执行与最终验证留给对应的拥有者。

Core 不强制 Advantage 必须是标量。实现可以消费标量 Reward、结构化指标、文本比较或它们的组合。这保留了核心假设：即使不存在有用的可微 Gradient，语言模型仍可能消费信息带宽更高的语义更新。

## 依赖规则

Core Package 不得导入 Formal、Lean、Chips 或 Benchmark Package。领域 Package 负责把自己的 Receipt 适配为 `EvaluationRecord`；例如 Formal 会把受信的 Obligation 数量和完整 Lean Receipt 映射成 Optimization Lane。该依赖方向允许我们在不修改证明任务和 Verifier 的前提下做 Optimizer 消融实验。

未来的 Scheduler、Checkpoint Service 或其他 Optimizer，只有在存在真实消费者与一致性测试时才进入 Core，不能仅为了模仿框架目录而添加空脚手架。
