// @ts-nocheck
import { createHash } from 'node:crypto'
import PluginData from './plugin-data'

const HASHED_UID_BASE = 2 ** 52
const HASHED_UID_RANGE = 2 ** 52
const HASH_PREFIX = 'phi-plugin:user:'

function getStore() {
    const store = globalThis.__PHI_NOTES_STORE
    if (!store) throw new Error('Phi notes store is not initialized')
    return store
}

/**
 * 数字平台 ID 保持原值以兼容既有数据；其余平台 ID 映射到高位安全整数区间，
 * 避免与正常数字用户 ID 冲突，同时满足 phi_user / monetary 的数字主键约束。
 */
function toUid(userId) {
    if (userId === undefined || userId === null) throw new Error(`Unsupported Phi user id: ${userId}`)
    const raw = String(userId).trim()
    if (!raw) throw new Error(`Unsupported Phi user id: ${userId}`)

    if (/^\d+$/.test(raw)) {
        const numericUid = Number(raw)
        if (Number.isSafeInteger(numericUid) && numericUid < HASHED_UID_BASE) return numericUid
    }

    const digest = createHash('sha256').update(HASH_PREFIX + raw).digest('hex')
    return HASHED_UID_BASE + Number.parseInt(digest.slice(0, 13), 16) % HASHED_UID_RANGE
}

export default class getNotes {
    static async getNotesData(userId) {
        return new PluginData(await getStore().get(toUid(userId)))
    }

    static putNotesData(userId, data) {
        return getStore().put(toUid(userId), data)
    }

    static delNotesData(userId) {
        return getStore().delete(toUid(userId))
    }
}
