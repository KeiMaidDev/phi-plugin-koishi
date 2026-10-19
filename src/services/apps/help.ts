// @ts-nocheck
import Config from '../config-store'
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
import { sendQuickCommands, helpQuickCommands, apiHelpQuickCommands } from '../../domain/game/markdown'

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
    constructor() {
        super({
            name: 'phi-help',
            dsc: 'phigros屁股肉帮助',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${Config.getUserCfg('config', 'cmdhead')}))(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
                    fnc: 'help'
                },
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${Config.getUserCfg('config', 'cmdhead')}))(\\s*)to?k(en)?(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
                    fnc: 'tkhelp'
                },
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${Config.getUserCfg('config', 'cmdhead')}))(\\s*)api(\\s*)(命令|帮助|菜单|help|说明|功能|指令|使用说明)$`,
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
    async help(e) {

        if (await getBanGroup.get(e, 'help')) {
            send.send_with_At(e, '这里被管理员禁止使用这个功能了呐QAQ！')
            return false
        }

        const helpData = await loadHelpData()
        let head = Config.getUserCfg('config', 'cmdhead')
        head = head.match(RegExp(head))[0]
        let pluginData = await getNotes.getNotesData(e.user_id)
        send.reply(e, await picmodle.help(e, {
            helpGroup: helpData.helpGroup,
            cmdHead: head || null,
            isMaster: e.isMaster,
            background: getInfo.getill(getInfo.illlist[Math.floor((Math.random() * (getInfo.illlist.length - 1)))]),
            theme: pluginData?.theme || 'star'
        }), true)
        await sendQuickCommands(e, helpQuickCommands(head || Config.getUserCfg('config', 'cmdhead')), '帮助页常用操作')
        return true
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async tkhelp(e) {

        if (await getBanGroup.get(e, 'tkhelp')) {
            send.send_with_At(e, '这里被管理员禁止使用这个功能了呐QAQ！')
            return false
        }

        send.send_with_At(e, `sessionToken有关帮助：\n【推荐】：扫码登录TapTap获取token\n指令：/${Config.getUserCfg('config', 'cmdhead')} bind qrcode\n【基础方法】详见《Phigros非官方查分指引》：https://kdocs.cn/l/cvMDjWPTNaz4\n绑定sessionToken指令：\n/${Config.getUserCfg('config', 'cmdhead')} bind <sessionToken>`)
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async apihelp(e) {

        // if (await getBanGroup.get(e, 'apihelp')) {
        //     send.send_with_At(e, '这里被管理员禁止使用这个功能了呐QAQ！')
        //     return false
        // }
        const apiAccess = await getApiAccessState(e)
        if (!apiAccess.enabled) {
            send.send_with_At(e, apiAccess.message)
            return false
        }
        if (apiAccess.warning) send.send_with_At(e, apiAccess.warning)

        const helpData = await loadHelpData()
        let head = Config.getUserCfg('config', 'cmdhead')
        head = head.match(RegExp(head))[0]
        let pluginData = await getNotes.getNotesData(e.user_id)
        send.reply(e, await picmodle.help(e, {
            helpGroup: helpData.apiHelp,
            cmdHead: head || null,
            isMaster: e.isMaster,
            background: getInfo.getill(getInfo.illlist[Math.floor((Math.random() * (getInfo.illlist.length - 1)))]),
            theme: pluginData?.theme || 'star'
        }), true)
        await sendQuickCommands(e, apiHelpQuickCommands(head || Config.getUserCfg('config', 'cmdhead')), 'API帮助快捷操作')
    }
}
