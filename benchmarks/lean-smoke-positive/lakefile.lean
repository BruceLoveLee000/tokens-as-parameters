import Lake
open Lake DSL

package «lean-smoke-positive» where

@[default_target]
lean_lib Smoke where
  roots := #[
    `Smoke,
    `inputs.SmokeModel,
    `inputs.SmokeSpec,
    `verifier.SmokeProof
  ]
