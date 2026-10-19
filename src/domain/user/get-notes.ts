// @ts-nocheck
import PluginData from './plugin-data'

function getStore() {
    const store = globalThis.__PHI_NOTES_STORE
    if (!store) throw new Error('Phi notes store is not initialized')
    return store
}

function toUid(userId) {
    const uid = Number(userId)
    if (!Number.isSafeInteger(uid) || uid < 0) throw new Error(`Unsupported Phi user id: ${userId}`)
    return uid
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
