// @ts-nocheck
import platform from '../platform/index'

/** @typedef {{browserInit(): Promise<any>, screenshot(name: string, data?: any): Promise<any>, restart(force?: boolean): Promise<any>, shutdown(): Promise<void>, forceShutdown(): void}} Renderer */

/** 只检查共享 Puppeteer 服务，不启动插件自有浏览器。 */
export function validateRendererDependencies() {
    if (!platform.hasPuppeteerService?.()) {
        throw new Error('[phi-plugin] 缺少必需的 puppeteer 服务，请安装并启用 koishi-plugin-puppeteer。')
    }
}

async function loadRenderer() {
    return require('./koishi-puppeteer.ts').default
}

/** 每个槽位只加载共享 Puppeteer 渲染器；截图前切换或卸载不会初始化已废弃的槽位。 */
export default class LazyRenderer {
    /** @param {any} config @param {string} browserId */
    constructor(config, browserId) {
        this.config = config
        this.browserId = browserId
        /** @type {Renderer | null} */
        this.instance = null
        /** @type {Promise<Renderer | false> | null} */
        this.initPromise = null
        /** @type {Set<Promise<any>>} */
        this.pending = new Set()
        this.shutdownRequested = false
        /** @type {Promise<void> | null} */
        this.shutdownPromise = null
    }

    async getInstance() {
        if (this.shutdownRequested) return false
        if (this.instance) return this.instance
        if (!this.initPromise) {
            this.initPromise = (async () => {
                validateRendererDependencies()
                const RendererClass = await loadRenderer()
                if (this.shutdownRequested) return false
                const renderer = new RendererClass(this.config, this.browserId)
                this.instance = renderer
                return renderer
            })().finally(() => { this.initPromise = null })
        }
        return this.initPromise
    }

    async browserInit() {
        const renderer = await this.getInstance()
        return renderer ? renderer.browserInit() : false
    }

    /** @param {string} name @param {any} [data] */
    async screenshot(name, data = {}) {
        if (this.shutdownRequested) return false
        const task = (async () => {
            const renderer = await this.getInstance()
            return renderer && !this.shutdownRequested ? renderer.screenshot(name, data) : false
        })()
        this.pending.add(task)
        try { return await task } finally { this.pending.delete(task) }
    }

    async restart(force = false) {
        return !this.shutdownRequested && this.instance ? this.instance.restart(force) : false
    }

    async shutdown() {
        if (this.shutdownPromise) return this.shutdownPromise
        this.shutdownRequested = true
        this.shutdownPromise = (async () => {
            await Promise.allSettled([...(this.initPromise ? [this.initPromise] : []), ...this.pending])
            await this.instance?.shutdown()
        })()
        return this.shutdownPromise
    }

    forceShutdown() {
        this.shutdownRequested = true
        this.instance?.forceShutdown()
    }
}
