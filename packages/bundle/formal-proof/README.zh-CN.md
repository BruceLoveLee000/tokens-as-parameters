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

Package Manifest 中的 `dsh.bundle.patch` 会组合八个运行时插件：

- `core-optimization`：领域无关的文本参数、暴露、反馈、原子更新与 Optimizer 注册契约；
- `optimizer-relative-reflection`：可替换的组间相对语义 Optimizer；
- `proof-observer`：持久化领域事件账本与 Run Snapshot；
- `proof-verification`：稳定的 Verifier 注册中心；
- `verifier-lean`：负责确定性检查与声明级整合的 Lean Provider；
- `proof-roles`：作用域隔离的 Prover，以及只读 Reviewer 的 Prompt/Tool；
- `proof-runtime`：后台生命周期、隔离 Worktree/Session、Checker 门控、语义合并与停止策略；
- `tool-proof-run`：仅用于实验的 `chip_proof`、`chip_proof_cases`、`proof_run_status`、`proof_run_list` 和 `proof_run_stop`。

`proof-contracts`、`core-state-git` 与 `core-telemetry` 等库是上述插件的依赖，不是 Bundle Row。

## Case 契约

配置的 `benchmarkRoot` 下每个可运行目录都包含 `case.json`。Runtime 按精确 `caseId` 发现 Case；调用方不能传入任意文件系统路径。Run 启动时，Case 目录必须在 Git Commit 上保持干净。

`case.json` 的完整示例见[英文文档](README.md#case-contract)，字段名和 JSON 内容无需翻译。提交 Case 前必须替换其中所有示例 Hash。

`editableFiles` 与 `lockedInputs` 不得重叠。顶层定理签名会单独冻结，因此把定理改写成更容易的命题不能获得进展。

每次调用时，Runtime 都会把 Case 复制到 `.tokens-as-parameters/runs/<runId>/workspace`，并排除 `.git`、`.lake`、生成 Build、依赖和历史 Run 状态。随后重新校验 Manifest 与锁定 Hash，初始化新的 Git 仓库，并把该 Commit 作为唯一 Run Baseline。源 Case 永远不是可写证明状态。

## 启动与观察 Run

在 DSH Code Agent 对话中使用实验约定：

```text
/chip_proof lean-smoke-positive
```

安装的 System Prompt Section 会指导 Code Agent 把它转换为 `chip_proof({ case_id: "lean-smoke-positive" })`；使用 `chip_proof_cases` 查看可用 id。搜索预算仍可作为 `chip_proof` 的可选参数。这是 `0.1.1-rc.2` DSH Tool API 上的对话约定，不是第二套 Agent Loop，也不是客户端 Slash Command 实现。

每次调用都会获得新的不可变 `runId`。刷新 Web 页面不会停止后台 Run；重新连接后使用 `proof_run_status` 或 `proof_run_list` 查询，使用 `proof_run_stop` 显式取消。进程重启后会重新发现默认 Run Root 下的历史 Snapshot；如果某个历史 Snapshot 原来仍是活动状态，系统会把它报告为 `ABORTED`，因为当前版本不会假装恢复已经失去所有权的 Agent Loop。

每个 Prover、Reflector 和 Reviewer 都是 DSH 官方 Session。原始模型和工具历史由原生对话/Session 界面管理。Bundle 还会在 `.tokens-as-parameters/runs/<runId>/` 保存研究账本：

- `run.json`：Controller 最新 Snapshot、受信 Commit、进度、Input/Output/Cache/Reasoning Token 计量、预算、Session ID 和终止原因；
- `events.jsonl`：有序的领域事件与关联 DSH Session 事件。

## 信任与停止规则

- Prover 文本永远不构成证明证据；
- 只有 Controller 自己执行的检查可以推进 Checkpoint：冻结输入 Hash、定理签名 Hash、相对 Epoch Base 的授权修改审计、文本卫生检查、成功的 `lake build`，以及每个 Obligation 的 `#print axioms` Receipt 不包含禁止依赖；如果某个声明仍间接依赖其他位置的 `sorryAx`，仅删除它自身的 `sorry` 不足以计入进度；
- 最终 `PROVED` 要求包括顶层定理在内的每个声明 Obligation 都通过公理门禁；启用白盒审查时，它是只能否决、不能提权的第二层；
- Lane 通过 Git Worktree 与 DSH Session 隔离；Runtime 进行声明级语义合并并重新检查，不把 `git merge` 当成证明合并器；
- Run 会在证明被接受、用户取消、总 Token 或总时间耗尽、或出现不可恢复的基础设施错误时停止；无进展和路线相似属于需要保留的实验行为，只要预算仍在就不会触发停止；
- 当前版本尚未包含经过独立认证的反例适配器，因此不会仅依据模型文本输出 `DISPROVED`。

## 比较反思

Reflector 是自主规划的 DSH Agent，而不是一次性摘要调用。默认上下文包含结构化 Checker 结果；随后可以搜索或分页读取完整的、经过单条限长处理的可观测轨迹，列出 Git 状态节点，并检查选中的状态转移 Diff。`record_insight(summary, insight)` 会生成 Insight 文件并自动创建 Git Commit，从而把证据状态和认知状态更新变成显式节点。

比较完成后，Controller 会创建一个多 Parent Reflection Commit：Tree 从受信证明开始，Parent 记录所有已消费的 Lane Tip。该节点成为下一 Epoch 的 `searchBaseCommit`，但不会虚增 `trustedCommit`，也不会带入未验证 Proof Tree。

Formal Prover Agent 注册 `task.memory`、`task.plan` 以及每个 Rollout 的 `lane.<id>.route`；是否接受反馈由 Agent 实例化时选择，而不是硬编码在 Core 中。每个 Session 都记录自己消费的精确 Revision。Reflector 可以检查参数使用、轨迹与 Git 证据，再原子替换有证据支撑的任意参数子集，并保留省略参数。

`chip_proof` 通过 `feedback_memory`、`feedback_plan` 与 `feedback_routes` 暴露该实验边界。启用反思时至少要开放其中一类参数。

超过反思 Soft Token 边界后，检查工具会被移除，并通过当前 Step 的消息要求 Agent 调用 `submit_reflection`。合法提交会结束 Turn；第二次非法提交将退化为中性更新。Core 与通用 Bundle 都不会硬编码定理分工或 FDIV 特定证明提示。

## 当前限制

打包后的机制已经具备单元测试与契约测试，但历史 FDIV 14/14 结果尚未通过这个 Bundle 重新运行。必须遵循版本化的[复现实验协议](../../../experiments/fdiv-reproduction/README.zh-CN.md)，并阅读[能力回退审查](../../../docs/zh-CN/architecture/fdiv-capability-review.md)；在证据门完成前，不得把旧结果表述为 Bundle 已复现。

本版本没有生产工作区模式。用户指定仓库、脏工作区治理和显式结果 Apply 由 [Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4) 跟踪。
