/** Context owned by the domain-neutral training loop for one Epoch. */
export interface TrainingEpochContext<State> {
  epoch: number
  state: State
  rolloutIds: readonly string[]
  signal: AbortSignal
}

/** One forward result paired with its independently computed evaluation. */
export interface EvaluatedRollout<Candidate, Evaluation> {
  rolloutId: string
  candidate: Candidate
  evaluation: Evaluation
}

export type TrainingLoopControl<Result> =
  | { kind: 'continue' }
  | { kind: 'complete'; result: Result }

export interface TrainingRuntimeHooks<State, Candidate, Evaluation, Decision, Result> {
  /** Domain budgets and preconditions may terminate before an Epoch starts. */
  beforeEpoch?(context: TrainingEpochContext<State>): Promise<TrainingLoopControl<Result>>
  /** Produce one candidate from the current state. */
  rollout(context: TrainingEpochContext<State>, rolloutId: string): Promise<Candidate>
  /** Compute replaceable external feedback for an immutable candidate. */
  evaluate(
    context: TrainingEpochContext<State>,
    rolloutId: string,
    candidate: Candidate,
  ): Promise<Evaluation>
  /** Domain acceptance may terminate after all candidates have feedback. */
  afterEvaluation?(
    context: TrainingEpochContext<State>,
    group: readonly EvaluatedRollout<Candidate, Evaluation>[],
  ): Promise<TrainingLoopControl<Result>>
  /** Estimate a semantic update from the evaluated rollout group. */
  optimize(
    context: TrainingEpochContext<State>,
    group: readonly EvaluatedRollout<Candidate, Evaluation>[],
  ): Promise<Decision>
  /** Atomically apply the decision and return the state for the next Epoch. */
  apply(
    context: TrainingEpochContext<State>,
    group: readonly EvaluatedRollout<Candidate, Evaluation>[],
    decision: Decision,
  ): Promise<State>
  /** Release domain resources whether an Epoch succeeds, fails, or terminates. */
  finishEpoch?(
    context: TrainingEpochContext<State>,
    candidates: readonly Candidate[],
    group: readonly EvaluatedRollout<Candidate, Evaluation>[],
  ): Promise<void>
}

export interface TrainingRuntimeOptions<State, Candidate, Evaluation, Decision, Result> {
  initialState: State
  rolloutIds: readonly string[]
  maxParallel: number
  signal: AbortSignal
  hooks: TrainingRuntimeHooks<State, Candidate, Evaluation, Decision, Result>
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
  output: R[],
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      const value = values[index]
      if (value !== undefined) output[index] = await operation(value, index)
    }
  })
  const settled = await Promise.allSettled(workers)
  const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed !== undefined) throw failed.reason
}

/**
 * Execute a policy-free Agent training loop. Domain plugins own candidate,
 * evaluation, optimizer, acceptance, and persistence semantics.
 */
export async function runTrainingLoop<State, Candidate, Evaluation, Decision, Result>(
  options: TrainingRuntimeOptions<State, Candidate, Evaluation, Decision, Result>,
): Promise<Result> {
  if (options.rolloutIds.length === 0) throw new Error('training runtime requires at least one rollout')
  if (new Set(options.rolloutIds).size !== options.rolloutIds.length) {
    throw new Error('training runtime rollout ids must be unique')
  }
  if (!Number.isInteger(options.maxParallel) || options.maxParallel < 1) {
    throw new Error('training runtime maxParallel must be a positive integer')
  }

  let state = options.initialState
  let epoch = 0
  while (true) {
    options.signal.throwIfAborted()
    epoch += 1
    const context: TrainingEpochContext<State> = {
      epoch,
      state,
      rolloutIds: options.rolloutIds,
      signal: options.signal,
    }
    const before = await options.hooks.beforeEpoch?.(context)
    if (before?.kind === 'complete') return before.result

    const candidates: Candidate[] = []
    const group: EvaluatedRollout<Candidate, Evaluation>[] = []
    try {
      await mapLimit(
        options.rolloutIds,
        options.maxParallel,
        rolloutId => options.hooks.rollout(context, rolloutId),
        candidates,
      )
      await mapLimit(
        options.rolloutIds,
        options.maxParallel,
        async (rolloutId, index) => {
          const candidate = candidates[index]
          if (candidate === undefined) throw new Error(`missing rollout candidate: ${rolloutId}`)
          return {
            rolloutId,
            candidate,
            evaluation: await options.hooks.evaluate(context, rolloutId, candidate),
          }
        },
        group,
      )
      const after = await options.hooks.afterEvaluation?.(context, group)
      if (after?.kind === 'complete') return after.result
      const decision = await options.hooks.optimize(context, group)
      state = await options.hooks.apply(context, group, decision)
    } finally {
      await options.hooks.finishEpoch?.(
        context,
        candidates.filter((candidate): candidate is Candidate => candidate !== undefined),
        group.filter((item): item is EvaluatedRollout<Candidate, Evaluation> => item !== undefined),
      )
    }
  }
}
