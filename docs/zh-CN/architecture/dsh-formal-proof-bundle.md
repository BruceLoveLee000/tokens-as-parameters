# DSH 原生形式化证明 Bundle 架构

[English](../../en/architecture/dsh-formal-proof-bundle.md)

## 决策

第一个实现版本采用一个可安装的 DSH Bundle，其中包含多个 Cordis Plugin。它复用官方 Code Agent、Agent Loop、Session、文件系统/Shell 工具、上下文压缩、Token 计量、凭据管理与 Web 轨迹界面。研究代码只负责形式化证明策略与证据信任边界。

```text
官方 DSH Web / Code Agent
            |
     proof_run_* tools
            |
     ProofRunService
       /     |      \
  Provers  Reflector  Reviewer       官方 DSH Sessions
     |        |          |
 Git nodes  relative   veto-only
     |      update       review
     +--------+----------+
              |
     Controller 自有 LeanVerifier
              |
     run.json + events.jsonl + Git commits
```

## 插件边界

| Plugin | 职责 | 不得负责 |
|---|---|---|
| `observer` | Run Snapshot，以及关联 DSH Session Event 的领域事件账本 | 原始对话持久化或替代 UI |
| `roles` | 作用域隔离的 Prover/Reviewer Prompt 与证明领域工具 | Agent Loop 或全局 Code Agent 工具 |
| `reflection` | 证据探索与一次结构化组间相对文本更新 | 证明验收或 Benchmark 特定提示 |
| `runtime` | Run 状态机、Worktree、Session、预算、合并和停止 | LLM Adapter、凭据、Shell、文件系统、上下文压缩 |
| `tools` | 用户可见的 start/status/list/stop 控制 | 第二套控制面或 Web Server |

领域契约、Manifest 解析、Git 状态和 Lean 校验不依赖 DSH 启动。适配代码只依赖 DSH 公开 Package。

## 状态与更新模型

每个 Run 都获得新的 `runId`，不同 Run 不会隐式继承可变证明状态。在同一个 Run 内，每个 Epoch 都从 Controller 上一次接受的 Git Commit 开始；每个 Lane 拥有独立的 Git Worktree 与 DSH Session。

`record_insight(summary, insight)` 把模型主动选择的认知/证据更新变为 Git 节点：

1. Runtime 写入版本化 Insight 文件；
2. Summary 成为 Commit Message；
3. 当前可编辑证明文件和 Insight 一起提交；
4. Reflector 可以列出节点，并按需检查选中节点的状态转移 Diff。

这样可以保留由模型选择的语义锚点，同时避免把所有隐藏思考 Token 或所有文件修改等量视为关键状态。

反思完成后，Controller 创建一个多 Parent Commit。它的 Tree 基于当前受信证明，只增加 Reflection State；Parent 包含受信证明与所有被消费的 Lane Tip。该 Commit 成为 `searchBaseCommit`，而 `trustedCommit` 仍由 Verifier 独立门控。因此 Git DAG 能记录信息流，又不会执行 `git merge` 或导入未验证的 Lane Proof Tree。

## 相对反思

反思读取各 Lane 的终态、Checker Receipt、Git 状态节点以及按需读取的轨迹片段。Reflector 自主规划只读工具调用。因为消费者是语言模型，所以输出是文本方向更新，不是数值标量。它编码：

- 可迁移证据与已被否定的假设；
- 一条高密度公共更新；
- 每个 Rollout 各一条非同质化的下一轮路线。

路线契约只要求覆盖所有 Rollout，不强制定理分工。错误收敛应作为可观测的实验行为保留下来，而不是被 Case 特定启发式隐藏。

## 信任边界

Controller 把模型输出、Shell 声称、反思和 Reviewer 批准都视为不受信信息。Checkpoint 只有通过 Controller 自己执行的确定性检查后才能推进，其中包括对每个计为已关闭的 Obligation 执行干净的 Lean 公理审计。这样可以避免“自身语法上已完成、但仍依赖其他 `sorryAx`”的引理虚增受信进度。最终验收要求包括顶层定理在内的所有 Obligation 都通过。白盒审查可以否决确定性成功，但不能凭空创造成功。

Claim Scope 必须显式声明。`lean-model-vs-spec` 证明不能在缺少独立版本化 RTL-to-Lean 证书或适配器时扩大为 RTL Fidelity 结论。

## 第一版有意保留的限制

- 不自动完成 RTL-to-Lean 转换；
- 尚无经过认证的 `DISPROVED` Adapter；
- 不跨 Run 继承证明状态；
- 通用 Bundle 不包含 Benchmark 特定 Lean Skill 或 FDIV 提示；
- 不声称历史 FDIV 结果已经通过本实现完成复现。
