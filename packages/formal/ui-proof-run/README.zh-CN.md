# 证明运行界面

这是 Formal Proof Runtime 的 DSH Web 视图。它读取宿主会话的 `proofRuns` 投影，展示控制器状态机、可信命题进度、实时总 Token 与各子 Session Token、历史 Run，以及 Prover、Reflector、Reviewer 会话入口。

“停止运行”按钮通过 DSH Commands 执行 `/proof-stop <run-id>`，属于直接控制面操作，不会调用主模型。
