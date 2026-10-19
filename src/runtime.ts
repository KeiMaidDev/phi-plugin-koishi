// @ts-nocheck
import path from 'node:path'
import fs from 'node:fs'
import type { Context, h as H } from 'koishi'
import type { Config } from './config'
import type { PhiRuntime } from './runtime-context'

export interface EngineRuntime extends PhiRuntime {
    apps: Record<string, any>
    adapter: any
    picmodle: any
    dispose(): Promise<void>
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

    const runtime: PhiRuntime = { config, data }
    const updateConfig = (values: Partial<Config>) => {
        Object.assign(config, values)
        const scope = ctx.scope as any
        if (typeof scope?.update === 'function') {
            scope.update({ ...scope.config, ...values })
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
