import FdivSpec
import FdivModel

set_option maxHeartbeats 400000

open FdivSpec
open FdivModel

def mkState (a b : BitVec 32) : RtlState :=
  RtlState.mk a b false 0#32 false false false false false false

def rtl_comb (a b : BitVec 32) : BitVec 32 × Bool × Bool × Bool × Bool × Bool :=
  combinationalLogic (mkState a b)

/--
The only public proof obligation in this benchmark. No decomposition,
proof API, proof view, bridge lemma, prior attempt, or route-specific helper
is supplied. The proving agent owns the proof architecture while the Model,
Spec, and top-level theorem remain locked.
-/
theorem rtlEquivSpec (a b : BitVec 32) : rtl_comb a b = fdiv a b := by
  sorry
