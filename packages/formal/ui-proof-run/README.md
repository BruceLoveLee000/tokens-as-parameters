# Proof Run UI

DSH Web view for the formal Proof Runtime. It consumes the owner session's `proofRuns` projection and renders the controller-owned state machine, trusted obligation progress, live total and per-session token use, run history, and direct links to Prover, Reflector, and Reviewer sessions.

The Stop button executes `/proof-stop <run-id>` through DSH Commands. It is a control-plane action and never invokes the main model.
