// @ts-nocheck
import { performance } from 'node:perf_hooks'
import { h } from 'koishi'

import { PHI_COMMAND_HEAD, phiMarketCallbackData, phiMenuCallbackData } from '../../constants'

import send from '../../render/send'
import { escapePromptText } from '../../render/prompt'
import { isQqMarkdownPlatform } from '../../platform/qq-markdown'
import { normalizePhiCommandHead, phiSubcommandCommand } from '../../utils/phi-command'


/** @import {botEvent} from '../../services/base-class' */

/** @param {unknown} value */
export function escapeMarkdownText(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/([|*_`~])/g, '\\$1')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}


/**
 * 判断当前事件是否来自 adapter-qq-crack 管理的 QQ 原生消息平台。
 * @param {botEvent} e
 */
export function isOfficialBot(e) {
    return isQqMarkdownPlatform(e)
}

/**
 * 构建通用的快捷操作菜单。
 * @param {{command:string,label:string}[]} commands
 * @param {string} [title]
 */
export function buildQuickCommandMarkdown(commands, title = '快捷操作') {
    if (!(commands || []).some(item => item?.command && item?.label)) return ''
    return [
        `### ${escapeMarkdownText(title)}`,
        '',
        '请使用下方键盘按钮执行快捷操作。',
    ].join('\n')
}

/**
 * 向 QQ 官方机器人发送一条带 Keyboard 的 Raw Markdown 菜单。
 * @param {botEvent} e
 * @param {string} markdown
 * @param {{command:string,label:string}[]} commands
 */
export async function sendQuickCommandMarkdown(e, markdown, commands, config, buttonsPerRow) {
    if (!isOfficialBot(e) || !config?.LetterMarkdown || !markdown) return
    return await send.prompt(e, markdown, {
        kind: 'help',
        markdown: true,
        actions: commands,
        buttonsPerRow,
        config,
        fallback: markdown,
    })
}

/**
 * 发送一次性结果页：正文/图片与快捷操作合并为同一条消息。
 * Raw Markdown 不可用或发送失败时，回退为一条不带 Keyboard 的普通消息。
 * @param {botEvent} e
 * @param {unknown} content
 * @param {{command:string,label:string}[]} commands
 * @param {{config?:any,kind?:string,markdown?:boolean,buttonsPerRow?:number,fallback?:unknown,keyboard?:any}} [options]
 */
export async function sendResultWithQuickCommands(e, content, commands, options = {}) {
    return await send.promptWithAt(e, content, {
        kind: options.kind || 'help',
        markdown: options.markdown === true,
        actions: commands,
        buttonsPerRow: options.buttonsPerRow,
        keyboard: options.keyboard,
        config: options.config,
        label: false,
        fallback: options.fallback ?? content,
    })
}

/**
 * 向 QQ 官方机器人发送快捷操作菜单。
 * @param {botEvent} e
 * @param {{command:string,label:string}[]} commands
 * @param {string} [title]
 */
export async function sendQuickCommands(e, commands, title = '快捷操作', config) {
    const markdown = buildQuickCommandMarkdown(commands, title)
    return await sendQuickCommandMarkdown(e, markdown, commands, config)
}

/**
 * 构建分组快捷操作菜单。分组只提供说明，具体操作由 Keyboard 承载。
 * @param {{title:string,commands:{command:string,label:string}[]}[]} sections
 * @param {string} [title]
 */
export function buildQuickCommandSectionsMarkdown(sections, title = '快捷操作') {
    const visible = (sections || []).filter(section => (section?.commands || []).some(item => item?.command && item?.label))
    if (!visible.length) return ''
    const lines = [
        `### ${escapeMarkdownText(title)}`,
        '',
        '请使用下方键盘按钮执行快捷操作。',
    ]
    for (const section of visible) {
        lines.push('', `#### ${escapeMarkdownText(section?.title || title)}`)
    }
    return lines.join('\n')
}

/** 构建与 mai-plugin 一致的简短帮助菜单正文。 */
export function buildHelpMenuMarkdown(title = 'Phi', intro = '这是一个查询 Phigros 成绩及相关信息的功能。') {
    return [
        `## ${escapeMarkdownText(title)}`,
        escapeMarkdownText(intro),
        '支持以下功能指令：',
    ].join('\n')
}

/** 向 QQ 官方机器人发送分组快捷操作菜单。 */
export async function sendQuickCommandSections(e, sections, title = '快捷操作', config) {
    const markdown = buildQuickCommandSectionsMarkdown(sections, title)
    const commands = (sections || []).flatMap(section => section?.commands || [])
    return await sendQuickCommandMarkdown(e, markdown, commands, config)
}

/** @param {string} commandHead @param {string} command */
function pageCommand(commandHead, command) {
    const head = normalizePhiCommandHead(commandHead)
    return head && command ? `/${head} ${command}` : ''
}

/** @param {string} commandHead */
function pageRoot(commandHead) {
    const head = normalizePhiCommandHead(commandHead)
    return head ? `/${head}` : ''
}

/**
 * 把当前消息改写成只含原始子命令的本插件指令。
 * @param {string} commandHead
 * @param {string} currentCommand
 * @param {string} [subcommand]
 */
export function replayableScoreCommand(commandHead, currentCommand, subcommand) {
    return phiSubcommandCommand(commandHead, currentCommand, subcommand)
}

/** 成绩图底部的三个快捷动作。 */
export function scoreImageQuickCommands(commandHead = PHI_COMMAND_HEAD, currentCommand = '', subcommand = '') {
    return [
        { command: replayableScoreCommand(commandHead, currentCommand, subcommand), label: '我也要查' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'myset'), label: '查分设置' },
    ]
}

/** 统计从调用渲染入口到拿到图片的完整耗时。 */
export async function timeScoreImageRender(render) {
    const start = performance.now()
    const image = await render()
    return {
        image,
        elapsedMs: Math.max(0, Math.round(performance.now() - start)),
    }
}

/** @param {unknown} value */
function isScoreImageElement(value) {
    return Boolean(
        value
        && typeof value === 'object'
        && value.attrs
        && ['img', 'image'].includes(String(value.type)),
    )
}

/** @param {any} image @param {string} alt */
function scoreImageElement(image, alt) {
    if (!isScoreImageElement(image)) return image
    return h('img', { ...image.attrs, alt: String(alt || '成绩图') })
}

/**
 * 发送 mai-plugin 风格的查询结果图：标题、图片、渲染耗时和 Keyboard 同条发送。
 * Markdown 不可用时回退为原始图片消息。
 * @param {botEvent} e
 * @param {unknown} image
 * @param {number} elapsedMs
 * @param {{alt?: string, extra?: string|(string|false|null|undefined)[], command?: string, config?: any}} [options]
 */
export async function sendScoreImage(e, image, elapsedMs, options = {}) {
    const rawExtra = (Array.isArray(options.extra) ? options.extra : options.extra ? [options.extra] : [])
        .filter(value => value !== false && value != null)
    if (!isScoreImageElement(image)) {
        return await send.promptWithAt(e, [image, ...rawExtra], { config: options.config })
    }

    const extra = rawExtra.map(value => escapePromptText(value).trim()).filter(Boolean)
    const imageWithAlt = scoreImageElement(image, options.alt || '成绩图')
    const attachedRenderMs = Number(image.attrs?.renderMs)
    const content = [
        '**查询结果**\n\n',
        imageWithAlt,
    ]
    if (!Number.isFinite(attachedRenderMs)) {
        content.push(`\n\n> 渲染耗时：${Math.max(0, Math.round(Number(elapsedMs) || 0))}ms`)
    }
    for (const line of extra) content.push(`\n\n${line}`)

    return await send.promptWithAt(e, content, {
        config: options.config,
        label: false,
        markdown: true,
        actions: scoreImageQuickCommands(PHI_COMMAND_HEAD, options.command || e.msg, e.phiSubcommand),
        buttonsPerRow: 3,
        fallback: [image, ...rawExtra],
    })
}

/** 查询页：成绩、存档、曲目与排行入口。 */
export function helpQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'pgr'), label: '📊B30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '👤个人信息' },
        { command: pageCommand(commandHead, 'update'), label: '🔄更新存档' },
        { command: pageCommand(commandHead, 'song'), label: '🎵曲目图鉴' },
        { command: pageCommand(commandHead, 'ranklist'), label: '🏆排行榜' },
        { command: pageCommand(commandHead, 'theorytable'), label: '📐理论分表' },
        { command: pageCommand(commandHead, 'rand'), label: '🎲随机曲目' },
        { command: phiMenuCallbackData('game'), type: 'callback', label: '🎮游戏功能' },
    ]
}

/** 游戏页：日常玩法与猜歌游戏入口。 */
export function gameQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'sign'), label: '✅签到' },
        { command: pageCommand(commandHead, 'task'), label: '📋每日任务' },
        { command: pageCommand(commandHead, 'jrrp'), label: '🍀今日人品' },
        { command: pageCommand(commandHead, 'guess'), label: '🖼猜曲绘' },
        { command: pageCommand(commandHead, 'ltr'), label: '🔤开字母' },
        { command: pageCommand(commandHead, 'fri'), label: '🧩弗一把' },
        { command: pageCommand(commandHead, 'market'), label: '🎨主题市场' },
        { command: phiMenuCallbackData('query'), type: 'callback', label: '↩️返回查询' },
    ]
}

const USER_SETTING_COMMAND_ALIAS = {
    theme: 'theme',
    b30AvgKind: 'avgkind',
    b30AvgColor: 'avgcolor',
    allowApiUsage: 'api',
    showB30Analysis: 'B30分析',
}

/** 按设置项决定按钮是否显示序号，并缩到 QQ 的 10 字上限。 */
function userSettingButtonLabel(option, showIndex) {
    const raw = String(option?.buttonTitle || option?.title || '').trim()
    const source = showIndex ? raw : raw.replace(/^\[\d+\]/, '')
    const chars = Array.from(source)
    if (chars.length <= 10) return source
    const prefix = source.match(/^\[\d+\]/)?.[0] || ''
    const prefixLength = prefix.length
    if (!prefixLength) return chars.slice(0, 10).join('')
    return prefix + chars.slice(prefixLength, 10).join('')
}

/** 从设置图同一份 items 生成五行设置按钮，主题市场不进入键盘。 */
export function userSettingCommandRows(items, commandHead) {
    return (items || []).flatMap(item => {
        const alias = USER_SETTING_COMMAND_ALIAS[item?.key]
        if (!alias) return []
        const row = (item.options || []).flatMap((option, index) => {
            if (item.key === 'theme' && option.market) return []
            const showIndex = item.key !== 'theme' && item.key !== 'b30AvgKind'
            const label = userSettingButtonLabel(option, showIndex)
            if (!label) return []
            return [{ command: pageCommand(commandHead, `myset ${alias} ${index}`), label }]
        })
        return row.length ? [row] : []
    })
}

/** 用户设置成功后的紧凑导航。 */
export function userSettingSuccessActions(commandHead) {
    return [
        { command: pageCommand(commandHead, 'myset'), label: '继续设置' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 成功提示使用全角方括号，避免提示转义在序号两侧插入反斜杠。 */
export function userSettingSuccessMessage(settingTitle, optionTitle) {
    const displayOption = String(optionTitle ?? '')
        .replace(/\[/g, '［')
        .replace(/\]/g, '］')
    return `✅ 已更新「${settingTitle}」为「${displayOption}」`
}

/** API 用户设置页。 */
export function apiSettingQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'apiset'), label: '刷新设置' },
        { command: pageCommand(commandHead, 'tkls'), label: 'Token列表' },
        { command: pageCommand(commandHead, 'myset'), label: '用户设置' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** API 帮助页。 */
export function apiHelpQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'bind qrcode'), label: 'TapTap' },
        { command: pageCommand(commandHead, 'tkls'), label: '🔑Token列表' },
        { command: pageCommand(commandHead, 'apiset'), label: '🔧API设置' },
        { command: pageCommand(commandHead, 'pgr'), label: '📊B30成绩' },
        { command: pageRoot(commandHead), label: '❓全部帮助' },
    ]
}

/** 更新存档结果页。 */
export function updateQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'p30'), label: 'P30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'myset'), label: '用户设置' },
    ]
}

/** 成绩筛选页。 */
export function userListQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'list'), label: '我也要查' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 存档历史页。 */
export function historyQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, '2025history'), label: '年度总结' },
        { command: pageCommand(commandHead, 'hisb30'), label: 'B30历史' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 推分建议页。 */
export function suggestQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'suggest'), label: '刷新建议' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 章节成绩页。 */
export function chapterQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'chap ALL'), label: '全部章节' },
        { command: pageCommand(commandHead, 'chap help'), label: '章节帮助' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 定数成就页。 */
export function achievementQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'achievement 1'), label: '查看低定数' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'chap ALL'), label: '章节成绩' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 绑定/更新页。 */
export function sessionQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'update'), label: '更新存档' },
        { command: pageCommand(commandHead, 'bind qrcode'), label: 'TapTap' },
        { command: pageCommand(commandHead, 'sessionToken'), label: '查看Token' },
        { command: pageCommand(commandHead, 'unbind'), label: '解绑' },
        { command: pageCommand(commandHead, 'myset'), label: '用户设置' },
    ]
}

/** 排行榜页。 */
export function rankQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'ranklist'), label: '排行榜' },
        { command: pageCommand(commandHead, 'pgr'), label: 'B30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 兼容旧调用方，默认使用帮助页菜单。 */
export const commonQuickCommands = helpQuickCommands

/**
 * @param {{slug:string,name:string,botDownloadAllowed:boolean|null}[]} themes
 * @param {{page?:number,pageCount?:number}} [pagination]
 */
export function buildMarketQuickMarkdown(themes, pagination = {}) {
    if (!themes.length) return ''
    const page = pagination.page || 1
    const pageCount = pagination.pageCount || 1
    return [
        `### 主题市场（第 ${page} / ${pageCount} 页）`,
        '',
        `本页共 ${themes.length} 个主题，请使用下方键盘按钮查看详情或切换主题。`,
    ].join('\n')
}

/** @param {{slug:string,name:string,botDownloadAllowed:boolean|null}[]} themes @param {{page?:number,pageCount?:number}} pagination */
export function marketQuickCommands(themes, pagination = {}) {
    const commandHead = `${PHI_COMMAND_HEAD}`
    const commands = []
    for (const theme of themes || []) {
        const name = escapeMarkdownText(theme.name)
        commands.push(
            { command: `/${commandHead} market detail ${theme.slug}`, label: `详情：${name}` },
            { command: `/${commandHead} market ${theme.slug}`, label: `使用：${name}` },
        )
    }
    const page = pagination.page || 1
    const pageCount = pagination.pageCount || 1
    if (pageCount > 1) {
        if (page > 1) commands.push({ command: phiMarketCallbackData('prev'), type: 'callback', label: '上一页' })
        if (page < pageCount) commands.push({ command: phiMarketCallbackData('next'), type: 'callback', label: '下一页' })
    }
    return commands
}


/**
 * @param {botEvent} e
 * @param {{slug:string,name:string,botDownloadAllowed:boolean|null}[]} themes
 * @param {{page?:number,pageCount?:number}} [pagination]
 */
export async function sendMarketQuickCommands(e, themes, pagination = {}, config) {
    const markdown = buildMarketQuickMarkdown(themes, pagination)
    return await sendQuickCommandMarkdown(e, markdown, marketQuickCommands(themes, pagination), config)
}

/**
 * 把主题市场目录图与 Keyboard 合并为一条消息。
 * @param {botEvent} e
 * @param {unknown} image
 * @param {{slug:string,name:string,botDownloadAllowed:boolean|null}[]} themes
 * @param {{page?:number,pageCount?:number}} pagination
 * @param {any} config
 * @param {string} [notice]
 */
export async function sendMarketResult(e, image, themes, pagination = {}, config, notice = '') {
    const markdown = buildMarketQuickMarkdown(themes, pagination)
    const fallbackText = markdown.replace(/^###\s*/, '')
    const content = notice ? [image, escapePromptText(notice), markdown] : [image, markdown]
    return await sendResultWithQuickCommands(
        e,
        content,
        marketQuickCommands(themes, pagination),
        {
            config,
            markdown: true,
            buttonsPerRow: 2,
            fallback: notice ? [image, notice, fallbackText] : [image, fallbackText],
        },
    )
}
