import { h } from 'koishi'
import {
    resolveMarkdownImageSources,
    type MarkdownImageAssets,
    type MarkdownImageLogger,
} from './markdown-images'

export interface QqKeyboardCommand {
    command?: string
    label: string
    type?: 'command' | 'input' | 'link' | 'callback'
    href?: string
    enter?: boolean
    reply?: boolean
    style?: number
}

export interface QqKeyboardButton {
    id: string
    render_data: {
        label: string
        visited_label: string
        style: number
    }
    action: {
        type: number
        permission: { type: number }
        data: string
        reply?: boolean
        enter?: boolean
        unsupport_tips: string
    }
}

export interface QqKeyboard {
    content: {
        rows: Array<{ buttons: QqKeyboardButton[] }>
    }
}

const QQ_MARKDOWN_PLATFORMS = new Set(['qq', 'qqguild'])
const MAX_KEYBOARD_ROWS = 5
const DEFAULT_KEYBOARD_BUTTONS_PER_ROW = 2

/** 返回事件所在的 QQ 原生命令平台。 */
export function getQqPlatform(event: any) {
    const value = event?.platform
        || event?.session?.platform
        || event?.session?.bot?.platform
        || event?.bot?.adapter
        || ''
    return String(value).trim().toLowerCase()
}

export function isQqMarkdownPlatform(event: any) {
    return QQ_MARKDOWN_PLATFORMS.has(getQqPlatform(event))
}

function keyboardData(item: QqKeyboardCommand) {
    if (item.type === 'input') return String(item.command || '') || ' '
    return String(item.type === 'link' ? item.href || item.command || '' : item.command || '').trim()
}

function normalizeKeyboardCommands(commands: QqKeyboardCommand[], seen: Set<string>) {
    const result: QqKeyboardCommand[] = []
    for (const item of commands || []) {
        const command = keyboardData(item)
        const label = Array.from(String(item?.label ?? '').trim()).slice(0, 10).join('')
        if (!command || !label || seen.has(command)) continue
        seen.add(command)
        result.push({
            command,
            label,
            type: item.type === 'input' || item.type === 'link' || item.type === 'callback' ? item.type : 'command',
            ...(item.type === 'link' && item.href ? { href: item.href } : {}),
            ...(typeof item.enter === 'boolean' ? { enter: item.enter } : {}),
            ...(typeof item.reply === 'boolean' ? { reply: item.reply } : {}),
            ...(typeof item.style === 'number' ? { style: item.style } : {}),
        })
    }
    return result
}

function buildKeyboard(rows: QqKeyboardCommand[][]) {
    let buttonIndex = 0
    return {
        content: {
            rows: rows
                .filter(row => row.length)
                .map(row => ({
                    buttons: row.map(item => {
                        const isLink = item.type === 'link'
                        const isCallback = item.type === 'callback'
                        const isInput = item.type === 'input'
                        const action = isLink
                            ? {
                                type: 0,
                                permission: { type: 2 },
                                data: keyboardData(item),
                                unsupport_tips: '当前 QQ 版本不支持链接按钮，请手动打开链接。',
                            }
                            : isCallback
                                ? {
                                    type: 1,
                                    permission: { type: 2 },
                                    data: keyboardData(item),
                                    unsupport_tips: '当前 QQ 版本不支持回调按钮，请发送 /phi 重新打开菜单。',
                                }
                                : isInput
                                    ? {
                                        type: 2,
                                        permission: { type: 2 },
                                        data: keyboardData(item),
                                        reply: false,
                                        enter: false,
                                        unsupport_tips: '当前 QQ 版本不支持输入按钮，请手动输入答案后发送。',
                                    }
                                    : {
                                        type: 2,
                                        permission: { type: 2 },
                                        data: keyboardData(item),
                                        reply: item.reply ?? false,
                                        enter: item.enter ?? true,
                                        unsupport_tips: '当前 QQ 版本不支持指令按钮，请手动发送指令。',
                                    }
                        const index = buttonIndex++
                        return {
                            id: `phi-quick-${index}`,
                            render_data: {
                                label: item.label,
                                visited_label: item.label,
                                style: item.style ?? 1,
                            },
                            action,
                        }
                    }),
                })),
        },
    } satisfies QqKeyboard
}

/** 构建 QQ 指令/链接/回调键盘；默认每行 2 个，超过 5 行时按调用方顺序截断。 */
export function buildQqKeyboard(
    commands: QqKeyboardCommand[],
    onOverflow?: (count: number) => void,
    buttonsPerRow = DEFAULT_KEYBOARD_BUTTONS_PER_ROW,
) {
    const requestedColumns = Math.floor(Number(buttonsPerRow))
    const columns = Number.isFinite(requestedColumns) && requestedColumns >= 1 && requestedColumns <= 5
        ? requestedColumns
        : DEFAULT_KEYBOARD_BUTTONS_PER_ROW
    const maxButtons = MAX_KEYBOARD_ROWS * columns
    let normalized = normalizeKeyboardCommands(commands, new Set<string>())
    if (normalized.length > maxButtons) {
        onOverflow?.(normalized.length)
        normalized = normalized.slice(0, maxButtons)
    }
    if (!normalized.length) return undefined

    const rows: QqKeyboardCommand[][] = []
    for (let index = 0; index < normalized.length; index += columns) {
        rows.push(normalized.slice(index, index + columns))
    }
    return buildKeyboard(rows)
}

/** 按调用方分组构建键盘；每组最多 5 个，总共最多 5 行。 */
export function buildQqKeyboardRows(
    groups: QqKeyboardCommand[][],
    onOverflow?: (count: number) => void,
) {
    const seen = new Set<string>()
    const rows: QqKeyboardCommand[][] = []
    let overflow = 0
    for (const group of groups || []) {
        const normalized = normalizeKeyboardCommands(group, seen)
        if (!normalized.length) continue
        if (rows.length >= MAX_KEYBOARD_ROWS) {
            overflow += normalized.length
            continue
        }
        const visible = normalized.slice(0, 5)
        overflow += normalized.length - visible.length
        rows.push(visible)
    }
    if (overflow) onOverflow?.(overflow)
    if (!rows.length) return undefined
    return buildKeyboard(rows)
}

export async function createQqMarkdownElement(
    content: string,
    keyboard?: QqKeyboard | string,
    assets?: MarkdownImageAssets,
    logger?: MarkdownImageLogger,
) {
    const resolved = await resolveMarkdownImageSources(content, assets, logger)
    if (keyboard) {
        return h('qq:rawmarkdown', {
            markdown: { content: resolved },
            keyboard,
        })
    }
    return h('qq:rawmarkdown-without-keyboard', { content: resolved })
}
