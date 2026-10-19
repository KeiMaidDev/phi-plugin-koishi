// @ts-nocheck
import path from 'node:path'
import fs from 'node:fs'
import type { Context, h as H } from 'koishi'

export interface EngineRuntime {
    apps: Record<string, any>
    adapter: any
    picmodle: any
    dispose(): Promise<void>
}

export async function createEngine(ctx: Context, config: Record<string, any>, h: typeof H): Promise<EngineRuntime> {
    const pluginRoot = path.resolve(__dirname, '..')
    const dataRoot = path.join(ctx.baseDir, 'data', 'phi-plugin')
    fs.mkdirSync(dataRoot, { recursive: true })
    ;(globalThis as any).__PHI_PLUGIN_ROOT = pluginRoot
    ;(globalThis as any).__PHI_DATA_ROOT = dataRoot

    const { useKoishiAdapter } = require('./platform/koishi.ts')
    const adapter = useKoishiAdapter(ctx, { h, rootPath: ctx.baseDir, botConfig: config })
    ctx.middleware((session, next) => adapter.dispatchContext(session, next), true)

    const { default: Config } = require('./services/config-store.ts')
    Config.config = {}
    Config.initCfg()

    const { bindHostSettings } = require('./config/host.ts')
    const unbind = bindHostSettings(config, values => {
        if (typeof (ctx.scope as any)?.update === 'function') {
            ;(ctx.scope as any).update({ ...(ctx.scope as any).config, ...values })
        }
    })

    // 启动后立即异步探测 Online API；本地初始化继续并行执行。
    const { default: autoSeekApi } = require('./providers/phi-api/auto-seek-api.ts')
    autoSeekApi.start(ctx)

    const { default: getInfo } = require('./domain/game/get-info.ts')
    await getInfo.init()

    const { default: picmodle } = require('./render/pic-model.ts')
    picmodle.validateRendererSettings()
    await picmodle.beginSession(ctx)

    const { default: themeManager } = require('./services/theme/manager.ts')
    await themeManager.init()

    const { createApps } = require('./services/apps/index.ts')
    const apps = createApps()

    let disposed = false
    return {
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
                    () => Config.close?.(),
                    () => autoSeekApi.dispose(),
                    () => adapter.close?.(),
                    async () => require('./utils/file-watcher-registry.ts').default.closeAll(),
                ]
                for (const close of closers) {
                    try { await close() } catch (error) { (typeof ctx.logger === 'function' ? ctx.logger('phi-plugin') : ctx.logger).warn(error) }
                }
                unbind?.()
            }
        },
    }
}

