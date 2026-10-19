// @ts-nocheck
import path from 'node:path'
import fs from 'node:fs'
import type { Context, h as H } from 'koishi'
import type { Config } from './config'
import type { PhiRuntime } from './runtime-context'
import YAML from 'yaml'

export interface EngineRuntime extends PhiRuntime {
    apps: Record<string, any>
    adapter: any
    picmodle: any
    dispose(): Promise<void>
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
    const dataRoot = path.join(ctx.baseDir, 'data', 'phi-plugin')
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
    const updateConfig = (values: Partial<Config>) => {
        Object.assign(config, values)
        const scope = ctx.scope as any
        if (typeof scope?.update === 'function') {
            scope.update({ ...scope.config, ...values }, false)
        }
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
    send.configure(config)

    const { default: getBanGroup } = require('./domain/user/get-ban-group.ts')
    getBanGroup.configure(config)

    const { createApps } = require('./services/apps/index.ts')
    const apps = createApps(runtime)
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
