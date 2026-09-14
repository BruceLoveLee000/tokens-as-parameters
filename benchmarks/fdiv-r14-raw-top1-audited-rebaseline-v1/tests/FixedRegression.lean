import FdivProof

open FdivSpec
open FdivModel

private abbrev b32 (n : Nat) : BitVec 32 := BitVec.ofNat 32 n

private def runModel (a b : BitVec 32) :
    BitVec 32 × Bool × Bool × Bool × Bool × Bool :=
  combinationalLogic
    (RtlState.mk a b false 0#32 false false false false false false)

example : runModel (b32 0x3F800000) (b32 0x40400000) =
    (b32 0x3EAAAAAB, false, false, false, false, true) := by native_decide
example : fdiv (b32 0x3F800000) (b32 0x40400000) =
    (b32 0x3EAAAAAB, false, false, false, false, true) := by native_decide

example : runModel (b32 0x3F800000) (b32 0x40A00000) =
    (b32 0x3E4CCCCD, false, false, false, false, true) := by native_decide
example : fdiv (b32 0x3F800000) (b32 0x40A00000) =
    (b32 0x3E4CCCCD, false, false, false, false, true) := by native_decide

example : runModel (b32 0x00000001) (b32 0x00400000) =
    (b32 0x34800000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x00000001) (b32 0x00400000) =
    (b32 0x34800000, false, false, false, false, false) := by native_decide

example : runModel (b32 0x00400000) (b32 0x00000001) =
    (b32 0x4A800000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x00400000) (b32 0x00000001) =
    (b32 0x4A800000, false, false, false, false, false) := by native_decide

example : runModel (b32 0x007FFFFF) (b32 0x00000001) =
    (b32 0x4AFFFFFE, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x007FFFFF) (b32 0x00000001) =
    (b32 0x4AFFFFFE, false, false, false, false, false) := by native_decide

example : runModel (b32 0x00800000) (b32 0x007FFFFF) =
    (b32 0x3F800001, false, false, false, false, true) := by native_decide
example : fdiv (b32 0x00800000) (b32 0x007FFFFF) =
    (b32 0x3F800001, false, false, false, false, true) := by native_decide

example : runModel (b32 0x007FFFFF) (b32 0x00800000) =
    (b32 0x3F7FFFFE, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x007FFFFF) (b32 0x00800000) =
    (b32 0x3F7FFFFE, false, false, false, false, false) := by native_decide

example : runModel (b32 0x0008F4D8) (b32 0xB7897257) =
    (b32 0x86857420, false, false, false, false, true) := by native_decide
example : fdiv (b32 0x0008F4D8) (b32 0xB7897257) =
    (b32 0x86857420, false, false, false, false, true) := by native_decide

example : runModel (b32 0x7F800000) (b32 0x00000000) =
    (b32 0x7F800000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x7F800000) (b32 0x00000000) =
    (b32 0x7F800000, false, false, false, false, false) := by native_decide
example : runModel (b32 0x7FC12345) (b32 0x3F800000) =
    (b32 0x7FC12345, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x7FC12345) (b32 0x3F800000) =
    (b32 0x7FC12345, false, false, false, false, false) := by native_decide
example : runModel (b32 0x7F812345) (b32 0x3F800000) =
    (b32 0x7FC12345, false, false, false, true, false) := by native_decide
example : fdiv (b32 0x7F812345) (b32 0x3F800000) =
    (b32 0x7FC12345, false, false, false, true, false) := by native_decide

private def lcg32 (value : Nat) : Nat :=
  (1664525 * value + 1013904223) % (2^32)

private def generatedModelSpecAgree : Nat → Nat → Bool
  | 0, _ => true
  | count + 1, seed =>
      let a := lcg32 seed
      let b := lcg32 a
      (runModel (b32 a) (b32 b) == fdiv (b32 a) (b32 b)) &&
        generatedModelSpecAgree count b

private def flagStatementsHold (a b : BitVec 32) : Bool :=
  let rtl := runModel a b
  let nanA := isSNaN a || isQNaN a
  let nanB := isSNaN b || isQNaN b
  let arithmetic :=
    !nanA && !nanB && !isInf a && !isInf b && !isZero a && !isZero b
  let invalidExpected :=
    isSNaN a || isSNaN b || (isInf a && isInf b) || (isZero a && isZero b)
  let divZeroExpected :=
    !nanA && !nanB && !isInf a && isZero b && !isZero a
  let overflowExpected := arithmetic && decide (resultExp a b > 254)
  let underflowExpected := arithmetic && decide (resultExp a b < 1)
  let division := mantissaDiv
    (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
  let grsExpected := arithmetic && (division.2.1 || division.2.2.1 || division.2.2.2.1)
  let inexactExpected :=
    rtl.2.1 ||
      (rtl.2.2.1 && grsExpected) || grsExpected
  (rtl.2.2.2.2.1 == invalidExpected) &&
    (rtl.2.2.2.1 == divZeroExpected) &&
    (rtl.2.1 == overflowExpected) &&
    (rtl.2.2.1 == underflowExpected) &&
    (rtl.2.2.2.2.2 == inexactExpected)

private def generatedFlagStatementsHold : Nat → Nat → Bool
  | 0, _ => true
  | count + 1, seed =>
      let a := lcg32 seed
      let b := lcg32 a
      flagStatementsHold (b32 a) (b32 b) && generatedFlagStatementsHold count b

-- Deterministic executable sweep over all six output fields. The explicit
-- regressions above carry the subnormal bias; this sweep broadens coverage.
example : generatedModelSpecAgree 512 0xA228FD1 = true := by native_decide
example : generatedFlagStatementsHold 512 0xA228FD1 = true := by native_decide

example : flagStatementsHold (b32 0x7FC12345) (b32 0x3F800000) = true := by native_decide
example : flagStatementsHold (b32 0x7F812345) (b32 0x3F800000) = true := by native_decide
example : flagStatementsHold (b32 0x7F800000) (b32 0x00000000) = true := by native_decide
example : flagStatementsHold (b32 0x00000000) (b32 0x00000000) = true := by native_decide
example : flagStatementsHold (b32 0x7F7FFFFF) (b32 0x00000001) = true := by native_decide
example : flagStatementsHold (b32 0x00000001) (b32 0x7F7FFFFF) = true := by native_decide
