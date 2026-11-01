// @ts-nocheck
import path from 'node:path'
import fs from 'node:fs'
import type { Context, h as H } from 'koishi'
import type { Config } from './config'
import type { PhiRuntime } from './runtime-context'
import YAML from 'yaml'
import { PHI_DATA_NAME } from './constants'

export interface EngineRuntime extends PhiRuntime {
    apps: Record<string, any>
    adapter: any
    picmodle: any
    dispose(): Promise<void>
}

/** 同步更新 Koishi 插件配置，并等待同一个 loader 写盘任务完成。 */
export async function persistPluginConfig(ctx: Context, config: Config, values: Partial<Config>, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('Koishi 配置写回已取消')
    // 让同一轮事件中的 dispose 有机会先取消，避免在卸载后启动写盘。
    await new Promise(resolve => setTimeout(resolve, 0))
    if (signal?.aborted) throw new Error('Koishi 配置写回已取消')
    Object.assign(config, values)
    if (signal?.aborted) throw new Error('Koishi 配置写回已取消')
    const scope = ctx.scope as any
    if (typeof scope?.update !== 'function') {
        throw new Error('Koishi 配置作用域不可用')
    }
    scope.update({ ...scope.config, ...values }, false)
    if (signal?.aborted) throw new Error('Koishi 配置写回已取消')
    // scope.update 只同步更新内存并排入写盘任务；等待同一个任务以确认真实落盘。
    if (typeof ctx.loader?.writeConfig !== 'function') {
        throw new Error('Koishi 配置写盘接口不可用')
    }
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (signal?.aborted) throw new Error('Koishi 配置写回已取消')
        try {
            await ctx.loader.writeConfig()
            return
        } catch (error: any) {
            lastError = error
            // Windows 上杀毒软件或短生命周期文件句柄可能暂时阻止 rename。
            if (!['EPERM', 'EBUSY'].includes(String(error?.code || '')) || attempt === 2) throw error
            await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)))
        }
    }
    throw lastError
}

/** 从旧配置存储恢复已签发的 Bot 身份，避免升级后重复申请并触发注册限流。 */
function restoreLegacyBotIdentity(ctx: Context, config: Config, configRoot: string) {
    const hasAnyIdentity = Boolean(config.apiBotClientId || config.apiBotClientSecret)
    if (hasAnyIdentity) return false

    const legacyPath = path.join(configRoot, 'config', 'config.yaml')
    if (!fs.existsSync(legacyPath)) return false

    try {
        const legacy = YAML.parse(fs.readFileSync(legacyPath, 'utf8')) || {}
        const identity = {
            apiBotClientId: String(legacy.apiBotClientId || '').trim(),
            apiBotClientSecret: String(legacy.apiBotClientSecret || '').trim(),
            apiBotSecretVersion: Number(legacy.apiBotSecretVersion || 0),
        }
        if (!identity.apiBotClientId || !identity.apiBotClientSecret) return false
        if (!Number.isSafeInteger(identity.apiBotSecretVersion) || identity.apiBotSecretVersion < 1) return false

        Object.assign(config, identity)
        const scope = ctx.scope as any
        if (typeof scope?.update === 'function') {
            scope.update({ ...scope.config, ...identity }, false)
        }
        const logger = typeof ctx.logger === 'function' ? ctx.logger('phi-plugin') : ctx.logger
        logger?.info?.('[phi-plugin] 已恢复旧版 API Bot 身份配置')
        return true
    } catch {
        return false
    }
}

export async function createEngine(ctx: Context, config: Config, h: typeof H): Promise<EngineRuntime> {
    const pluginRoot = path.resolve(__dirname, '..')
    const dataRoot = path.join(ctx.baseDir, 'data', PHI_DATA_NAME)
    fs.mkdirSync(dataRoot, { recursive: true })
    ;(globalThis as any).__PHI_PLUGIN_ROOT = pluginRoot
    ;(globalThis as any).__PHI_DATA_ROOT = dataRoot

    const { useKoishiAdapter } = require('./platform/koishi.ts')
    const adapter = useKoishiAdapter(ctx, { h, rootPath: ctx.baseDir, botConfig: config })
    ctx.middleware((session, next) => adapter.dispatchContext(session, next), true)

    const { BusinessDataStore } = require('./services/business-data.ts')
    const data = new BusinessDataStore()
    await data.init()
    restoreLegacyBotIdentity(ctx, config, dataRoot)

    const runtime: PhiRuntime = { config, data }
    const updateConfig = async (values: Partial<Config>, signal?: AbortSignal) => {
        await persistPluginConfig(ctx, config, values, signal)
    }

    const { default: botApiAuth } = require('./providers/phi-api/bot-api-auth.ts')
    botApiAuth.configure(config, updateConfig)

    // 启动后立即异步探测 Online API；本地初始化继续并行执行。
    const { default: autoSeekApi } = require('./providers/phi-api/auto-seek-api.ts')
    autoSeekApi.start(ctx, config)

    const { default: getInfo } = require('./domain/game/get-info.ts')
    await getInfo.init(runtime)

    const { default: picmodle } = require('./render/pic-model.ts')
    picmodle.configure(config)
    picmodle.validateRendererSettings()
    await picmodle.beginSession(ctx, config)

    const { default: themeManager } = require('./services/theme/manager.ts')
    await themeManager.init()

    const { default: themeUseService } = require('./services/theme/use-service.ts')
    themeUseService.configure(config)

    const { default: send } = require('./render/send.ts')
    send.configure(config, () => ctx.assets)

    const { default: getBanGroup } = require('./domain/user/get-ban-group.ts')
    getBanGroup.configure(config)

    const { createApps } = require('./services/apps/index.ts')
    const apps = createApps(runtime)
    ctx.middleware((session, next) => apps.guessGame.handleMessage(session, next), true)
    const { registerAliasProposalTask } = require('./services/apps/alias-proposal.ts')
    registerAliasProposalTask(ctx, config)

    let disposed = false
    return {
        ...runtime,
        apps,
        adapter,
        picmodle,
        async dispose() {
            if (disposed) return
            disposed = true
            try {
                await adapter.drain?.()
                await picmodle.endSession(ctx)
            } finally {
                const closers = [
                    () => getInfo.close?.(),
                    () => data.close(),
                    () => botApiAuth.dispose(),
                    () => autoSeekApi.dispose(),
                    () => adapter.close?.(),
                    async () => require('./utils/file-watcher-registry.ts').default.closeAll(),
                ]
                for (const close of closers) {
                    try { await close() } catch (error) { (typeof ctx.logger === 'function' ? ctx.logger('phi-plugin') : ctx.logger).warn(error) }
                }
            }
        },
    }
}
