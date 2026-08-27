import { Service, type Context } from '@deepseek-ai/cordis'
import type { TextOptimizer } from './optimizer.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    optimization: OptimizationService
  }
}

/** DSH registry seam. Parameter and update contracts remain domain-neutral. */
export default class OptimizationService extends Service {
  private readonly optimizers = new Map<string, TextOptimizer>()

  constructor(ctx: Context) {
    super(ctx, 'optimization')
  }

  register(optimizer: TextOptimizer): () => void {
    const id = optimizer.id.trim()
    if (id.length === 0) throw new Error('optimizer id must be non-empty')
    if (this.optimizers.has(id)) throw new Error(`optimizer already registered: ${id}`)
    this.optimizers.set(id, optimizer)
    return () => {
      if (this.optimizers.get(id) === optimizer) this.optimizers.delete(id)
    }
  }

  require(id: string): TextOptimizer {
    const optimizer = this.optimizers.get(id)
    if (optimizer === undefined) throw new Error(`unknown text optimizer: ${id}`)
    return optimizer
  }

  list(): string[] {
    return [...this.optimizers.keys()].sort()
  }
}
