// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import send from '../../render/send'
import picmodle from '../../render/pic-model'
import getFile from '../../utils/get-file'
import path from 'path'
import { infoPath } from '../../utils/path'
import getBanGroup from '../../domain/user/get-ban-group';
import phiPluginBase from '../base-class';
import getNotes from '../../domain/user/get-notes'
import getInfo from '../../domain/game/get-info'
import { getApiAccessState } from '../../domain/user/api-permission'
import { buildHelpMenuMarkdown, helpQuickCommands, gameQuickCommands, apiHelpQuickCommands, isOfficialBot, sendQuickCommandMarkdown } from '../../domain/game/markdown'

/**@import {botEvent} from '../base-class' */

let helpGroup
let apiHelp

async function loadHelpData() {
    if (!helpGroup) {
        [helpGroup, apiHelp] = await Promise.all([
            getFile.FileReader(path.join(infoPath, 'help.json')),
            getFile.FileReader(path.join(infoPath, 'help', 'api.json')),
        ])
    }
    return { helpGroup, apiHelp }
}


export class phihelp extends phiPluginBase {
    constructor(runtime: PhiRuntime) {
        super({
            config: runtime.config,
            data: runtime.data,
            name: 'phi-help',
            dsc: 'phigros屁股肉帮助',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
                    fnc: 'help'
                },
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)to?k(en)?(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
                    fnc: 'tkhelp'
                },
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)api(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
                    fnc: 'apihelp'
                }

            ]
        })

    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async showMenu(e, page = 'query') {
        if (await getBanGroup.get(e, 'help')) {
            send.promptWithAt(e, '这里被管理员禁止使用这个功能了呐QAQ！')
            return false
        }

        let head = PHI_COMMAND_HEAD
        head = head.match(RegExp(head))[0]
        const commands = page === 'game'
            ? gameQuickCommands(head || PHI_COMMAND_HEAD)
            : helpQuickCommands(head || PHI_COMMAND_HEAD)
        const markdown = buildHelpMenuMarkdown('Phi-plugin', '这是一个查询 Phigros 成绩及相关信息的功能。')
        if (this.config.LetterMarkdown && isOfficialBot(e)) {
            await sendQuickCommandMarkdown(e, markdown, commands, this.config, 2)
            return true
        }
        if (page === 'game') {
            send.prompt(e, markdown, { kind: 'help', actions: commands, buttonsPerRow: 2 })
            return true
        }
        const helpData = await loadHelpData()
        let pluginData = await getNotes.getNotesData(e.user_id)
        send.prompt(e, await picmodle.help(e, {
            helpGroup: helpData.helpGroup,
            cmdHead: head || null,
            isMaster: e.isMaster,
            background: getInfo.getill(getInfo.illlist[Math.floor((Math.random() * (getInfo.illlist.length - 1)))]),
            theme: pluginData?.theme || 'star'
        }), true)
        return true
    }

    /**
     * 根命令打开查询页，QQ Keyboard 回调可切换到游戏页。
     * @param {botEvent} e
     */
    async help(e) {
        return await this.showMenu(e, 'query')
    }

    /**
     * 打开游戏页，仅供 QQ Keyboard 回调调用。
     * @param {botEvent} e
     */
    async gameMenu(e) {
        return await this.showMenu(e, 'game')
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async tkhelp(e) {

        if (await getBanGroup.get(e, 'tkhelp')) {
            send.promptWithAt(e, '这里被管理员禁止使用这个功能了呐QAQ！')
            return false
        }

        send.promptWithAt(e, `sessionToken有关帮助：\n【推荐】：点击登录链接绑定 TapTap 获取token\n指令：/${PHI_COMMAND_HEAD} bind qrcode\n【基础方法】详见《Phigros非官方查分指引》：https://kdocs.cn/l/cvMDjWPTNaz4\n绑定sessionToken指令：\n/${PHI_COMMAND_HEAD} bind <sessionToken>`, { kind: 'info', actions: [{ command: `/${PHI_COMMAND_HEAD} bind qrcode`, label: 'TapTap' }] })
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async apihelp(e) {

        // if (await getBanGroup.get(e, 'apihelp')) {
        //     send.promptWithAt(e, '这里被管理员禁止使用这个功能了呐QAQ！')
        //     return false
        // }
        const apiAccess = await getApiAccessState(this.config, e)
        if (!apiAccess.enabled) {
            send.promptWithAt(e, apiAccess.message)
            return false
        }
        if (apiAccess.warning) send.promptWithAt(e, apiAccess.warning)

        let head = PHI_COMMAND_HEAD
        head = head.match(RegExp(head))[0]
        if (this.config.LetterMarkdown && isOfficialBot(e)) {
            const markdown = buildHelpMenuMarkdown('Phi Online API', '在线查分、账户绑定与 API 数据管理。')
            await sendQuickCommandMarkdown(e, markdown, apiHelpQuickCommands(head || PHI_COMMAND_HEAD), this.config, 2)
            return true
        }
        const helpData = await loadHelpData()
        let pluginData = await getNotes.getNotesData(e.user_id)
        send.prompt(e, await picmodle.help(e, {
            helpGroup: helpData.apiHelp,
            cmdHead: head || null,
            isMaster: e.isMaster,
            background: getInfo.getill(getInfo.illlist[Math.floor((Math.random() * (getInfo.illlist.length - 1)))]),
            theme: pluginData?.theme || 'star'
        }), true)
    }
}
