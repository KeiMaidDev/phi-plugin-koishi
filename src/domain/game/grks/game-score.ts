import type { Context } from 'koishi'
import type { PhiGrksScore } from '../../../database'

export type GrksMode = 'normal' | 'match'
export type GrksRankKind = 'score' | 'winRate' | 'accuracy'
export interface GrksProfile {
  source: 'phigros'
  name: string
  avatar: string
}
export interface GrksScoreRow extends PhiGrksScore {
  userId: string
}
export interface GrksScoreOptions {
  result?: 'win' | 'loss' | 'draw'
  hints?: number
  answerTotal?: number
  answerCorrect?: number
  profile?: GrksProfile
}
export const GRKS_RANK_MIN_PLAYS = 10
export const ANONYMOUS_GRKS_PROFILE: Readonly<GrksProfile> = Object.freeze({
  source: 'phigros', name: '匿名用户', avatar: 'Introduction',
})

const queues = new Map<string, Promise<unknown>>()

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeProfile(value: unknown): GrksProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.source !== 'phigros' || typeof input.name !== 'string') return null
  const name = input.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!name) return null
  const avatar = typeof input.avatar === 'string' && input.avatar && !/[/\\:\u0000-\u001f]/.test(input.avatar)
    ? input.avatar : ANONYMOUS_GRKS_PROFILE.avatar
  return { source: 'phigros', name, avatar }
}

export function grksIdentity(event: any) {
  const platform = String(event?.platform || event?.bot?.adapter || 'koishi').trim() || 'koishi'
  const platformId = String(event?.userId ?? event?.user_id ?? '').trim()
  if (!platformId) throw new Error('无法识别 GRKS 平台用户')
  return { platform, platformId, userId: `${platform}:${platformId}` }
}

export function grksScoreKey(mode: GrksMode, identity: { platform: string; platformId: string }) {
  return `grks:${mode}:${identity.platform}:${identity.platformId}`
}

async function serialized<T>(key: string, callback: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) || Promise.resolve()
  let resolveGate!: () => void
  const gate = new Promise<void>(resolve => { resolveGate = resolve })
  const next = previous.then(() => gate, () => gate)
  queues.set(key, next)
  await previous.catch(() => undefined)
  try {
    return await callback()
  } finally {
    resolveGate()
    if (queues.get(key) === next) queues.delete(key)
  }
}

export async function addGrksScore(
  ctx: Context,
  mode: GrksMode,
  event: any,
  points: number,
  options: GrksScoreOptions = {},
): Promise<PhiGrksScore> {
  const identity = grksIdentity(event)
  const id = grksScoreKey(mode, identity)
  return serialized(id, async () => {
    const [existing] = await ctx.database.get('phi_grks_score', { id })
    const now = new Date()
    const gain = Number.isFinite(Number(points)) ? Math.max(0, round2(Number(points))) : 0
    const hints = Number(options.hints)
    const answers = Math.max(0, Math.trunc(Number(options.answerTotal) || 0))
    const correct = Math.max(0, Math.min(answers, Math.trunc(Number(options.answerCorrect) || 0)))
    const profile = options.profile ? normalizeProfile(options.profile) : normalizeProfile(existing?.profile)
    const row: PhiGrksScore = {
      id,
      gameId: 'grks',
      mode,
      platform: identity.platform,
      platformId: identity.platformId,
      score: round2((existing?.score || 0) + gain),
      best: Math.max(existing?.best || 0, gain),
      plays: (existing?.plays || 0) + 1,
      wins: existing?.wins || 0,
      losses: existing?.losses || 0,
      draws: existing?.draws || 0,
      hintSum: existing?.hintSum || 0,
      hintPlays: existing?.hintPlays || 0,
      answerTotal: existing?.answerTotal || 0,
      answerCorrect: existing?.answerCorrect || 0,
      profile,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    if (options.result === 'win') row.wins += 1
    else if (options.result === 'loss') row.losses += 1
    else if (options.result === 'draw') row.draws += 1
    if (Number.isFinite(hints) && hints >= 0) {
      row.hintSum = round2(row.hintSum + hints)
      row.hintPlays += 1
    }
    row.answerTotal += answers
    row.answerCorrect += correct
    await ctx.database.upsert('phi_grks_score', [row], ['id'])
    return row
  })
}

export async function getGrksScore(ctx: Context, mode: GrksMode, event: any) {
  const identity = grksIdentity(event)
  const id = grksScoreKey(mode, identity)
  const [row] = await ctx.database.get('phi_grks_score', { id })
  return row
}

export async function listGrksScores(ctx: Context, mode?: GrksMode): Promise<GrksScoreRow[]> {
  const rows = await ctx.database.get('phi_grks_score', mode ? { gameId: 'grks', mode } : { gameId: 'grks' })
  return rows.map(row => ({
    ...row,
    profile: normalizeProfile(row.profile),
    userId: `${row.platform}:${row.platformId}`,
  }))
}

export function winRate(row: GrksScoreRow) {
  const total = row.wins + row.losses + row.draws
  return total > 0 ? row.wins / total : 0
}

export function averageHints(row: Pick<GrksScoreRow, 'hintSum' | 'hintPlays'> | null | undefined) {
  const plays = Math.max(0, Math.trunc(Number(row?.hintPlays) || 0))
  return plays > 0 ? Number(row?.hintSum || 0) / plays : null
}

export function rankByScore(rows: GrksScoreRow[]) {
  return [...rows]
    .filter(row => row.plays > 0 || row.score > 0)
    .sort((a, b) => b.score - a.score || a.plays - b.plays || a.userId.localeCompare(b.userId))
}

export function rankByWinRate(rows: GrksScoreRow[], minimum = GRKS_RANK_MIN_PLAYS) {
  const threshold = Math.max(1, Math.trunc(minimum))
  return [...rows]
    .filter(row => row.wins + row.losses + row.draws >= threshold)
    .sort((a, b) =>
      winRate(b) - winRate(a)
      || (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws)
      || b.score - a.score
      || a.userId.localeCompare(b.userId))
}

export function rankByAccuracy(rows: GrksScoreRow[], minimum = GRKS_RANK_MIN_PLAYS) {
  const threshold = Math.max(1, Math.trunc(minimum))
  return [...rows]
    .filter(row => row.hintPlays >= threshold)
    .sort((a, b) =>
      (averageHints(a) ?? Infinity) - (averageHints(b) ?? Infinity)
      || b.score - a.score
      || b.hintPlays - a.hintPlays
      || a.userId.localeCompare(b.userId))
}

export function paginate<T>(rows: T[], page = 1, pageSize = 10) {
  const size = Math.max(1, Math.trunc(pageSize))
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages)
  return { items: rows.slice((current - 1) * size, current * size), page: current, pages, total }
}

function kindLabel(kind: GrksRankKind) {
  return kind === 'accuracy' ? '准确率榜' : kind === 'winRate' ? '胜率榜' : '积分榜'
}

function modeLabel(mode: GrksMode) {
  return mode === 'match' ? '匹配' : '单机'
}

function describeRow(row: GrksScoreRow, kind: GrksRankKind) {
  const name = row.profile?.name || ANONYMOUS_GRKS_PROFILE.name
  if (kind === 'accuracy') return `${name}　平均 ${averageHints(row)?.toFixed(2) ?? '--'} 条提示　${row.hintPlays} 局　积分 ${row.score.toFixed(2)}`
  if (kind === 'winRate') return `${name}　胜率 ${(winRate(row) * 100).toFixed(1)}%　${row.wins}胜 ${row.losses}负 ${row.draws}平　积分 ${row.score.toFixed(2)}`
  return `${name}　${row.score.toFixed(2)} 分　${row.plays} 局　最高 ${row.best.toFixed(2)}`
}

export interface GrksRankingResult {
  ok: true
  title: string
  mode: GrksMode
  kind: GrksRankKind
  items: GrksScoreRow[]
  page: number
  pages: number
  total: number
  meId: string
  meRank: number | null
  me: GrksScoreRow | null
  minimum: number
  text: string
}

export async function queryGrksRanking(ctx: Context, options: {
  mode?: GrksMode
  kind?: GrksRankKind
  page?: number
  pageSize?: number
  event: any
  minimum?: number
}): Promise<GrksRankingResult | { ok: false; text: string }> {
  const mode = options.mode === 'match' ? 'match' : 'normal'
  const requestedKind = options.kind === 'accuracy' ? 'accuracy' : options.kind === 'winRate' ? 'winRate' : 'score'
  const kind = requestedKind === 'winRate' && mode !== 'match' ? 'score' : requestedKind
  const minimum = Math.max(1, Math.trunc(options.minimum ?? GRKS_RANK_MIN_PLAYS))
  const rows = await listGrksScores(ctx, mode)
  const sorted = kind === 'accuracy'
    ? rankByAccuracy(rows, minimum)
    : kind === 'winRate'
      ? rankByWinRate(rows, minimum)
      : rankByScore(rows)
  const paged = paginate(sorted, options.page, options.pageSize ?? 10)
  const meId = grksIdentity(options.event).userId
  const meIndex = sorted.findIndex(row => row.userId === meId)
  const title = `猜RKS · ${modeLabel(mode)} ${kindLabel(kind)}`
  const lines = [`🏆 ${title}（共 ${sorted.length} 人）`, `第 ${paged.page}/${paged.pages} 页`]
  if (!paged.items.length) {
    lines.push(kind === 'score'
      ? '暂无数据，快去玩一局吧！'
      : kind === 'accuracy'
        ? `暂无符合条件的玩家（至少完成 ${minimum} 局）`
        : `暂无符合条件的玩家（至少 ${minimum} 场匹配对局）`)
  } else {
    paged.items.forEach((row, index) => {
      lines.push(`#${(paged.page - 1) * (options.pageSize ?? 10) + index + 1} ${describeRow(row, kind)}`)
    })
  }
  lines.push(meIndex >= 0
    ? `我的排名：#${meIndex + 1} ${describeRow(sorted[meIndex], kind)}`
    : kind === 'score' ? '我的排名：暂无记录'
      : `我的排名：未上榜（需要至少 ${minimum} ${kind === 'accuracy' ? '局' : '场匹配对局'}）`)
  return {
    ok: true,
    title,
    mode,
    kind,
    ...paged,
    meId,
    meRank: meIndex >= 0 ? meIndex + 1 : null,
    me: meIndex >= 0 ? sorted[meIndex] : null,
    minimum,
    text: lines.join('\n'),
  }
}