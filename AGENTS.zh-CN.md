# Codex 开发指南

[English](AGENTS.md) | 简体中文

## 目的

本文件用于指导 Codex 如何开发这个代码仓。它不定义实验中的 Prover、Reflector 或 Consolidator Agent 的 Prompt 与行为。

本规则适用于仓库根目录及其所有子目录；如果更近的目录存在 `AGENTS.md`，则以更具体的规则为准。

## 开始开发前

修改代码前必须：

1. 检查 `git status`，保留无关的已有修改。
2. 阅读 `README.md`、`CONTRIBUTING.md` 和距离目标文件最近的 `AGENTS.md`。
3. 在设计改动前，检查受影响的 Package、公共契约和测试。
4. 当修改跨越 Package 或信任边界时，阅读 `docs/` 下相关的架构决策。

## 当前仓库状态

仓库仍处于初始化阶段，尚未提交包管理器 Workspace、构建命令或测试命令。

不要在文档或自动化脚本中虚构命令。Monorepo 脚手架建立后，只能把已在干净 Checkout 中成功执行过的命令补充到本文件。

## 仓库目录

- `packages/`：DSH 插件、运行时库和 Verifier 适配器。
- `benchmarks/`：带有逐 Case 来源和许可证的版本化研究任务。
- `experiments/`：可复现实验协议、Manifest、消融和分析。
- `docs/`：理论、架构、ADR、指南和研究结果。

只有当某个目录的开发规则与根规则存在实质差异时，才增加嵌套的 `AGENTS.md`。

## 架构规则

- 科研领域契约和状态转移必须独立于 DeepSeek Harness API。
- 通过 DSH 公开的 Plugin、Service、Event、Tool 和 Agent Preset 完成集成。
- 除非通过 ADR 证明公开扩展点无法满足需求，否则不得 Fork 或修改 DSH 官方 Agent Loop。
- 在满足需求时，复用 DSH 官方 Code Agent、Session Log、工具执行、上下文管理和 Trajectory UI。
- 尽可能将模型可见 Prompt、Skill 和实验策略进行版本管理，并与实现代码分离。
- 不得把 Benchmark 特定答案或证明提示写入通用 Plugin、Skill、Prompt 或开发说明。
- 不得原地修改已经冻结的 Benchmark 输入；必须创建带明确来源的新版本或新 Case。
- 模型声称成功不构成可信结果，只有 Verifier 证据可以推进受信进度。
- Orchestrator、Verifier、Textual State Store、Update Policy、Consolidator 与 DSH Adapter 之间优先使用明确接口。

## 开发流程

1. 明确需要修改的可观察行为或公共契约。
2. 在保持 Package 边界的前提下，实现最小且完整的修改。
3. 为修改的行为增加或更新聚焦测试。
4. 先运行最相关的小范围检查；共享契约变化时再运行仓库级检查。
5. 行为或配置变化时，同步更新公共文档与示例。
6. 检查 Diff 中是否存在密钥、本机路径、Benchmark 泄漏、生成物或无关修改。

不得为了让修改通过而静默弱化测试、Verifier、Theorem、Expected Verdict 或语义契约。

## 文档语言

所有面向人类阅读的项目文档都必须提供英文和简体中文版本。

- 中文是主要创作语言和维护者审核语言。
- 英文是 GitHub 和国际社区的默认语言。
- 文档修改只有在同一个 PR 内同步更新两个版本后才算完成。
- 两个版本必须保持语义一致，翻译不得额外引入新的技术结论。
- 不翻译代码标识符、API 名称、命令、文件路径、结构化日志字段和数学记号。
- 代码注释、公共标识符、Schema、Commit 标题和机器接口使用英文。

使用 `README.md` 与 `README.zh-CN.md` 这样的成对文件。后续建立文档树时，`docs/` 使用镜像的 `docs/en/` 与 `docs/zh-CN/` 路径。

`LICENSE`、`DCO` 等官方法律文本保留英文；中文法律说明必须明确标注为非约束性说明。

## 安全与许可证

- 不得提交 API Key、Access Token、私有仓库地址、私有源码、个人邮箱或包含凭据的 Trace。
- 密钥只能存放在 DSH Credential Provider、操作系统 Keychain 或被忽略的本地配置中。
- 保留第三方许可证、Notice 和 Benchmark 来源信息。
- 遵循 `NOTICE` 与 `CONTRIBUTING.md` 中定义的许可证边界。

## 完成标准

一次开发任务只有在满足以下条件时才算完成：

- 请求的行为已经实现，且没有夹带无关改动；
- 聚焦测试通过，并按影响范围运行了更广泛的检查；
- 公共契约、配置和失败模式已有文档；
- 中英文文档已经同步；
- 不包含密钥、本机路径或无授权材料；
- 已检查工作区状态和最终 Diff；
- 用于贡献的 Commit 包含 DCO sign-off。
