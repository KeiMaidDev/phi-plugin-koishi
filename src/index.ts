import { Context, Schema, h } from 'koishi'
import type {} from 'koishi-plugin-monetary'
import type {} from 'koishi-plugin-puppeteer'
import { installCommunityModels, installCommunityStore, installNotesStore, installPhiModels } from './database'
import { createEngine } from './runtime'
import { registerEngineCommands } from './commands'
import { PHI_COMMAND_HEAD } from './constants'
import { registerMoneyCommands, type MoneyConfig } from './commands'
import { createKoishiSchema } from './config'

export const name = 'phi-plugin-koishi'
export const inject = ['database', 'monetary', 'puppeteer']

export interface Config extends MoneyConfig {
  [key: string]: unknown
}

const baseConfig = Schema.object({
  timezone: Schema.string().default('Asia/Shanghai').description('Sign-in 使用的时区。'),
  signInRewardMin: Schema.natural().default(5).description('Sign-in 奖励的最小 Note 数量。'),
  signInRewardMax: Schema.natural().default(20).description('Sign-in 奖励的最大 Note 数量。'),
  transferFee: Schema.natural().max(100).default(20).description('Transfer 手续费百分比，范围为 0 到 100。'),
})

const configSchema = Schema.intersect([
  createKoishiSchema(),
  baseConfig.description('Note 设置'),
]).description('Phi 插件配置')

const legacyConfigKeys = [
  'koishiDiscordCommands',
  'koishiShortcuts',
  'koishiShortcutCommands',
  'koishiShortcutCategories',
  'cmdhead',
  'renderer',
] as const

function normalizeConfig(config: Partial<Config>): Config {
  const normalized = { ...config }
  for (const key of legacyConfigKeys) delete normalized[key]
  return normalized as Config
}

export const Config = configSchema as Schema<Partial<Config>, Config>

function validateConfig(config: Config) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.timezone })
  } catch {
    throw new Schema.ValidationError(`invalid timezone "${config.timezone}"`, { path: ['timezone'] })
  }
  if (config.signInRewardMin > config.signInRewardMax) {
    throw new Schema.ValidationError('signInRewardMin must not exceed signInRewardMax', { path: ['signInRewardMin'] })
  }
}

export async function apply(ctx: Context, input: Config) {
  const config = normalizeConfig(input)
  validateConfig(config)
  installPhiModels(ctx)
  installCommunityModels(ctx)
  installNotesStore(ctx)
  await installCommunityStore(ctx)

  const runtimeConfig = { ...config, cmdhead: PHI_COMMAND_HEAD }
  const runtime = await createEngine(ctx, runtimeConfig, h)
  registerEngineCommands(ctx, runtime)
  registerMoneyCommands(ctx, runtimeConfig)

  ctx.on('dispose', () => {
    void runtime.dispose()
  })
}
