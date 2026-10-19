// @ts-nocheck
import path from 'path'

/**宿主进程根目录 */
export const _path = process.cwd()

const runtime = globalThis as any
const bundleDir = typeof __dirname === 'string' ? __dirname : process.cwd()
/**插件根目录 */
export const pluginRoot = runtime.__PHI_PLUGIN_ROOT || (path.basename(bundleDir) === 'lib' ? path.resolve(bundleDir, '..') : path.resolve(bundleDir, '../..'))
/**插件名 */
export const pluginName = path.basename(pluginRoot)
/**数据路径 */
export const dataPath = runtime.__PHI_DATA_ROOT || path.join(process.cwd(), 'data', pluginName)
/**插件临时文件目录 */
export const tempPath = path.join(dataPath, 'temp')
/**插件资源目录 */
export const pluginResources = path.join(pluginRoot, 'assets')

/**曲绘资源、曲目信息路径 */
export const infoPath = path.join(pluginResources, 'info')

/**额外曲目名称信息（开字母用） */
export const DlcInfoPath = path.join(pluginResources, 'info', 'DLC')

/**上个版本曲目信息 */
export const oldInfoPath = path.join(pluginResources, 'info', 'oldInfo')

/**用户娱乐数据路径 */
export const pluginDataPath = path.join(dataPath, 'pluginData')

/**用户存档数据路径 */
export const savePath = path.join(dataPath, 'saveData')

/**API用户存档数据路径 */
export const apiSavePath = path.join(dataPath, 'apiSaveData')

/**用户设置路径 */
export const configPath = path.join(dataPath, 'config')

/**默认图片路径 */
export const imgPath = path.join(pluginResources, 'html', 'otherimg')

/**用户图片路径 */
export const ortherIllPath = path.join(pluginResources, 'otherill')

/**原画资源 */
export const originalIllPath = path.join(dataPath, 'original_ill')

/**备份路径 */
export const backupPath = path.join(dataPath, 'backup')


