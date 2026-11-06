// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { cachePath } from '../../utils/path'
import logger from '../../utils/logger'
import botApiAuth from './bot-api-auth'

const unzip = promisify(gunzip)
export const AVG_SNAPSHOT_MAX_AGE_MS = 48 * 3600_000
export const AVG_SNAPSHOT_MAX_FILE_BYTES = 64 * 1024 ** 2
export const AVG_SNAPSHOT_MAX_DECOMPRESSED_BYTES = 256 * 1024 ** 2
export const AVG_SNAPSHOT_FUTURE_GRACE_MS = 60_000
export type AvgSnapshotDimension = 'all' | 'b30'
export const AVG_SNAPSHOT_DIMENSIONS: readonly AvgSnapshotDimension[] = ['all', 'b30']
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/i

export interface AvgSnapshotFile {
  bytes: number
  sha256: string
}

export interface AvgSnapshotManifest {
  format: 1
  version: string
  generatedAt: string
  files: Record<AvgSnapshotDimension, AvgSnapshotFile>
}

export type AvgSnapshotGroups = Record<string, Record<string, Record<string, [number, number]>>>
export interface AvgSnapshotCache {
  manifest: AvgSnapshotManifest
  data: Record<AvgSnapshotDimension, AvgSnapshotGroups>
}

export interface AvgSnapshotServiceOptions {
  cacheFile?: string
  now?: () => number
  schedule?: (callback: () => void, delay: number) => any
  wait?: (delay: number, signal?: AbortSignal) => Promise<void>
  download?: (route: string, maxBytes: number, signal?: AbortSignal) => Promise<Buffer>
  logger?: Pick<Console, 'warn'>
}

function cancelTimer(timer: any) {
  if (timer == null) return
  if (typeof timer === 'function') timer()
  else clearTimeout(timer)
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function validateAvgSnapshotManifest(value: unknown, now = Date.now()): AvgSnapshotManifest {
  if (!isRecord(value) || value.format !== 1) throw new Error('均值快照清单格式不受支持')
  if (typeof value.version !== 'string' || !UUID_V4.test(value.version)) throw new Error('均值快照 UUID 无效')
  const generatedAt = typeof value.generatedAt === 'string' ? Date.parse(value.generatedAt) : Number.NaN
  if (!Number.isFinite(generatedAt)) throw new Error('均值快照生成时间无效')
  if (generatedAt > now + AVG_SNAPSHOT_FUTURE_GRACE_MS) throw new Error('均值快照生成时间超过允许的未来窗口')
  if (now - generatedAt >= AVG_SNAPSHOT_MAX_AGE_MS) throw new Error('均值快照已过期')
  if (!isRecord(value.files)) throw new Error('均值快照文件清单无效')
  for (const dimension of AVG_SNAPSHOT_DIMENSIONS) {
    const file = value.files[dimension]
    if (!isRecord(file)
      || !Number.isSafeInteger(file.bytes)
      || file.bytes <= 0
      || file.bytes > AVG_SNAPSHOT_MAX_FILE_BYTES
      || typeof file.sha256 !== 'string'
      || !SHA256.test(file.sha256)) {
      throw new Error(`均值快照 ${dimension} 文件描述无效`)
    }
  }
  return {
    format: 1,
    version: value.version.toLowerCase(),
    generatedAt: new Date(generatedAt).toISOString(),
    files: {
      all: { bytes: value.files.all.bytes, sha256: value.files.all.sha256.toLowerCase() },
      b30: { bytes: value.files.b30.bytes, sha256: value.files.b30.sha256.toLowerCase() },
    },
  }
}

export async function decodeAvgSnapshotDimension(bytes: Buffer, file: AvgSnapshotFile): Promise<AvgSnapshotGroups> {
  if (!Buffer.isBuffer(bytes) || bytes.length !== file.bytes) throw new Error('均值快照文件大小不符')
  if (hash(bytes) !== file.sha256.toLowerCase()) throw new Error('均值快照文件哈希不符')
  let decoded: Buffer
  try {
    decoded = await unzip(bytes, { maxOutputLength: AVG_SNAPSHOT_MAX_DECOMPRESSED_BYTES })
  } catch {
    throw new Error('均值快照压缩数据无效或解压后过大')
  }
  if (decoded.length > AVG_SNAPSHOT_MAX_DECOMPRESSED_BYTES) throw new Error('均值快照解压后超过大小限制')
  let groups: unknown
  try {
    groups = JSON.parse(decoded.toString('utf8'))
  } catch {
    throw new Error('均值快照 JSON 无效')
  }
  if (!isRecord(groups)) throw new Error('均值快照区间无效')
  for (const [key, songs] of Object.entries(groups)) {
    if (!/^\d+,\d+$/.test(key) || !isRecord(songs)) throw new Error('均值快照区间无效')
    for (const ranks of Object.values(songs)) {
      if (!isRecord(ranks)) throw new Error('均值快照曲目记录无效')
      for (const [rank, pair] of Object.entries(ranks)) {
        if (!['EZ', 'HD', 'IN', 'AT'].includes(rank)
          || !Array.isArray(pair)
          || pair.length !== 2
          || !Number.isFinite(pair[0])
          || !Number.isSafeInteger(pair[1])
          || pair[1] <= 0) {
          throw new Error('均值快照统计值无效')
        }
      }
    }
  }
  return groups as AvgSnapshotGroups
}

export function encodeAvgSnapshotBundle(manifest: AvgSnapshotManifest, all: Buffer, b30: Buffer) {
  return Buffer.concat([Buffer.from(`${JSON.stringify(manifest)}\n`), all, b30])
}

export async function readAvgSnapshotBundle(bytes: Buffer, now = Date.now()): Promise<AvgSnapshotCache | undefined> {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('均值快照缓存为空')
  const headerEnd = bytes.indexOf(10)
  if (headerEnd < 0 || headerEnd > 2048) throw new Error('均值快照缓存头无效')
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.subarray(0, headerEnd).toString('utf8'))
  } catch {
    throw new Error('均值快照缓存清单无效')
  }
  const manifest = validateAvgSnapshotManifest(parsed, now)
  const allStart = headerEnd + 1
  const allEnd = allStart + manifest.files.all.bytes
  if (allEnd + manifest.files.b30.bytes !== bytes.length) throw new Error('均值快照缓存长度不符')
  const all = await decodeAvgSnapshotDimension(bytes.subarray(allStart, allEnd), manifest.files.all)
  const b30 = await decodeAvgSnapshotDimension(bytes.subarray(allEnd), manifest.files.b30)
  return { manifest, data: { all, b30 } }
}

/** 从 floor(minRks/0.005),floor(maxRks/0.005) 精确取区间桶。 */
export function lookupAvgGroups(
  groups: AvgSnapshotGroups | undefined,
  minRksOrRange: number | { minRks: number; maxRks: number },
  maxRks?: number,
) {
  const minRks = typeof minRksOrRange === 'object' ? minRksOrRange.minRks : minRksOrRange
  const max = typeof minRksOrRange === 'object' ? minRksOrRange.maxRks : maxRks
  if (!groups || !Number.isFinite(minRks) || !Number.isFinite(max)) return undefined
  return groups[`${Math.floor(minRks / 0.005)},${Math.floor(max / 0.005)}`]
}

export function lookupAvgValue(
  groups: AvgSnapshotGroups | undefined,
  range: { minRks: number; maxRks: number },
  songId: string,
  rank: string,
) {
  const pair = lookupAvgGroups(groups, range.minRks, range.maxRks)?.[songId]?.[rank]
  return pair ? { accAvg: pair[0], count: pair[1] } : undefined
}

async function atomicReplace(target: string, bytes: Buffer) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, bytes)
    try {
      await fs.rename(temp, target)
    } catch (error: any) {
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(String(error?.code))) throw error
      const backup = `${target}.${randomUUID()}.bak`
      let moved = false
      try {
        await fs.rename(target, backup)
        moved = true
        await fs.rename(temp, target)
        await fs.rm(backup, { force: true })
      } catch (replaceError) {
        if (moved) await fs.rename(backup, target).catch(() => undefined)
        throw replaceError
      }
    }
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined)
  }
}

export class AvgSnapshotService {
  cacheFile: string
  now: () => number
  wait: (delay: number, signal?: AbortSignal) => Promise<void>
  download: (route: string, maxBytes: number, signal?: AbortSignal) => Promise<Buffer>
  logger: Pick<Console, 'warn'>
  current?: AvgSnapshotCache
  restored?: Promise<void>
  refreshPromise?: Promise<boolean>
  failures = 0
  retryAt = 0
  controller?: AbortController
  scheduledTimers = new Set<any>()

  constructor(options: AvgSnapshotServiceOptions = {}) {
    this.cacheFile = options.cacheFile || path.join(cachePath, 'avgSnapshot.bin')
    this.now = options.now || Date.now
    this.logger = options.logger || logger
    this.download = options.download || ((route, maxBytes, signal) =>
      botApiAuth.signedDownload(route, { maxBytes, timeout: 120_000, signal }))
    if (options.wait) this.wait = options.wait
    else {
      this.wait = (delay, signal) => new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
        const timer = setTimeout(() => {
          this.scheduledTimers.delete(timer)
          signal?.removeEventListener('abort', abort)
          resolve()
        }, Math.max(0, delay))
        timer.unref?.()
        this.scheduledTimers.add(timer)
        const abort = () => {
          cancelTimer(timer)
          this.scheduledTimers.delete(timer)
          reject(signal?.reason ?? new Error('aborted'))
        }
        signal?.addEventListener('abort', abort, { once: true })
      })
    }
  }

  configure(ctx?: any) {
    this.dispose()
    this.controller = new AbortController()
    if (ctx?.on) ctx.on('dispose', () => this.dispose())
  }

  dispose() {
    this.controller?.abort()
    this.controller = undefined
    for (const timer of this.scheduledTimers) cancelTimer(timer)
    this.scheduledTimers.clear()
    this.refreshPromise = undefined
    this.restored = undefined
  }

  async local(): Promise<Record<AvgSnapshotDimension, AvgSnapshotGroups> | undefined> {
    await (this.restored ??= this.restore())
    if (!this.current) return undefined
    if (this.now() - Date.parse(this.current.manifest.generatedAt) >= AVG_SNAPSHOT_MAX_AGE_MS) return undefined
    return this.current.data
  }

  async restore() {
    try {
      const bytes = await fs.readFile(this.cacheFile)
      this.current = await readAvgSnapshotBundle(bytes, this.now())
    } catch (error: any) {
      if (error?.code !== 'ENOENT') this.logger.warn('[phi-plugin] 无法加载本地均值快照', error)
    }
  }

  refresh(manifest: unknown): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise
    const task = this.refreshCoalesced(manifest)
    this.refreshPromise = task
    void task.finally(() => {
      if (this.refreshPromise === task) this.refreshPromise = undefined
    })
    return task
  }

  async refreshCoalesced(manifest: unknown): Promise<boolean> {
    await this.local()
    if (this.now() < this.retryAt) return false
    return await this.refreshOnce(manifest)
  }

  async refreshOnce(manifestInput: unknown): Promise<boolean> {
    try {
      const manifest = validateAvgSnapshotManifest(manifestInput, this.now())
      if (this.current?.manifest.version === manifest.version) return true
      const jitter = this.jitterDelay()
      if (jitter > 0) {
        if (this.controller?.signal.aborted) return false
        await this.wait(jitter, this.controller?.signal)
      }
      if (this.controller?.signal.aborted) return false
      const load = async (dimension: AvgSnapshotDimension) => {
        const file = manifest.files[dimension]
        const route = `/bot/avg-snapshots/${manifest.version}/${dimension}`
        const bytes = await this.download(route, file.bytes, this.controller?.signal)
        return { bytes, groups: await decodeAvgSnapshotDimension(bytes, file) }
      }
      const [all, b30] = await Promise.all([load('all'), load('b30')])
      if (this.controller?.signal.aborted) return false
      const bundle = encodeAvgSnapshotBundle(manifest, all.bytes, b30.bytes)
      await atomicReplace(this.cacheFile, bundle)
      this.current = { manifest, data: { all: all.groups, b30: b30.groups } }
      this.failures = 0
      this.retryAt = 0
      return true
    } catch (error) {
      if (!this.controller?.signal.aborted) {
        this.failures += 1
        this.retryAt = this.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(this.failures - 1, 6))
        this.logger.warn('[phi-plugin] 均值快照更新失败', error)
      }
      return false
    }
  }

  jitterDelay() {
    const clientId = botApiAuth.getClientId() || 'phi-plugin'
    return createHash('sha256').update(clientId).digest().readUInt32BE(0) % 60_000
  }
}

export default new AvgSnapshotService()