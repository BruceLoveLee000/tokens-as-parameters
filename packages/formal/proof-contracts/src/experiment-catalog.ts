import { readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import {
  type ExperimentCaseSummary,
} from './index.js'
import {
  loadCaseManifest,
  type ResolvedCase,
} from './case-manifest.js'

export interface CatalogCase extends ExperimentCaseSummary {
  resolvedCase: ResolvedCase
}

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.lake',
  '.tokens-as-parameters',
  'build',
  'dist',
  'lib',
  'node_modules',
])

async function findManifestDirectories(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const manifests: string[] = []
  if (entries.some(entry => entry.isFile() && entry.name === 'case.json')) manifests.push(directory)
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue
    manifests.push(...await findManifestDirectories(root, resolve(directory, entry.name)))
  }
  return manifests
}

function catalogPath(root: string, caseRoot: string): string {
  const path = relative(root, caseRoot)
  if (path.length === 0 || path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error(`experiment case escapes benchmark catalog: ${caseRoot}`)
  }
  return path.split(sep).join('/')
}

export async function discoverExperimentCases(benchmarkRoot: string): Promise<CatalogCase[]> {
  const root = resolve(benchmarkRoot)
  const cases = await Promise.all((await findManifestDirectories(root)).map(async caseRoot => {
    const resolvedCase = await loadCaseManifest(caseRoot)
    return {
      caseId: resolvedCase.manifest.caseId,
      claimScope: resolvedCase.manifest.claimScope,
      description: resolvedCase.manifest.description,
      catalogPath: catalogPath(root, resolvedCase.root),
      resolvedCase,
    }
  }))
  const seen = new Set<string>()
  for (const item of cases) {
    if (seen.has(item.caseId)) throw new Error(`duplicate experiment case id: ${item.caseId}`)
    seen.add(item.caseId)
  }
  return cases.sort((left, right) => left.caseId.localeCompare(right.caseId))
}

export async function resolveExperimentCase(
  benchmarkRoot: string,
  caseId: string,
): Promise<CatalogCase> {
  const matches = (await discoverExperimentCases(benchmarkRoot)).filter(item => item.caseId === caseId)
  if (matches.length === 0) throw new Error(`unknown experiment case: ${caseId}`)
  const match = matches[0]
  if (match === undefined) throw new Error(`unknown experiment case: ${caseId}`)
  return match
}
