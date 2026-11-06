import { h } from 'koishi'
import platform from '../platform'
import { buildQqKeyboard, createQqMarkdownElement, isQqMarkdownPlatform, type QqKeyboard, type QqKeyboardCommand } from '../platform/qq-markdown'
import { formatMarkdownImage, getMarkdownImageDimensions, isPublicHttpUrl, type MarkdownImageAssets, type MarkdownImageLogger } from '../platform/markdown-images'
import logger from '../utils/logger'

const platformApi = platform as any
const promptLogger = logger as MarkdownImageLogger

let defaultPromptConfig: PromptOptions['config']
let defaultAssets: (() => MarkdownImageAssets | undefined) | undefined

export function configurePrompts(config?: PromptOptions['config'], getAssets?: () => MarkdownImageAssets | undefined) {
  defaultPromptConfig = config
  defaultAssets = getAssets
}

export type PromptKind = 'info' | 'help' | 'error' | 'warning' | 'success' | 'confirm' | 'status'

export interface PromptAction extends QqKeyboardCommand {
  href?: string
  type?: 'command' | 'link' | 'input' | 'callback'
}

export interface PromptOptions {
  kind?: PromptKind
  label?: boolean
  markdown?: boolean
  mention?: boolean
  quote?: boolean
  actions?: PromptAction[]
  keyboard?: QqKeyboard | false
  buttonsPerRow?: number
  recallMsg?: number
  data?: Record<string, unknown>
  fallback?: unknown | (() => unknown | Promise<unknown>)
  assets?: MarkdownImageAssets
  config?: { LetterMarkdown?: boolean }
}

/** 保留换行，同时转义纯文本中的 Markdown 语法。 */
export function escapePromptText(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => {
      const escaped = line
        .replace(/\\/g, '\\\\')
        .replace(/([*_`~[\]<>])/g, '\\$1')
        .replace(/\|/g, '\\|')
      return escaped.replace(/^(\s*)([#>+-])(?=\s)/, '$1\\$2')
    })
    .join('\n')
}

function escapeMarkdownUrl(value: unknown) {
  return String(value ?? '')
    .replace(/\s/g, '%20')
    .replace(/\)/g, '\\)')
}
function escapeMarkdownAttribute(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}


function isElement(value: any) {
  return value && typeof value === 'object' && typeof value.type === 'string' && value.attrs && Array.isArray(value.children)
}

async function resolveImageSource(source: unknown, assets?: MarkdownImageAssets) {
  if (isPublicHttpUrl(source)) return source
  if (!assets?.transform) throw new Error('assets service is unavailable')
  const transformed = await assets.transform(String(h.image(source as any)))
  const image = h.parse(transformed).find(element => element.type === 'img')
  const resolved = image?.attrs?.src
  if (!isPublicHttpUrl(resolved)) throw new Error('assets transform did not return a public HTTP(S) URL')
  return resolved
}

async function elementToMarkdown(element: any, assets?: MarkdownImageAssets): Promise<string> {
  switch (element.type) {
    case 'text':
      return escapePromptText(element.attrs?.content)
    case 'br':
      return '\n'
    case 'p':
      return `${await elementsToMarkdown(element.children, assets)}\n`
    case 'quote':
      // rawmarkdown 不携带引用；引用只由普通消息回退路径处理。
      return ''
    case 'at': {
      if (element.attrs?.type === 'all') return '<qqbot-at-everyone />'
      const id = element.attrs?.id ?? element.attrs?.userId
      return id ? `<qqbot-at-user id="${escapeMarkdownAttribute(id)}" />` : ''
    }
    case 'img':
    case 'image': {
      const source = element.attrs?.src ?? element.attrs?.url
      if (!source) throw new Error('image source is missing')
      const resolved = await resolveImageSource(source, assets)
      const alt = element.attrs?.alt ?? element.attrs?.title ?? '图片'
      const width = Number(element.attrs?.width)
      const height = Number(element.attrs?.height)
      const dimensions = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
        ? { width, height }
        : await getMarkdownImageDimensions(String(source))
      const renderMs = Number(element.attrs?.renderMs)
      const timing = Number.isFinite(renderMs)
        ? `\n\n> 渲染耗时：${Math.max(0, Math.round(renderMs))}ms`
        : ''
      return `${formatMarkdownImage(alt, resolved, dimensions)}${timing}`
    }
    case 'a': {
      const href = element.attrs?.href
      const text = await elementsToMarkdown(element.children, assets)
      return href ? `[${text || escapePromptText(href)}](${escapeMarkdownUrl(href)})` : text
    }
    case 'markdown':
      return String(element.attrs?.content ?? element.children?.map((child: any) => child.attrs?.content ?? '').join('') ?? '')
    case 'face':
    case 'button':
      return ''
    default:
      if (element.children?.length) return elementsToMarkdown(element.children, assets)
      throw new Error(`unsupported prompt element: ${element.type}`)
  }
}

async function elementsToMarkdown(values: any[], assets?: MarkdownImageAssets): Promise<string> {
  let result = ''
  for (const value of values || []) {
    if (value === false || value == null) continue
    if (typeof value === 'string') {
      result += escapePromptText(value)
    } else if (isElement(value)) {
      result += await elementToMarkdown(value, assets)
    } else {
      throw new Error(`unsupported prompt value: ${typeof value}`)
    }
  }
  return result
}

function appendMarkdownBlock(result: string, chunk: string) {
  if (!chunk) return result
  if (!result) return chunk
  if (result.endsWith('\n') || chunk.startsWith('\n')) return result + chunk
  return `${result}\n\n${chunk}`
}

async function contentToMarkdown(content: unknown, options: PromptOptions) {
  const values = Array.isArray(content) ? content : [content]
  let result = ''
  for (const value of values) {
    if (value === false || value == null) continue
    let chunk = ''
    if (typeof value === 'string') {
      chunk = options.markdown ? value : escapePromptText(value)
    } else if (isElement(value)) {
      chunk = await elementToMarkdown(value, options.assets)
    } else {
      throw new Error(`unsupported prompt value: ${typeof value}`)
    }
    result = appendMarkdownBlock(result, chunk)
  }
  return result
}

function promptReplyData(options: PromptOptions) {
  const data = { ...(options.data || {}) }
  if (options.recallMsg) data.recallMsg = options.recallMsg
  return data
}

function promptActions(actions?: PromptAction[]) {
  if (!actions?.length) return undefined
  return actions.map(action => ({
    ...action,
    command: action.type === 'link' ? (action.href || action.command) : action.command,
    type: action.type,
  }))
}

function promptMentionPrefix(event: any) {
  const userId = event?.userId ?? event?.user_id ?? event?.session?.userId
  if (!userId || (!event?.isGroup && !event?.isGuild && !event?.group_id && !event?.guildId)) return ''
  return `<qqbot-at-user id="${escapeMarkdownAttribute(userId)}" />\n`
}

async function sendFallback(event: any, content: unknown, options: PromptOptions) {
  const fallback = typeof options.fallback === "function" ? await options.fallback() : options.fallback ?? content
  const data = promptReplyData(options)
  if (options.mention) return platformApi.sendWithAt(event, fallback as any, options.quote ?? false, data)
  return platformApi.reply(event, fallback as any, { quote: options.quote ?? false, ...data })
}

/**
 * 发送一条业务提示。仅 QQ 原生 Markdown 平台使用 rawmarkdown，其它情况和失败路径回退原消息。
 */
export async function sendPrompt(event: any, content: unknown, options: PromptOptions = {}) {
  const wrapped = platformApi.wrapEvent(event)
  const config = options.config ?? defaultPromptConfig
  const assets = options.assets ?? defaultAssets?.()
  if (!config?.LetterMarkdown || !isQqMarkdownPlatform(wrapped)) {
    return sendFallback(wrapped, content, options)
  }

  try {
    const markdown = await contentToMarkdown(content, { ...options, assets })
    if (!markdown.trim()) return sendFallback(wrapped, content, options)
    const prefix = options.mention ? promptMentionPrefix(wrapped) : ''
    const actions = promptActions(options.actions)
    const keyboard = options.keyboard === false
      ? undefined
      : options.keyboard ?? buildQqKeyboard(actions, undefined, options.buttonsPerRow)
    const message = await createQqMarkdownElement(
      `${prefix}${markdown}`,
      keyboard,
      assets,
      promptLogger,
    )
    const sent = await platformApi.reply(wrapped, message, promptReplyData(options))
    if ((sent as any)?.error?.length) throw new Error('QQ rawmarkdown send failed')
    return sent
  } catch (error) {
    promptLogger.warn('[phi-plugin] 提示 Markdown 发送失败，回退普通消息', error)
    return sendFallback(wrapped, content, options)
  }
}

export function sendPromptWithAt(event: any, content: unknown, options: PromptOptions = {}) {
  return sendPrompt(event, content, { ...options, mention: true, quote: options.quote ?? false })
}
