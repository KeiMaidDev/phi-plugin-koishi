// @ts-nocheck
import platform from '../platform/index'

const logger = /** @type {import('../platform/types').PlatformLogger} */ (new Proxy({}, {
    get(_target, prop) {
        if (typeof prop === 'symbol') return undefined
        const value = platform.logger?.[prop]
        return typeof value === 'function' ? value.bind(platform.logger) : value
    },
}))

export default logger
