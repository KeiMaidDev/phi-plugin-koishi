import fs from 'node:fs'
import path from 'node:path'
import { configPath } from '../utils/path'
import fileWatcherRegistry from '../utils/file-watcher-registry'
import logger from '../utils/logger'

export type AliasMap = Record<string, string[]>
export type SongData = Record<string, any>
export type SongMap = Record<string, SongData>

/** 内置别名数据；首次启动时写入 aliases.json。 */
export const DEFAULT_ALIASES: AliasMap = {
  'AM': [
    "AnotherMe.DAAN.0",
    "AnotherMe.NeutralMoon.0"
  ]
}

/** 内置额外曲目；首次启动时写入 songs.json。 */
export const DEFAULT_SONGS: SongMap = {
  "今年も「雪降り、メリクリ」目指して頑張ります！！": {
    "id": "今年も「雪降り、メリクリ」目指して頑張ります！！",
    "song": "今年も「雪降り、メリクリ」目指して頑張ります！！",
    "illustration": "雪降SP.png",
    "illustration_big": "雪降SP.png",
    "chapter": "SP",
    "bpm": "156~234",
    "composer": "AiSS vs. 华牧狸 w/ 夜轮 ft.結月ゆかり",
    "length": "3:45",
    "illustrator": "Vios.NoFurry.git",
    "spinfo": "本曲目已于 v2.5.1 版本后移除\n愚人节在 雪降り、メリクリ 谱面中难度会变为 26℃\n点击难度后出现空调控制器，切换制冷模式后调整为0℃进入SP谱面\n（在制热模式下调整为40℃将强制退出谱面）",
    "can_t_be_guessill": false,
    "can_t_be_letter": false,
    "chart": {
      "IN": {
        "level": "?",
        "difficulty": "|2",
        "combo": "2500",
        "charter": "今年も「NerSANTA」「BarbarianerSLEDGE」と遊ぼう！！\\\\リンコ*198食べ放題//"
      },
      "lN": {
        "rgba": "0, 0, 0, 1",
        "level": "?",
        "difficulty": "0℃",
        "combo": "2500",
        "charter": "今年も「NerSANTA」「BarbarianerSLEDGE」と遊ぼう！！\\\\リンコ*198食べ放題//"
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 运行时业务数据存储。插件设置由 Koishi Config 管理，这里只保存可变的别名与额外曲目。
 */
export class BusinessDataStore {
  private aliases: AliasMap = {}
  private songs: SongMap = {}
  private leases: Array<{ close(): Promise<void> }> = []

  async init() {
    fs.mkdirSync(configPath, { recursive: true })
    this.aliases = this.readOrSeed('aliases.json', DEFAULT_ALIASES, (value) => {
      if (!isRecord(value) || Object.values(value).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string'))) {
        throw new TypeError('aliases.json 必须是别名字符串到曲目 ID 数组的映射')
      }
      return clone(value) as AliasMap
    })
    this.songs = this.readOrSeed('songs.json', DEFAULT_SONGS, (value) => {
      if (!isRecord(value) || Object.values(value).some(song => !isRecord(song))) {
        throw new TypeError('songs.json 必须是曲目 ID 到曲目对象的映射')
      }
      return this.normalizeSongs(clone(value) as SongMap)
    })
    this.songs = this.normalizeSongs(this.songs)

    this.watch('aliases', 'aliases.json', () => {
      try {
        const value = this.readJSON('aliases.json')
        if (!isRecord(value) || Object.values(value).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string'))) {
          throw new TypeError('aliases.json 必须是别名字符串到曲目 ID 数组的映射')
        }
        this.aliases = value as AliasMap
      } catch (error) {
        (logger as any).error('[phi-plugin] aliases.json 读取失败，继续使用上一版数据：%o', error)
      }
    })
    this.watch('songs', 'songs.json', () => {
      try {
        const value = this.readJSON('songs.json')
        if (!isRecord(value) || Object.values(value).some(song => !isRecord(song))) {
          throw new TypeError('songs.json 必须是曲目 ID 到曲目对象的映射')
        }
        this.songs = this.normalizeSongs(value as SongMap)
      } catch (error) {
        (logger as any).error('[phi-plugin] songs.json 读取失败，继续使用上一版数据：%o', error)
      }
    })
  }

  getAliases(): AliasMap {
    return this.aliases
  }

  getSongs(): SongMap {
    return this.songs
  }

  async setAlias(alias: string, ids: string[]) {
    this.aliases = { ...this.aliases, [alias]: [...ids] }
    this.writeJSON('aliases.json', this.aliases)
  }

  async addAlias(alias: string, songId: string) {
    const ids = this.aliases[alias] || []
    if (ids.includes(songId)) return
    await this.setAlias(alias, [...ids, songId])
  }

  async close() {
    const leases = this.leases.splice(0)
    await Promise.allSettled(leases.map((lease) => lease.close()))
  }

  private watch(key: string, file: string, onChange: () => void) {
    const lease = fileWatcherRegistry.watch(
      'business-data:' + key,
      path.join(configPath, file),
      onChange,
      ['change', 'add'],
      { ignoreInitial: true },
    )
    this.leases.push(lease)
  }

  private readOrSeed<T>(file: string, seed: T, validate: (value: unknown) => T): T {
    const target = path.join(configPath, file)
    if (!fs.existsSync(target)) {
      this.writeJSON(file, seed)
      return clone(seed)
    }
    try {
      return validate(this.readJSON(file))
    } catch (error) {
      (logger as any).error('[phi-plugin] %s 读取失败，使用内置默认值：%o', file, error)
      return clone(seed)
    }
  }

  private normalizeSongs(songs: SongMap): SongMap {
    for (const song of Object.values(songs)) song.sp_vis = true
    return songs
  }

  private readJSON(file: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(configPath, file), 'utf8'))
  }

  private writeJSON(file: string, value: unknown) {
    const target = path.join(configPath, file)
    const temp = target + '.' + process.pid + '.' + Date.now() + '.tmp'
    try {
      fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
      fs.renameSync(temp, target)
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
    }
  }
}
