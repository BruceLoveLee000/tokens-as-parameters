# Security

Tokens as Parameters orchestrates coding agents, shell commands, Git worktrees, model providers, and formal verification tools. Treat plugins, benchmark inputs, prompts, and generated code as potentially untrusted.

## Default security principles

- Scope filesystem and process access to the selected workspace.
- Reuse DSH credential references; never copy API keys into run state or traces.
- Keep verifier execution independent from model-authored success claims.
- Preserve append-only evidence for security- and trust-relevant decisions.
- Do not upload source code, traces, or benchmark data by default.
- Make cancellation, timeout, cleanup, and resource budgets explicit.

Until a public repository enables private security advisories, contact the maintainers privately rather than publishing exploitable details.
