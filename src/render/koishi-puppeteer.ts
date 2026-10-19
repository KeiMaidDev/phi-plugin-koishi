// @ts-nocheck
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import timers from 'node:timers/promises'
import logger from '../utils/logger'
import platform from '../platform/index'

const Renderer = platform.RendererBase
const PAGE_CLOSE_TIMEOUT_MS = 3000

class KoishiPuppeteer extends Renderer {
    constructor(config = {}, browserId = '0') {
        super({ id: `phi-puppeteer-${browserId}`, type: 'image', render: 'screenshot' })
        this.browserId = browserId
        this.shoting = []
        this.renderNum = 0
        this.puppeteerTimeout = config.puppeteerTimeout || 0
        this.pageCloseTimeout = Number.isFinite(config.pageCloseTimeout) && config.pageCloseTimeout > 0
            ? config.pageCloseTimeout
            : PAGE_CLOSE_TIMEOUT_MS
        this.templateClosePromise = null
        this.pageGotoParams = config.pageGotoParams || {
            timeout: 120000,
            waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
        }
    }

    async browserInit() {
        const service = platform.getPuppeteerService?.()
        if (!service?.page) {
            logger.error('[phi-plugin] 未找到 Koishi puppeteer 服务，请安装并启用 koishi-plugin-puppeteer。')
            return false
        }
        return service
    }

    async screenshot(name, data = {}) {
        const jobName = `${name}#${Date.now()}`
        this.shoting.push(jobName)
        const start = Date.now()
        let page
        try {
            const service = await this.browserInit()
            if (!service) return false
            data.saveId = `${data.saveId || name.split('/').pop()}_${this.browserId}`
            const resolvedPath = this.dealTpl(name, data)
            if (!resolvedPath) return false
            page = await service.page()
            const ret = await this.withTimeout(
                this.renderPage(page, name, String(resolvedPath), data, start),
                this.puppeteerTimeout,
            )
            if (!ret || !ret[0]) {
                logger.error(`[图片生成][${name}] 图片生成为空`)
                return false
            }
            return data.multiPage ? ret : ret[0]
        } catch (error) {
            logger.error(`[图片生成][${name}] 图片生成失败`, error)
            return false
        } finally {
            if (page) await this.closePage(page)
            this.removeJob(jobName)
        }
    }

    async renderPage(page, name, savePath, data, start) {
        const pageHeight = Math.max(1, Number(data.multiPageHeight) || 4000)
        const pageGotoParams = { ...this.pageGotoParams, ...(data.pageGotoParams || {}) }
        await page.goto(pathToFileURL(path.resolve(savePath)).href, pageGotoParams)
        const body = (await page.$('#container')) || (await page.$('body'))
        if (!body) throw new Error('未找到可截图的页面节点')
        const boundingBox = await body.boundingBox()
        if (!boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) throw new Error('页面尺寸为空，无法截图')
        const screenshotOptions = { type: data.imgType || 'jpeg', omitBackground: data.omitBackground || false, quality: data.quality || 90 }
        if (data.path) screenshotOptions.path = data.path
        if (data.multiPage) screenshotOptions.type = 'jpeg'
        if (screenshotOptions.type === 'png') delete screenshotOptions.quality
        if (!data.multiPage) {
            const buff = await this.toBuffer(body.screenshot(screenshotOptions))
            this.renderNum++
            logger.mark(`[图片生成][${name}][${this.renderNum}次] ${(buff.length / 1024).toFixed(2)}KB ${logger.green(`${Date.now() - start}ms`)}`)
            return [buff]
        }
        const totalHeight = Math.ceil(boundingBox.height)
        const viewportWidth = Math.max(1, Math.ceil(boundingBox.width))
        const num = Math.max(1, Math.ceil(totalHeight / pageHeight))
        const ret = []
        if (num > 1) await page.setViewport({ width: viewportWidth, height: Math.min(pageHeight, totalHeight) + 100 })
        for (let i = 0; i < num; i++) {
            const remainHeight = totalHeight - pageHeight * i
            const currentHeight = Math.max(1, Math.min(pageHeight, remainHeight))
            if (num > 1) {
                await page.setViewport({ width: viewportWidth, height: currentHeight + (i === num - 1 ? 0 : 100) })
                await page.evaluate(`window.scrollTo(0, ${pageHeight * i})`)
            }
            const buff = await this.toBuffer(num === 1 ? body.screenshot(screenshotOptions) : page.screenshot(screenshotOptions))
            if (num > 2) await timers.setTimeout(200)
            this.renderNum++
            ret.push(buff)
        }
        return ret
    }

    async toBuffer(promise) {
        const buff = await promise
        return Buffer.isBuffer(buff) ? buff : Buffer.from(buff)
    }

    async withTimeout(promise, timeout) {
        if (!(timeout > 0)) return promise
        let timeoutId
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(Object.assign(new Error('渲染超时'), { isRenderTimeout: true })), timeout)
                }),
            ])
        } finally {
            clearTimeout(timeoutId)
        }
    }

    async closePage(page) {
        let timeoutId
        try {
            await Promise.race([
                page.close(),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('page.close 超时')), this.pageCloseTimeout)
                }),
            ])
        } catch (error) {
            logger.warn('[phi-plugin] 共享 Puppeteer 页面关闭超时，已交由宿主服务回收', error)
        } finally {
            clearTimeout(timeoutId)
        }
    }

    removeJob(jobName) {
        const index = this.shoting.indexOf(jobName)
        if (index >= 0) this.shoting.splice(index, 1)
    }

    async restart() {
        logger.info('[phi-plugin] Puppeteer 由 Koishi 共享服务托管，插件不会重启宿主浏览器。')
        return false
    }

    async closeTemplateResources() {
        if (this.templateClosePromise) return this.templateClosePromise
        const watchers = [...new Set(Object.values(this.watcher || {}))]
        this.watcher = {}
        this.html = {}
        this.htmlIdentity = {}
        this.phiTemplateIdentity = {}
        this.phiTemplateWatchers?.clear()
        this.templateClosePromise = Promise.allSettled(watchers.map(watcher => watcher.close()))
        return this.templateClosePromise
    }

    async shutdown() {
        await this.closeTemplateResources()
    }

    forceShutdown() {}
}

export default KoishiPuppeteer
