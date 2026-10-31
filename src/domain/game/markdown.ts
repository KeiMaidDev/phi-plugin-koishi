// @ts-nocheck
import { performance } from 'node:perf_hooks'
import { h } from 'koishi'

import { PHI_COMMAND_HEAD } from '../../constants'

import send from '../../render/send'
import { escapePromptText } from '../../render/prompt'
import { isQqMarkdownPlatform } from '../../platform/qq-markdown'


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

/** @param {string} commandHead */
function normalizeCommandHead(commandHead) {
    return String(commandHead ?? '').replace(/^[/#]+/, '').trim()
}

/** @param {string} commandHead @param {string} command */
function pageCommand(commandHead, command) {
    const head = normalizeCommandHead(commandHead)
    return head && command ? `/${head} ${command}` : ''
}

/** @param {string} commandHead */
function pageRoot(commandHead) {
    const head = normalizeCommandHead(commandHead)
    return head ? `/${head}` : ''
}

/** @param {string} value */
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把当前消息改写成可再次执行的本插件指令，并去掉代查他人的 `-id` 参数。
 * @param {string} commandHead
 * @param {string} currentCommand
 */
export function replayableScoreCommand(commandHead, currentCommand) {
    const head = normalizeCommandHead(commandHead)
    if (!head) return ''
    let rest = String(currentCommand ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    rest = rest.replace(new RegExp(`^(?:[#/杠刚钢纲]\\s*)?${escapeRegExp(head)}\\s*`, 'i'), '')
    rest = rest.replace(/(?:^|\s)-id\s+\d+\b/gi, ' ').replace(/\s+/g, ' ').trim()
    return rest ? `/${head} ${rest}` : `/${head}`
}

/** 成绩图底部的三个快捷动作。 */
export function scoreImageQuickCommands(commandHead = PHI_COMMAND_HEAD, currentCommand = '') {
    return [
        { command: replayableScoreCommand(commandHead, currentCommand), label: '我也要查' },
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
    const content = [
        '**查询结果**\n\n',
        scoreImageElement(image, options.alt || '成绩图'),
        `\n\n> 生成时间：${Math.max(0, Math.round(Number(elapsedMs) || 0))}ms`,
    ]
    for (const line of extra) content.push(`\n\n${line}`)

    return await send.promptWithAt(e, content, {
        config: options.config,
        label: false,
        markdown: true,
        actions: scoreImageQuickCommands(PHI_COMMAND_HEAD, options.command || e.msg),
        buttonsPerRow: 3,
        fallback: [image, ...rawExtra],
    })
}

/** 帮助页：按功能类别提供最常用的入口。 */
export function helpQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'b27'), label: '📊B27成绩' },
        { command: pageCommand(commandHead, 'p30'), label: '💯P30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '👤个人信息' },
        { command: pageCommand(commandHead, 'update'), label: '🔄更新存档' },
        { command: pageCommand(commandHead, 'myset'), label: '⚙️用户设置' },
        { command: pageCommand(commandHead, 'market'), label: '🎨主题市场' },
    ]
}

/** 用户设置页：快捷入口必须能直接执行对应设置。 */
export function userSettingQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'myset theme 0'), label: '主题风格' },
        { command: pageCommand(commandHead, 'myset avgkind 0'), label: 'B30统计数据展示' },
        { command: pageCommand(commandHead, 'myset avgcolor 0'), label: 'B30均值条配色' },
        { command: pageCommand(commandHead, 'myset api 0'), label: 'API功能开关' },
        { command: pageCommand(commandHead, 'myset B30分析 0'), label: 'B30统计分析' },
        { command: pageCommand(commandHead, 'market'), label: '主题市场' },
    ]
}

/** 用户设置页：每个设置区域单独展示该区域的全部选项。 */
export function userSettingQuickCommandSections(commandHead) {
    const command = (setting, value) => pageCommand(commandHead, `myset ${setting} ${value}`)
    return [
        {
            title: '主题风格',
            commands: [
                { command: command('theme', 0), label: '[0]默认' },
                { command: command('theme', 1), label: '[1]寒冬' },
                { command: command('theme', 2), label: '[2]使一颗心免于哀伤' },
                { command: command('theme', 3), label: '[3]大师赛2' },
            ],
        },
        {
            title: 'B30统计数据展示',
            commands: [
                { command: command('avgkind', 0), label: '[0]全部统计' },
                { command: command('avgkind', 1), label: '[1]仅B30' },
                { command: command('avgkind', 2), label: '[2]仅Top' },
                { command: command('avgkind', 3), label: '[3]隐藏' },
            ],
        },
        {
            title: 'B30均值条配色',
            commands: [
                { command: command('avgcolor', 0), label: '[0]红' },
                { command: command('avgcolor', 1), label: '[1]金' },
                { command: command('avgcolor', 2), label: '[2]蓝' },
                { command: command('avgcolor', 3), label: '[3]绿' },
            ],
        },
        {
            title: 'API功能开关',
            commands: [
                { command: command('api', 0), label: '[0]启用' },
                { command: command('api', 1), label: '[1]禁用' },
            ],
        },
        {
            title: 'B30统计分析',
            commands: [
                { command: command('B30分析', 0), label: '[0]显示' },
                { command: command('B30分析', 1), label: '[1]隐藏' },
            ],
        },
    ]
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
        { command: pageCommand(commandHead, 'b27'), label: '📊B27成绩' },
        { command: pageRoot(commandHead), label: '❓全部帮助' },
    ]
}

/** 更新存档结果页。 */
export function updateQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
        { command: pageCommand(commandHead, 'p30'), label: 'P30成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'myset'), label: '用户设置' },
    ]
}

/** 成绩筛选页。 */
export function userListQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'list'), label: '全部成绩' },
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 存档历史页。 */
export function historyQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, '2025history'), label: '年度总结' },
        { command: pageCommand(commandHead, 'hisb30'), label: 'B30历史' },
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
        { command: pageCommand(commandHead, 'info'), label: '个人信息' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 推分建议页。 */
export function suggestQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'suggest'), label: '刷新建议' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 章节成绩页。 */
export function chapterQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'chap ALL'), label: '全部章节' },
        { command: pageCommand(commandHead, 'chap help'), label: '章节帮助' },
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
        { command: pageCommand(commandHead, 'list'), label: '成绩筛选' },
        { command: pageRoot(commandHead), label: '帮助' },
    ]
}

/** 定数成就页。 */
export function achievementQuickCommands(commandHead) {
    return [
        { command: pageCommand(commandHead, 'achievement 1'), label: '查看低定数' },
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
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
        { command: pageCommand(commandHead, 'b27'), label: 'B27成绩' },
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
function marketQuickCommands(themes, pagination = {}) {
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
        if (page > 1) commands.push({ command: `/${commandHead} pr`, label: '上一页' })
        if (page < pageCount) commands.push({ command: `/${commandHead} nx`, label: '下一页' })
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
