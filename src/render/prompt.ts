import { h } from 'koishi'
import platform from '../platform'
import { buildQqKeyboard, createQqMarkdownElement, isQqMarkdownPlatform, type QqKeyboard, type QqKeyboardCommand } from '../platform/qq-markdown'
import { formatMarkdownImage, getMarkdownImageDimensions, isPublicHttpUrl, type MarkdownImageAssets, type MarkdownImageLogger } from '../platform/markdown-images'
import logger from '../utils/logger'
import { PHI_COMMAND_HEAD } from '../constants'

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
  type?: 'command' | 'link'
}

const DEFAULT_MARKDOWN_ACTIONS: PromptAction[] = [
  { command: `/${PHI_COMMAND_HEAD} list`, label: '我也要查' },
  { command: `/${PHI_COMMAND_HEAD} b27`, label: 'B27成绩' },
  { command: `/${PHI_COMMAND_HEAD} myset`, label: '用户设置' },
  { command: `/${PHI_COMMAND_HEAD}`, label: '帮助' },
]

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

interface PromptLocale {
  info: string
  error: string
  warning: string
  success: string
  confirm: string
  status: string
}

const PROMPT_LOCALES: Record<'zh' | 'en', PromptLocale> = {
  zh: {
    info: '提示',
    error: '错误',
    warning: '注意',
    success: '成功',
    confirm: '确认',
    status: '状态',
  },
  en: {
    info: 'Tip',
    error: 'Error',
    warning: 'Warning',
    success: 'Success',
    confirm: 'Confirm',
    status: 'Status',
  },
}

function eventLocale(event: any) {
  const value = String(event?.locale || event?.session?.locale || event?.session?.bot?.locale || '')
  return value.toLowerCase().startsWith('en') ? 'en' : 'zh'
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

async function contentToMarkdown(content: unknown, options: PromptOptions) {
  const values = Array.isArray(content) ? content : [content]
  let result = ''
  for (const value of values) {
    if (value === false || value == null) continue
    if (typeof value === 'string') {
      result += options.markdown ? value : escapePromptText(value)
    } else if (isElement(value)) {
      result += await elementToMarkdown(value, options.assets)
    } else {
      throw new Error(`unsupported prompt value: ${typeof value}`)
    }
  }
  return result
}

function inferPromptKind(markdown: string): PromptKind {
  if (/失败|错误|未找到|没有找到|无法|禁止|无权限|不足|超时|QAQ|报错|error|failed|not found|invalid|timeout|insufficient|unauthorized/i.test(markdown)) return 'error'
  if (/恭喜|成功|已完成|已绑定|已更新|更新完毕|success|completed|done/i.test(markdown)) return 'success'
  if (/确认|取消|是否|请选择|confirm|cancel|are you sure/i.test(markdown)) return 'confirm'
  if (/注意|请勿|警告|warning|caution|do not/i.test(markdown)) return 'warning'
  if (/正在|请稍等|开始|loading|starting|please wait/i.test(markdown)) return 'status'
  return 'info'
}

function applyPromptKind(event: any, markdown: string, kind?: PromptKind, label = true) {
  if (!markdown) return markdown
  // 纯图片结果是业务产物，不额外套“提示”标签。
  if (!markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()) return markdown
  const resolved = kind ?? inferPromptKind(markdown)
  if (resolved === 'help' || !label) return markdown
  const labelText = PROMPT_LOCALES[eventLocale(event)][resolved]
  return labelText ? `**${labelText}**：${markdown}` : markdown
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
    const markdown = applyPromptKind(
      wrapped,
      await contentToMarkdown(content, { ...options, assets }),
      options.kind,
      options.label,
    )
    if (!markdown.trim()) return sendFallback(wrapped, content, options)
    const prefix = options.mention ? promptMentionPrefix(wrapped) : ''
    const actions = options.actions?.length ? promptActions(options.actions) : DEFAULT_MARKDOWN_ACTIONS
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
