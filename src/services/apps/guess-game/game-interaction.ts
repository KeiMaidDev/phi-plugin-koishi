import { PHI_COMMAND_HEAD } from '../../../constants'
import getInfo from '../../../domain/game/get-info'
import { buildQqKeyboard, type QqKeyboard } from '../../../platform/qq-markdown'

export const GAME_STOP_KEYWORD = '不玩了'
export const GAME_HINT_KEYWORD = '提示'
export const LETTER_OPEN_KEYWORD = '开字母'
export const LETTER_OPEN_SONG_KEYWORD = '开歌'

export type GameKeyboardMode = 'answer' | 'answer-hint' | 'letter' | 'replay'

export interface SongGuessResolution {
  status: 'correct' | 'ambiguous' | 'miss' | 'none'
  id?: string
  ids: string[]
}

export interface SongGuessLookup {
  exact(query: string): readonly string[]
  fuzzy(query: string): readonly string[]
}

const defaultLookup: SongGuessLookup = {
  exact: query => getInfo.fuzzysongsnick(query, 1),
  fuzzy: query => getInfo.fuzzysongsnick(query, 0.95),
}

/** 统一字符输入：全角转半角并忽略大小写。 */
export function normalizeCharacter(value: unknown) {
  return Array.from(String(value ?? '').trim().normalize('NFKC'))[0]?.toLocaleLowerCase() ?? ''
}

/** 只用于比较曲名与别名的轻量规范化。 */
export function normalizeSongText(value: unknown) {
  return String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase()
}

function unique(values: readonly string[]) {
  return [...new Set(values)]
}

/**
 * 先取唯一精确命中，再取模糊结果与当前题板的唯一交集。
 * 完全识别不到曲目时返回 none，让中间件继续处理普通群聊。
 */
export function classifySongGuess(
  exactIds: readonly string[],
  fuzzyIds: readonly string[],
  candidates: readonly string[],
): SongGuessResolution {
  const candidateSet = new Set(candidates)
  const exact = unique(exactIds.filter(id => candidateSet.has(id)))
  if (exact.length === 1) return { status: 'correct', id: exact[0], ids: exact }
  if (exact.length > 1) return { status: 'ambiguous', ids: exact }

  const fuzzy = unique(fuzzyIds.filter(id => candidateSet.has(id)))
  if (fuzzy.length === 1) return { status: 'correct', id: fuzzy[0], ids: fuzzy }
  if (fuzzy.length > 1) return { status: 'ambiguous', ids: fuzzy }

  const recognized = unique([...exactIds, ...fuzzyIds])
  return recognized.length
    ? { status: 'miss', ids: recognized }
    : { status: 'none', ids: [] }
}

export function resolveSongGuess(
  query: string,
  candidates: readonly string[],
  lookup: SongGuessLookup = defaultLookup,
): SongGuessResolution {
  const raw = String(query ?? '').trim()
  if (!raw || !candidates.length) return { status: 'none', ids: [] }
  return classifySongGuess(lookup.exact(raw), lookup.fuzzy(raw), candidates)
}

/** 键盘动作按游戏裁剪；开字母使用两个前缀输入按钮，其余游戏使用空 payload 输入框。 */
export function buildGameKeyboard(
  mode: GameKeyboardMode,
  replayCommand?: string,
): QqKeyboard | undefined {
  if (mode === 'replay') {
    return buildQqKeyboard([
      { command: replayCommand, label: '🕹️再来一局', enter: true, reply: false },
    ])
  }
  if (mode === 'letter') {
    return buildQqKeyboard([
      { command: LETTER_OPEN_KEYWORD, label: `🔤${LETTER_OPEN_KEYWORD}`, enter: false, reply: false },
      { command: LETTER_OPEN_SONG_KEYWORD, label: `🎶${LETTER_OPEN_SONG_KEYWORD}`, enter: false, reply: false },
      { command: GAME_HINT_KEYWORD, label: `💡${GAME_HINT_KEYWORD}`, type: 'command', enter: false, reply: false, style: 0 },
      { command: GAME_STOP_KEYWORD, label: `🔚${GAME_STOP_KEYWORD}`, type: 'command', enter: false, reply: false, style: 0 },
    ])
  }

  const commands = [
    { type: 'input' as const, label: '⬇输入答案', enter: false, reply: false },
    { command: GAME_STOP_KEYWORD, label: `🔚${GAME_STOP_KEYWORD}`, type: 'command' as const, enter: false, reply: false, style: 0 },
  ]
  if (mode === 'answer-hint') {
    commands.splice(1, 0, {
      command: GAME_HINT_KEYWORD,
      label: `💡${GAME_HINT_KEYWORD}`,
      type: 'command' as const,
      enter: false,
      reply: false,
      style: 0,
    })
  }
  return buildQqKeyboard(commands)
}

/** 将命令事件中已生成的 `/phi ...` 文本保存为可复用的开局指令。 */
export function normalizeGameReplayCommand(message: unknown) {
  const raw = String(message ?? '').trim()
  if (!raw) return `/${PHI_COMMAND_HEAD}`
  const withHead = /^[#/]\s*phi\b/i.test(raw)
    ? raw.replace(/^[#/]\s*/, '/')
    : raw.replace(/^[#/]\s*/, `/${PHI_COMMAND_HEAD} `)
  return withHead.replace(/\s+/g, ' ')
}
