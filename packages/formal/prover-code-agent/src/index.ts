import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  createTextParameterState,
  requireTextParameter,
  type TextParameterState,
} from '@tokens-as-parameters/core-optimization'
import { sessionSteps } from '@tokens-as-parameters/core-telemetry'
import type {
  ProofAgentFeedbackSelection,
  ProofAgentInstallOptions,
  ProofAgentProvider,
} from '@tokens-as-parameters/proof-agent'
import type { CaseManifest } from '@tokens-as-parameters/proof-contracts'

export const name = 'prover-code-agent'
export const inject = ['proofAgents']
export const FORMAL_CODE_AGENT_ID = 'formal-code-agent'
export const FORMAL_PROVER_MODULE_ID = 'formal-prover'
export const FORMAL_PROVER_MEMORY_PARAMETER_ID = 'task.memory'
export const FORMAL_PROVER_PLAN_PARAMETER_ID = 'task.plan'

const STRING_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

export function formalProverRouteParameterId(rolloutId: string): string {
  const normalized = rolloutId.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new Error(`invalid formal prover rollout id: ${rolloutId}`)
  }
  return `lane.${normalized}.route`
}

export function createFormalProverParameterState(
  version: string,
  rolloutIds: readonly string[],
  selection: ProofAgentFeedbackSelection = {},
): TextParameterState {
  return createTextParameterState({
    moduleId: FORMAL_PROVER_MODULE_ID,
    version,
    parameters: [
      {
        definition: {
          id: FORMAL_PROVER_MEMORY_PARAMETER_ID,
          scope: 'run',
          description: 'Concise verifier-backed facts, reusable proof discoveries, and failed assumptions shared by all formal-prover lanes in the next epoch.',
        },
        content: 'No shared verifier-backed task memory has been learned yet.',
        requiresFeedback: selection.memory ?? true,
      },
      {
        definition: {
          id: FORMAL_PROVER_PLAN_PARAMETER_ID,
          scope: 'run',
          description: 'Shared proof-search policy for the next epoch. It guides prioritization and proof engineering but never changes the locked theorem or trust policy.',
        },
        content: 'Use Lean feedback, preserve locked inputs, and prefer small reusable lemmas that improve the checker-visible proof state.',
        requiresFeedback: selection.plan ?? true,
      },
      ...rolloutIds.map(rolloutId => ({
        definition: {
          id: formalProverRouteParameterId(rolloutId),
          scope: 'lane' as const,
          description: `Independent search assignment for formal-prover lane ${rolloutId}. It should preserve useful diversity while targeting checker-visible progress.`,
        },
        content: 'Explore independently from the selected verified or exploratory Git state.',
        requiresFeedback: selection.routes ?? true,
      })),
    ],
  })
}

function restrictProverTools(agentCtx: Context, agent: Agent): string[] {
  const requested = ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'skill', 'get_goal']
  const allowed = requested.filter(tool => agentCtx.tools.get(tool, agent) !== undefined)
  const missing = ['bash', 'read', 'write', 'edit'].filter(tool => !allowed.includes(tool))
  if (missing.length > 0) {
    throw new Error(`formal prover requires official Code Agent tools: ${missing.join(', ')}`)
  }
  agentCtx.tools.restrict({ allow: allowed })
  return allowed
}

export function shouldEnterProverSubmitOnly(currentSteps: number, maxSteps: number): boolean {
  return currentSteps >= maxSteps
}

export class FormalCodeAgentProver implements ProofAgentProvider {
  readonly id = FORMAL_CODE_AGENT_ID

  createParameterState(
    version: string,
    rolloutIds: readonly string[],
    selection: ProofAgentFeedbackSelection,
  ): TextParameterState {
    return createFormalProverParameterState(version, rolloutIds, selection)
  }

  parameterIdsForRollout(rolloutId: string): string[] {
    return [
      FORMAL_PROVER_MEMORY_PARAMETER_ID,
      FORMAL_PROVER_PLAN_PARAMETER_ID,
      formalProverRouteParameterId(rolloutId),
    ]
  }

  route(parameters: TextParameterState, rolloutId: string): string {
    return requireTextParameter(parameters, formalProverRouteParameterId(rolloutId)).content
  }

  task(manifest: CaseManifest, _rolloutId: string, optimizerTask?: string): string {
    return [
      `Prove the locked formal claim ${manifest.lean.theoremName} in ${manifest.lean.proofFile}.`,
      `The claim scope is ${manifest.claimScope}.`,
      `Open obligations: ${manifest.lean.obligations.join(', ')}. Use lean_check_candidate to measure actual status.`,
      'Work directly in the isolated Git worktree. Locked inputs and theorem signatures are immutable; proof-side files may be created or refactored.',
      ...(optimizerTask === undefined ? [] : [`Optimizer assignment for this rollout: ${optimizerTask}`]),
    ].join('\n')
  }

  install(agentCtx: Context, options: ProofAgentInstallOptions): void {
    const manifest = options.resolvedCase.manifest
    const [memoryId, planId, routeId] = this.parameterIdsForRollout(options.rolloutId)
    const memory = requireTextParameter(options.parameters, memoryId ?? '')
    const plan = requireTextParameter(options.parameters, planId ?? '')
    const route = requireTextParameter(options.parameters, routeId ?? '')
    agentCtx.systemPrompt.section({
      name: 'tokens-as-parameters:prover',
      order: 90,
      text: [
        'You are one independent formal-proof search trajectory running on the official DSH Code Agent.',
        `Suggested starting proof surface: ${manifest.editableFiles.join(', ')}. You may create or refactor proof-side source files when useful.`,
        `Never modify locked inputs: ${manifest.lockedInputs.map(item => item.path).join(', ')}. Never weaken the target theorem signature or checker.`,
        'Use Lean feedback as evidence. Intermediate sorry declarations may remain only for obligations not yet closed; never add admit, axioms, unsafe declarations, theorem shadowing, or domain restrictions.',
        'Call record_insight for a material hypothesis, failure explanation, or reusable proof fact. Runtime commits the whole source state with the insight.',
        'Call submit_proof_candidate when ready. At the model-step boundary, only that tool remains.',
        'A candidate is trusted only after the configured Loss plugin evaluates deterministic and white-box evidence.',
      ].join('\n'),
    })
    agentCtx.systemPrompt.section({ name: `tokens-as-parameters:${memory.id}`, order: 91, text: `Shared verifier-backed task memory:\n${memory.content}` })
    agentCtx.systemPrompt.section({ name: `tokens-as-parameters:${plan.id}`, order: 92, text: `Shared proof-search plan:\n${plan.content}` })
    agentCtx.systemPrompt.section({ name: `tokens-as-parameters:${route.id}`, order: 93, text: `This lane's independent search assignment:\n${route.content}` })

    let submitOnly = false
    const searchToolDisposers: Array<() => void> = []
    searchToolDisposers.push(agentCtx.tools.register(defineTool({
      name: 'record_insight',
      description: 'Commit the whole current proof-source state together with one concise evidence-backed insight.',
      parameters: {
        summary: { type: 'string', required: true, description: 'Short commit-style summary.' },
        insight: { type: 'string', required: true, description: 'Evidence, hypothesis, failed route, or next implication.' },
      },
      output: STRING_OUTPUT,
      async execute(args, exec) {
        return JSON.stringify(await options.git.recordInsight(
          options.worktree,
          options.runId,
          options.epoch,
          options.rolloutId,
          args.summary,
          args.insight,
          AbortSignal.any([options.signal, exec.signal]),
        ))
      },
    })))
    searchToolDisposers.push(agentCtx.tools.register(defineTool({
      name: 'lean_check_candidate',
      description: 'Run the independent Lean build, locked-input, theorem-signature, hygiene, obligation, and axiom checks on the current worktree.',
      parameters: {},
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        return JSON.stringify(await options.verifier.check(
          options.resolvedCase,
          options.worktree,
          options.baselineClosed,
          AbortSignal.any([options.signal, exec.signal]),
          options.baseCommit,
        ))
      },
    })))
    agentCtx.tools.register(defineTool({
      name: 'submit_proof_candidate',
      description: 'Stop this proof-search turn and hand the whole current source state to the configured Loss plugin.',
      parameters: {},
      output: STRING_OUTPUT,
      async execute(_args, exec) {
        exec.concludeTurn()
        return JSON.stringify({ submitted: true })
      },
    }))
    const inheritedProofTools = restrictProverTools(agentCtx, options.agent)
    agentCtx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || submitOnly || !shouldEnterProverSubmitOnly(sessionSteps(agent.session.events), options.maxSteps)) {
        return decision
      }
      submitOnly = true
      searchToolDisposers.splice(0).forEach(dispose => dispose())
      agentCtx.tools.restrict({ deny: inheritedProofTools })
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          createUserMessage({
            source: { kind: 'user' },
            content: [{
              type: 'text',
              text: `This rollout reached its ${options.maxSteps}-step search boundary. Only submit_proof_candidate remains available. Submit the current source state now; do not attempt unavailable tools.`,
            }],
          }),
        ],
      }
    })
  }
}

export function apply(ctx: Context): () => void {
  return ctx.proofAgents.register(new FormalCodeAgentProver())
}
