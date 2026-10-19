// @ts-nocheck
import platform from '../platform/index'

export default {
    /**
     * @param {import('../platform/types').PlatformUserId} userId
     * @param {import('../platform/types').PlatformMessageInput} msg
     * @param {import('../platform/types').PlatformUserId} [botId]
     */
    relpyPrivate(userId, msg, botId) {
        if (platform.relpyPrivate) return platform.relpyPrivate(userId, msg, botId)
        return false
    },

    /**
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return platform.sleep(ms)
    },

    /**
     * @param {string} url
     * @param {string} file
     * @param {unknown} [opts]
     */
    downFile(url, file, opts) {
        return platform.downFile(url, file, opts)
    },

    /**
     * @param {string} dirname
     * @returns {boolean}
     */
    mkdirs(dirname) {
        return platform.mkdirs(dirname)
    },

    /**
     * @param {import('../platform/types').PlatformEvent} e
     * @param {import('../platform/types').PlatformMessageInput[]} [msg]
     * @param {string} [dec]
     */
    makeForwardMsg(e, msg = [], dec) {
        return platform.makeForwardMsg(e, msg, dec)
    },
}
