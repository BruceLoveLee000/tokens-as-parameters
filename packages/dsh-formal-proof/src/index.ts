export * from './contracts.js'
export * from './case-manifest.js'
export * from './command-runner.js'
export * from './git-state.js'
export * from './lean-verifier.js'
export * from './session-utils.js'

export const pluginSuite = {
  name: '@tokens-as-parameters/dsh-formal-proof',
  bundlePatch: './packages/dsh-formal-proof/cordis.patch.yml',
  plugins: [
    'observer',
    'roles',
    'reflection',
    'runtime',
    'tools',
  ],
} as const
