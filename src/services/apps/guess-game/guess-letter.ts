// @ts-nocheck
import getInfo from '../../../domain/game/get-info'
import fCompute from '../../../domain/game/f-compute'
import getPic from '../../../render/get-pic'
import picmodle from '../../../render/pic-model'
import send from '../../../render/send'
import logger from '../../../utils/logger'
import {
  LETTER_HIDDEN_CHAR,
  allGuessed,
  encryptSongName,
  getRevealCandidates,
  hasHiddenCharacters,
  revealCharacter,
} from './letter-game-utils'
import {
  GAME_HINT_KEYWORD,
  GAME_STOP_KEYWORD,
  LETTER_OPEN_KEYWORD,
  LETTER_OPEN_SONG_KEYWORD,
  normalizeCharacter,
  resolveSongGuess,
} from './game-interaction'
import {
  escapePromptText,
  sendGameStatus,
  sendGameStatusWithImage,
} from './game-message'

const SONGWEIGHT_IDLE_TTL = 60 * 60 * 1000

/** @type {Record<string, Record<string, number>>} */
const songweights = {}
/** @type {Record<string, NodeJS.Timeout>} */
const songweightCleanupTimers = {}
/** @type {Record<string, LetterGameData>} */
const letterGameData = {}
/** @type {Map<string, Promise<unknown>>} */
const groupQueues = new Map()

function scheduleSongweightCleanup(groupId) {
  if (songweightCleanupTimers[groupId]) clearTimeout(songweightCleanupTimers[groupId])
  songweightCleanupTimers[groupId] = setTimeout(() => {
    delete songweights[groupId]
    delete songweightCleanupTimers[groupId]
  }, SONGWEIGHT_IDLE_TTL)
  songweightCleanupTimers[groupId].unref?.()
}

async function serialized(groupId, operation) {
  const previous = groupQueues.get(groupId) ?? Promise.resolve()
  let release
  const pending = new Promise(resolve => { release = resolve })
  const tail = previous.then(() => pending)
  groupQueues.set(groupId, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (groupQueues.get(groupId) === tail) groupQueues.delete(groupId)
  }
}

class LetterGameData {
  constructor({ letterNum, gameSelectList, replayCommand, event }) {
    this.letterNum = letterNum
    this.ansList = new Array(letterNum).fill('')
    this.ansIdList = new Array(letterNum).fill('')
    this.blurlist = new Array(letterNum).fill('')
    this.winnerlist = new Array(letterNum).fill('')
    this.alphalist = []
    this.lastGuessedTime = 0
    this.lastRevealedTime = 0
    this.lastTipTime = 0
    this.gameSelectList = [...gameSelectList]
    this.replayCommand = replayCommand
    this.event = event
    this.timer = null
    this.settled = false
  }
}

function parseStartArgs(message) {
  const raw = String(message ?? '').trim()
  const match = raw.match(/^[#/]\S+\s+(?:ltr|letter|开字母)\b([\s\S]*)$/i)
  return match?.[1]?.trim() ?? ''
}

function chooseSongPool(args) {
  const selected = []
  let ids = []
  for (const key of Object.keys(getInfo.DLC_Info || {})) {
    if (!args.includes(key)) continue
    selected.push(key)
    ids = ids.concat(getInfo.DLC_Info[key] || [])
  }
  if (!selected.length) {
    selected.push('pgr')
    ids = [...(getInfo.idList || [])]
  }
  return { gameSelectList: selected, ids: [...new Set(ids)] }
}

function getRandomSong(groupId, ids) {
  const weights = songweights[groupId] || (songweights[groupId] = {})
  for (const id of ids) weights[id] ||= 1
  const totalWeight = ids.reduce((total, id) => total + weights[id], 0)
  const randomWeight = fCompute.randFloatBetween(0, totalWeight, 6)
  let accumulated = 0
  for (const id of ids) {
    accumulated += weights[id]
    if (accumulated >= randomWeight) return id
  }
  return ids[fCompute.randInt(0, ids.length - 1)]
}

function rememberPickedSongs(groupId, ids) {
  const weights = songweights[groupId] || (songweights[groupId] = {})
  for (const id of ids) {
    weights[id] = Math.min(5, (weights[id] || 1) * 1.1)
  }
  scheduleSongweightCleanup(groupId)
}

function nicknameOf(event) {
  return String(
    event?.sender?.card
      || event?.sender?.name
      || event?.nickname
      || event?.user_id
      || '群友',
  )
}

function hiddenIds(game) {
  return game.ansIdList.filter((_, index) => Boolean(game.blurlist[index]))
}

function revealAllTitle(game, index) {
  game.blurlist[index] = null
}

function revealCharacterAcrossGame(game, character) {
  let changed = false
  game.ansList.forEach((song, index) => {
    const blur = game.blurlist[index]
    if (!blur) return
    const next = revealCharacter(song, blur, character)
    if (next !== blur) changed = true
    game.blurlist[index] = hasHiddenCharacters(next) ? next : null
  })
  return changed
}

function cooldownMessage(kind, seconds) {
  return `${kind}冷却还有 ${seconds}s，先耐心等一下喵。`
}

function buildLetterPanel(game, { note = '', revealAll = false } = {}) {
  const markdown = ['## Phi 开字母', '']
  const text = ['Phi 开字母']
  if (note) {
    markdown.push(`**${escapePromptText(note)}**`, '')
    text.push(note)
  }
  const scope = game.gameSelectList.join('、')
  markdown.push(`> 曲库范围：${escapePromptText(scope)}`)
  text.push(`曲库范围：${scope}`)
  game.ansList.forEach((song, index) => {
    if (revealAll || !game.blurlist[index]) {
      const winner = game.winnerlist[index]
      const suffix = winner ? ` · ${escapePromptText(winner)}` : ''
      markdown.push(`> ✅ ${escapePromptText(song)}${suffix}`)
      text.push(`✅ ${song}${winner ? ` · ${winner}` : ''}`)
      return
    }
    const masked = game.blurlist[index].replaceAll(LETTER_HIDDEN_CHAR, '?')
    markdown.push(`> 🤔 ${escapePromptText(masked)}`)
    text.push(`🤔 ${masked}`)
  })
  const opened = game.alphalist.join(' ') || '暂无'
  markdown.push(`> 💡已开字符：${escapePromptText(opened)}`)
  text.push(`💡已开字符：${opened}`)
  return { markdown: markdown.join('\n'), text: text.join('\n') }
}

async function illustrationFor(event, songId, config) {
  const info = getInfo.info(songId)
  if (!info?.illustration) return null
  try {
    if (config.LetterIllustration === '水印版') {
      return await picmodle.ill(event, {
        illustration: info.illustration,
        illustrator: info.illustrator,
      })
    }
    if (config.LetterIllustration === '原版') return getPic.getIll(songId)
  } catch (error) {
    logger.warn('[phi-plugin][letter]曲绘发送准备失败', error)
  }
  return null
}

export default class guessLetter {
  config

  constructor(runtime) {
    this.config = runtime.config
  }

  async start(e, gameList) {
    const groupId = String(e.group_id)
    if (letterGameData[groupId]) {
      await sendGameStatus(
        e,
        `**开字母已在进行中**\n\n发送“${LETTER_OPEN_KEYWORD} X”“${LETTER_OPEN_SONG_KEYWORD} 曲名”“${GAME_HINT_KEYWORD}”或“${GAME_STOP_KEYWORD}”继续。`,
        `开字母已在进行中。发送“${LETTER_OPEN_KEYWORD} X”“${LETTER_OPEN_SONG_KEYWORD} 曲名”“${GAME_HINT_KEYWORD}”或“${GAME_STOP_KEYWORD}”继续。`,
        this.config,
        'letter',
      )
      return true
    }

    const args = parseStartArgs(e.msg)
    const letterNum = Math.max(1, Math.floor(Number(this.config.LetterNum) || 8))
    const { gameSelectList, ids } = chooseSongPool(args)
    const validIds = ids.filter(id => !getInfo.info(id)?.can_t_be_letter)
    if (validIds.length < letterNum) {
      await sendGameStatus(
        e,
        '**曲库不足**\n\n当前筛选曲库中可参与开字母的曲目少于配置的曲目条数。',
        '曲库不足。当前筛选曲库中可参与开字母的曲目少于配置的曲目条数。',
        this.config,
        'letter',
      )
      return false
    }

    const game = new LetterGameData({
      letterNum,
      gameSelectList,
      replayCommand: e.replayCommand || `/phi ltr${args ? ` ${args}` : ''}`,
      event: e,
    })

    const available = new Set(validIds)
    for (let index = 0; index < game.letterNum; index++) {
      if (!available.size) break
      const pool = [...available]
      const chosenId = getRandomSong(groupId, pool)
      available.delete(chosenId)
      const info = getInfo.info(chosenId)
      const song = info?.song || chosenId
      game.ansIdList[index] = chosenId
      game.ansList[index] = song
      game.blurlist[index] = encryptSongName(song)
    }
    rememberPickedSongs(groupId, game.ansIdList)

    gameList[groupId] = { gameType: 'guessLetter', replayCommand: game.replayCommand }
    letterGameData[groupId] = game
    await this.sendPanel(e, game, {
      note: `直接回复曲名猜歌；发送“${LETTER_OPEN_KEYWORD} X”翻开字符，发送“${LETTER_OPEN_SONG_KEYWORD} 曲名”直接开出题目，也可以使用“${GAME_HINT_KEYWORD}”或“${GAME_STOP_KEYWORD}”。`,
    })
    this.refreshTimeout(groupId, gameList)
    return true
  }

  async reveal(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.revealUnlocked(e, gameList))
  }

  async revealUnlocked(e, gameList) {
    const groupId = String(e.group_id)
    const game = letterGameData[groupId]
    if (!game) return false
    const raw = String(e.msg ?? '').slice(String(e.msg ?? '').indexOf(LETTER_OPEN_KEYWORD) + LETTER_OPEN_KEYWORD.length).trim()
    const character = normalizeCharacter(raw)
    if (!character) {
      await this.sendPanel(e, game, { note: `请在“${LETTER_OPEN_KEYWORD}”后输入一个字符。` })
      return true
    }
    const label = /^[a-z]$/i.test(character) ? character.toUpperCase() : character
    if (game.alphalist.includes(label)) {
      await this.sendPanel(e, game, { note: `字符“${raw[0]}”已经开过了。` })
      return true
    }
    const left = this.cooldownLeft(game.lastRevealedTime, this.config.LetterRevealCd)
    if (left > 0) {
      await this.sendPanel(e, game, { note: cooldownMessage('开字符', left) })
      return true
    }

    game.lastRevealedTime = Date.now()
    game.alphalist.push(label)
    const changed = revealCharacterAcrossGame(game, character)
    this.refreshTimeout(groupId, gameList)
    await this.sendPanel(e, game, {
      note: changed
        ? `成功翻开字符“${raw[0]}”。`
        : `当前题目中没有字符“${raw[0]}”，已记入已开字符。`,
    })
    return true
  }

  async openSong(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.openSongUnlocked(e, gameList))
  }

  async openSongUnlocked(e, gameList) {
    const groupId = String(e.group_id)
    const game = letterGameData[groupId]
    if (!game) return false
    const msg = String(e.msg ?? '')
    const query = msg.slice(msg.indexOf(LETTER_OPEN_SONG_KEYWORD) + LETTER_OPEN_SONG_KEYWORD.length).trim()
    if (!query) {
      await this.sendPanel(e, game, { note: `请在“${LETTER_OPEN_SONG_KEYWORD}”后输入歌曲名称。` })
      return true
    }
    const resolution = resolveSongGuess(query, hiddenIds(game))
    if (resolution.status === 'none') {
      await this.sendPanel(e, game, { note: '歌曲不存在！' })
      return true
    }
    if (resolution.status === 'ambiguous') {
      await this.sendPanel(e, game, { note: '匹配到多首题目，请输入更完整的曲名。' })
      return true
    }
    if (resolution.status === 'miss') {
      const name = getInfo.info(resolution.ids[0])?.song || query
      await this.sendPanel(e, game, { note: `“${name}”不在当前未揭开的题目中。` })
      return true
    }

    const left = this.cooldownLeft(game.lastRevealedTime, this.config.LetterRevealCd)
    if (left > 0) {
      await this.sendPanel(e, game, { note: cooldownMessage('开字符', left) })
      return true
    }
    game.lastRevealedTime = Date.now()
    const index = game.ansIdList.indexOf(resolution.id)
    const song = game.ansList[index]
    revealAllTitle(game, index)
    this.refreshTimeout(groupId, gameList)
    const image = await illustrationFor(e, resolution.id, this.config)
    await this.sendPanel(e, game, {
      note: `已直接开出《${song}》，本题不记录猜中者。`,
      image,
    })
    return true
  }

  async getTip(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.getTipUnlocked(e, gameList))
  }

  async getTipUnlocked(e, gameList) {
    const groupId = String(e.group_id)
    const game = letterGameData[groupId]
    if (!game) return false
    const candidates = getRevealCandidates(game)
    if (!candidates.length) {
      await this.sendPanel(e, game, { note: '当前没有可以继续翻开的字符。' })
      return true
    }
    const left = this.cooldownLeft(game.lastTipTime, this.config.LetterTipCd)
    if (left > 0) {
      await this.sendPanel(e, game, { note: cooldownMessage('提示', left) })
      return true
    }

    game.lastTipTime = Date.now()
    const character = candidates[fCompute.randInt(0, candidates.length - 1)]
    const label = /^[a-z]$/i.test(character) ? character.toUpperCase() : character
    if (!game.alphalist.includes(label)) game.alphalist.push(label)
    revealCharacterAcrossGame(game, character)
    this.refreshTimeout(groupId, gameList)
    await this.sendPanel(e, game, { note: `随机提示翻开了字符“${character}”。` })
    return true
  }

  async guess(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.guessUnlocked(e, gameList))
  }

  async guessUnlocked(e, gameList) {
    const groupId = String(e.group_id)
    const game = letterGameData[groupId]
    if (!game) return false
    const query = String(e.msg ?? '').trim()
    if (!query || query.startsWith('/') || query.startsWith('#') || query === GAME_HINT_KEYWORD || query === GAME_STOP_KEYWORD) return false
    const resolution = resolveSongGuess(query, hiddenIds(game))
    if (resolution.status === 'none') return false

    const left = this.cooldownLeft(game.lastGuessedTime, this.config.LetterGuessCd)
    if (left > 0) {
      await this.sendPanel(e, game, { note: cooldownMessage('猜测', left) })
      return true
    }
    game.lastGuessedTime = Date.now()

    if (resolution.status === 'ambiguous') {
      await this.sendPanel(e, game, { note: '匹配到多首题目，请输入更完整的曲名。' })
      return true
    }
    if (resolution.status === 'miss') {
      const name = getInfo.info(resolution.ids[0])?.song || query
      await this.sendPanel(e, game, { note: `“${name}”不在当前未揭开的题目中。` })
      return true
    }

    const index = game.ansIdList.indexOf(resolution.id)
    const song = game.ansList[index]
    revealAllTitle(game, index)
    game.winnerlist[index] = nicknameOf(e)
    this.refreshTimeout(groupId, gameList)
    const image = await illustrationFor(e, resolution.id, this.config)
    await this.sendPanel(e, game, {
      note: `恭喜 ${nicknameOf(e)} 猜中了《${song}》。`,
      image,
    })
    return true
  }

  async ans(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.answerUnlocked(e, gameList, '游戏已结束，正确答案如下。'))
  }

  async timeout(e, gameList) {
    const groupId = String(e.group_id)
    return serialized(groupId, () => this.answerUnlocked(e, gameList, `超过 ${this.config.LetterTimeLength}s 没有新的有效操作，本局结束。`))
  }

  async answerUnlocked(e, gameList, note) {
    const groupId = String(e.group_id)
    const game = letterGameData[groupId]
    if (!game || game.settled) return false
    game.settled = true
    if (game.timer) clearTimeout(game.timer)
    delete letterGameData[groupId]
    delete gameList[groupId]
    await this.sendPanel(e, game, { note, revealAll: true, forceReplay: true })
    return true
  }

  refreshTimeout(groupId, gameList) {
    const game = letterGameData[groupId]
    if (!game) return
    if (game.timer) clearTimeout(game.timer)
    const seconds = Math.max(0, Number(this.config.LetterTimeLength) || 0)
    game.timer = setTimeout(() => {
      void serialized(groupId, () => {
        const current = letterGameData[groupId]
        if (!current || current !== game || current.settled) return
        return this.answerUnlocked(game.event, gameList, `超过 ${this.config.LetterTimeLength}s 没有新的有效操作，本局结束。`)
      })
    }, seconds * 1000)
    game.timer.unref?.()
  }

  cooldownLeft(lastAt, seconds) {
    const cooldown = Math.max(0, Number(seconds) || 0)
    if (!lastAt || !cooldown) return 0
    return Math.max(0, Math.ceil((lastAt + cooldown * 1000 - Date.now()) / 1000))
  }

  async sendPanel(e, game, { note = '', image = null, revealAll = false, forceReplay = false } = {}) {
    const finished = forceReplay || allGuessed(game)
    const content = buildLetterPanel(game, { note, revealAll: revealAll || finished })
    const mode = finished ? 'replay' : 'letter'
    if (image) {
      await sendGameStatusWithImage(
        e,
        content.markdown,
        content.text,
        image,
        this.config,
        mode,
        game.replayCommand,
      )
      return
    }
    await sendGameStatus(
      e,
      content.markdown,
      content.text,
      this.config,
      mode,
      game.replayCommand,
    )
  }
}
