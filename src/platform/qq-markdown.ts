import { h } from 'koishi'
import {
    resolveMarkdownImageSources,
    type MarkdownImageAssets,
    type MarkdownImageLogger,
} from './markdown-images'

export interface QqKeyboardCommand {
    command: string
    label: string
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
        reply: boolean
        enter: boolean
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
const MAX_KEYBOARD_BUTTONS_PER_ROW = 5
const MAX_KEYBOARD_BUTTONS = MAX_KEYBOARD_ROWS * MAX_KEYBOARD_BUTTONS_PER_ROW

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

function normalizeKeyboardCommands(commands: QqKeyboardCommand[]) {
    const result: QqKeyboardCommand[] = []
    const seen = new Set<string>()
    for (const item of commands || []) {
        const command = String(item?.command ?? '').trim()
        const label = Array.from(String(item?.label ?? '').trim()).slice(0, 10).join('')
        if (!command || !label || seen.has(command)) continue
        seen.add(command)
        result.push({
            command,
            label,
            ...(typeof item.enter === 'boolean' ? { enter: item.enter } : {}),
            ...(typeof item.reply === 'boolean' ? { reply: item.reply } : {}),
            ...(typeof item.style === 'number' ? { style: item.style } : {}),
        })
    }
    return result
}

/** 构建 QQ 指令键盘；超过 5×5 时按调用方顺序截断。 */
export function buildQqKeyboard(
    commands: QqKeyboardCommand[],
    onOverflow?: (count: number) => void,
) {
    let normalized = normalizeKeyboardCommands(commands)
    if (normalized.length > MAX_KEYBOARD_BUTTONS) {
        onOverflow?.(normalized.length)
        normalized = normalized.slice(0, MAX_KEYBOARD_BUTTONS)
    }
    if (!normalized.length) return undefined

    const rows: Array<{ buttons: QqKeyboardButton[] }> = []
    for (let index = 0; index < normalized.length; index += MAX_KEYBOARD_BUTTONS_PER_ROW) {
        rows.push({
            buttons: normalized.slice(index, index + MAX_KEYBOARD_BUTTONS_PER_ROW).map((item, offset) => ({
                id: `phi-quick-${index + offset}`,
                render_data: {
                    label: item.label,
                    visited_label: item.label,
                    style: item.style ?? 1,
                },
                action: {
                    type: 2,
                    permission: { type: 2 },
                    data: item.command,
                    reply: item.reply ?? false,
                    enter: item.enter ?? true,
                    unsupport_tips: '当前 QQ 版本不支持指令按钮，请手动发送指令。',
                },
            })),
        })
    }
    return { content: { rows } } satisfies QqKeyboard
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
