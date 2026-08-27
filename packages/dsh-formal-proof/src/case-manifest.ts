import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { CaseManifestSchema, type CaseManifest } from './contracts.js'

export interface LockedInputBaseline {
  path: string
  sha256: string
}

export interface ResolvedCase {
  root: string
  manifestPath: string
  manifest: CaseManifest
  lockedInputs: LockedInputBaseline[]
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function resolveInside(root: string, candidate: string): string {
  const absolute = resolve(root, candidate)
  const relation = relative(root, absolute)
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`path escapes case root: ${candidate}`)
  }
  return absolute
}

export async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path))
}

export async function loadCaseManifest(
  caseRootInput: string,
  manifestPathInput = 'case.json',
): Promise<ResolvedCase> {
  const root = await realpath(resolve(caseRootInput))
  const manifestPath = resolveInside(root, manifestPathInput)
  const parsed = CaseManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const lockedInputs: LockedInputBaseline[] = []
  for (const input of parsed.lockedInputs) {
    const digest = await hashFile(resolveInside(root, input.path))
    if (digest !== input.sha256) {
      throw new Error(`locked input hash mismatch before run: ${input.path}`)
    }
    lockedInputs.push({ path: input.path, sha256: input.sha256 })
  }
  return { root, manifestPath, manifest: parsed, lockedInputs }
}

export async function verifyLockedInputs(
  root: string,
  baseline: readonly LockedInputBaseline[],
): Promise<Array<{ path: string; expected: string; actual?: string }>> {
  const mismatches: Array<{ path: string; expected: string; actual?: string }> = []
  for (const input of baseline) {
    try {
      const actual = await hashFile(resolveInside(root, input.path))
      if (actual !== input.sha256) mismatches.push({ path: input.path, expected: input.sha256, actual })
    } catch {
      mismatches.push({ path: input.path, expected: input.sha256 })
    }
  }
  return mismatches
}
