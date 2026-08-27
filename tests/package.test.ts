import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageRoot = new URL('../packages/', import.meta.url)

async function manifest(path: string): Promise<{
  name: string
  dependencies?: Record<string, string>
  dsh?: { bundle: { patch: string } }
}> {
  return JSON.parse(await readFile(new URL(`${path}/package.json`, packageRoot), 'utf8'))
}

test('workspace publishes independent core, domain, adapter, tool, and Bundle packages', async () => {
  assert.equal((await manifest('core/optimization')).name, '@tokens-as-parameters/core-optimization')
  assert.equal((await manifest('core/optimizer-relative-reflection')).name, '@tokens-as-parameters/optimizer-relative-reflection')
  assert.equal((await manifest('formal/proof-runtime')).name, '@tokens-as-parameters/proof-runtime')
  assert.equal((await manifest('formal/proof-verification')).name, '@tokens-as-parameters/proof-verification')
  assert.equal((await manifest('lean/verifier-lean')).name, '@tokens-as-parameters/verifier-lean')
  assert.equal((await manifest('formal/tool-proof-run')).name, '@tokens-as-parameters/tool-proof-run')

  const bundle = await manifest('bundle/formal-proof')
  assert.equal(bundle.name, '@tokens-as-parameters/bundle-formal-proof')
  assert.equal(bundle.dsh?.bundle.patch, './cordis.patch.yml')
})

test('Core packages do not depend on Formal, Lean, Chips, or Bundle packages', async () => {
  for (const path of [
    'core/optimization',
    'core/optimizer-relative-reflection',
    'core/state-git',
    'core/telemetry',
  ]) {
    const dependencies = Object.keys((await manifest(path)).dependencies ?? {})
    assert.equal(dependencies.some(name => /proof|verifier|chips|bundle/.test(name)), false, path)
  }
})

test('Bundle composes packages and contains no implementation subpath plugins', async () => {
  const patch = await readFile(new URL('bundle/formal-proof/cordis.patch.yml', packageRoot), 'utf8')
  for (const plugin of [
    'core-optimization',
    'optimizer-relative-reflection',
    'proof-observer',
    'proof-verification',
    'proof-roles',
    'proof-runtime',
    'tool-proof-run',
    'verifier-lean',
  ]) {
    assert.match(patch, new RegExp(`@tokens-as-parameters/${plugin}\\b`))
  }
  assert.doesNotMatch(patch, /dsh-formal-proof\//)
})
