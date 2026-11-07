import { Context, h } from 'koishi'
import { installCommunityModels, installCommunityStore, installNotesStore, installPhiModels } from './database'
import { createEngine } from './runtime'
import { registerEngineCommands } from './commands'
import { registerMoneyCommands } from './commands'
import { Config, resolveConfig, validateConfig, type Config as PhiConfig } from './config'
import { isPluginContextActive } from './utils/context-lifecycle'

export { Config }
export type { PhiConfig }
export const name = 'phi-plugin-koishi'
export const inject = {
  required: ['database', 'monetary', 'puppeteer', 'cron'],
  optional: ['assets'],
}

export async function apply(ctx: Context, input: PhiConfig) {
  const config = resolveConfig(input)
  validateConfig(config)
  installPhiModels(ctx)
  installCommunityModels(ctx)
  installNotesStore(ctx)
  await installCommunityStore(ctx)

  const runtime = await createEngine(ctx, config, h)
  if (!isPluginContextActive(ctx)) {
    try {
      await runtime.dispose()
    } catch (error) {
      ctx.logger('phi-plugin').warn('清理已卸载插件实例失败', error)
    }
    return
  }
  registerEngineCommands(ctx, runtime)
  registerMoneyCommands(ctx, config)

  ctx.on('dispose', () => {
    void runtime.dispose()
  })
}
