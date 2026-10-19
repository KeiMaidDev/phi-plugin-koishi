// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { dataPath, pluginResources } from '../../utils/path'

/** 运行时可写主题目录；插件包内的主题目录只读。 */
export const themesDir = path.join(dataPath, 'themes')
/** 随插件发布的只读内置主题目录。 */
export const bundledThemesDir = path.join(pluginResources, 'themes')

const legacyThemeDirs = [
    bundledThemesDir,
    path.join(pluginResources, 'html', 'b19', 'res', 'themes'),
    path.join(pluginResources, 'html', 'b19', 'themes'),
]
export const BUNDLED_THEME_IDS = new Set(['milthm'])
const THEME_ID_RE = /^[a-zA-Z0-9_-]+$/
const RESERVED_IDS = new Set(['default', 'snow', 'star', 'dss2', 'topText', 'foolsDay', 'milthm'])

/** @param {string} source */
function readThemeId(source) {
    try {
        const info = YAML.parse(fs.readFileSync(path.join(source, 'info.yaml'), 'utf8'))
        return typeof info?.id === 'string' ? info.id : ''
    } catch {
        return ''
    }
}

/**
 * Copy writable legacy themes into the instance data directory. Bundled themes
 * stay in the package and are never moved or rewritten.
 * @returns {{from:string,to:string}[]}
 */
export function migrateLegacyThemeDirectories() {
    fs.mkdirSync(themesDir, { recursive: true, mode: 0o700 })
    const marker = path.join(dataPath, '.themes-migrated-v1')
    if (fs.existsSync(marker)) return []
    /** @type {{from:string,to:string}[]} */
    const migrated = []
    for (const root of legacyThemeDirs) {
        if (!fs.existsSync(root)) continue
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.phi-market-')) continue
            const source = path.join(root, entry.name)
            const id = readThemeId(source)
            if (!THEME_ID_RE.test(id) || RESERVED_IDS.has(id)) continue
            if (root === bundledThemesDir && BUNDLED_THEME_IDS.has(id)) continue
            const destination = path.join(themesDir, id)
            if (path.resolve(source) === path.resolve(destination) || fs.existsSync(destination)) continue
            const staging = path.join(themesDir, '.phi-theme-migrate-' + process.pid + '-' + Date.now())
            try {
                fs.cpSync(source, staging, { recursive: true, errorOnExist: true, force: false })
                fs.renameSync(staging, destination)
                migrated.push({ from: source, to: destination })
            } finally {
                if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
            }
        }
    }
    fs.writeFileSync(marker, new Date().toISOString(), { encoding: 'utf8', mode: 0o600 })
    return migrated
}
