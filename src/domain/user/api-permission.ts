// @ts-nocheck
import autoSeekApi from '../../providers/phi-api/auto-seek-api'
import getNotes from './get-notes'
import Config from '../../services/config-store'

/** @typedef {'customTheme' | 'scoreStatistics' | 'onlineScore'} ApiCapability */

const capabilityConfigKeys = {
    customTheme: 'enableCustomThemeApi',
    scoreStatistics: 'enableScoreStatisticsApi',
    onlineScore: 'enableOnlineScoreApi',
}
const USER_API_DISABLED_MESSAGE = '你已在本地用户设置中禁用 API 功能，可在 phi myset 中重新开启。'

/** @param {ApiCapability} capability */
export function isApiCapabilityConfigured(capability) {
    return Boolean(
        Config.getUserCfg('config', 'openPhiPluginApi')
        && Config.getUserCfg('config', /** @type {configName} */ (capabilityConfigKeys[capability])) !== false
    )
}

/**
 * 等待 Online API 探测并返回不依赖用户开关的能力状态。
 * @param {ApiCapability} capability
 * @returns {Promise<boolean>}
 */
export async function isApiCapabilityAvailable(capability) {
    if (!isApiCapabilityConfigured(capability)) return false
    return autoSeekApi.waitForProbe()
}

/**
 * @param {string | number | undefined} userId
 * @returns {Promise<boolean>}
 */
export async function isUserApiEnabled(userId) {
    if (!userId) return true
    const uid = String(userId)
    const pluginData = await getNotes.getNotesData(uid)
    if (typeof pluginData.allowApiUsage !== 'boolean') {
        pluginData.allowApiUsage = true
        getNotes.putNotesData(uid, pluginData)
    }
    return pluginData.allowApiUsage !== false
}

/**
 * 取得 Online API 能力状态。需要在线能力时先等待启动探测，最多 5 秒。
 * @param {import('../../services/base-class').botEvent} e
 * @param {ApiCapability} [capability]
 */
export async function getApiAccessState(e, capability = /** @type {ApiCapability} */ ('onlineScore')) {
    const globalConfigured = Boolean(Config.getUserCfg('config', 'openPhiPluginApi'))
    const capabilityEnabled = Config.getUserCfg('config', /** @type {configName} */ (capabilityConfigKeys[capability])) !== false
    let userEnabled = true
    let onlineAvailable = autoSeekApi.state === 'available' && autoSeekApi.openPhiPluginApi
    let message = ''

    if (!globalConfigured) {
        message = 'Bot 主人已关闭查分 API。'
    } else if (!capabilityEnabled) {
        message = 'Bot 主人已关闭在线查分功能。'
    } else {
        userEnabled = capability === 'onlineScore' ? await isUserApiEnabled(e?.user_id) : true
        if (!userEnabled) {
            message = USER_API_DISABLED_MESSAGE
        } else {
            onlineAvailable = await autoSeekApi.waitForProbe()
            if (!onlineAvailable) message = autoSeekApi.getUnavailableMessage()
        }
    }

    const globalEnabled = globalConfigured && onlineAvailable
    return {
        globalEnabled,
        globalConfigured,
        capability,
        capabilityEnabled,
        userEnabled,
        onlineAvailable,
        enabled: globalEnabled && capabilityEnabled && userEnabled,
        state: autoSeekApi.state,
        warning: autoSeekApi.versionWarning,
        message,
    }
}

/**
 * @param {import('../../services/base-class').botEvent} e
 * @param {ApiCapability} [capability]
 */
export async function canUseApi(e, capability = /** @type {ApiCapability} */ ('onlineScore')) {
    return (await getApiAccessState(e, capability)).enabled
}
