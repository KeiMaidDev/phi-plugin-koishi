// @ts-nocheck
import ApiSaveCacheRepository from '../../save/get-save-from-api'
import LocalSaveRepository from '../../save/get-save'

const SESSION_PREFIX = 'session:'
const API_PREFIX = 'api:'

/**
 * 统一 GRKS 题目来源标识，避免 sessionToken 与 API ID 的读取路径和命名冲突。
 * @param {'session' | 'api'} kind
 * @param {string | number} id
 * @returns {string}
 */
function sourceId(kind, id) {
    const value = String(id ?? '').trim()
    return value ? `${kind}:${value}` : ''
}

/** @param {string | number} token @returns {string} */
export function sessionSourceId(token) {
    return sourceId('session', token)
}

/** @param {string | number} apiId @returns {string} */
export function apiSourceId(apiId) {
    return sourceId('api', apiId)
}

/**
 * 解析统一来源标识。
 * @param {string | null | undefined} value
 * @returns {{kind: 'session' | 'api', id: string} | null}
 */
export function parseSourceId(value) {
    const raw = String(value ?? '')
    if (raw.startsWith(SESSION_PREFIX)) {
        const id = raw.slice(SESSION_PREFIX.length)
        return id ? { kind: 'session', id } : null
    }
    if (raw.startsWith(API_PREFIX)) {
        const id = raw.slice(API_PREFIX.length)
        return id ? { kind: 'api', id } : null
    }
    return null
}

/**
 * 当前本地绑定优先使用 sessionToken，其次使用 API ID。
 * @param {{sessionToken?: string | null, apiId?: string | number | null}} [credentials]
 * @returns {string | undefined}
 */
export function preferredSourceId(credentials = {}) {
    if (credentials.sessionToken) return sessionSourceId(credentials.sessionToken)
    if (credentials.apiId) return apiSourceId(credentials.apiId)
    return undefined
}

/**
 * 按来源标识读取已初始化的存档。
 * @param {string} value
 * @param {{session: (token: string) => Promise<any>, api: (apiId: string) => Promise<any>}} [repositories]
 * @returns {Promise<any | undefined>}
 */
export async function getSaveBySourceId(value, repositories = {
    session: token => LocalSaveRepository.getSaveBySessionToken(token),
    api: apiId => ApiSaveCacheRepository.getSaveByApiId(apiId),
}) {
    const source = parseSourceId(value)
    if (!source) return undefined
    return repositories[source.kind](source.id)
}
