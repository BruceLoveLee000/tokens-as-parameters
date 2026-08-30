# DSH 形式化证明 Bundle

[English](README.md) | 简体中文

`@tokens-as-parameters/bundle-formal-proof` 是一个可安装的 DeepSeek Harness Bundle。它在 DSH 官方 Code Agent 与 Agent Loop 之上组装彼此独立的 Core Optimizer、Formal、Lean 与 Tool Package；Bundle 自身不承载证明实现。

## 兼容性

- DSH Package：当前研究预览版精确锁定为 `0.1.1-rc.2`；
- Node.js：`^22.19` 或 `>=24`；
- 实验 Catalog：使用本仓库 `benchmarks/`，其中 Case 必须是已提交的快照，并包含由 Lake 管理的 Lean 工程。

精确锁定 DSH Peer Version 是有意为之。公开扩展接口仍处于预发布阶段，扩大版本范围前必须重新验证兼容性。

## 安装到 DSH Web

在当前 Checkout 中构建并打包：

```bash
npm ci
npm run check
npm run pack:local
dsh plugin --profile web add ./tokens-as-parameters-*.tgz
```

安装后重启 Profile：

```bash
dsh web
```

Package Manifest 中的 `dsh.bundle.patch` 会组合十二个运行时插件：

- `core-optimization`：领域无关的文本参数、暴露、反馈、原子更新与 Optimizer 注册契约；
- `optimizer-relative-reflection`：可替换的组间相对语义 Optimizer；
- `proof-observer`：持久化领域事件账本与 Run Snapshot；
- `proof-agent` / `prover-code-agent`：可替换 Prover Registry 与默认官方 Code Agent Provider；
- `proof-loss` / `loss-lean-dual`：可替换 Loss Registry 与默认逐 Rollout Lean + 白盒 Provider；
- `proof-verification`：稳定的 Verifier 注册中心；
- `verifier-lean`：确定性 Lean 规则检查 Provider；
- `proof-runtime`：后台生命周期、隔离 Worktree/Session、Plugin 调度、Git 状态图与停止策略；
- `tool-proof-run`：仅用于实验的 `chip_proof`、`chip_proof_cases`、`proof_run_status`、`proof_run_list` 和 `proof_run_stop`。
- `ui-proof-run`：把 Proof Runtime 状态机、可信进度、历史 Run 与 Agent Session 入口投影到 DSH Web，并提供不经过模型的停止按钮。

`proof-contracts`、`core-state-git` 与 `core-telemetry` 等库是上述插件的依赖，不是 Bundle Row。

## Case 契约

配置的 `benchmarkRoot` 下每个可运行目录都包含 `case.json`。Runtime 按精确 `caseId` 发现 Case；调用方不能传入任意文件系统路径。Run 启动时，Case 目录必须在 Git Commit 上保持干净。

`case.json` 的完整示例见[英文文档](README.md#case-contract)，字段名和 JSON 内容无需翻译。提交 Case 前必须替换其中所有示例 Hash。

`editableFiles` 与 `lockedInputs` 不得重叠。`editableFiles` 是历史起始提示，Agent 可以新增证明侧源码；锁定 Hash 与单独冻结的定理 Signature 定义不可变边界。

每次调用时，Runtime 都会把 Case 复制到 `.tokens-as-parameters/runs/<runId>/workspace`，并排除 `.git`、`.lake`、生成 Build、依赖和历史 Run 状态。随后重新校验 Manifest 与锁定 Hash，初始化新的 Git 仓库，并把该 Commit 作为唯一 Run Baseline。源 Case 永远不是可写证明状态。

## 启动与观察 Run

在 DSH Code Agent 对话中使用实验约定：

```text
/chip_proof lean-smoke-positive
```

安装的 System Prompt Section 会指导 Code Agent 把它转换为 `chip_proof({ case_id: "lean-smoke-positive" })`；使用 `chip_proof_cases` 查看可用 id。搜索预算仍可作为 `chip_proof` 的可选参数。这是 `0.1.1-rc.2` DSH Tool API 上的对话约定，不是第二套 Agent Loop，也不是客户端 Slash Command 实现。

每次调用都会获得新的不可变 `runId`。DSH Web 的“证明运行”标签页同时展示 Prover、逐 Rollout Loss Judge 与 Reflector Session，以及可信 Obligation、Candidate/Loss 状态、模型 Step、Token 和 Epoch。刷新页面不会停止后台 Run；“停止运行”按钮通过 `/proof-stop <runId>` 直达 Controller，不调用主模型。

每个 Prover、Reflector 和 Reviewer 都是 DSH 官方 Session。原始模型和工具历史由原生对话/Session 界面管理。Bundle 还会在 `.tokens-as-parameters/runs/<runId>/` 保存研究账本：

- `run.json`：Controller 最新 Snapshot、受信 Commit、进度、Input/Output/Cache/Reasoning Token 计量、预算、Session ID 和终止原因；
- `events.jsonl`：有序的领域事件与关联 DSH Session 事件。

## 信任与停止规则

- Prover 文本永远不构成证明证据；
- `lean-dual-check` 把 Controller 自有的锁定/Signature/Hygiene/Build/Axiom 检查，与每个 Rollout 后的只读白盒 Judge 组合起来；`lean-rule-only` 是显式的纯黑盒消融；
- 最终 `PROVED` 要求 Loss 为 `solved`，并由 Controller 重新执行 Lean 检查关闭包括顶层定理在内的所有 Obligation；
- Lane 通过 Git Worktree 与 DSH Session 隔离；系统不自动合并。Optimizer 选择每条下一父状态，语义整合是普通 Prover 任务，之后经过同一 Loss；
- Run 会在证明被接受、用户取消、总 Token 或总时间耗尽、或出现不可恢复的基础设施错误时停止；无进展和路线相似属于需要保留的实验行为，只要预算仍在就不会触发停止；
- 当前版本尚未包含经过独立认证的反例适配器，因此不会仅依据模型文本输出 `DISPROVED`。

## 比较反思

Reflector 是自主规划的 DSH Agent，而不是一次性摘要调用。默认上下文包含结构化 Loss Report、参数暴露和可用状态 ID；它可以搜索/分页读取 Trace、列出 Git 节点、检查状态转移、读取 Commit 文件并比较两路同一文件。`record_insight(summary, insight)` 会把安全的已变更证明源码与认知/证据节点一起提交。

比较完成后，Reflector 提交原子 `OptimizationDecision`：文本参数更新，以及每条下一 Lane 唯一的合法父状态/任务。Reflection Commit 记录决策与已消费 Tip，但下一 Prover 从选中的 Solution Commit 启动，不从合成 Merge Tree 启动。

Formal Prover Agent 注册 `task.memory`、`task.plan` 以及每个 Rollout 的 `lane.<id>.route`；是否接受反馈由 Agent 实例化时选择，而不是硬编码在 Core 中。每个 Session 都记录自己消费的精确 Revision。Reflector 可以检查参数使用、轨迹与 Git 证据，再原子替换有证据支撑的任意参数子集，并保留省略参数。

`chip_proof` 通过 `feedback_memory`、`feedback_plan` 与 `feedback_routes` 暴露该实验边界。启用反思时至少要开放其中一类参数。

模型 Step 是主要深度预算：默认每个 Prover 200 Step、白盒 Judge 24 Step、Reflector 32 Step。到达角色边界后移除探索工具，只保留提交工具。Cache Read Token 仍属于成本/上下文计量，但不会终止 Rollout。Core 与通用 Bundle 都不会硬编码定理分工或 FDIV 特定证明提示。

## 当前限制

打包后的机制已经具备单元测试与契约测试，但历史 FDIV 14/14 结果尚未通过这个 Bundle 重新运行。必须遵循版本化的[复现实验协议](../../../experiments/fdiv-reproduction/README.zh-CN.md)，并阅读[能力回退审查](../../../docs/zh-CN/architecture/fdiv-capability-review.md)；在证据门完成前，不得把旧结果表述为 Bundle 已复现。

本版本没有生产工作区模式。用户指定仓库、脏工作区治理和显式结果 Apply 由 [Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4) 跟踪。
