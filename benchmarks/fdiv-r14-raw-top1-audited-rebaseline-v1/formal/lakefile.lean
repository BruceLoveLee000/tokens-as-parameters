import Lake
open Lake DSL

package «fdiv-formal» where
  leanOptions := #[]

-- Keep the historical `fspec` alias because the dependency package itself is
-- named `FloatSpec`. The public Case pins the exact Apache-2.0 source commit
-- instead of relying on the machine-local checkout used by the original Run.
require fspec from git
  "https://github.com/Beneficial-AI-Foundation/FloatSpec.git" @
  "eef09dc52b20c00c378e3ee25fabdac23bf65ac9"

@[default_target]
lean_lib FdivSpec

@[default_target]
lean_lib FdivModel

@[default_target]
lean_lib FdivProof

-- Step D (2026-05-03): BitVec 32 ↔ Binary754 24 128 桥接, 不被 FdivProof 依赖,
-- 独立 lib 方便后续语义级 critical theorem 引用.
@[default_target]
lean_lib FloatSpecBridge

-- spec.md §10 truth table (12 corner case) — §9.2 #1 anti-co-bug 强制要求.
-- 用 native_decide 直接验 spec→Lean 翻译跟 IEEE 754 ground truth 锚定.
@[default_target]
lean_lib TruthTable
