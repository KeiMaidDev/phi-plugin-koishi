import { Context, h } from 'koishi'
import type {} from 'koishi-plugin-monetary'
import type {} from 'koishi-plugin-puppeteer'
import { installCommunityModels, installCommunityStore, installNotesStore, installPhiModels } from './database'
import { createEngine } from './runtime'
import { registerEngineCommands } from './commands'
import { registerMoneyCommands } from './commands'
import { Config, resolveConfig, validateConfig, type Config as PhiConfig } from './config'

export { Config }
export type { PhiConfig }
export const name = 'phi-plugin-koishi'
export const inject = ['database', 'monetary', 'puppeteer']

export async function apply(ctx: Context, input: PhiConfig) {
  const config = resolveConfig(input)
  validateConfig(config)
  installPhiModels(ctx)
  installCommunityModels(ctx)
  installNotesStore(ctx)
  await installCommunityStore(ctx)

  const runtime = await createEngine(ctx, config, h)
  registerEngineCommands(ctx, runtime)
  registerMoneyCommands(ctx, config)

  ctx.on('dispose', () => {
    void runtime.dispose()
  })
}
