import { randomUUID } from 'node:crypto'
import type { Context } from 'koishi'
import type { Config } from '../../../config'
import type { PhiRuntime } from '../../../runtime-context'
import { UserCredentials } from '../../../domain/user/user-credentials'
import getBanGroup from '../../../domain/user/get-ban-group'
import getInfo from '../../../domain/game/get-info'
import send from '../../../render/send'
import type { PromptAction } from '../../../render/prompt'
import { escapePromptText } from '../../../render/prompt'
import logger from '../../../utils/logger'
import { isUsableImage } from '../../../domain/game/grks/render-result'
import { grksSoloRender } from './solo-render'
import {
  applyMatchHint,
  applySoloHint,
  createMatchSideState,
  createSoloState,
  defaultMatchHint,
  formatHintText,
  matchHintType,
} from '../../../domain/game/grks/hints'
import { drawPair } from '../../../domain/game/grks/draw-pair'
import { getPool, loadPuzzle } from '../../../domain/game/grks/pool'
import { getSaveBySourceId, preferredSourceId } from '../../../domain/game/grks/source'
import { formatScoreValue, isCorrect, parseGuess, scoreForHintCount } from '../../../domain/game/grks/score'
import {
  addGrksScore,
  averageHints,
  getGrksScore,
  grksIdentity,
  queryGrksRanking,
  winRate,
  type GrksMode,
  type GrksProfile,
} from '../../../domain/game/grks/game-score'

const log = logger as any

export type GrksHintInput = { type?: string, arg?: string }
export type GrksRankInput = { gameId?: string, mode?: GrksMode, kind?: 'score' | 'winRate' | 'accuracy', page: number }

const MAX_GUESSES = 10
const MATCH_QUEUE_TIMEOUT_MS = 240_000

function cancelTimer(timer: any) {
  if (timer == null) return
  if (typeof timer === 'function') timer()
  else clearTimeout(timer)
}

function profileFromSave(save: any): GrksProfile {
  const rawName = String(save?.saveInfo?.PlayerId || '').replace(/\s+/g, ' ').trim()
  const avatar = String(save?.gameuser?.avatar || 'Introduction')
  return {
    source: 'phigros',
    name: rawName || '匿名用户',
    avatar: /[/\\:\u0000-\u001f]/.test(avatar) || !avatar ? 'Introduction' : getInfo.idgetavatar(avatar),
  }
}

function channelKey(event: any) {
  const identity = grksIdentity(event)
  if (event?.chatType === 'group' || event?.isGroup) {
    return `${identity.platform}:group:${event.groupId || event.group_id || event.chatId || ''}`
  }
  return `${identity.platform}:private:${identity.platformId}`
}

export function parseHintArgs(msg: string): GrksHintInput {
  const matched = String(msg ?? '').match(/(?:grks|猜rks)\s*(?:hint|提示)\s*(?:([134])\s*)?([PpBb]\d{1,2}|histogram|range)?\s*$/i)
  if (!matched) return {}
  const typeChar = matched[1]
  const raw = matched[2]
  const arg = raw ? (/^[PpBb]/i.test(raw) ? raw.toUpperCase() : raw.toLowerCase()) : undefined
  if (typeChar) return { type: typeChar, arg }
  if (!arg) return {}
  return { type: !/^[PB]\d{1,2}$/.test(arg) ? '3' : '1', arg }
}

export function parseRankArgs(msg: string): GrksRankInput {
  const tail = String(msg ?? '')
    .replace(/^[#/]\S*\s*/, '')
    .replace(/^(grks|猜rks)\s*(lb|榜)\s*/, '')
    .replace(/^(游戏积分榜|积分榜)\s*/, '')
  const parts = tail.split(/\s+/).filter(Boolean)
  let kind: GrksRankInput['kind'] = 'score'
  let mode: GrksMode | undefined
  let gameId: string | undefined
  let page = 1
  for (const part of parts) {
    const text = part.toLowerCase()
    if (text === 'accuracy' || part === '准确率' || part === '准确率榜') kind = 'accuracy'
    else if (text === 'winrate' || part === '胜率' || part === '胜率榜') kind = 'winRate'
    else if (text === 'score' || part === '积分' || part === '积分榜') kind = 'score'
    else if (text === 'normal' || part === '单机') mode = 'normal'
    else if (text === 'match' || part === '匹配') mode = 'match'
    else if (/^\d+$/.test(text)) page = Math.max(1, Number(text))
    else if (!gameId) gameId = text
  }
  return { gameId, mode, kind, page }
}

export interface PuzzleSource {
  sourceId: string
  profile: GrksProfile
  puzzle: any
}

interface SoloRoom {
  key: string
  event: any
  puzzle: any
  state: any
  latestHint: any
  history: any[]
  answerAtByUser: Map<string, number>
  lastHintAt: number
  timer: any
  settled: boolean
}

interface QueueEntry extends PuzzleSource {
  event: any
  userKey: string
  joinedAt: number
  matches: number
  accuracy: number | null
}

interface MatchPlayer extends PuzzleSource {
  event: any
  userKey: string
  sideState: any
  answer: any
  pendingHint: any
  guess: number | null
  answerTotal: number
  answerCorrect: number
  history: any[]
  team: 'red' | 'blue'
}

interface MatchRoom {
  id: string
  red: MatchPlayer
  blue: MatchPlayer
  turn: number
  phase: 'hint' | 'answer' | 'settled'
  timer: any
  notice: string
  result: string[]
}

export interface GrksApplicationOptions {
  now?: () => number
  rng?: () => number
  schedule?: (callback: () => void, delay: number) => any
  prompt?: (event: any, content: any, options: any) => Promise<any>
  render?: (event: any, data: any) => Promise<any>
  addScore?: typeof addGrksScore
  queryRanking?: typeof queryGrksRanking
  banCheck?: (event: any) => Promise<boolean> | boolean
  loadPool?: typeof getPool
  loadPuzzle?: typeof loadPuzzle
  loadSource?: (sourceId: string, event: any, puzzle?: any) => Promise<PuzzleSource>
  loadOwnSource?: (event: any, minimum: number) => Promise<PuzzleSource | null>
}

export class GrksApplication {
  readonly runtime: PhiRuntime
  readonly config: Config
  ctx?: Context
  now: () => number
  rng: () => number
  schedule: (callback: () => void, delay: number) => any
  promptSender: (event: any, content: any, options: any) => Promise<any>
  renderer?: (event: any, data: any) => Promise<any>
  addScore: typeof addGrksScore
  queryRanking: typeof queryGrksRanking
  banCheck: (event: any) => Promise<boolean> | boolean
  loadPool: typeof getPool
  loadPuzzle: typeof loadPuzzle
  loadSource?: (sourceId: string, event: any, puzzle?: any) => Promise<PuzzleSource>
  loadOwnSource?: (event: any, minimum: number) => Promise<PuzzleSource | null>
  soloRooms = new Map<string, SoloRoom>()
  startingRooms = new Set<string>()
  queue = new Map<string, QueueEntry>()
  matchRooms = new Map<string, MatchRoom>()
  userMatches = new Map<string, MatchRoom>()
  queueScanTimer: any
  pairPromise?: Promise<boolean>
  disposed = false

  constructor(runtime: PhiRuntime, options: GrksApplicationOptions = {}) {
    this.runtime = runtime
    this.config = runtime.config
    this.now = options.now || Date.now
    this.rng = options.rng || Math.random
    this.schedule = options.schedule || ((callback, delay) => {
      const timer = setTimeout(callback, delay)
      timer.unref?.()
      return timer
    })
    this.promptSender = options.prompt || ((event, content, promptOptions) => send.promptWithAt(event, content, promptOptions))
    this.renderer = options.render
    this.addScore = options.addScore || addGrksScore
    this.queryRanking = options.queryRanking || queryGrksRanking
    this.banCheck = options.banCheck || ((event) => this.checkBanned(event))
    this.loadPool = options.loadPool || getPool
    this.loadPuzzle = options.loadPuzzle || loadPuzzle
    this.loadSource = options.loadSource
    this.loadOwnSource = options.loadOwnSource
  }

  configure(ctx: Context, adapter?: any) {
    this.ctx = ctx
    this.startQueueScanner()
  }

  private requireContext() {
    if (!this.ctx) throw new Error('GRKS 应用尚未配置 Koishi Context')
    return this.ctx
  }

  private number(value: unknown, fallback: number, min = 0) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    if (min > 0 && parsed <= 0) return fallback
    return Math.max(min, parsed)
  }

  private cfg() {
    return {
      tolerance: this.number(this.config.GrksTolerance, 0.1, 0.01),
      minimum: this.number(this.config.GrksMinRecord, 27, 1),
      maxScore: this.number(this.config.GrksMaxScore, 10, 1),
      positionHintAt: this.number(this.config.GrksPositionHintAt, 5, 1),
      revealNum: this.number(this.config.GrksHintRevealNum, 2, 1),
      hintCd: this.number(this.config.GrksTipCd, 3),
      soloCd: this.number(this.config.GrksSoloCd, 5),
      soloTimeout: this.number(this.config.GrksTimeLength, 600, 30),
      wrongLimit: Math.trunc(this.number(this.config.GrksWrongLimit, 0)),
      statsHint: this.config.GrksStatsHint || 'auto',
      poolRefreshHours: this.number(this.config.GrksPoolRefreshHours, 6),
      matchTime: this.number(this.config.GrksMatchTurnTime, 90, 10),
    }
  }

  private commandPrefix() {
    return 'phi grks'
  }
  private async checkBanned(event: any) {
    try {
      return Boolean(await getBanGroup.get(event, 'grksgame'))
    } catch {
      return false
    }
  }

  private async isBanned(event: any) {
    return Boolean(await this.banCheck(event))
  }

  private soloActions(): PromptAction[] {
    return [
      { type: 'input', command: '/phi grks ', label: '输入RKS' },
      { command: '/phi grks ans', label: '公布答案' },
      { command: '/phi grks lb', label: '积分榜' },
    ]
  }

  private matchActions(): PromptAction[] {
    return [
      { command: '/phi grks hint B7', label: '提示B7' },
      { command: '/phi grks hint 3', label: '统计提示' },
      { command: '/phi grks hint 4', label: '课题提示' },
      { command: '/phi grks cancel', label: '退出' },
    ]
  }

  private homeActions(): PromptAction[] {
    return [
      { command: '/phi grks', label: '开始猜RKS' },
      { command: '/phi grks match', label: '匹配' },
      { command: '/phi grks lb', label: '积分榜' },
    ]
  }

  private async prompt(event: any, text: string, actions: PromptAction[], viewData?: any, fallbackText = text, renderKind: 'game' | 'ranking' = 'game') {
    let image: any
    if (viewData) {
      try {
        image = this.renderer
          ? await this.renderer(event, viewData)
          : renderKind === 'ranking'
            ? await require('../../../render/pic-model.ts').default.grksRanking(event, viewData)
            : await require('../../../render/pic-model.ts').default.grks(event, viewData)
      } catch (error) {
        log.warn('[phi-plugin][grks] 面板渲染失败，改为文字', error)
      }
    }
    const usableImage = isUsableImage(image) ? image : undefined
    const markdownText = escapePromptText(text)
    const content = usableImage ? [markdownText, usableImage] : markdownText
    const fallback = usableImage ? [fallbackText, usableImage] : fallbackText
    return this.promptSender(event, content, {
      markdown: true,
      actions,
      fallback,
      config: this.config,
    })
  }

  private puzzleRenderData(puzzle: any, revealedSlots: string[], statsKind: string, challengeRevealed: boolean, revealAll = false) {
    const revealed = new Set(revealedSlots)
    const records = puzzle.slots.map((slot: any) => revealAll || revealed.has(slot.slot) ? slot : null)
    const info = revealAll || challengeRevealed ? {
      stats: puzzle.stats.map((item: any) => [item.cleared, item.fc, item.phi]),
      challenge: puzzle.challengeModeRank,
      updateAt: this.now(),
    } : null
    return {
      records,
      info,
      sheet: {
        range: statsKind === 'range' ? [puzzle.analysis.max, puzzle.analysis.min] : null,
        histogram: statsKind === 'histogram' ? puzzle.slots.map((slot: any) => slot.rks) : null,
      },
    }
  }

  private hintLabel(hint: any) {
    if (!hint || hint.kind === 'exhausted') return '成绩已全部公开'
    if (hint.kind === 'records') return `公开成绩 ${hint.slots?.join(' / ') || ''}`.trim()
    if (hint.kind === 'stats') return hint.statsKind === 'range' ? '等效 RKS 上下界' : '等效 RKS 直方图'
    return '存档统计与课题分'
  }

  private appendSoloHint(room: SoloRoom, hint: any) {
    const last = room.history.at(-1)
    if (last?.result === 'pending') {
      last.hint = last.hint ? `${last.hint}；${this.hintLabel(hint)}` : this.hintLabel(hint)
      return
    }
    room.history.push({ turn: room.history.length + 1, hint: this.hintLabel(hint), guess: null, result: 'pending' })
  }

  private recordSoloGuess(room: SoloRoom, guess: number | null, result: string) {
    const last = room.history.at(-1)
    if (!last || last.result !== 'pending') return
    last.guess = guess
    last.result = result
  }

  private buildSoloView(room: SoloRoom, revealAll = false, footnote = '') {
    const puzzle = room.puzzle
    const state = room.state
    const data = this.puzzleRenderData(
      puzzle,
      revealAll ? puzzle.slots.map((slot: any) => slot.slot) : state.revealedSlots,
      state.statsKind,
      revealAll || state.challengeRevealed,
      revealAll,
    )
    const view = grksSoloRender.buildView({
      data,
      orderKnown: revealAll || state.positionRevealed,
      footnote,
      answerRks: revealAll ? puzzle.rks : null,
      revealAll,
      history: room.history,
    })
    if (revealAll) view.header.playerId = puzzle.profile?.name || view.header.playerId
    return { ...view, panels: [view] }
  }

  private soloFootnote(room: SoloRoom) {
    const cfg = this.cfg()
    return [
      `第 ${room.state.hintCount} 条提示`,
      `回答冷却 ${cfg.soloCd}s`,
      cfg.wrongLimit ? `最多猜错 ${cfg.wrongLimit} 次` : '猜错次数不设上限',
      `发送 ${this.commandPrefix()} <数值> 猜测，${this.commandPrefix()} ans 放弃`,
    ].join(' · ')
  }

  private armSoloTimeout(room: SoloRoom) {
    cancelTimer(room.timer)
    const cfg = this.cfg()
    room.timer = this.schedule(() => {
      void this.finishSolo(room, room.event, 'timeout').catch(error => log.warn('[phi-plugin][grks] 单机超时结算失败', error))
    }, Math.max(30, cfg.soloTimeout) * 1000)
  }

  async start(event: any) {
    if (await this.isBanned(event)) {
      await this.prompt(event, '当前群组已禁用猜 RKS 游戏。', this.homeActions())
      return false
    }
    const key = channelKey(event)
    const identity = grksIdentity(event)
    if (this.userMatches.has(identity.userId) || this.queue.has(identity.userId)) {
      await this.prompt(event, `你正在匹配中，先发送 ${this.commandPrefix()} cancel 退出。`, this.matchActions())
      return false
    }
    if (this.soloRooms.has(key) || this.startingRooms.has(key)) {
      await this.prompt(event, `当前会话已有进行中的猜 RKS，直接发送 ${this.commandPrefix()} <数值> 继续猜测。`, this.soloActions())
      return false
    }

    this.startingRooms.add(key)
    try {
      const cfg = this.cfg()
      const ownSourceId = await this.ownSource(event)
      const pool = await this.loadPool({ minRecord: cfg.minimum, refreshHours: cfg.poolRefreshHours })
      const candidates = pool.entries.filter(entry => entry.sourceId !== ownSourceId)
      const poolEntries = candidates.length ? candidates : pool.entries
      if (!poolEntries.length) {
        await this.prompt(event, `暂无可出题的存档：需要本地存在有效成绩不少于 ${cfg.minimum} 条的绑定存档。API 绑定用户请先发送 /phi update 更新存档。`, this.homeActions())
        return false
      }
      const selected = poolEntries[Math.floor(this.rng() * poolEntries.length) % poolEntries.length]
      const puzzle = await this.loadPuzzle(selected.sourceId, { e: event })
      if (!puzzle || puzzle.recordCount < cfg.minimum) {
        await this.prompt(event, '出题失败：存档的 B30 数据不完整，请稍后再试。', this.homeActions())
        return false
      }
      const source = await this.puzzleSource(selected.sourceId, event, puzzle)
      let state = createSoloState(source.sourceId)
      const first = applySoloHint(state, source.puzzle, {
        PositionHintAt: cfg.positionHintAt,
        HintRevealNum: cfg.revealNum,
        StatsHint: cfg.statsHint,
      }, this.rng)
      state = { ...first.state, lastHintAt: this.now(), lastGuessAt: 0 }
      const room: SoloRoom = {
        key,
        event,
        puzzle: source.puzzle,
        state,
        latestHint: first.hint,
        history: [],
        answerAtByUser: new Map(),
        lastHintAt: this.now(),
        timer: null,
        settled: false,
      }
      this.appendSoloHint(room, first.hint)
      this.soloRooms.set(key, room)
      this.armSoloTimeout(room)
      const text = [
        '猜 RKS 已开始。',
        formatHintText({ puzzle: room.puzzle, hint: room.latestHint, revealedSlots: room.state.revealedSlots, positionRevealed: room.state.positionRevealed }),
      ].join('\n')
      await this.prompt(event, text, this.soloActions(), this.buildSoloView(room, false, this.soloFootnote(room)))
      return true
    } finally {
      this.startingRooms.delete(key)
    }
  }

  async guess(event: any, rawValue: string) {
    const identity = grksIdentity(event)
    const match = this.userMatches.get(identity.userId)
    if (match) return await this.guessMatch(event, match, rawValue)
    return await this.guessSolo(event, rawValue)
  }
  private async guessSolo(event: any, rawValue: string) {
    const key = channelKey(event)
    const room = this.soloRooms.get(key)
    if (!room) {
      await this.prompt(event, `当前没有进行中的猜 RKS，发送 ${this.commandPrefix()} 开始一局吧。`, this.homeActions())
      return false
    }
    const value = parseGuess(rawValue)
    if (value === null) {
      await this.prompt(event, `请输入 0~99 的数值，例如：${this.commandPrefix()} 15.25`, this.soloActions())
      return false
    }
    const cfg = this.cfg()
    const userId = grksIdentity(event).userId
    const now = this.now()
    const previous = room.answerAtByUser.get(userId) || 0
    if (previous > 0 && now - previous < cfg.soloCd * 1000) {
      const seconds = Math.ceil((cfg.soloCd * 1000 - (now - previous)) / 1000)
      await this.prompt(event, `你的回答冷却中，请 ${seconds}s 后再试。`, this.soloActions())
      return false
    }
    room.answerAtByUser.set(userId, now)
    room.event = event
    if (isCorrect(value, room.puzzle.rks, cfg.tolerance)) {
      this.recordSoloGuess(room, value, 'correct')
      await this.finishSolo(room, event, 'correct', value)
      return true
    }

    room.state = { ...room.state, wrongCount: room.state.wrongCount + 1, lastGuessAt: now }
    this.recordSoloGuess(room, value, 'wrong')
    if (cfg.wrongLimit > 0 && room.state.wrongCount >= cfg.wrongLimit) {
      await this.finishSolo(room, event, 'failed', value)
      return true
    }

    let hintText = ''
    if (now - room.lastHintAt >= cfg.hintCd * 1000) {
      try {
        const next = applySoloHint(room.state, room.puzzle, {
          PositionHintAt: cfg.positionHintAt,
          HintRevealNum: cfg.revealNum,
          StatsHint: cfg.statsHint,
        }, this.rng)
        room.state = { ...next.state, lastHintAt: now, lastGuessAt: now }
        room.latestHint = next.hint
        this.appendSoloHint(room, next.hint)
        room.lastHintAt = now
        hintText = `
${formatHintText({ puzzle: room.puzzle, hint: room.latestHint, revealedSlots: room.state.revealedSlots, positionRevealed: room.state.positionRevealed })}`
      } catch (error) {
        log.warn('[phi-plugin][grks] 系统提示生成失败', error)
      }
    }
    this.armSoloTimeout(room)
    const wait = Math.max(0, Math.ceil((room.lastHintAt + cfg.hintCd * 1000 - now) / 1000))
    const text = `猜错啦，提交值 ${value.toFixed(4)}。${hintText || (wait ? `
提示冷却中，约 ${wait}s 后可获得新提示。` : '')}`
    await this.prompt(event, text, this.soloActions(), this.buildSoloView(room, false, this.soloFootnote(room)))
    return true
  }

  async ans(event: any) {
    const identity = grksIdentity(event)
    const match = this.userMatches.get(identity.userId)
    if (match) return await this.cancel(event)
    const room = this.soloRooms.get(channelKey(event))
    if (!room) {
      await this.prompt(event, '当前没有可放弃的猜 RKS 对局。', this.homeActions())
      return false
    }
    await this.finishSolo(room, event, 'abandoned')
    return true
  }

  private disposeSolo(room: SoloRoom) {
    if (room.settled) return false
    room.settled = true
    cancelTimer(room.timer)
    if (this.soloRooms.get(room.key) === room) this.soloRooms.delete(room.key)
    return true
  }

  private async finishSolo(room: SoloRoom, event: any, reason: 'correct' | 'failed' | 'abandoned' | 'timeout', guess: number | null = null) {
    if (!this.disposeSolo(room)) return
    const cfg = this.cfg()
    if (reason === 'abandoned' || reason === 'timeout') this.recordSoloGuess(room, null, reason)
    const points = reason === 'correct' ? scoreForHintCount(Math.max(1, room.state.hintCount), cfg.maxScore) : 0
    let text: string
    if (reason === 'correct') {
      text = `猜对了！答案 ${room.puzzle.rks.toFixed(4)}，本次获得 ${formatScoreValue(points)} 分（${room.state.hintCount} 条提示）。`
    } else if (reason === 'failed') {
      text = `猜错次数达到上限，答案 ${room.puzzle.rks.toFixed(4)}。`
    } else if (reason === 'timeout') {
      text = `超过 ${cfg.soloTimeout}s 没有新的操作，答案 ${room.puzzle.rks.toFixed(4)}。`
    } else {
      text = `本局已放弃，答案 ${room.puzzle.rks.toFixed(4)}。`
    }
    if (guess !== null) text += `
最后提交：${guess.toFixed(4)}`
    await this.prompt(event, text, this.homeActions(), this.buildSoloView(room, true, text))
    if (reason === 'correct') {
      try {
        await this.addScore(this.requireContext(), 'normal', event, points, {
          hints: room.state.hintCount,
          profile: await this.ownProfile(event),
        })
      } catch (error) {
        log.warn('[phi-plugin][grks] 记录单机积分失败', error)
      }
    }
  }

  private async ownProfile(event: any) {
    try {
      const sourceId = await this.ownSource(event)
      if (!sourceId) return undefined
      const save = await getSaveBySourceId(sourceId)
      return save ? profileFromSave(save) : undefined
    } catch {
      return undefined
    }
  }

  private async ownSource(event: any) {
    try {
      const credentials = await UserCredentials.fromEvent(event).getLocalCredentials()
      return preferredSourceId(credentials)
    } catch {
      return undefined
    }
  }

  private async puzzleSource(sourceId: string, event: any, puzzle?: any): Promise<PuzzleSource> {
    if (this.loadSource) return await this.loadSource(sourceId, event, puzzle)
    const save = await getSaveBySourceId(sourceId)
    const resolvedPuzzle = puzzle || await this.loadPuzzle(sourceId, { e: event })
    if (!save || !resolvedPuzzle) throw new Error('无法读取 GRKS 存档')
    const profile = profileFromSave(save)
    resolvedPuzzle.profile = profile
    return { sourceId, puzzle: resolvedPuzzle, profile }
  }

  private async loadOwnPuzzle(event: any, minimum: number): Promise<PuzzleSource | null> {
    if (this.loadOwnSource) return await this.loadOwnSource(event, minimum)
    const sourceId = await this.ownSource(event)
    if (!sourceId) return null
    try {
      const source = await this.puzzleSource(sourceId, event)
      return source.puzzle.recordCount >= minimum ? source : null
    } catch (error) {
      log.warn('[phi-plugin][grks] 读取本人存档失败', error)
      return null
    }
  }

  async match(event: any) {
    if (await this.isBanned(event)) {
      await this.prompt(event, '当前群组已禁用猜 RKS 游戏。', this.homeActions())
      return false
    }
    const identity = grksIdentity(event)
    if (this.userMatches.has(identity.userId)) {
      await this.prompt(event, `你已在对局中，发送 ${this.commandPrefix()} cancel 可退出。`, this.matchActions())
      return false
    }
    if (this.queue.has(identity.userId)) {
      await this.prompt(event, `你已在匹配队列中，发送 ${this.commandPrefix()} cancel 可取消。`, this.matchActions())
      return false
    }
    if (this.soloRooms.has(channelKey(event))) {
      await this.prompt(event, `当前会话还有进行中的单机对局，先发送 ${this.commandPrefix()} ans 结束再匹配吧。`, this.soloActions())
      return false
    }
    const cfg = this.cfg()
    const source = await this.loadOwnPuzzle(event, cfg.minimum)
    if (!source) {
      await this.prompt(event, `匹配需要完整 P3 和 B27，且至少有 ${cfg.minimum} 条有效成绩。API 缓存缺失或过旧时，请先发送 /phi update 更新存档后重试。`, this.homeActions())
      return false
    }
    const ctx = this.requireContext()
    const score = await getGrksScore(ctx, 'match', event)
    const settledMatches = score ? score.wins + score.losses + score.draws : 0
    this.queue.set(identity.userId, {
      ...source,
      event,
      userKey: identity.userId,
      joinedAt: this.now(),
      matches: settledMatches,
      accuracy: score?.answerTotal ? score.answerCorrect / score.answerTotal : null,
    })
    const paired = await this.tryPair()
    if (!paired) {
      await this.prompt(event, `正在匹配（当前排队 ${this.queue.size} 人）。优先选择匹配场次与答题正确率接近的跨会话对手；等待 ${MATCH_QUEUE_TIMEOUT_MS / 1000}s 后自动退出。
发送 ${this.commandPrefix()} cancel 可取消。`, this.homeActions())
    }
    return true
  }
  private startQueueScanner() {
    cancelTimer(this.queueScanTimer)
    this.queueScanTimer = this.schedule(() => {
      if (this.disposed) return
      void this.scanQueue().catch(error => log.warn('[phi-plugin][grks] 匹配扫描失败', error))
      this.startQueueScanner()
    }, 2000)
  }

  private async scanQueue() {
    const now = this.now()
    for (const [userId, entry] of this.queue) {
      if (now - entry.joinedAt >= MATCH_QUEUE_TIMEOUT_MS) {
        this.queue.delete(userId)
        await this.prompt(entry.event, `本次匹配等待已满 ${MATCH_QUEUE_TIMEOUT_MS / 1000}s，已自动退出匹配池。`, this.homeActions())
      }
    }
    await this.tryPair()
  }

  private selectPair(entries: QueueEntry[]) {
    let best: [QueueEntry, QueueEntry] | null = null
    let bestMatchDiff = Infinity
    let bestAccuracyDiff = Infinity
    let bestJoin = Infinity
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]
        const b = entries[j]
        if (a.userKey === b.userKey || channelKey(a.event) === channelKey(b.event)) continue
        const matchDiff = Math.abs(a.matches - b.matches)
        const accuracyDiff = a.accuracy == null || b.accuracy == null
          ? Infinity : Math.abs(a.accuracy - b.accuracy)
        const joined = Math.max(a.joinedAt, b.joinedAt)
        if (matchDiff < bestMatchDiff
          || (matchDiff === bestMatchDiff && accuracyDiff < bestAccuracyDiff)
          || (matchDiff === bestMatchDiff && accuracyDiff === bestAccuracyDiff && joined < bestJoin)) {
          best = [a, b]
          bestMatchDiff = matchDiff
          bestAccuracyDiff = accuracyDiff
          bestJoin = joined
        }
      }
    }
    return best
  }

  private tryPair(): Promise<boolean> {
    if (this.pairPromise) return this.pairPromise
    const task = this.tryPairOnce()
    this.pairPromise = task
    void task.finally(() => {
      if (this.pairPromise === task) this.pairPromise = undefined
    }).catch(error => log.warn('[phi-plugin][grks] 匹配配对失败', error))
    return task
  }

  private async tryPairOnce() {
    const pair = this.selectPair([...this.queue.values()])
    if (!pair) return false
    const [left, right] = pair
    this.queue.delete(left.userKey)
    this.queue.delete(right.userKey)
    const room = await this.createMatchRoom(left, right)
    if (!room) {
      await Promise.all([
        this.prompt(left.event, '匹配失败：题库无法分配双方题目，请稍后重试。', this.homeActions()),
        this.prompt(right.event, '匹配失败：题库无法分配双方题目，请稍后重试。', this.homeActions()),
      ])
    }
    return true
  }

  private async createMatchRoom(left: QueueEntry, right: QueueEntry): Promise<MatchRoom | null> {
    let leftAnswer = right.puzzle
    let rightAnswer = left.puzzle
    if (left.sourceId === right.sourceId) {
      const cfg = this.cfg()
      const pool = await this.loadPool({ minRecord: cfg.minimum, refreshHours: cfg.poolRefreshHours })
      const sourceIds = pool.entries.map(entry => entry.sourceId)
      const drawn = await drawPair(sourceIds, left.sourceId, right.sourceId, sourceId => this.loadPuzzle(sourceId, { e: left.event }))
      if (!drawn) return null
      leftAnswer = drawn[0]
      rightAnswer = drawn[1]
    }
    const makePlayer = (source: QueueEntry, answer: any, team: 'red' | 'blue'): MatchPlayer => ({
      ...source,
      team,
      answer,
      sideState: createMatchSideState(),
      pendingHint: null,
      guess: null,
      answerTotal: 0,
      answerCorrect: 0,
      history: [],
    })
    const room: MatchRoom = {
      id: randomUUID().slice(0, 8),
      red: makePlayer(left, leftAnswer, 'red'),
      blue: makePlayer(right, rightAnswer, 'blue'),
      turn: 1,
      phase: 'hint',
      timer: null,
      notice: '匹配成功，请选择一次要公开给对手的提示。',
      result: [],
    }
    this.matchRooms.set(room.id, room)
    this.userMatches.set(room.red.userKey, room)
    this.userMatches.set(room.blue.userKey, room)
    this.armMatchTimeout(room)
    await Promise.all([this.sendMatchState(room, room.red), this.sendMatchState(room, room.blue)])
    return room
  }

  private opponent(player: MatchPlayer, room: MatchRoom) {
    return room.red === player ? room.blue : room.red
  }

  private matchView(player: MatchPlayer, room: MatchRoom, revealAll = false, footnote = '') {
    const giver = room.phase === 'hint' && !revealAll
    const opponent = this.opponent(player, room)
    const side = giver ? player.sideState : opponent.sideState
    if (giver) {
      const data = this.puzzleRenderData(
        player.puzzle,
        player.puzzle.slots.map((slot: any) => slot.slot),
        side.statsKind,
        true,
        true,
      )
      const revealed = new Set(side.revealedSlots)
      const known = {
        records: player.puzzle.slots.map((slot: any) => revealed.has(slot.slot)),
        info: Boolean(side.statsKind || side.challengeRevealed),
        sheetKind: side.statsKind,
      }
      const view = grksSoloRender.buildGiverView({
        data,
        known,
        answerRks: null,
        history: player.history,
        playerId: player.profile.name,
        prefix: this.commandPrefix(),
        footnote,
      })
      return { ...view, panels: [view], match: true }
    }
    const puzzle = player.answer
    const data = this.puzzleRenderData(
      puzzle,
      revealAll ? puzzle.slots.map((slot: any) => slot.slot) : side.revealedSlots,
      side.statsKind,
      revealAll || side.challengeRevealed,
      revealAll,
    )
    const view = grksSoloRender.buildView({
      data,
      orderKnown: revealAll || side.revealedSlots.length >= puzzle.slots.length,
      answerRks: revealAll ? puzzle.rks : null,
      revealAll,
      history: player.history,
      footnote,
    })
    if (revealAll) view.header.playerId = puzzle.profile?.name || view.header.playerId
    return { ...view, panels: [view], match: false }
  }

  private matchText(room: MatchRoom, player: MatchPlayer, notice = room.notice) {
    const opponent = this.opponent(player, room)
    return [
      `猜 RKS 匹配房间 ${room.id} · 第 ${room.turn}/10 轮`,
      `你是${player.team === 'red' ? '红方' : '蓝方'}，对手：${opponent.profile.name}`,
      room.phase === 'hint' ? '提示回合：请选择要公开给对手的提示。' : room.phase === 'answer' ? '回答回合：请猜测对手的 B30 RKS。' : '对局已结束。',
      notice,
      `本方提示 ${player.pendingHint ? '已锁定' : '未选择'} · 本方回答 ${player.guess == null ? '未提交' : '已提交'} · 对方提示 ${opponent.pendingHint ? '已锁定' : '未选择'} · 对方回答 ${opponent.guess == null ? '未提交' : '已提交'}`,
      `${this.commandPrefix()} hint B7 / hint 3 histogram / hint 4 · ${this.commandPrefix()} cancel`,
    ].filter(Boolean).join('\n')
  }

  private async sendMatchState(room: MatchRoom, player: MatchPlayer, notice?: string) {
    const text = this.matchText(room, player, notice)
    const actions: PromptAction[] = room.phase === 'hint' ? this.matchActions() : [
      { type: 'input', command: '/phi grks ', label: '输入RKS' },
      { command: '/phi grks cancel', label: '认输' },
    ]
    return this.prompt(player.event, text, actions, this.matchView(player, room, false, text))
  }

  private armMatchTimeout(room: MatchRoom) {
    cancelTimer(room.timer)
    const cfg = this.cfg()
    room.timer = this.schedule(() => { void this.onMatchTimeout(room).catch(error => log.warn('[phi-plugin][grks] 匹配阶段超时处理失败', error)) }, Math.max(10, cfg.matchTime) * 1000)
  }
  async hint(event: any, input: GrksHintInput) {
    const identity = grksIdentity(event)
    const room = this.userMatches.get(identity.userId)
    if (!room) {
      if (this.queue.has(identity.userId)) {
        await this.prompt(event, '匹配仍在排队，进入房间后才能选择提示。', this.matchActions())
      } else {
        await this.prompt(event, `当前没有匹配对局，发送 ${this.commandPrefix()} match 加入匹配池。`, this.homeActions())
      }
      return false
    }
    const player = room.red.userKey === identity.userId ? room.red : room.blue
    player.event = event
    if (room.phase !== 'hint') {
      await this.prompt(event, '当前是回答回合，不能再选择提示。', this.matchActions())
      return false
    }
    if (player.pendingHint) {
      await this.prompt(event, '本轮提示已锁定，等待双方选择完毕后统一公布。', this.matchActions())
      return false
    }
    if (!input.type) {
      await this.prompt(event, `格式：${this.commandPrefix()} hint B7 / hint 3 histogram / hint 4`, this.matchActions())
      return false
    }
    const type = matchHintType(input.type)
    if (!type) {
      await this.prompt(event, '提示类型必须是 1（槽位）、3（统计）或 4（课题）。', this.matchActions())
      return false
    }
    const applied = applyMatchHint(player.sideState, player.puzzle, type, input.arg, { StatsHint: this.cfg().statsHint }, this.rng)
    if (!applied.ok) {
      await this.prompt(event, `提示参数不合法：${applied.error}`, this.matchActions())
      return false
    }
    player.sideState = applied.side
    player.pendingHint = applied.hint
    room.notice = `${player.team === 'red' ? '红方' : '蓝方'}已锁定本轮提示。`
    const opponent = this.opponent(player, room)
    if (!opponent.pendingHint) {
      await this.prompt(event, '提示已锁定，等待对手选择后统一公布。', this.matchActions())
      return true
    }
    await this.publishHints(room)
    return true
  }

  private async publishHints(room: MatchRoom) {
    if (room.phase !== 'hint') return
    cancelTimer(room.timer)
    room.phase = 'answer'
    room.notice = '双方提示已同时公布，请猜测对手的 B30 RKS。'
    room.red.guess = null
    room.blue.guess = null
    this.armMatchTimeout(room)
    await Promise.all([this.sendMatchState(room, room.red), this.sendMatchState(room, room.blue)])
  }

  private async guessMatch(event: any, room: MatchRoom, rawValue: string) {
    const identity = grksIdentity(event)
    const player = room.red.userKey === identity.userId ? room.red : room.blue
    player.event = event
    if (room.phase === 'hint') {
      await this.prompt(event, '当前是提示回合，双方选择完毕并公布提示后才能作答。', this.matchActions())
      return false
    }
    if (room.phase !== 'answer') {
      await this.prompt(event, '对局已结束。', this.homeActions())
      return false
    }
    if (player.guess !== null) {
      await this.prompt(event, '本回合已经提交过猜测了，等待本回合结算。', this.matchActions())
      return false
    }
    const value = parseGuess(rawValue)
    if (value === null) {
      await this.prompt(event, `请输入 0~99 的数值，例如：${this.commandPrefix()} 15.25`, this.matchActions())
      return false
    }
    player.guess = value
    room.notice = `${player.team === 'red' ? '红方' : '蓝方'}已提交回答。`
    const opponent = this.opponent(player, room)
    if (opponent.guess === null) {
      await this.prompt(event, '回答已提交，等待对手完成后结算本轮。', this.matchActions())
      return true
    }
    await this.settleMatchRound(room)
    return true
  }

  private async settleMatchRound(room: MatchRoom) {
    cancelTimer(room.timer)
    const cfg = this.cfg()
    const redCorrect = isCorrect(room.red.guess, room.red.answer.rks, cfg.tolerance)
    const blueCorrect = isCorrect(room.blue.guess, room.blue.answer.rks, cfg.tolerance)
    room.red.answerTotal += 1
    room.blue.answerTotal += 1
    if (redCorrect) room.red.answerCorrect += 1
    if (blueCorrect) room.blue.answerCorrect += 1
    room.red.history.push({
      turn: room.turn,
      hint: this.hintLabel(room.blue.pendingHint),
      guess: room.red.guess,
      result: room.red.guess === null ? 'timeout' : redCorrect ? 'correct' : 'wrong',
    })
    room.blue.history.push({
      turn: room.turn,
      hint: this.hintLabel(room.red.pendingHint),
      guess: room.blue.guess,
      result: room.blue.guess === null ? 'timeout' : blueCorrect ? 'correct' : 'wrong',
    })
    room.result = [
      `红方猜测 ${room.red.guess ?? '超时'}：${redCorrect ? '正确' : '错误'}`,
      `蓝方猜测 ${room.blue.guess ?? '超时'}：${blueCorrect ? '正确' : '错误'}`,
    ]

    if (redCorrect && !blueCorrect) return await this.finishMatch(room, 'red', '红方猜中，蓝方未猜中')
    if (blueCorrect && !redCorrect) return await this.finishMatch(room, 'blue', '蓝方猜中，红方未猜中')
    if (redCorrect && blueCorrect) return await this.finishMatch(room, 'draw', '双方均猜中')
    if (room.turn >= MAX_GUESSES) return await this.finishMatch(room, 'draw', `${MAX_GUESSES} 轮均未分胜负`)

    room.turn += 1
    room.phase = 'hint'
    room.red.guess = null
    room.blue.guess = null
    room.red.pendingHint = null
    room.blue.pendingHint = null
    room.notice = '本轮双方均未猜中，进入下一轮提示回合。'
    this.armMatchTimeout(room)
    await Promise.all([this.sendMatchState(room, room.red), this.sendMatchState(room, room.blue)])
  }

  private async onMatchTimeout(room: MatchRoom) {
    if (room.phase === 'settled') return
    if (room.phase === 'hint') {
      for (const player of [room.red, room.blue]) {
        if (!player.pendingHint) {
          const fallback = defaultMatchHint(player.sideState, player.puzzle)
          const applied = applyMatchHint(player.sideState, player.puzzle, fallback.type, fallback.arg, { StatsHint: this.cfg().statsHint }, this.rng)
          if (applied.ok) {
            player.sideState = applied.side
            player.pendingHint = applied.hint
          }
        }
      }
      room.notice = '提示选择超时，系统已代为公开双方提示。'
      await this.publishHints(room)
      return
    }
    if (room.phase === 'answer') {
      room.notice = '回答超时，未提交者视为放弃本轮。'
      await this.settleMatchRound(room)
    }
  }
  private async finishMatch(room: MatchRoom, winner: 'red' | 'blue' | 'draw', reason: string) {
    if (room.phase === 'settled') return
    room.phase = 'settled'
    cancelTimer(room.timer)
    this.matchRooms.delete(room.id)
    this.userMatches.delete(room.red.userKey)
    this.userMatches.delete(room.blue.userKey)
    const cfg = this.cfg()
    const reward = (player: MatchPlayer) => winner === 'draw'
      ? scoreForHintCount(this.opponent(player, room).sideState.hintCount || 1, cfg.maxScore) / 2
      : (winner === player.team ? scoreForHintCount(this.opponent(player, room).sideState.hintCount || 1, cfg.maxScore) : 0)
    const record = async (player: MatchPlayer) => {
      const result = winner === 'draw' ? 'draw' : winner === player.team ? 'win' : 'loss'
      try {
        await this.addScore(this.requireContext(), 'match', player.event, reward(player), {
          result,
          hints: this.opponent(player, room).sideState.hintCount,
          answerTotal: player.answerTotal,
          answerCorrect: player.answerCorrect,
          profile: player.profile,
        })
      } catch (error) {
        log.warn('[phi-plugin][grks] 记录匹配积分失败', error)
      }
    }
    await Promise.all([record(room.red), record(room.blue)])
    const resultText = [
      `猜 RKS 匹配结束：${reason}`,
      `红方答案 ${room.red.answer.rks.toFixed(4)} · 蓝方答案 ${room.blue.answer.rks.toFixed(4)}`,
      winner === 'draw' ? '结果：平局' : `胜者：${winner === 'red' ? '红方' : '蓝方'}`,
    ].join('\n')
    await Promise.all([
      this.prompt(room.red.event, resultText, this.homeActions(), this.matchView(room.red, room, true, resultText)),
      this.prompt(room.blue.event, resultText, this.homeActions(), this.matchView(room.blue, room, true, resultText)),
    ])
  }

  async cancel(event: any) {
    const identity = grksIdentity(event)
    if (this.queue.delete(identity.userId)) {
      await this.prompt(event, '已退出匹配池。', this.homeActions())
      return true
    }
    const room = this.userMatches.get(identity.userId)
    if (!room) {
      await this.prompt(event, '当前不在匹配队列或匹配房间中。', this.homeActions())
      return false
    }
    const player = room.red.userKey === identity.userId ? room.red : room.blue
    const winner = player === room.red ? 'blue' : 'red'
    await this.finishMatch(room, winner, `${player.profile.name} 主动退出，判负`)
    return true
  }

  private rankingView(result: any) {
    const metricTitle = result.kind === 'accuracy' ? '准确率榜' : result.kind === 'winRate' ? '胜率榜' : '积分榜'
    return {
      title: result.title,
      pageText: `第 ${result.page} / ${result.pages} 页 · 共 ${result.total} 位玩家`,
      metricTitle,
      rows: result.items.map((row: any, index: number) => ({
        rank: (result.page - 1) * 10 + index + 1,
        name: row.profile?.name || '匿名用户',
        avatar: row.profile?.avatar || 'Introduction',
        me: row.userId === result.meId || row.id === result.me?.id,
        metric: result.kind === 'accuracy'
          ? `${averageHints(row)?.toFixed(2) ?? '--'} 条提示`
          : result.kind === 'winRate'
            ? `${(winRate(row) * 100).toFixed(1)}%`
            : `${row.score.toFixed(2)} 分`,
        detail: result.kind === 'accuracy'
          ? `${row.hintPlays} 局统计 · 积分 ${row.score.toFixed(2)}`
          : result.kind === 'winRate'
            ? `${row.wins} 胜 · ${row.losses} 负 · ${row.draws} 平 · 积分 ${row.score.toFixed(2)}`
            : `${row.plays} 局 · 单局最高 ${row.best.toFixed(2)} 分`,
      })),
      emptyText: result.kind === 'accuracy'
        ? `暂无符合条件的玩家（至少完成 ${result.minimum} 局）`
        : result.kind === 'winRate'
          ? `暂无符合条件的玩家（至少 ${result.minimum} 场匹配对局）`
          : '暂无数据，快去玩一局吧！',
      footer: result.meRank !== null
        ? `我的排名：#${result.meRank} · ${result.me?.profile?.name || '匿名用户'}`
        : '我的排名：未上榜',
    }
  }
  async leaderboard(event: any, input: GrksRankInput) {
    const ctx = this.requireContext()
    const result = await this.queryRanking(ctx, {
      event,
      mode: input.mode,
      kind: input.kind,
      page: input.page,
      pageSize: 10,
    })
    if (!result.ok) {
      await this.prompt(event, result.text, this.homeActions())
      return false
    }
    const metric = input.kind || 'score'
    const mode = input.mode || 'normal'
    const actions: PromptAction[] = [
      { command: `/phi grks lb ${mode} ${metric} ${Math.max(1, result.page - 1)}`, label: '上一页' },
      { command: `/phi grks lb ${mode} ${metric} ${result.page + 1}`, label: '下一页' },
      { command: '/phi grks', label: '开始游戏' },
    ]
    await this.prompt(event, result.text, actions, this.rankingView(result), result.text, 'ranking')
    return true
  }

  async dispatch(event: any) {
    const text = String(event?.msg ?? event?.text ?? '')
      .replace(/^[#/]\S*\s*/, '')
      .replace(/^(grks|猜rks)\s*/, '')
      .trim()
    if (!text) return await this.start(event)
    const [head] = text.split(/\s+/)
    if (/^\d+(?:\.\d+)?$/.test(head)) return await this.guess(event, head)
    if (/^(ans|答案|放弃)$/i.test(head)) return await this.ans(event)
    if (/^(match|匹配)$/i.test(head)) return await this.match(event)
    if (/^(cancel|取消|退出)$/i.test(head)) return await this.cancel(event)
    if (/^(hint|提示)$/i.test(head)) return await this.hint(event, parseHintArgs(event.msg))
    if (/^(lb|榜)$/i.test(head)) return await this.leaderboard(event, parseRankArgs(event.msg))
    await this.prompt(event, `未知的猜 RKS 操作。使用 ${this.commandPrefix()} 开始，${this.commandPrefix()} match 匹配，${this.commandPrefix()} lb 查看积分榜。`, this.homeActions())
    return false
  }

  async dispose() {
    this.disposed = true
    cancelTimer(this.queueScanTimer)
    for (const room of this.soloRooms.values()) {
      room.settled = true
      cancelTimer(room.timer)
    }
    for (const room of this.matchRooms.values()) {
      room.phase = 'settled'
      cancelTimer(room.timer)
    }
    this.soloRooms.clear()
    this.startingRooms.clear()
    this.queue.clear()
    this.matchRooms.clear()
    this.userMatches.clear()
  }
}
