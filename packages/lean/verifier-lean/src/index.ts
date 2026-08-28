import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import {
  RUN_SCHEMA_VERSION,
  type ProofHygieneFinding,
  type ProofReceipt,
} from '@tokens-as-parameters/proof-contracts'
import {
  resolveInside,
  sha256,
  verifyLockedInputs,
  type ResolvedCase,
} from '@tokens-as-parameters/proof-contracts/case-manifest'
import { DshCommandRunner, type CommandRunner } from '@tokens-as-parameters/core-state-git'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { ProofVerifier } from '@tokens-as-parameters/proof-verification'

export const name = 'verifier-lean'
export const inject = ['proofVerification', 'subprocess']

const LEAN_DECLARATION_NAME = '[A-Za-z_][A-Za-z0-9_\'.]*'
const DECLARATION_PREFIX = '^\\s*(?:@\\[[^\\]\\n]*\\]\\s*)*(?:private\\s+)?'
const DECLARATION = new RegExp(`${DECLARATION_PREFIX}(?:theorem|lemma)\\s+(${LEAN_DECLARATION_NAME})\\b`, 'gm')
const ANY_TOP_LEVEL_DECLARATION = new RegExp(
  `${DECLARATION_PREFIX}(?:theorem|lemma|def|abbrev|structure|inductive|class|instance)\\s+${LEAN_DECLARATION_NAME}\\b`,
  'gm',
)

export interface DeclarationSource {
  name: string
  start: number
  end: number
  source: string
}

export function stripLeanComments(source: string): string {
  let output = ''
  let index = 0
  let blockDepth = 0
  let lineComment = false
  let inString = false
  let escaped = false
  while (index < source.length) {
    const current = source[index] ?? ''
    const next = source[index + 1] ?? ''
    if (lineComment) {
      if (current === '\n') {
        lineComment = false
        output += '\n'
      } else {
        output += ' '
      }
      index += 1
      continue
    }
    if (blockDepth > 0) {
      if (current === '/' && next === '*') {
        blockDepth += 1
        output += '  '
        index += 2
      } else if (current === '*' && next === '/') {
        blockDepth -= 1
        output += '  '
        index += 2
      } else {
        output += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (inString) {
      output += current
      if (escaped) escaped = false
      else if (current === '\\') escaped = true
      else if (current === '"') inString = false
      index += 1
      continue
    }
    if (current === '"') {
      inString = true
      output += current
      index += 1
    } else if (current === '-' && next === '-') {
      lineComment = true
      output += '  '
      index += 2
    } else if (current === '/' && next === '*') {
      blockDepth = 1
      output += '  '
      index += 2
    } else {
      output += current
      index += 1
    }
  }
  return output
}

export function declarationSources(source: string): Map<string, DeclarationSource> {
  const starts: Array<{ name: string; start: number }> = []
  for (const match of source.matchAll(DECLARATION)) {
    if (match.index !== undefined && match[1] !== undefined) starts.push({ name: match[1], start: match.index })
  }
  const allStarts = [...source.matchAll(ANY_TOP_LEVEL_DECLARATION)]
    .flatMap(match => match.index === undefined ? [] : [match.index])
    .sort((left, right) => left - right)
  const output = new Map<string, DeclarationSource>()
  for (const item of starts) {
    const end = allStarts.find(index => index > item.start) ?? source.length
    output.set(item.name, {
      name: item.name,
      start: item.start,
      end,
      source: source.slice(item.start, end).trimEnd(),
    })
  }
  return output
}

export function normalizedTheoremSignature(source: string, theoremName: string): string {
  const declaration = declarationSources(source).get(theoremName)
  if (declaration === undefined) return ''
  const clean = stripLeanComments(declaration.source)
  const assignment = clean.indexOf(':=')
  const byBody = clean.search(/\s:=?\s*by\b/)
  const boundary = assignment >= 0 ? assignment : byBody >= 0 ? byBody : clean.length
  return clean.slice(0, boundary).replace(/\s+/g, ' ').trim()
}

export function theoremSignatureSha256(source: string, theoremName: string): string {
  return sha256(normalizedTheoremSignature(source, theoremName))
}

export function obligationStatus(
  proofSource: string,
  obligations: readonly string[],
): { closed: string[]; open: string[] } {
  const declarations = declarationSources(proofSource)
  const closed: string[] = []
  const open: string[] = []
  for (const name of obligations) {
    const source = declarations.get(name)?.source
    if (source !== undefined && !/\bsorry\b/.test(stripLeanComments(source))) closed.push(name)
    else open.push(name)
  }
  return { closed, open }
}

export function proofHygiene(source: string, path: string): ProofHygieneFinding[] {
  const clean = stripLeanComments(source)
  const findings: ProofHygieneFinding[] = []
  if (/\badmit\b/.test(clean)) findings.push({ kind: 'admit', message: 'proof contains admit', path })
  if (/^\s*axiom\s+/m.test(clean)) findings.push({ kind: 'axiom', message: 'proof introduces a custom axiom', path })
  if (/^\s*unsafe\s+/m.test(clean)) findings.push({ kind: 'unsafe', message: 'proof introduces an unsafe declaration', path })
  return findings
}

export function parseAxiomAudit(output: string): string[] {
  const match = output.match(/depends on axioms:\s*\[([^\]]*)\]/s)
  if (match?.[1] === undefined) return []
  return match[1].split(',').map(value => value.trim()).filter(Boolean)
}

export function parseNamedAxiomAudits(output: string): Map<string, string[]> {
  const audits = new Map<string, string[]>()
  const pattern = /'([^']+)'\s+(does not depend on any axioms|depends on axioms:\s*\[([^\]]*)\])/g
  for (const match of output.matchAll(pattern)) {
    const name = match[1]
    if (name === undefined) continue
    const observed = match[3] === undefined
      ? []
      : match[3].split(',').map(value => value.trim()).filter(Boolean)
    audits.set(name, observed)
  }
  return audits
}

export class LeanVerifier implements ProofVerifier {
  readonly id = 'lean'

  constructor(private readonly runner: CommandRunner) {}

  consolidate(baseSource: string, candidateSource: string, acceptedUnits: readonly string[]): string {
    return transplantDeclarations(baseSource, candidateSource, acceptedUnits)
  }

  async check(
    resolvedCase: ResolvedCase,
    worktree: string,
    baselineClosed = 0,
    signal?: AbortSignal,
    baselineCommit?: string,
  ): Promise<ProofReceipt> {
    const manifest = resolvedCase.manifest
    const leanWorkingDirectory = resolveInside(worktree, manifest.lean.workingDirectory)
    await Promise.all([
      rm(join(leanWorkingDirectory, '.lake', 'build'), { recursive: true, force: true }),
      rm(join(leanWorkingDirectory, '.lake', 'config'), { recursive: true, force: true }),
    ])
    const proofPath = resolveInside(worktree, manifest.lean.proofFile)
    const theoremPath = resolveInside(worktree, manifest.lean.theoremFile)
    const proofSource = await readFile(proofPath, 'utf8')
    const theoremSource = manifest.lean.theoremFile === manifest.lean.proofFile
      ? proofSource
      : await readFile(theoremPath, 'utf8')
    const findings = proofHygiene(proofSource, manifest.lean.proofFile)
    const mismatches = await verifyLockedInputs(worktree, resolvedCase.lockedInputs)
    for (const mismatch of mismatches) {
      findings.push({
        kind: 'locked-input',
        message: `locked input changed: ${mismatch.path}`,
        path: mismatch.path,
      })
    }
    if (baselineCommit !== undefined) {
      const changed = await this.changedPathsSince(worktree, baselineCommit, signal)
      const editable = new Set(manifest.editableFiles)
      const unauthorized = changed.filter(path =>
        !editable.has(path)
        && !/^\.tokens-as-parameters\/(?:insights|reflections)\/.*\.md$/.test(path),
      )
      for (const path of unauthorized) {
        findings.push({
          kind: 'unauthorized-change',
          message: `candidate changed a path outside the declared editable surface: ${path}`,
          path,
        })
      }
    }
    const signature = theoremSignatureSha256(theoremSource, manifest.lean.theoremName)
    const signatureMatches = signature === manifest.lean.theoremSignatureSha256
    if (!signatureMatches) {
      findings.push({
        kind: 'signature',
        message: `top theorem signature hash changed (expected ${manifest.lean.theoremSignatureSha256}, got ${signature})`,
        path: manifest.lean.theoremFile,
      })
    }
    const syntacticStatus = obligationStatus(proofSource, manifest.lean.obligations)
    const declarations = declarationSources(proofSource)
    let checkpointCandidates: string[] = []
    if (baselineCommit !== undefined) {
      const baselineProof = await this.proofAtCommit(
        worktree,
        baselineCommit,
        manifest.lean.proofFile,
        signal,
      )
      if (baselineProof !== undefined) {
        const baselineDeclarations = declarationSources(baselineProof)
        const obligations = new Set(manifest.lean.obligations)
        checkpointCandidates = [...declarations.values()]
          .filter(declaration => !obligations.has(declaration.name))
          .filter(declaration => !/\bsorry\b/.test(stripLeanComments(declaration.source)))
          .filter(declaration => baselineDeclarations.get(declaration.name)?.source !== declaration.source)
          .map(declaration => declaration.name)
      }
    }
    const build = await this.runner.run({
      argv: manifest.lean.buildArgv,
      cwd: leanWorkingDirectory,
      timeoutMs: 30 * 60_000,
      maxOutputBytes: 8_000_000,
      ...(signal === undefined ? {} : { signal }),
    })
    if (build.exitCode !== 0 || build.signal !== null) {
      findings.push({ kind: 'build', message: 'Lean build did not complete successfully' })
    }
    const structurallyAcceptable = build.exitCode === 0
      && build.signal === null
      && mismatches.length === 0
      && signatureMatches
      && findings.every(finding => finding.kind === 'build'
        ? false
        : !['admit', 'axiom', 'unsafe', 'signature', 'locked-input', 'unauthorized-change'].includes(finding.kind))
    let obligationAxiomAudit: ProofReceipt['obligationAxiomAudit']
    let checkpointAxiomAudit: ProofReceipt['checkpointAxiomAudit']
    let axiomAudit: ProofReceipt['axiomAudit']
    let closedObligations: string[] = []
    let verifiedDeclarations: string[] = []
    let checkpointDeclarations: string[] = []
    const auditNames = [...new Set([...syntacticStatus.closed, ...checkpointCandidates])]
    if (structurallyAcceptable && auditNames.length > 0) {
      const audit = await this.auditDeclarations(resolvedCase, worktree, auditNames, signal)
      const allowed = new Set(manifest.lean.allowedAxioms)
      const accepted: string[] = []
      const rejected: NonNullable<ProofReceipt['obligationAxiomAudit']>['rejected'] = []
      for (const name of auditNames) {
        const observed = audit.observed.get(name)
        const forbidden = observed?.filter(axiom => !allowed.has(axiom)) ?? ['audit-result-missing']
        if (audit.command.exitCode === 0 && forbidden.length === 0) accepted.push(name)
        else rejected.push({ name, observed: observed ?? [], forbidden })
      }
      const obligationSet = new Set(syntacticStatus.closed)
      const checkpointSet = new Set(checkpointCandidates)
      const acceptedObligations = accepted.filter(name => obligationSet.has(name))
      const rejectedObligations = rejected.filter(item => obligationSet.has(item.name))
      const acceptedCheckpoints = accepted.filter(name => checkpointSet.has(name))
      const rejectedCheckpoints = rejected.filter(item => checkpointSet.has(item.name))
      obligationAxiomAudit = {
        command: audit.command,
        accepted: acceptedObligations,
        rejected: rejectedObligations,
      }
      if (checkpointCandidates.length > 0) {
        checkpointAxiomAudit = {
          command: audit.command,
          accepted: acceptedCheckpoints,
          rejected: rejectedCheckpoints,
        }
      }
      closedObligations = acceptedObligations
      checkpointDeclarations = acceptedCheckpoints
      verifiedDeclarations = accepted
      if (audit.command.exitCode !== 0 || rejectedObligations.length > 0) {
        findings.push({
          kind: 'axiom-audit',
          message: audit.command.exitCode !== 0
            ? 'Lean obligation axiom audit failed to run'
            : `obligations with forbidden or missing axiom evidence: ${rejectedObligations.map(item => item.name).join(', ')}`,
        })
      }
      if (syntacticStatus.open.length === 0) {
        const observed = audit.observed.get(manifest.lean.theoremName) ?? []
        axiomAudit = {
          command: audit.command,
          observed,
          forbidden: observed.filter(axiom => !allowed.has(axiom)),
        }
      }
    }
    const openObligations = manifest.lean.obligations.filter(name => !closedObligations.includes(name))
    const checkpointable = structurallyAcceptable
      && (closedObligations.length > baselineClosed || checkpointDeclarations.length > 0)
    const finalAccepted = structurallyAcceptable
      && openObligations.length === 0
      && !/\bsorry\b/.test(stripLeanComments(proofSource))
      && axiomAudit !== undefined
      && axiomAudit.command.exitCode === 0
      && axiomAudit.forbidden.length === 0
    return {
      schemaVersion: RUN_SCHEMA_VERSION,
      checkedAt: new Date().toISOString(),
      caseId: manifest.caseId,
      claimScope: manifest.claimScope,
      worktree,
      build,
      lockedInputsMatch: mismatches.length === 0,
      theoremSignatureMatches: signatureMatches,
      obligationsClosed: closedObligations.length,
      obligationsTotal: manifest.lean.obligations.length,
      closedObligations,
      openObligations,
      verifiedDeclarations,
      checkpointDeclarations,
      findings,
      ...(obligationAxiomAudit === undefined ? {} : { obligationAxiomAudit }),
      ...(checkpointAxiomAudit === undefined ? {} : { checkpointAxiomAudit }),
      ...(axiomAudit === undefined ? {} : { axiomAudit }),
      checkpointable,
      finalAccepted,
    }
  }

  private async proofAtCommit(
    worktree: string,
    commit: string,
    proofPath: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const receipt = await this.runner.run({
      argv: ['git', 'show', `${commit}:${proofPath}`],
      cwd: worktree,
      timeoutMs: 60_000,
      maxOutputBytes: 8_000_000,
      ...(signal === undefined ? {} : { signal }),
    })
    return receipt.exitCode === 0 && receipt.signal === null ? receipt.stdout : undefined
  }

  private async changedPathsSince(
    worktree: string,
    baselineCommit: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const tracked = await this.runner.run({
      argv: ['git', 'diff', '--name-only', baselineCommit, '--'],
      cwd: worktree,
      timeoutMs: 60_000,
      maxOutputBytes: 2_000_000,
      ...(signal === undefined ? {} : { signal }),
    })
    const untracked = await this.runner.run({
      argv: ['git', 'ls-files', '--others', '--exclude-standard'],
      cwd: worktree,
      timeoutMs: 60_000,
      maxOutputBytes: 2_000_000,
      ...(signal === undefined ? {} : { signal }),
    })
    if (tracked.exitCode !== 0 || tracked.signal !== null || untracked.exitCode !== 0 || untracked.signal !== null) {
      return ['<unable-to-audit-git-changes>']
    }
    return [...new Set(
      `${tracked.stdout}\n${untracked.stdout}`.split('\n').map(path => path.trim()).filter(Boolean),
    )]
  }

  private async auditDeclarations(
    resolvedCase: ResolvedCase,
    worktree: string,
    names: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ command: ProofReceipt['build']; observed: Map<string, string[]> }> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'tap-lean-audit-'))
    const auditFile = join(tempRoot, 'AxiomAudit.lean')
    await writeFile(
      auditFile,
      [
        `import ${resolvedCase.manifest.lean.module}`,
        ...names.map(name => `#print axioms ${name}`),
        '',
      ].join('\n'),
      'utf8',
    )
    try {
      const command = await this.runner.run({
        argv: ['lake', 'env', 'lean', auditFile],
        cwd: resolve(worktree, resolvedCase.manifest.lean.workingDirectory),
        timeoutMs: 10 * 60_000,
        maxOutputBytes: 2_000_000,
        ...(signal === undefined ? {} : { signal }),
      })
      return {
        command,
        observed: parseNamedAxiomAudits(`${command.stdout}\n${command.stderr}`),
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
}

/** Merge only named Lean declarations; the caller must re-run the verifier. */
export function transplantDeclarations(
  baseSource: string,
  candidateSource: string,
  names: readonly string[],
): string {
  let output = baseSource
  const candidateDeclarations = [...declarationSources(candidateSource).values()]
  for (const name of names) {
    const base = declarationSources(output).get(name)
    const candidate = declarationSources(candidateSource).get(name)
    if (candidate === undefined) continue
    if (base !== undefined) {
      output = `${output.slice(0, base.start)}${candidate.source}\n\n${output.slice(base.end).replace(/^\s+/, '')}`
      continue
    }
    const nextCandidate = candidateDeclarations.find(declaration => (
      declaration.start > candidate.start && declarationSources(output).has(declaration.name)
    ))
    const insertion = nextCandidate === undefined
      ? output.length
      : declarationSources(output).get(nextCandidate.name)?.start ?? output.length
    const separator = insertion === output.length && !output.endsWith('\n') ? '\n\n' : ''
    output = `${output.slice(0, insertion)}${separator}${candidate.source}\n\n${output.slice(insertion).replace(/^\s+/, '')}`
  }
  return output
}

export async function readProof(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export function apply(ctx: Context): () => void {
  return ctx.proofVerification.register(new LeanVerifier(new DshCommandRunner(ctx)))
}
