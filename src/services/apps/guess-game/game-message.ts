import send from '../../../render/send'
import { escapePromptText } from '../../../render/prompt'
import { isQqMarkdownPlatform } from '../../../platform/qq-markdown'
import { buildGameKeyboard, type GameKeyboardMode } from './game-interaction'

export { escapePromptText }

export interface GamePromptConfig {
  LetterMarkdown?: boolean
}

export interface GamePromptOptions {
  recallMsg?: number
}

/** 发送带统一键盘的游戏状态文本；Markdown 关闭或非 QQ 平台时使用纯文本。 */
export async function sendGameStatus(
  event: any,
  markdown: string,
  text: string,
  config: GamePromptConfig | undefined,
  mode: GameKeyboardMode,
  replayCommand?: string,
  options: GamePromptOptions = {},
) {
  return send.prompt(event, markdown, {
    markdown: true,
    label: false,
    kind: 'status',
    keyboard: buildGameKeyboard(mode, replayCommand),
    config,
    recallMsg: options.recallMsg,
    fallback: text,
  })
}

/**
 * 优先把核心图片嵌入状态 Markdown。assets 不可用、平台不支持或发送失败时，
 * 发送不带图的同结构状态面板，再单独补发图片。
 */
export async function sendGameStatusWithImage(
  event: any,
  markdown: string,
  text: string,
  image: unknown,
  config: GamePromptConfig | undefined,
  mode: GameKeyboardMode,
  replayCommand?: string,
  options: GamePromptOptions = {},
) {
  if (!image) return sendGameStatus(event, markdown, text, config, mode, replayCommand, options)

  if (!config?.LetterMarkdown || !isQqMarkdownPlatform(event)) {
    await sendGameStatus(event, markdown, text, config, mode, replayCommand)
    return send.reply(event, image, false, { recallMsg: options.recallMsg })
  }

  let fellBack = false
  try {
    await send.prompt(event, [markdown, image], {
      markdown: true,
      label: false,
      kind: 'status',
      keyboard: buildGameKeyboard(mode, replayCommand),
      config,
      recallMsg: options.recallMsg,
      fallback: () => {
        fellBack = true
        throw new Error('game markdown image embedding unavailable')
      },
    })
  } catch {
    fellBack = true
  }

  if (!fellBack) return
  await sendGameStatus(event, markdown, text, config, mode, replayCommand)
  await send.reply(event, image, false, { recallMsg: options.recallMsg })
}
