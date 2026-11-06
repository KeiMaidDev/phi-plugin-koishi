// @ts-nocheck
import path from 'path'
import { PHI_DATA_NAME } from '../constants'

const runtime = globalThis as any
const defaultBasePath = process.cwd()
const bundleDir = typeof __dirname === 'string' ? __dirname : defaultBasePath

/** 当前 Koishi 实例根目录。 */
export let basePath = path.resolve(runtime.__PHI_BASE_DIR || defaultBasePath)
/** 可迁移的持久化数据目录。 */
export let dataPath = path.resolve(runtime.__PHI_DATA_ROOT || path.join(basePath, 'data', PHI_DATA_NAME))
/** 可删除、无需迁移的缓存目录。 */
export let cachePath = path.resolve(runtime.__PHI_CACHE_ROOT || path.join(basePath, 'cache', PHI_DATA_NAME))
/** 下次启动即失效的临时目录。 */
export let tempPath = path.resolve(runtime.__PHI_TEMP_ROOT || path.join(basePath, 'temp', PHI_DATA_NAME))

/** 插件包根目录只用于读取随包发布的只读资源。 */
export const pluginRoot = runtime.__PHI_PLUGIN_ROOT || (path.basename(bundleDir) === 'lib'
    ? path.resolve(bundleDir, '..')
    : path.resolve(bundleDir, '../..'))
/** 插件名。 */
export const pluginName = path.basename(pluginRoot)
/** 插件资源目录。 */
export const pluginResources = path.join(pluginRoot, 'assets')

/** 曲绘资源、曲目信息路径。 */
export const infoPath = path.join(pluginResources, 'info')
/** 额外曲目名称信息（开字母用）。 */
export const DlcInfoPath = path.join(pluginResources, 'info', 'DLC')
/** 上个版本曲目信息。 */
export const oldInfoPath = path.join(pluginResources, 'info', 'oldInfo')
/** 用户娱乐数据路径。 */
export let pluginDataPath = path.join(dataPath, 'pluginData')
/** 用户存档数据路径。 */
export let savePath = path.join(dataPath, 'saveData')
/** API 用户存档数据路径。 */
export let apiSavePath = path.join(dataPath, 'apiSaveData')
/** 用户设置路径。 */
export let configPath = path.join(dataPath, 'config')
/** 默认图片路径。 */
export const imgPath = path.join(pluginResources, 'html', 'otherimg')
/** 用户图片路径。 */
export const ortherIllPath = path.join(pluginResources, 'otherill')
/** 原画资源。 */
export let originalIllPath = path.join(dataPath, 'original_ill')
/** 备份路径。 */
export let backupPath = path.join(dataPath, 'backup')

/**
 * 在导入依赖路径常量的模块之前绑定实例目录。路径导出使用 live binding，
 * 因此热重载或测试重绑定时后续读取会得到新目录。
 * @param {string} baseDir
 * @param {{data?:string,cache?:string,temp?:string}} [overrides]
 */
export function configureStorage(baseDir, overrides = {}) {
    basePath = path.resolve(baseDir)
    dataPath = path.resolve(overrides.data || path.join(basePath, 'data', PHI_DATA_NAME))
    cachePath = path.resolve(overrides.cache || path.join(basePath, 'cache', PHI_DATA_NAME))
    tempPath = path.resolve(overrides.temp || path.join(basePath, 'temp', PHI_DATA_NAME))
    pluginDataPath = path.join(dataPath, 'pluginData')
    savePath = path.join(dataPath, 'saveData')
    apiSavePath = path.join(dataPath, 'apiSaveData')
    configPath = path.join(dataPath, 'config')
    originalIllPath = path.join(dataPath, 'original_ill')
    backupPath = path.join(dataPath, 'backup')
    runtime.__PHI_BASE_DIR = basePath
    runtime.__PHI_DATA_ROOT = dataPath
    runtime.__PHI_CACHE_ROOT = cachePath
    runtime.__PHI_TEMP_ROOT = tempPath
    return { basePath, dataPath, cachePath, tempPath }
}

/**
 * 判断 target 是否位于 root 内，包含 root 本身。
 * @param {string} root
 * @param {string} target
 */
export function isPathInside(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target))
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

/**
 * 返回已解析的实例存储路径；实例包目录、cwd 顶层等位置一律拒绝写入。
 * @param {string} target
 */
export function assertStoragePath(target) {
    const resolved = path.resolve(String(target))
    if (isPathInside(dataPath, resolved) || isPathInside(cachePath, resolved) || isPathInside(tempPath, resolved)) {
        return resolved
    }
    throw new Error(`[phi-plugin] 拒绝写入实例存储目录之外的路径：${resolved}`)
}
