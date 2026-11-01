// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import send from '../../render/send'
import GuessTips from './guess-game/guess-tips'
import GuessLetter from './guess-game/guess-letter'
import GuessIll from './guess-game/guess-ill'
import Frib19 from './guess-game/frib19'
import getBanGroup from '../../domain/user/get-ban-group'
import phiPluginBase from '../base-class'
import logger from '../../utils/logger'
import {
  GAME_HINT_KEYWORD,
  GAME_STOP_KEYWORD,
  LETTER_OPEN_KEYWORD,
  LETTER_OPEN_SONG_KEYWORD,
  normalizeGameReplayCommand,
} from './guess-game/game-interaction'

const games = [
  '(提示猜曲|tipgame)',
  '(ltr|letter|开字母).*',
  '(guess|猜曲绘)(?:\\s*\\-[lL]\\s*\\d+)?',
  '(弗一把|(?:[Ff][Rr][Ii][Bb][Ee][Rr][Gg])|(?:[Ff][Ii][Bb])|(?:[Ff][Rr][Ii]))(?:\\s*(?:(?:[Ee][Zz]|[Hh][Dd]|[Ii][Nn]|[Aa][Tt])(?:\\s*\\d+(?:\\.\\d+)?\\s*\\+?)?|\\d+(?:\\.\\d+)?\\s*\\+?))?',
].join('|')

/** @type {Record<string, { gameType: string, replayCommand?: string }>} */
let gameList = {}

function parseGameStart(message) {
  const matched = String(message ?? '').match(new RegExp(`^[#/](${PHI_COMMAND_HEAD})(\\s*)(?:${games})$`))
  const text = matched?.slice(3).find(value => value !== undefined) ?? ''
  return { text, lower: text.toLowerCase() }
}

export class phiGames extends phiPluginBase {
  guessTips
  guessLetter
  guessIll
  frib19
  runtime
  queues = new Map()

  constructor(runtime: PhiRuntime) {
    super({
      config: runtime.config,
      data: runtime.data,
      name: 'phi-games',
      dsc: 'phi-plugin 猜曲游戏',
      event: 'message',
      priority: 1000,
      rule: [],
    })
    this.runtime = runtime
    this.guessTips = new GuessTips(runtime)
    this.guessLetter = new GuessLetter(runtime)
    this.guessIll = new GuessIll(runtime)
    this.frib19 = new Frib19(runtime)
  }

  async serialized(groupId, operation) {
    const previous = this.queues.get(groupId) ?? Promise.resolve()
    let release
    const pending = new Promise(resolve => { release = resolve })
    const tail = previous.then(() => pending)
    this.queues.set(groupId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(groupId) === tail) this.queues.delete(groupId)
    }
  }

  async startGame(e, starter) {
    return starter()
  }

  async start(e) {
    const groupId = String(e.group_id || '')
    const { text, lower } = parseGameStart(e.msg)
    if (!groupId) {
      send.promptWithAt(e, '请在群聊中使用这个功能喵！')
      return false
    }
    if (gameList[groupId]) {
      send.promptWithAt(e, `当前存在未结束的游戏喵！发送“${GAME_STOP_KEYWORD}”结束后再开始新游戏。`)
      return false
    }
    if (!text) return false

    e.replayCommand = normalizeGameReplayCommand(e.msg)

    if (lower === 'tipgame' || lower === '提示猜曲') {
      if (await getBanGroup.get(e, 'tipgame')) {
        send.promptWithAt(e, '这里被管理员禁止使用这个功能了喵。')
        return false
      }
      return this.startGame(e, () => this.guessTips.start(e, gameList))
    }

    if (lower === 'guess' || lower.startsWith('猜曲绘') || lower.startsWith('guess ')) {
      if (await getBanGroup.get(e, 'guessgame')) {
        send.promptWithAt(e, '这里被管理员禁止使用这个功能了喵。')
        return false
      }
      return this.startGame(e, () => this.guessIll.start(e, gameList))
    }

    if (['弗一把', 'friberg', 'fib', 'fri'].includes(lower) || lower.startsWith('弗一把') || lower.startsWith('fri')) {
      if (await getBanGroup.get(e, 'fribgame')) {
        send.promptWithAt(e, '这里被管理员禁止使用这个功能了喵。')
        return false
      }
      return this.startGame(e, () => this.frib19.start(e, gameList))
    }

    if (lower.startsWith('ltr') || lower.startsWith('letter') || lower.startsWith('开字母')) {
      if (await getBanGroup.get(e, 'ltrgame')) {
        send.promptWithAt(e, '这里被管理员禁止使用这个功能了喵。')
        return false
      }
      return this.startGame(e, () => this.guessLetter.start(e, gameList))
    }
    return false
  }

  async guess(e) {
    if (!e.msg || !e.group_id) return false
    const groupId = String(e.group_id)
    try {
      switch (gameList[groupId]?.gameType) {
        case 'guessTips':
          logger.info(`[phi-games][guess][tips] ${e.msg}`)
          return await this.guessTips.guess(e, gameList)
        case 'guessLetter':
          logger.info(`[phi-games][guess][letter] ${e.msg}`)
          return await this.guessLetter.guess(e, gameList)
        case 'guessIll':
          logger.info(`[phi-games][guess][ill] ${e.msg}`)
          return await this.guessIll.guess(e, gameList)
        case 'frib19':
          logger.info(`[phi-games][guess][frib] ${e.msg}`)
          return await this.frib19.guess(e, gameList)
        default:
          return false
      }
    } catch (error) {
      logger.error('[phi-plugin][games]直接回答处理失败', error)
      return false
    }
  }

  async getTip(e) {
    const groupId = String(e.group_id || '')
    if (!groupId) return false
    switch (gameList[groupId]?.gameType) {
      case 'guessTips':
        return this.guessTips.getTip(e, gameList)
      case 'guessLetter':
        return this.guessLetter.getTip(e, gameList)
      default:
        return false
    }
  }

  async ans(e) {
    const groupId = String(e.group_id || '')
    if (!groupId) return false
    switch (gameList[groupId]?.gameType) {
      case 'guessTips':
        return this.guessTips.ans(e, gameList)
      case 'guessLetter':
        return this.guessLetter.ans(e, gameList)
      case 'guessIll':
        return this.guessIll.ans(e, gameList)
      case 'frib19':
        return this.frib19.ans(e, gameList)
      default:
        return false
    }
  }

  async interact(e) {
    const groupId = String(e.group_id || '')
    const type = gameList[groupId]?.gameType
    if (!type) return false
    const content = String(e.msg ?? '').trim()
    if (!content) return false

    if (content === GAME_STOP_KEYWORD) {
      await this.ans(e)
      return true
    }
    if (content === GAME_HINT_KEYWORD) {
      if (type === 'guessTips' || type === 'guessLetter') {
        await this.getTip(e)
        return true
      }
      return false
    }
    if (type === 'guessLetter' && content.startsWith(LETTER_OPEN_KEYWORD)) {
      await this.guessLetter.reveal(e, gameList)
      return true
    }
    if (type === 'guessLetter' && content.startsWith(LETTER_OPEN_SONG_KEYWORD)) {
      await this.guessLetter.openSong(e, gameList)
      return true
    }
    return this.guess(e)
  }

  async handleMessage(session, next) {
    if (!session?.userId || !session?.channelId || session.userId === session.selfId) return next()
    if (session.event?.user?.isBot) return next()
    const content = String(session.stripped?.content ?? session.content ?? '').trim()
    if (!content || content.startsWith('/') || content.startsWith('#')) return next()
    const event = this.runtime.adapter.fromSession(session)
    const groupId = String(event.group_id || '')
    if (!groupId || !gameList[groupId]) return next()
    event.replayCommand = gameList[groupId]?.replayCommand
    this.e = event
    const handled = await this.serialized(groupId, () => this.interact(event))
    return handled ? undefined : next()
  }
}
