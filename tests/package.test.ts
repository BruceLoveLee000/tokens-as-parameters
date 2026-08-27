import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('npm package exposes one official DSH Bundle and the five plugin boundaries', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    dsh: { bundle: { patch: string } }
    exports: Record<string, unknown>
  }
  assert.equal(packageJson.dsh.bundle.patch, './packages/dsh-formal-proof/cordis.patch.yml')
  for (const subpath of ['./runtime', './tools', './roles', './reflection', './observer']) {
    assert.equal(Object.hasOwn(packageJson.exports, subpath), true)
  }

  const patch = await readFile(new URL('../packages/dsh-formal-proof/cordis.patch.yml', import.meta.url), 'utf8')
  for (const plugin of ['observer', 'roles', 'reflection', 'runtime', 'tools']) {
    assert.match(patch, new RegExp(`/\\b${plugin}\\b`))
  }
})
