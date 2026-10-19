// @ts-nocheck
import chalk from "chalk"
import logger from "../../utils/logger"
import { APIBASEURL } from "../../domain/game/const-num"
import https from 'node:https';
import axios from "axios";
import Version from "../../utils/version";
import botApiAuth from "./bot-api-auth";
import { classifyApiConnectionError, getPhiApiUserMessage, isFatalBotIdentityError, PhiApiError } from "./phi-api-errors";
import {
  compareApiVersion,
  isApiVersionBlocked,
  setApiVersionBlocked,
  SUPPORTED_API_VERSION,
} from './api-version';

/** 首次在线请求最多等待启动探测的时间。 */
export const API_PROBE_WAIT_MS = 5000
/** 探测失败后的后台重试间隔，最后一次间隔用于之后的所有重试。 */
export const API_RETRY_DELAYS = [30_000, 60_000, 120_000, 300_000]
const STATUS_REQUEST_TIMEOUT_MS = 5000

/**
 * 取消由 Koishi Context、Node 或测试时钟返回的定时器句柄。
 * @param {any} timer
 */
function cancelTimer(timer) {
  if (timer == null) return
  if (typeof timer === 'function') timer()
  else clearTimeout(timer)
}

/**
 * 读取 `/status`，并统一处理非 200 与无效响应。
 * @param {AbortSignal} [signal] 插件卸载时中止请求
 * @returns {Promise<{version?: unknown, id?: unknown}>}
 */
async function requestApiStatus(signal = undefined) {
  const agent = new https.Agent({ rejectUnauthorized: false })
  const response = await axios.get(`${APIBASEURL}/status`, {
    httpsAgent: agent,
    timeout: STATUS_REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
    signal,
  })
  if (response.status !== 200) {
    throw new PhiApiError(
      `API状态接口返回 HTTP ${response.status}`,
      response.status,
      'api_server_error',
    )
  }
  const data = response.data?.data ?? response.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PhiApiError('API状态接口返回无效数据', 502, 'api_status_invalid')
  }
  return data
}

/**
 * Online API 状态探测与重试。
 *
 * 状态只描述 Online API：插件本地初始化不等待它，在线请求才通过
 * `waitForProbe()` 取得最多 5 秒的探测结果。
 */
export class AutoSeekApi {
  /** @param {{
   *   isConfigured?: () => boolean,
   *   requestStatus?: (signal?: AbortSignal) => Promise<any>,
   *   recoverOnlineServices?: (signal?: AbortSignal) => Promise<void>,
   *   schedule?: (callback: () => void, delay: number) => any,
   *   logger?: { mark(...args: any[]): void, warn(...args: any[]): void, error(...args: any[]): void },
   * }} [options]
   */
  constructor(options = {}) {
    this.options = options
    this.config = undefined
    this.getConfigured = options.isConfigured
      ?? (() => Boolean(this.config?.openPhiPluginApi))
    this.requestStatus = options.requestStatus ?? requestApiStatus
    this.logger = options.logger ?? logger
    this.recoverOnlineServices = options.recoverOnlineServices
      ?? (() => this.recoverServices())

    /** @type {'idle'|'probing'|'available'|'unavailable'|'incompatible'} */
    this.state = 'idle'
    /** @type {any} */
    this.error = null
    this.openPhiPluginApi = false
    this.remoteApiVersion = ''
    this.versionWarning = ''
    this.probePromise = null
    this.probeGeneration = 0
    this.abortController = null
    this.probeWaiters = new Set()
    this.recoveryPromise = null
    this.recoveryGeneration = 0
    this.recoveryAbortController = null
    this.retryTimer = null
    this.retryIndex = 0
    this.ctx = null
    this.ctxDispose = null
    this.started = false
    this.disposed = false
    this.disposing = false
  }

  /**
   * 启动后立即探测 Online API，但不等待探测结果。
   * @param {any} [ctx] Koishi Context，用于绑定生命周期定时器
   * @returns {Promise<boolean>} 本次探测是否可用
   */
  start(ctx = undefined, config = undefined) {
    if (config) this.config = config
    if (this.started && this.ctx === (ctx ?? null)) {
      return this.probePromise ?? Promise.resolve(this.state === 'available')
    }
    if (this.started) this.dispose()

    this.started = true
    this.disposed = false
    this.ctx = ctx ?? null
    if (ctx?.on) this.ctxDispose = ctx.on('dispose', () => this.dispose())

    if (!this.getConfigured()) {
      this.state = 'idle'
      this.openPhiPluginApi = false
      this.versionWarning = ''
      return Promise.resolve(false)
    }
    return this.startProbe()
  }

  /** @returns {boolean} 当前配置是否启用 Online API */
  isConfigured() {
    return Boolean(this.getConfigured())
  }

  /** @returns {boolean} 当前运行周期是否因 API 协议版本不兼容而被关闭 */
  isVersionBlocked() {
    return isApiVersionBlocked()
  }

  /**
   * 等待启动探测完成，最多等待 `timeoutMs`。
   * 配置关闭、已知不可用或协议不兼容时立即返回 false。
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async waitForProbe(timeoutMs = API_PROBE_WAIT_MS) {
    if (!this.isConfigured() || this.disposed) return false
    if (this.state === 'available') return true
    if (this.state === 'incompatible' || this.state === 'unavailable') return false

    let pending = this.probePromise
    if (!pending && this.state === 'idle') pending = this.startProbe()
    if (!pending) return this.state === 'available'

    return new Promise(resolve => {
      let settled = false
      let timer = null
      const finish = value => {
        if (settled) return
        settled = true
        this.probeWaiters.delete(finish)
        cancelTimer(timer)
        resolve(value)
      }

      this.probeWaiters.add(finish)
      pending.then(
        () => finish(this.state === 'available'),
        () => finish(false),
      )

      try {
        timer = this.scheduleTimer(() => finish(false), Math.max(0, timeoutMs))
      } catch (error) {
        this.logger.warn('[phi-plugin] 启动 Online API 等待定时器失败', error)
        finish(false)
      }
      if (settled) cancelTimer(timer)
    })
  }

  /**
   * 在线请求入口：等待启动探测，失败时抛出可读错误。
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async ensureAvailable(timeoutMs = API_PROBE_WAIT_MS) {
    if (!this.isConfigured()) {
      throw new PhiApiError(
        getPhiApiUserMessage({ code: 'api_disabled' }),
        0,
        'api_disabled',
      )
    }
    if (await this.waitForProbe(timeoutMs)) return true
    if (this.error instanceof Error) throw this.error
    if (this.state === 'incompatible') {
      throw new PhiApiError('API协议大版本不兼容，请更新 phi-plugin 后重启。', 0, 'api_version_incompatible')
    }
    throw new PhiApiError('Online API 探测超时，在线功能暂时不可用，请稍后重试。', 0, 'api_timeout')
  }

  /**
   * 校验状态接口返回的 API 协议版本并更新运行时开关。
   * @param {unknown} version API 返回的版本号
   * @returns {boolean} 是否允许继续初始化 API 客户端
   */
  validateApiVersion(version) {
    const result = compareApiVersion(version)
    this.remoteApiVersion = result.apiVersion

    if (result.status === 'major_mismatch') {
      setApiVersionBlocked(true)
      this.openPhiPluginApi = false
      this.state = 'incompatible'
      this.versionWarning = ''
      this.error = new PhiApiError(
        `API协议大版本不兼容：API ${result.apiVersion}，插件支持 ${result.supportedVersion}。`,
        0,
        'api_version_incompatible',
      )
      this.cancelRetry()
      this.logger.error(
        `[phi-plugin] API大版本不兼容：API ${result.apiVersion}，插件支持 ${result.supportedVersion}。` +
        '已自动关闭 API 功能，请更新 phi-plugin 后重启。'
      )
      return false
    }

    if (result.status === 'invalid') {
      // 坏响应可能是临时异常；不要永久阻断，交给统一退避重试。
      setApiVersionBlocked(false)
      this.openPhiPluginApi = false
      this.state = 'unavailable'
      this.versionWarning = ''
      this.error = new PhiApiError(
        `API未返回有效的协议版本，插件支持 ${SUPPORTED_API_VERSION}。`,
        502,
        'api_status_invalid',
      )
      this.logger.error(
        `[phi-plugin] API未返回有效的协议版本，插件支持 ${SUPPORTED_API_VERSION}。` +
        '在线功能暂时不可用，将自动重试。'
      )
      return false
    }

    setApiVersionBlocked(false)
    if (result.status === 'minor_mismatch') {
      this.versionWarning = `API小版本不一致：API ${result.apiVersion}，插件支持 ${result.supportedVersion}。建议尽快更新 phi-plugin。`
      this.logger.warn(`[phi-plugin] ${this.versionWarning}`)
    } else {
      this.versionWarning = ''
    }
    return true
  }

  /** 启动一次探测；重复调用复用进行中的请求。 @returns {Promise<boolean>} */
  startProbe() {
    if (this.disposed || this.isVersionBlocked()) return Promise.resolve(false)
    if (!this.isConfigured()) {
      this.state = 'idle'
      this.openPhiPluginApi = false
      this.versionWarning = ''
      return Promise.resolve(false)
    }
    if (this.probePromise) return this.probePromise

    this.state = 'probing'
    this.openPhiPluginApi = false
    this.error = null
    const generation = this.probeGeneration
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    this.abortController = controller
    const task = this.runProbe(generation, controller?.signal).finally(() => {
      if (this.abortController === controller) this.abortController = null
      if (this.probePromise === task) this.probePromise = null
    })
    this.probePromise = task
    return task
  }

  /** 兼容旧调用名；一次调用只执行一轮探测。 */
  testStatus() {
    return this.startProbe()
  }

  /** @returns {Promise<boolean>} */
  async runProbe(generation = this.probeGeneration, signal = undefined) {
    this.logger.mark(chalk.yellow('正在测试API链接...'))
    try {
      const data = await this.requestStatus(signal)
      if (this.disposed || generation !== this.probeGeneration) return false
      if (!this.validateApiVersion(data?.version)) {
        if (this.state === 'unavailable') this.scheduleRetrySafely()
        return false
      }

      this.state = 'available'
      this.error = null
      this.openPhiPluginApi = true
      this.retryIndex = 0
      this.cancelRetry()
      this.logger.mark(chalk.green(`API地址测试成功！${data?.id || 'phi-plugin-api'} ${data.version}`))

      // 身份恢复和周期同步属于在线能力初始化，不阻塞启动探测与首个请求。
      void this.startRecovery(generation)
      return true
    } catch (error) {
      if (this.disposed || generation !== this.probeGeneration) return false
      const classified = classifyApiConnectionError(error)
      this.state = 'unavailable'
      this.openPhiPluginApi = false
      this.error = classified
      this.logger.error(`[phi-plugin] API连接检测失败：${classified.code}`)
      this.scheduleRetrySafely()
      return false
    }
  }

  /**
   * 在线能力恢复只允许一个任务运行；探测成功后自动拉起身份、同步与别名服务。
   * @param {number} generation
   * @returns {Promise<void>}
   */
  startRecovery(generation = this.probeGeneration) {
    if (this.recoveryPromise) {
      if (this.recoveryGeneration === generation) return this.recoveryPromise
      return this.recoveryPromise.then(() => {
        if (this.disposed || generation !== this.probeGeneration) return
        return this.startRecovery(generation)
      })
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null
    this.recoveryGeneration = generation
    this.recoveryAbortController = controller
    const task = Promise.resolve()
      .then(() => (this.disposed || generation !== this.probeGeneration)
        ? false
        : this.recoverOnlineServices(controller?.signal))
      .catch(error => {
        if (this.disposed || controller?.signal.aborted) return
        this.logger[isFatalBotIdentityError(error) ? 'error' : 'warn'](
          `[phi-plugin] API已恢复，但Bot身份恢复失败：${error?.code || getPhiApiUserMessage(error)}`
        )
      })
      .finally(() => {
        if (this.recoveryAbortController === controller) this.recoveryAbortController = null
        if (this.recoveryPromise === task) {
          this.recoveryPromise = null
          this.recoveryGeneration = 0
        }
      })
    this.recoveryPromise = task
    return task
  }

  /**
   * API 请求遇到连接错误后进入不可用状态并安排后台重试。
   * @param {any} [error]
   */
  seekApi(error = undefined) {
    if (this.disposed || !this.isConfigured() || this.isVersionBlocked()) {
      this.openPhiPluginApi = false
      this.cancelRetry()
      return
    }
    if (error) {
      this.state = 'unavailable'
      this.openPhiPluginApi = false
      this.error = classifyApiConnectionError(error)
    }
    this.scheduleRetrySafely()
  }

  /** 安排重试但不让定时器错误影响调用方。 */
  scheduleRetrySafely() {
    try {
      this.scheduleRetry()
    } catch (scheduleError) {
      this.logger.error('[phi-plugin] 安排 API 重试失败', scheduleError)
    }
  }

  /** 按 30s、60s、120s、300s 的指数退避安排下一次探测。 */
  scheduleRetry() {
    if (this.retryTimer || this.disposed || !this.isConfigured() || this.isVersionBlocked()) return
    const delay = API_RETRY_DELAYS[Math.min(this.retryIndex, API_RETRY_DELAYS.length - 1)]
    this.logger.mark(chalk.red(`${this.getUnavailableMessage()} 插件将在${delay / 1000}秒后重试`))

    // 在调度前先登记，确保即使测试时钟同步触发回调也只存在一个重试循环。
    const retryRegistration = { active: true, cancel: null }
    this.retryTimer = retryRegistration
    try {
      retryRegistration.cancel = this.scheduleTimer(() => {
        if (!retryRegistration.active) return
        retryRegistration.active = false
        if (this.retryTimer === retryRegistration) this.retryTimer = null
        void this.startProbe()
      }, delay)
      this.retryIndex += 1
    } catch (error) {
      retryRegistration.active = false
      if (this.retryTimer === retryRegistration) this.retryTimer = null
      throw error
    }
    if (!retryRegistration.active) cancelTimer(retryRegistration.cancel)
  }

  /** 使用 Context 生命周期定时器；测试可注入自己的时钟。 */
  scheduleTimer(callback, delay) {
    if (this.options.schedule) return this.options.schedule(callback, delay)
    if (this.ctx?.setTimeout) return this.ctx.setTimeout(callback, delay)
    return setTimeout(callback, delay)
  }

  cancelRetry() {
    const retryRegistration = this.retryTimer
    this.retryTimer = null
    if (!retryRegistration) return
    retryRegistration.active = false
    cancelTimer(retryRegistration.cancel)
  }

  /** 恢复 Bot 身份、周期同步与别名快照；热重载后停止后续步骤。 */
  async recoverServices(signal = undefined) {
    const throwIfAborted = () => {
      if (signal?.aborted) throw signal.reason ?? new Error('API recovery aborted')
    }
    throwIfAborted()
    const identity = await botApiAuth.recoverAfterReconnect(Version.ver, signal)
    throwIfAborted()
    this.logger.mark(chalk.green(`API Bot身份已就绪：${identity.clientId}`))
    const { default: botSyncService } = require('./bot-sync-service.ts')
    await botSyncService.recoverAfterReconnect(signal)
    throwIfAborted()
    const { default: aliasProposalService } = require('./alias-proposal-service.ts')
    await aliasProposalService.initialize(signal)
  }

  /** 返回面向用户的状态提示。 */
  getUnavailableMessage() {
    if (!this.isConfigured()) return getPhiApiUserMessage({ code: 'api_disabled' })
    if (this.state === 'incompatible') {
      return getPhiApiUserMessage(this.error ?? { code: 'api_version_incompatible' })
    }
    if (this.error) return getPhiApiUserMessage(this.error)
    if (this.state === 'probing') return 'Online API 仍在探测中，请稍后重试。'
    return 'Online API 暂时不可用，请稍后重试。'
  }

  /** 停止探测、重试定时器并解除 Context 生命周期绑定。 */
  dispose() {
    if (this.disposed || this.disposing) return
    this.disposing = true
    this.disposed = true
    this.started = false
    this.probeGeneration += 1
    this.probePromise = null

    const recoveryController = this.recoveryAbortController
    this.recoveryAbortController = null
    if (recoveryController) recoveryController.abort()
    const controller = this.abortController
    this.abortController = null
    if (controller) controller.abort()
    for (const finish of [...this.probeWaiters]) finish(false)
    this.probeWaiters.clear()

    this.state = 'idle'
    this.openPhiPluginApi = false
    this.remoteApiVersion = ''
    this.versionWarning = ''
    this.error = null
    this.retryIndex = 0
    this.cancelRetry()
    setApiVersionBlocked(false)
    const ctxDispose = this.ctxDispose
    this.ctxDispose = null
    this.ctx = null
    if (ctxDispose) {
      try { ctxDispose() } catch {}
    }
    this.disposing = false
  }
}

export default new AutoSeekApi();
