// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import send from '../../render/send'
import Save from '../../domain/save/save'
import ScoreHistory from '../../domain/save/score-history'
import getQRcode from '../../vendor/phigros/get-qr-code'
import common from '../common'
import fCompute from '../../domain/game/f-compute'
import getBanGroup from '../../domain/user/get-ban-group';
import { allLevel, redisPath } from "../../domain/game/const-num"
import makeRequest from '../../providers/phi-api/make-request'
import saveHistory from '../../domain/save/save-history'
import getNotes from '../../domain/user/get-notes'
import { APII18NCN } from '../../domain/game/const-num'
import phiPluginBase from '../base-class'
import logger from '../../utils/logger'
import segment from '../../platform/segment'
import getInfo from '../../domain/game/get-info'
import picmodle from '../../render/pic-model'
import { canUseApi } from '../../domain/user/api-permission'
import platform, { redis } from '../../platform/index'
import { UserCredentials } from '../../domain/user/user-credentials'
import { sendResultWithQuickCommands, sessionQuickCommands, updateQuickCommands } from '../../domain/game/markdown'
import {
    getBindingReminder,
    bindingPromptActions,
    bindingSuccessActions,
    unbindConfirmActions,
    unbindFailureActions,
    unbindResultActions,
} from '../../render/binding-prompt'

/**@import {botEvent} from '../base-class' */

export class phisstk extends phiPluginBase {
    constructor(runtime: PhiRuntime) {
        super({
            config: runtime.config,
            data: runtime.data,
            name: 'phi-sessionToken',
            dsc: 'sessionToken获取',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})(\\s*)(cn|gb)?(绑定|bind).*$`,
                    fnc: 'bind'
                },
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})(\\s*)(更新存档|update)$`,
                    fnc: 'update'
                },
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})(\\s*)(解绑|unbind)$`,
                    fnc: 'unbind'
                },
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})(\\s*)(clean)$`,
                    fnc: 'clean'
                },
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})(\\s*)session[tT]oken$`,
                    fnc: 'getSstk'
                }
            ]
        })

    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async bind(e) {

        const credentials = UserCredentials.fromEvent(e)

        if (await getBanGroup.get(e, 'bind')) {
            send.promptWithAt(e, '当前群组已禁用绑定功能。', {
                kind: 'error',
                actions: [{ command: `/${PHI_COMMAND_HEAD}`, label: '帮助' }],
            })
            return false
        }

        let sessionToken =/**@type {phigrosToken} */ (e.msg.replace(/[#/](.*?)(cn|gb)?(绑定|bind)(\s*)/, "").match(/[0-9a-zA-Z]{25}|qrcode/g)?.[0])
        const useWhich = e.msg.match(/[#/](.*?)(cn|gb)?(绑定|bind)(\s*)/)?.[2]

        /** @type {boolean} */
        let isGlobal = useWhich ? useWhich === 'gb' : this.config.defaultGlobal;
        const allowApi = await canUseApi(this.config, e)
        let apiBindingSucceeded = false

        /**精简回复模式：仅发送登录链接、绑定成功提示、成绩更新图与API不可用提示，避免官方Bot被动回复超出条数限制 */
        const simpleReply = this.config.SimpleBindReply

        let localPhigrosToken = await credentials.getSessionToken()

        if (!sessionToken) {
            let apiId = e.msg.replace(/[#/](.*?)(绑定|bind)(\s*)/, "").match(/[0-9]+/g)?.[0]
            if (apiId && allowApi) {
                const result = await credentials.bindWithApiId(apiId)
                if (result?.apiUserId) {
                    let resMsg = `绑定成功！您的查分ID为：${result.apiUserId}，请妥善保管嗷！`
                    send.promptWithAt(e, resMsg, { keyboard: false })
                    let updateData = await credentials.getUpdatedSaveFromApi()
                    let history = await credentials.getCloudHistory(['data', 'rks', 'scoreHistory'])
                    if (updateData && history) await build(this.config, e, updateData, history, sessionQuickCommands, '绑定页快捷操作', { simpleReply })
                    else send.promptWithAt(e, `绑定成功，但暂时无法读取在线存档。请稍后发送 /${PHI_COMMAND_HEAD} update 重试。`, { kind: 'success', actions: bindingSuccessActions() })
                    return true
                }
                if (!result) {
                    send.promptWithAt(e, `没有找到查分 ID ${apiId} 对应的用户，请检查后重试。\n\n${getBindingReminder(e, this.config)}`, { kind: 'warning', actions: bindingPromptActions() })
                    return false
                }
            } else {
                if (apiId) {
                    send.promptWithAt(e, `当前未连接查分 API，暂时无法使用查分 ID 绑定。\n\n${getBindingReminder(e, this.config)}`, { kind: 'warning', actions: bindingPromptActions() })
                    return false
                }
            }
            if (!localPhigrosToken) {
                send.promptWithAt(e, getBindingReminder(e, this.config), { kind: 'warning', actions: bindingPromptActions() })
                return false
            }

        }

        if (sessionToken == "qrcode") {
            /**用户若已经触发且未绑定，则重新发送登录链接 */
            let key = `${redisPath}:qrcode:${e.user_id}`
            let timeOutKey = `${redisPath}:qrcodeTimeOut:${e.user_id}`
            let qrcode = await redis.get(key)
            if (qrcode) {
                let qrcodeTimeOut = await redis.ttl(timeOutKey)
                let recallTime = qrcodeTimeOut
                if (qrcodeTimeOut >= 60) recallTime = 60
                if (this.config.TapTapLoginQRcode) {
                    await send.promptWithAt(e, `请点击下方按钮登录 TapTap。登录链接仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。\n链接剩余时间：${qrcodeTimeOut} 秒`, {
                        kind: 'info',
                        actions: [{ type: 'link', href: qrcode, label: 'TapTap' }],
                        fallback: async () => [segment.image(await getQRcode.getQRcode(qrcode)), `请使用 TapTap 扫描二维码完成登录。二维码仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。\n二维码剩余时间：${qrcodeTimeOut} 秒`],
                        recallMsg: recallTime,
                    });
                } else {
                    await send.promptWithAt(e, `请点击链接登录 TapTap。登录链接仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。\n链接剩余时间：${qrcodeTimeOut} 秒\n${qrcode}`, { kind: 'info', recallMsg: recallTime, keyboard: false });
                }
                return
            }

            let request = await getQRcode.getRequest(isGlobal);
            let qrCodeMsg;
            if (this.config.TapTapLoginQRcode) {
                qrCodeMsg = await send.promptWithAt(e, '请点击下方按钮登录 TapTap。登录链接仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。', {
                    kind: 'info',
                    actions: [{ type: 'link', href: request.data.qrcode_url, label: 'TapTap' }],
                    fallback: async () => [segment.image(await getQRcode.getQRcode(request.data.qrcode_url)), '请使用 TapTap 扫描二维码完成登录。二维码仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。'],
                    recallMsg: 60,
                });
            } else {
                qrCodeMsg = await send.promptWithAt(e, `请点击链接登录 TapTap。登录链接仅限本人使用；登录可能造成账号及财产损失，请仅在信任本 Bot 时操作。\n${request.data.qrcode_url}`, { kind: 'info', recallMsg: 60, keyboard: false });
            }
            let t1 = new Date().getTime();
            /**@type {any} */
            let result;
            /**是否已处理首次扫码等待状态 */
            let flag = false;
            /**判断adapter是否为QQBot，如果是并且超时时间大于270秒则将超时时间改为270秒，以免被动消息回复超时**/
            let QRCodetimeout = request.data.expires_in
            if (fCompute.getAdapterName(e) === 'QQBot' && request.data.expires_in > 270) QRCodetimeout = 270
            /**利用redis的超时机制，设置一个生命与超时时间一致的键值作为倒计时器，不存储值仅提供倒计时 */
            await redis.set(timeOutKey, '1', { EX: QRCodetimeout })

            while (new Date().getTime() - t1 < QRCodetimeout * 1000) {
                result = await getQRcode.checkQRCodeResult(request, isGlobal);
                if (!flag) {
                    /**存储登录链接，生命为3秒，以便在代码意外被终止再次触发时不会阻塞正常绑定 */
                    await redis.set(key, request.data.qrcode_url, { EX: 3 })
                }
                if (!result.success) {
                    if (result.data.error == "authorization_waiting" && !flag) {
                        platform.recall(e, qrCodeMsg)
                        flag = true;
                    }
                } else {
                    break
                }
                await common.sleep(2000)
            }

            redis.del(key) //绑定完成、超时后删除键值
            redis.del(timeOutKey)

            if (!result.success) {
                send.promptWithAt(e, `登录操作已超时，请重新发起绑定。\n\n${getBindingReminder(e, this.config)}`, { kind: 'warning', actions: bindingPromptActions() });
                return true
            }
            try {
                sessionToken = await getQRcode.getSessionToken(result, isGlobal);
            } catch (err) {
                logger.error(err)
                send.promptWithAt(e, `未能获取 sessionToken。请确认 Phigros 已登录 TapTap，并完成一次游戏数据同步后重试。\n\n${getBindingReminder(e, this.config)}`, { kind: 'error', actions: bindingPromptActions() })
                return true
            }
        }

        sessionToken = sessionToken || localPhigrosToken

        if (!simpleReply && !this.config.isGuild) {

            send.prompt(e, "正在完成绑定，请稍候。", false, { kind: 'info', recallMsg: 5, keyboard: false })
            // return true
        }

        if (allowApi) {
            try {

                let result = await credentials.bindWithSessionToken(sessionToken, isGlobal)
                if (result?.apiUserId) {
                    apiBindingSucceeded = true
                    let resMsg = `绑定成功！您的查分ID为：${result.apiUserId}，请妥善保管嗷！`
                    send.promptWithAt(e, resMsg, { keyboard: false })
                    let oldHistory = await credentials.getLocalHistory()
                    if (oldHistory) {
                        await credentials.uploadHistory(oldHistory)
                    }
                    let updateData = await credentials.getUpdatedSaveFromApi()
                    let history = await credentials.getCloudHistory(['data', 'rks', 'scoreHistory'])
                    if (updateData && history) await build(this.config, e, updateData, history, sessionQuickCommands, '绑定页快捷操作', { simpleReply })
                    else send.promptWithAt(e, `绑定成功，但暂时无法读取在线存档。请稍后发送 /${PHI_COMMAND_HEAD} update 重试。`, { kind: 'success', actions: bindingSuccessActions() })
                    return true
                }
                logger.warn('[phi-plugin] API绑定未完成，将改用当前 Bot 本地绑定')
            } catch (err) {
                logger.warn('[phi-plugin] API绑定异常，将仅更改本地绑定状态', err)
            }
        }



        try {
            let updateData = apiBindingSucceeded
                ? await credentials.getUpdatedSaveFromLocal(sessionToken, isGlobal)
                : await credentials.bindLocallyWithSessionToken(sessionToken, isGlobal)
            if (!updateData) return true;
            send.promptWithAt(e, `${apiBindingSucceeded ? '' : '在线绑定暂不可用，已完成本地绑定。\n'}请妥善保管 sessionToken；如需查看当前绑定，请私聊发送 /${PHI_COMMAND_HEAD} sessionToken。`, false, { recallMsg: 10, keyboard: false })
            let history = await credentials.getLocalHistory()
            if (history) await build(this.config, e, updateData, history, sessionQuickCommands, '绑定页快捷操作', { simpleReply })
            else send.promptWithAt(e, `绑定成功，但暂时无法读取本地存档。请稍后发送 /${PHI_COMMAND_HEAD} update 重试。`, { kind: 'success', actions: bindingSuccessActions() })
        } catch (error) {
            logger.error(error)
            send.promptWithAt(e, `绑定状态已保存，但读取存档失败。请稍后发送 /${PHI_COMMAND_HEAD} update 重试。`, { kind: 'warning', actions: bindingSuccessActions() })
        }

        return true
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async update(e) {

        const credentials = UserCredentials.fromEvent(e)

        if (await getBanGroup.get(e, 'update')) {
            send.promptWithAt(e, '这里被管理员禁止使用这个功能了呐QAQ！', { keyboard: false })
            return false
        }
        let updateData;
        let history;
        if (await canUseApi(this.config, e)) {
            try {

                if (!this.config.isGuild || !e.isGroup) {
                    send.prompt(e, "正在更新，请稍等一下哦！\n >_<", true, { recallMsg: 5, keyboard: false })
                }

                updateData = await credentials.getUpdatedSaveFromApi()
                history = await credentials.getCloudHistory(['data', 'rks', 'scoreHistory'])
            } catch (/**@type {any} */ err) {
                if (err?.message != APII18NCN.userNotFound) {
                    makeRequest.handleApiError(e, err, {
                        errorPrefix: '从API获取存档失败，本次更新将使用本地数据QAQ！',
                        notifyUser: true,
                        logTag: 'API错误 update from api',
                        loggerLevel: 'warn'
                    })
                }
            }
        }
        if (!updateData || !history) {

            let session = await credentials.getSessionToken()
            if (!session) {
                send.prompt(e, getBindingReminder(e, this.config), { quote: true, kind: 'warning', actions: bindingPromptActions() })
                return true
            }

            if (!this.config.isGuild || !e.isGroup) {
                send.prompt(e, "正在更新，请稍等一下哦！\n >_<", true, { recallMsg: 5, keyboard: false })
            }

            try {
                updateData = await credentials.getUpdatedSaveFromLocal(session)
                if (!updateData) return true;
                history = await credentials.getLocalHistory()
            } catch (error) {
                logger.error(error)
                send.promptWithAt(e, `更新存档失败，请稍后重试或检查绑定状态。\n\n${getBindingReminder(e, this.config)}`, { kind: 'error', actions: bindingPromptActions() })
                return true
            }
        }

        try {
            await build(this.config, e, updateData, history, updateQuickCommands, '更新页快捷操作')
        } catch (error) {
            logger.error(error)
            send.promptWithAt(e, `生成更新结果失败，请稍后重试。`, { kind: 'error', keyboard: false })
        }

        return true
    }


    /**
     * @param {botEvent} e
     */
    async unbind(e) {

        const credentials = UserCredentials.fromEvent(e)

        if (await getBanGroup.get(e, 'unbind')) {
            send.promptWithAt(e, '当前群组已禁用解绑功能。', {
                kind: 'error',
                actions: [{ command: `/${PHI_COMMAND_HEAD}`, label: '帮助' }],
            })
            return false
        }


        const { sessionToken, apiId } = await credentials.getLocalCredentials()
        if (!sessionToken && !apiId) {
            send.promptWithAt(e, '当前没有可解绑的 Phigros 绑定。', { kind: 'warning', actions: bindingPromptActions() })
            return false
        }

        this.setContext('doUnbind', false, 30, '操作已超时，解绑未执行。')

        send.promptWithAt(e, '解绑会删除当前 Bot 保存的绑定、存档和历史，但不会修改 API 中的数据。确认解绑吗？（确认/取消）', {
            kind: 'confirm',
            actions: unbindConfirmActions(),
        })

        return true
    }

    async doUnbind() {

        let e = this.e
        const credentials = UserCredentials.fromEvent(e)

        let msg = e.msg.replace(/\s/g, '').replace(/^[#/]/, '')

        if (msg == '确认') {
            let flag = true
            try {
                await credentials.unbindAndReport()
            } catch (err) {
                logger.error(err)
                flag = false
            }
            if (flag) try {
                let pluginData = await getNotes.getNotesData(e.user_id)

                if (pluginData) {
                    if (pluginData) {
                        pluginData.task = []
                    }
                    getNotes.putNotesData(e.user_id, pluginData)
                }
            } catch (err) {
                logger.error(err)
                flag = false
            }
            if (flag) {
                send.promptWithAt(e, '已完成解绑。', { kind: 'success', actions: unbindResultActions() })
            } else {
                send.promptWithAt(e, '解绑操作出现问题，请稍后重试或检查当前绑定状态。', { kind: 'error', actions: unbindFailureActions() })
            }
        } else {
            send.promptWithAt(e, '已取消解绑。', { kind: 'info', actions: unbindResultActions() })
        }
        this.finish('doUnbind', false)
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async clean(e) {
        this.setContext('doClean', false, 30, '超时已取消，请注意 @Bot 进行回复哦！')

        send.promptWithAt(e, '请注意，本操作将会删除Phi-Plugin关于您的所有信息QAQ！（确认/取消）', { keyboard: false })

        return true
    }

    async doClean() {

        let e = this.e
        const credentials = UserCredentials.fromEvent(e)

        let msg = e.msg.replace(' ', '')

        if (msg == '确认') {
            let flag = true
            try {
                await credentials.deleteLocalSave()
            } catch (err) {
                send.promptWithAt(e, err, { keyboard: false })
                flag = false
            }
            try {
                getNotes.delNotesData(e.user_id)
            } catch (err) {
                send.promptWithAt(e, err, { keyboard: false })
                flag = false
            }
            if (flag) {
                send.promptWithAt(e, '清除数据成功', { keyboard: false })
            }
        } else {
            send.promptWithAt(e, `取消成功！`, { keyboard: false })
        }
        this.finish('doClean', false)
    }

    /**
     * 
     * @param {botEvent} e 
     * @returns 
     */
    async getSstk(e) {
        const credentialManager = UserCredentials.fromEvent(e)
        if (e.isGroup) {
            send.promptWithAt(e, `请私聊发送 /${PHI_COMMAND_HEAD} sessionToken 查看当前绑定信息。`, { kind: 'info', keyboard: false })
            return false
        }

        let save = await send.getsave_result(e)
        if (!save) {
            send.promptWithAt(e, getBindingReminder(e, this.config), { kind: 'warning', actions: bindingPromptActions() })
            return true
        }

        const credentials = await credentialManager.getLocalCredentials()
        send.promptWithAt(e, `PlayerId: ${fCompute.convertRichText(save.saveInfo.PlayerId, true)}\nsessionToken: ${credentials.sessionToken}\nObjectId: ${save.saveInfo.objectId}\nQQId: ${e.user_id}\nAPIId: ${credentials.apiId || '未绑定'}`, { keyboard: false })

    }

}


/**
 * 定义一个函数，接受一个整数参数，返回它的十六进制形式
 * @param {number} num 
 * @returns 
 */
function toHex(num) {
    // 如果数字小于 16，就在前面补一个 0
    if (num < 16) {
        return "0" + num.toString(16);
    } else {
        return num.toString(16);
    }
}

// 定义一个函数，不接受参数，返回一个随机的背景色
function getRandomBgColor() {
    // 生成三个 0 到 200 之间的随机整数，分别代表红、绿、蓝分量
    let red = Math.floor(Math.random() * 201);
    let green = Math.floor(Math.random() * 201);
    let blue = Math.floor(Math.random() * 201);
    // 将三个分量转换为十六进制形式，然后拼接成一个 RGB 颜色代码
    let hexColor = "#" + toHex(red) + toHex(green) + toHex(blue);
    // 返回生成的颜色代码
    return hexColor;
}

/**
 * 计算/update宽度
 * @param {number} num
 */
function comWidth(num) {
    return num * 135 + 20 * num - 20
}

/**
 * 保存PhigrosUser
 * @param {botEvent} e
 * @param {{save:Save, added_rks_notes: number[]}} updateData
 * @param {saveHistory} history
 */
async function build(config, e, updateData, history, quickCommands = updateQuickCommands, quickCommandsTitle = '更新页快捷操作', { simpleReply = false } = {}) {

    let { added_rks_notes, save } = updateData

    const displayAddedRksNotes = ['', ''];

    if (added_rks_notes[0]) displayAddedRksNotes[0] = `${added_rks_notes[0] > 0 ? '+' : ''}${added_rks_notes[0] >= 1e-4 ? added_rks_notes[0].toFixed(4) : ''}`
    if (added_rks_notes[1]) displayAddedRksNotes[1] = `${added_rks_notes[1] > 0 ? '+' : ''}${added_rks_notes[1]}`


    /**图片 */

    /**
     * 标记数据中含有的时间
     * @type {{[date:string]:number}}
     */
    let time_vis = {}

    /**历史记录的展示时区：来源时区缺失时用运行环境时区 */
    const historyTimezone = history?.getTimezone?.() ?? fCompute.timezoneOffset()

    /**
     * 总信息
     * @type {{date:string,
        * color:string,
        * update_num:number,
        * song:import('../../domain/save/score-history').extendedScoreHistoryDetail[]
     * }[]}
     */
    let tot_update = []


    let now = save
    let pluginData = await getNotes.getNotesData(e.user_id)

    // const RecordErr = now.checkRecord()

    // if (RecordErr) {
    //     send.promptWithAt(e, '[测试功能，概率有误，暂时不清楚错误原因]\n请注意，你的存档可能存在一些问题：\n' + RecordErr)
    // }
    for (let id of fCompute.objectKeys(history.scoreHistory)) {
        const tem = history.scoreHistory[id]
        for (let level of allLevel) {
            /**v4 历史：dateValue 实例 */
            const levelRecords = ScoreHistory.toScoreDetails(tem[level])
            if (!levelRecords.length) continue
            for (let i = 0; i < levelRecords.length; i++) {
                let score_date = fCompute.formatDate(ScoreHistory.date(levelRecords[i]), undefined, historyTimezone)
                let score_info = ScoreHistory.extend(id, level, levelRecords[i], i ? levelRecords[i - 1] : undefined, 'low')
                if (time_vis[score_date] == undefined) {
                    time_vis[score_date] = tot_update.length
                    tot_update.push({ date: score_date, color: getRandomBgColor(), update_num: 0, song: [] })
                }
                ++tot_update[time_vis[score_date]].update_num
                tot_update[time_vis[score_date]].song.push(score_info)
            }
        }
    }

    let newnum = tot_update[time_vis[fCompute.formatDate(now.saveInfo.modifiedAt.iso, undefined, historyTimezone)]]?.update_num || 0

    tot_update.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    /**实际显示的数量 */
    let show = 0
    /**每日显示上限 */
    const DayNum = Math.max(config.HistoryDayNum, 2)
    /**显示日期上限 */
    const DateNum = config.HistoryScoreDate
    /**总显示上限 */
    const TotNum = config.HistoryScoreNum



    for (let date = 0; date < tot_update.length; date++) {

        /**天数上限 */
        if (date >= DateNum || TotNum < show + Math.min(DayNum, tot_update[date].update_num)) {
            tot_update.splice(date, tot_update.length)
            break
        }

        /**预处理每日显示上限 */
        tot_update[date].song.sort((a, b) => { return (b.rks_new || 0) - (a.rks_new || 0) })

        tot_update[date].song = tot_update[date].song.slice(0, Math.min(DayNum, TotNum - show))


        /**总上限 */
        show += tot_update[date].song.length

    }

    /**
     * 预分行
     * @type {any[]}
     */
    let box_line = []

    /**循环中当前行的数量 */
    let line_num = 0


    line_num = 5
    let flag = false

    while (tot_update.length) {
        if (line_num == 5) {
            if (flag) {
                box_line.push([{ color: tot_update[0].color, song: tot_update[0].song.splice(0, 5) }])
            } else {
                box_line.push([{ date: tot_update[0].date, color: tot_update[0].color, song: tot_update[0].song.splice(0, 5) }])
            }
            let tem = box_line[box_line.length - 1]
            line_num = tem[tem.length - 1].song.length
        } else {
            let tem = box_line[box_line.length - 1]
            if (flag) {
                tem.push({ color: tot_update[0].color, song: tot_update[0].song.splice(0, 5 - line_num) })
            } else {
                tem.push({ date: tot_update[0].date, color: tot_update[0].color, song: tot_update[0].song.splice(0, 5 - line_num) })

            }
            line_num += tem[tem.length - 1].song.length
        }
        let tem = box_line[box_line.length - 1]
        tem[tem.length - 1].width = comWidth(tem[tem.length - 1].song.length)
        flag = true
        if (!tot_update[0].song.length) {
            tem[tem.length - 1].update_num = tot_update[0].update_num
            tot_update.shift()
            flag = false
        }
    }

    /**添加任务信息 */
    let task_data = pluginData?.task
    let task_time = fCompute.formatDate(pluginData?.task_time)

    /**添加曲绘 */
    if (task_data) {
        for (let i in task_data) {
            if (task_data[i]) {
                // @ts-ignore
                task_data[i].illustration = getInfo.getill(task_data[i].song, 'low', task_data[i].request.rank)
                if (task_data[i].request.type == 'acc') {
                    // @ts-ignore
                    task_data[i].request.value = task_data[i].request.value.toFixed(2) + '%'
                } else {
                    // @ts-ignore
                    task_data[i].request.value = task_data[i].request.value.toString().padStart(6, '0')
                }
                // @ts-ignore
                task_data[i].song = getInfo.idgetsong(task_data[i].song)
            }
        }
    }



    let { rks_history, rks_range, rks_date } = history.getRksLine()

    let data = {
        PlayerId: fCompute.convertRichText(now.saveInfo.PlayerId),
        Rks: Number(now.saveInfo.summary.rankingScore).toFixed(4),
        Date: fCompute.formatDate(now.saveInfo.summary.updatedAt),
        ChallengeMode: (now.saveInfo.summary.challengeModeRank - (now.saveInfo.summary.challengeModeRank % 100)) / 100,
        ChallengeModeRank: now.saveInfo.summary.challengeModeRank % 100,
        background: getInfo.getill(getInfo.illlist[Math.floor((Math.random() * (getInfo.illlist.length - 1)))], 'low'),
        box_line: box_line,
        update_ans: newnum ? `更新了${newnum}份成绩` : `未收集到新成绩`,
        Notes: pluginData?.money || 0,
        show: show,
        tips: getInfo.tips[Math.floor((Math.random() * (getInfo.tips.length - 1)) + 1)],
        task_data: task_data,
        task_time: task_time,
        // dan: await get.getDan(e.user_id),
        added_rks_notes: displayAddedRksNotes,
        theme: pluginData?.theme || 'star',
        rks_date: [fCompute.formatDate(rks_date[0], undefined, historyTimezone), fCompute.formatDate(rks_date[1], undefined, historyTimezone)],
        rks_history, rks_range,
    }

    const image = await picmodle.update(e, data)
    const playerId = fCompute.convertRichText(now.saveInfo.PlayerId, true)
    await sendResultWithQuickCommands(
        e,
        [image, `PlayerId: ${playerId}`],
        simpleReply ? [] : quickCommands(PHI_COMMAND_HEAD),
        { config, buttonsPerRow: 2 },
    )

    return false
}
