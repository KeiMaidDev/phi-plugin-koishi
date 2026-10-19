// @ts-nocheck
import logger from '../../utils/logger'
import Version from '../../utils/version'
import autoSeekApi from './auto-seek-api'
import platform from '../../platform/index'
import makeRequest from './make-request'
import { isApiVersionBlocked } from './api-version'
import themePolicy from '../../services/theme/policy'
import { UserCredentials } from '../../domain/user/user-credentials'

export class BotSyncService {
    constructor() {
        this.running = false
        this.initialized = false
        this.reportRenderPressure = false
        /** @type {Set<string>} */
        this.pendingAcknowledgements = new Set()
    }

    /**
     * 执行一次 Bot 状态同步；成功送达的消息在下一次请求中确认。
     * @param {AbortSignal} [signal] 插件卸载时中止请求
     * @returns {Promise<void>}
     */
    async sync(signal = undefined) {
        if (this.running) return
        this.running = true
        const acknowledgedMessageIds = [...this.pendingAcknowledgements]
        try {
            // 始终在本地滚动采样；服务端许可只决定是否把匿名压力历史放入请求。
            const renderPressure = require('../../render/pic-model.ts').default.takeRenderPressureSnapshot()
            const response = await makeRequest.syncBot({
                pluginVersion: Version.ver,
                acknowledgedMessageIds,
                ...(this.reportRenderPressure ? { renderPressure } : {}),
            }, { signal })
            if (signal?.aborted) return
            for (const id of acknowledgedMessageIds) this.pendingAcknowledgements.delete(id)
            this.reportRenderPressure = response?.reporting?.renderPressure === true
            if (response?.themePolicy) themePolicy.apply(response.themePolicy)

            for (const request of response?.unbindRequests || []) {
                if (signal?.aborted) return
                await this.applyUnbindRequest(request)
            }

            for (const message of response?.messages || []) {
                if (signal?.aborted) return
                try {
                    const sent = await platform.relpyPrivate(message.target.platformId, message.text)
                    if (sent !== false && sent != null) this.pendingAcknowledgements.add(message.id)
                } catch (error) {
                    logger.warn(`[phi-plugin] Bot消息私聊失败，将在下次同步重试：${message.id}`, error)
                }
            }
        } finally {
            this.running = false
        }
    }

    /**
     * 执行服务端下发的解绑信号：清除本地绑定与数据，并把解绑状态回传 API。
     * 单个信号失败不影响其余信号，失败项将在下次同步重试（API 端保持 disabled 直至确认）。
     * @param {{platform?: string, platformId?: string, reason?: string}} request 解绑信号
     * @returns {Promise<void>}
     */
    async applyUnbindRequest(request) {
        const platformId = String(request?.platformId ?? '').trim()
        if (!platformId) return
        try {
            const credentials = new UserCredentials(platformId)
            const { hadBinding } = await credentials.unbindLocal()
            await credentials.reportUnbind({
                platform: typeof request?.platform === 'string' ? request.platform : undefined,
                platformId,
                reason: request?.reason || 'disabled_by_account',
            })
            if (hadBinding) logger.mark(`[phi-plugin] 已按 API 解绑信号清除本地绑定：${platformId}`)
        } catch (error) {
            logger.warn(`[phi-plugin] 处理 API 解绑信号失败，将在下次同步重试：${platformId}`, error)
        }
    }

    /** 启动时立即同步一次；失败由一分钟周期和 API 重连流程继续恢复。 @param {AbortSignal} [signal] */
    async initialize(signal = undefined) {
        if (!autoSeekApi.isConfigured() || isApiVersionBlocked()) return
        if (this.initialized) return
        this.initialized = true
        await this.sync(signal).catch(error => {
            logger.warn('[phi-plugin] 初始 Bot状态同步失败，将稍后重试', error)
        })
    }

    /** API 恢复连接后立即补发心跳并拉取消息。 @param {AbortSignal} [signal] */
    async recoverAfterReconnect(signal = undefined) {
        this.initialized = true
        await this.sync(signal).catch(error => {
            logger.warn('[phi-plugin] API恢复后的 Bot状态同步失败', error)
        })
    }

    /** @returns {Promise<void>} 一分钟平台任务入口 */
    async scheduledTask() {
        if (!autoSeekApi.isConfigured() || isApiVersionBlocked()) return
        await this.sync().catch(error => {
            logger.warn('[phi-plugin] Bot状态同步失败', error)
        })
    }
}

export default new BotSyncService()
