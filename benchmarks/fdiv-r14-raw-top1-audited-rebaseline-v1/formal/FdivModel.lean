-- FdivModel.lean — RTL 数学模型（mirrors verilog wires）
-- 翻译策略: 手动翻译（方案B），因 sparkle 工具链 (Lean 4.28) 与项目 (4.12) 不兼容。
--
-- 与 RTL 信号一对一映射：
--   RtlState           → 所有寄存器（input reg + output reg）
--   combinationalLogic → 纯组合逻辑（wire 计算）
--   nextRtlState       → 下一时钟沿的状态转移
--
-- 约束：
--   § P-now-6: 无 self-test / example / #eval
--   § P-now-7: 28-stage divider 用 List.foldl 实现（plain recursion 在 Lean 4
--              中不被 kernel 接受为非终止）
--   § 复用 FdivSpec 定义的类型和分类函数，不重复实现

import FdivSpec

open FdivSpec

namespace FdivModel

-- ===========================================================================
-- 第 1 节 — 寄存器状态（对应 Verilog always @(posedge clk) 全部 reg）
-- ===========================================================================

structure RtlState where
  -- 输入寄存器
  a_reg      : BitVec 32
  b_reg      : BitVec 32
  start_reg  : Bool
  -- 输出寄存器
  result     : BitVec 32
  valid      : Bool
  overflow   : Bool
  underflow  : Bool
  div_by_zero : Bool
  invalid    : Bool
  inexact    : Bool
deriving Repr

-- 复位初始状态（对应 rst_n = 0 时的 always @(negedge rst_n)）
def rtlInitState : RtlState :=
  { a_reg      := 0#32
    b_reg      := 0#32
    start_reg  := false
    result     := 0#32
    valid      := false
    overflow   := false
    underflow  := false
    div_by_zero := false
    invalid    := false
    inexact    := false
  }

-- ===========================================================================
-- 第 2 节 — 组合逻辑辅助函数（与 RTL wire 一对一）
-- ===========================================================================

-- 字段提取（RTL § Input Field Extraction）
def rtlSign (x : BitVec 32) : Bool   := x.getLsbD 31
def rtlExp  (x : BitVec 32) : BitVec 8  := BitVec.extractLsb 30 23 x
def rtlFrac (x : BitVec 32) : BitVec 23 := BitVec.extractLsb 22 0 x

-- 特殊值标志（复用 FdivSpec 的分类定义，与 RTL § Special Value Detection 一致）
def a_is_zero (s : RtlState) : Bool     := isZero s.a_reg
def b_is_zero (s : RtlState) : Bool     := isZero s.b_reg
def a_is_subnormal (s : RtlState) : Bool := isSubnormal s.a_reg
def b_is_subnormal (s : RtlState) : Bool := isSubnormal s.b_reg
def a_is_inf (s : RtlState) : Bool      := isInf s.a_reg
def b_is_inf (s : RtlState) : Bool      := isInf s.b_reg
def a_is_nan (s : RtlState) : Bool      := isSNaN s.a_reg || isQNaN s.a_reg

def b_is_nan (s : RtlState) : Bool      := isSNaN s.b_reg || isQNaN s.b_reg
def a_is_snan (s : RtlState) : Bool     := isSNaN s.a_reg
def b_is_snan (s : RtlState) : Bool     := isSNaN s.b_reg

@[simp]
theorem a_is_nan_of_snan (s : RtlState) (h : isSNaN s.a_reg) : a_is_nan s = true := by
  unfold a_is_nan; simp [h]

@[simp]
theorem b_is_nan_of_snan (s : RtlState) (h : isSNaN s.b_reg) : b_is_nan s = true := by
  unfold b_is_nan; simp [h]

def sign_result (s : RtlState) : Bool := rtlSign s.a_reg != rtlSign s.b_reg

-- -----------------------------------------------------------------------
-- 特殊情形检测（RTL § Special Case Handling — priority encoded）
-- -----------------------------------------------------------------------
def any_nan (s : RtlState) : Bool := a_is_nan s || b_is_nan s
def case_nan (s : RtlState) : Bool := any_nan s
def case_inf_inf (s : RtlState) : Bool := a_is_inf s && b_is_inf s
def case_zero_zero (s : RtlState) : Bool := a_is_zero s && b_is_zero s
def case_nonzero_div_zero (s : RtlState) : Bool := !a_is_zero s && b_is_zero s
def case_zero_div_nonzero (s : RtlState) : Bool := a_is_zero s && !b_is_zero s

-- 特殊情形优先级编码
inductive SpecialCase : Type where
  | none
  | nan
  | inf_inf
  | zero_zero
  | nonzero_div_zero
  | zero_div_nonzero
  | a_inf
  | b_inf
deriving Repr, DecidableEq

def special_sel (s : RtlState) : SpecialCase :=
  if case_nan s then               .nan
  else if case_inf_inf s then      .inf_inf
  else if case_zero_zero s then    .zero_zero
  else if a_is_inf s then          .a_inf
  else if b_is_inf s then          .b_inf
  else if case_nonzero_div_zero s then .nonzero_div_zero
  else if case_zero_div_nonzero s then .zero_div_nonzero
  else                             .none

def is_special (s : RtlState) : Bool :=
  match special_sel s with
  | .none => false
  | _ => true

-- 编码辅助常量（使用 FdivSpec.defaultQNaN，避免与 proof 中的私有 qnan_code 冲突）

def inf_with_sign (s : RtlState) : BitVec 32 :=
  let sBit : BitVec 1 := if sign_result s then 1#1 else 0#1
  sBit ++ 0xFF#8 ++ 0#23

def zero_with_sign (s : RtlState) : BitVec 32 :=
  let sBit : BitVec 1 := if sign_result s then 1#1 else 0#1
  sBit ++ 0#8 ++ 0#23

-- 特殊结果计算（RTL § special_result_reg case）
def special_result (s : RtlState) : BitVec 32 :=
  match special_sel s with
  | .nan =>
    if a_is_nan s then
      let sBit : BitVec 1 := if rtlSign s.a_reg then 1#1 else 0#1
      sBit ++ 0xFF#8 ++ (1#1 ++ BitVec.extractLsb 21 0 (rtlFrac s.a_reg))
    else
      let sBit : BitVec 1 := if rtlSign s.b_reg then 1#1 else 0#1
      sBit ++ 0xFF#8 ++ (1#1 ++ BitVec.extractLsb 21 0 (rtlFrac s.b_reg))
  | .inf_inf  => specDefaultQNaN
  | .zero_zero => specDefaultQNaN
  | .nonzero_div_zero => inf_with_sign s
  | .zero_div_nonzero => zero_with_sign s
  | .a_inf    => inf_with_sign s
  | .b_inf    => zero_with_sign s
  | .none     => 0#32

-- 特殊情形标志
def special_invalid (s : RtlState) : Bool :=
  match special_sel s with
  | .nan    => a_is_snan s || b_is_snan s
  | .inf_inf  => true
  | .zero_zero => true
  | _       => false

def special_div_by_zero (s : RtlState) : Bool :=
  match special_sel s with
  | .nonzero_div_zero => true
  | _ => false

-- ===========================================================================
-- 第 3 节 — 正常数除法组合逻辑
-- ===========================================================================

-- -----------------------------------------------------------------------
-- 3a. 符号（RTL § Sign Logic）
-- -----------------------------------------------------------------------
def calc_sign (s : RtlState) : Bool := rtlSign s.a_reg != rtlSign s.b_reg

-- -----------------------------------------------------------------------
-- 3b. Subnormal normalization and signed exponent datapath
-- -----------------------------------------------------------------------

-- Number of left shifts required to move a nonzero 23-bit subnormal
-- fraction's leading one to the normal hidden-bit position (bit 23).
def normalizeShift23 (frac : BitVec 23) : Nat :=
  if frac == 0#23 then 0 else 23 - Nat.log2 frac.toNat

def norm_shift_a (s : RtlState) : Nat :=
  if a_is_subnormal s then normalizeShift23 (rtlFrac s.a_reg) else 0

def norm_shift_b (s : RtlState) : Nat :=
  if b_is_subnormal s then normalizeShift23 (rtlFrac s.b_reg) else 0

def exp_a_adj (s : RtlState) : Int :=
  if a_is_subnormal s then 1 - (norm_shift_a s : Int)
  else ((rtlExp s.a_reg).toNat : Int)

def exp_b_adj (s : RtlState) : Int :=
  if b_is_subnormal s then 1 - (norm_shift_b s : Int)
  else ((rtlExp s.b_reg).toNat : Int)

def result_exp_raw (s : RtlState) : Int :=
  exp_a_adj s - exp_b_adj s + 127

-- -----------------------------------------------------------------------
-- 3c. 尾数准备（RTL § Mantissa Preparation）
-- -----------------------------------------------------------------------
-- Both normal and subnormal inputs enter the divider with the leading one at
-- bit 23, so their ratio is always in [0.5, 2).
def mant_a_val (s : RtlState) : BitVec 26 :=
  if a_is_subnormal s then
    (0#3 ++ rtlFrac s.a_reg) <<< norm_shift_a s
  else
    0#1 ++ 1#2 ++ rtlFrac s.a_reg

def mant_b_val (s : RtlState) : BitVec 26 :=
  if b_is_subnormal s then
    (0#3 ++ rtlFrac s.b_reg) <<< norm_shift_b s
  else
    0#1 ++ 1#2 ++ rtlFrac s.b_reg

-- -----------------------------------------------------------------------
-- 3d. 28-stage Restoring Array Divider（RTL § 28-Stage Restoring Array Divider）
--      使用 List.foldl（P-now-7 避免 plain recursion）
-- -----------------------------------------------------------------------

-- 单级函数（阶段 1–27，带左移）
def dividerStep (state : BitVec 29 × BitVec 28) (divisor : BitVec 29) : BitVec 29 × BitVec 28 :=
  let (rem, qbits) := state
  -- 左移 1 位（丢弃 bit 28，末位补 0）
  let shifted : BitVec 29 := (BitVec.extractLsb 27 0 rem) ++ 0#1
  let qBit : Bool := shifted ≥ divisor
  let nextRem : BitVec 29 := if qBit then shifted - divisor else shifted
  let nextQbits : BitVec 28 := (qbits <<< 1) ||| (if qBit then 1#28 else 0#28)
  (nextRem, nextQbits)

-- 完整 28-stage 除法器
-- 返回 (qbits_final, rem_final_no_restore)
--   qbits_final[27] = q_0 (整数位), [26] = q_1 (2^-1), …, [0] = q_27 (2^-27)
--   rem_final_no_restore = rem_28（含可能负值的 MSB）
def runDivider (mv_a mv_b : BitVec 26) : BitVec 28 × BitVec 29 :=
  let divisor29 : BitVec 29 := 0#3 ++ mv_b
  -- Stage 0（无左移，提取整数位 q_0）
  let q_int : Bool := mv_a ≥ mv_b
  let rem0 : BitVec 29 := 0#3 ++ mv_a
  let rem1 : BitVec 29 := if q_int then rem0 - divisor29 else rem0
  let initQbits : BitVec 28 := if q_int then 1#28 else 0#28
  -- Stages 1–27（List.foldl 迭代 27 次）
  let (remFinal, qbitsFinal) :=
    (List.range 27).foldl (fun (st : BitVec 29 × BitVec 28) (_ : Nat) =>
      dividerStep st divisor29) (rem1, initQbits)
  (qbitsFinal, remFinal)

-- 最终余数恢复（restoration）及 sticky bit
def finalRemWithSticky (remRaw divisor : BitVec 29) : Bool :=
  let remRestored : BitVec 29 := if remRaw.getLsbD 28 then remRaw + divisor else remRaw
  let low28zero : Bool := (BitVec.extractLsb 27 0 remRestored) == 0#28
  !low28zero

-- -----------------------------------------------------------------------
-- 3e. 商归一化（RTL § Post-Divider Normalization）
-- -----------------------------------------------------------------------

-- GRS 提取与归一化移位选择
structure NormResult where
  mant : BitVec 23       -- 归一化后 23-bit 尾数
  G : Bool               -- Guard bit
  R : Bool               -- Round bit
  S : Bool               -- Sticky bit (= S_q | sticky_rem)
  shift_needed : Bool    -- 是否需要左移 1（对应 exp_adj）
  adj_for_shift : BitVec 9  -- 指数调整量
deriving Repr

def extractNorm (qbits : BitVec 28) (stickyRem : Bool) (mv_a mv_b : BitVec 26) : NormResult :=
  let shift_needed : Bool := !(mv_a ≥ mv_b)
  -- mantissa field
  let mant_noshift : BitVec 23 := BitVec.extractLsb 26 4 qbits  -- q_bits[26:4]
  let mant_shifted : BitVec 23 := BitVec.extractLsb 25 3 qbits  -- quotient q_2..q_24
  let mant : BitVec 23 := if shift_needed then mant_shifted else mant_noshift
  -- GRS for no-shift case: G=q[3], R=q[2], S_q=|q[1:0]|
  let G_noshift : Bool := qbits.getLsbD 3
  let R_noshift : Bool := qbits.getLsbD 2
  let S_q_noshift : Bool := (BitVec.extractLsb 1 0 qbits) != 0#2
  -- GRS for shift case after quotient × 2: G=q_25, R=q_26, S=q_27|remainder
  let G_shifted : Bool := qbits.getLsbD 2
  let R_shifted : Bool := qbits.getLsbD 1
  let S_q_shifted : Bool := qbits.getLsbD 0
  -- select
  let G : Bool := if shift_needed then G_shifted else G_noshift
  let R : Bool := if shift_needed then R_shifted else R_noshift
  let S_q : Bool := if shift_needed then S_q_shifted else S_q_noshift
  let S : Bool := S_q || stickyRem
  let adj_for_shift : BitVec 9 := if shift_needed then 1#9 else 0#9
  { mant, G, R, S, shift_needed, adj_for_shift }

-- -----------------------------------------------------------------------
-- 3f. RNE 舍入（RTL § RNE Rounding）
-- -----------------------------------------------------------------------

-- 返回 (final_mantissa, round_carry)
structure RoundResult where
  mant : BitVec 23
  carry : Bool
deriving Repr

def rneRound (mant23 : BitVec 23) (G R S : Bool) : RoundResult :=
  let L : Bool := mant23.getLsbD 0   -- LSB of 23-bit mantissa
  let doRound : Bool := G && (R || S || L)
  -- 25-bit: {0, 1, mant23} + round_increment
  let mantWithImplied : BitVec 25 := 0#1 ++ 1#1 ++ mant23
  let incVec : BitVec 25 := 0#24 ++ (if doRound then 1#1 else 0#1)
  let mantRounded : BitVec 25 := mantWithImplied + incVec
  let carry : Bool := mantRounded.getLsbD 24
  let finalMant : BitVec 23 :=
    if carry then
      BitVec.extractLsb 23 1 mantRounded   -- mant_rounded[23:1]
    else
      BitVec.extractLsb 22 0 mantRounded   -- mant_rounded[22:0]
  { mant := finalMant, carry := carry }

-- -----------------------------------------------------------------------
-- 3g. 正常数除法完整通路
-- -----------------------------------------------------------------------

-- 返回 (result, overflow, underflow, inexact)
def normalFdiv (s : RtlState) : BitVec 32 × Bool × Bool × Bool :=
  let cs := calc_sign s
  -- 指数
  let raw_exp := result_exp_raw s
  -- 尾数
  let mv_a := mant_a_val s
  let mv_b := mant_b_val s
  -- 执行 28-stage 除法
  let (qbits, remRaw) := runDivider mv_a mv_b
  let divisor29 : BitVec 29 := 0#3 ++ mv_b
  let stickyRem : Bool := finalRemWithSticky remRaw divisor29
  -- 归一化
  let norm := extractNorm qbits stickyRem mv_a mv_b
  -- 指数调整
  let result_exp_pre : Int :=
    raw_exp - (norm.adj_for_shift.toNat : Int)
  -- RNE 舍入
  let roundRes := rneRound norm.mant norm.G norm.R norm.S
  -- 舍入后指数
  let final_exp : Int :=
    result_exp_pre + (if roundRes.carry then 1 else 0)
  -- 溢出/下溢检测
  let exp_overflow : Bool := final_exp > 254
  let exp_underflow : Bool := final_exp < 1
  -- 最终结果拼装
  let calc_exp_final : BitVec 8 :=
    if exp_overflow then 0xFF#8
    else if exp_underflow then 0#8
    else BitVec.ofNat 8 final_exp.toNat
  let calc_mant_final : BitVec 23 :=
    if exp_overflow || exp_underflow then 0#23
    else roundRes.mant
  let calc_result : BitVec 32 :=
    let sBit : BitVec 1 := if cs then 1#1 else 0#1
    sBit ++ calc_exp_final ++ calc_mant_final
  -- 标志
  let calc_overflow : Bool := exp_overflow
  let calc_underflow : Bool := exp_underflow
  let calc_inexact : Bool :=
    (norm.G || norm.R || norm.S) || exp_overflow
  (calc_result, calc_overflow, calc_underflow, calc_inexact)

-- ===========================================================================
-- 第 4 节 — 输出多路选择（RTL § Output MUX）
-- ===========================================================================

-- 完整组合逻辑：回归一函数，输入 s（a_reg, b_reg 等），输出 wire 值
-- 返回 (result, overflow, underflow, division_by_zero, invalid, inexact)
def combinationalLogic (s : RtlState) : BitVec 32 × Bool × Bool × Bool × Bool × Bool :=
  let isSpec := is_special s
  if isSpec then
    -- 特殊情形输出
    ( special_result s,
      false,                              -- overflow
      false,                              -- underflow
      special_div_by_zero s,              -- division_by_zero
      special_invalid s,                  -- invalid
      false                               -- inexact
    )
  else
    -- 正常计算
    let (res, ovf, unf, inex) := normalFdiv s
    (res, ovf, unf, false, false, inex)

-- ===========================================================================
-- 第 5 节 — 状态机（RTL 时序等价）
-- ===========================================================================

-- 下一时钟沿状态
--
-- 时序（RTL § Input Registers / Output Registers）：
--   在 posedge clk 时刻：
--     a_reg <= start ? a : a_reg   (仅 start=1 时采样输入)
--     b_reg <= start ? b : b_reg
--     start_reg <= start
--     result  <= result_comb (来自 current State 的组合逻辑)
--     valid   <= start_reg   (来自 current State)
--     ...（其余输出标志一样来自 current State 的组合逻辑）
--
-- 因此 nextRtlState(s, a, b, start) 表示 posedge 后的新状态。
def nextRtlState (s : RtlState) (a b : BitVec 32) (start : Bool) : RtlState :=
  -- 输入寄存器更新（在 posedge 采样）
  let a_reg' : BitVec 32 := if start then a else s.a_reg
  let b_reg' : BitVec 32 := if start then b else s.b_reg
  let start_reg' : Bool := start
  -- 当前 state 的组合逻辑结果→被输出寄存器在 posedge 捕获
  let (result_comb, overflow_comb, underflow_comb,
       div_by_zero_comb, invalid_comb, inexact_comb) :=
    combinationalLogic s
  -- 输出寄存器更新
  { a_reg      := a_reg'
    b_reg      := b_reg'
    start_reg  := start_reg'
    result     := result_comb
    valid      := s.start_reg       -- valid ≤ start_reg (当前 state 的值)
    overflow   := overflow_comb
    underflow  := underflow_comb
    div_by_zero := div_by_zero_comb
    invalid    := invalid_comb
    inexact    := inexact_comb
  }

-- ===========================================================================
-- 第 6 节 — 便捷访问函数
-- ===========================================================================

def modelResult       (s : RtlState) : BitVec 32 := s.result
def modelValid        (s : RtlState) : Bool    := s.valid
def modelOverflow     (s : RtlState) : Bool    := s.overflow
def modelUnderflow    (s : RtlState) : Bool    := s.underflow
def modelDivByZero    (s : RtlState) : Bool    := s.div_by_zero
def modelInvalid      (s : RtlState) : Bool    := s.invalid
def modelInexact      (s : RtlState) : Bool    := s.inexact

end FdivModel
