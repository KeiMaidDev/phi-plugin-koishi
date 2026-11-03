// @ts-nocheck
import { PHI_COMMAND_HEAD } from '../constants'

import { UserCredentials } from '../domain/user/user-credentials';
import Save from "../domain/save/save";
import logger from "../utils/logger";
import { canUseApi } from '../domain/user/api-permission';
import platform from "../platform/index";
import { configurePrompts, sendPrompt, sendPromptWithAt, type PromptOptions } from './prompt'
import { getBindingReminder, bindingPromptActions } from './binding-prompt'

class send {

    static configure(config, getAssets) {
        this.config = config
        this.getAssets = getAssets
        configurePrompts(config, getAssets)
    }

    /**
     * 普通回复，统一经过平台接口。
     * @param {*} e
     * @param {*} msg
     * @param {boolean} [quote=false]
     * @param {{}} [data={}]
     */
    static async reply(e, msg, quote = false, data = {}) {
        e = platform.wrapEvent(e)
        return platform.reply(e, msg, { quote, ...data })
    }

    /**
     * 发送业务提示；QQ rawmarkdown 失败时回退普通消息。
     * @param {*} e
     * @param {*} msg
     * @param {PromptOptions} [options]
     */
    static async prompt(e, msg, options = {}, legacyData = {}) {
        if (typeof options === 'boolean') options = { quote: options, ...legacyData }
        const event = platform.wrapEvent(e)
        return sendPrompt(event, msg, {
            ...options,
            config: options.config ?? this.config,
            assets: options.assets ?? this.getAssets?.(),
        })
    }

    /**
     * 发送带 @ 的业务提示；rawmarkdown 路径把 @ 写入正文。
     * @param {*} e
     * @param {*} msg
     * @param {PromptOptions} [options]
     */
    static async promptWithAt(e, msg, options = {}, legacyData = {}) {
        if (typeof options === 'boolean') options = { quote: options, ...legacyData }
        const event = platform.wrapEvent(e)
        return sendPromptWithAt(event, msg, {
            ...options,
            config: options.config ?? this.config,
            assets: options.assets ?? this.getAssets?.(),
        })
    }
    /**
     * 私聊省略@
     * @param {*} e 
     * @param {*} msg 
     * @param {boolean} [quote=false] 是否引用回复
     * @param {{}} [data={}] recallMsg等
     */
    static async send_with_At(e, msg, quote = false, data = {}) {
        e = platform.wrapEvent(e)
        return platform.sendWithAt(e, msg, quote, data)
    }

    /**
     * 检查存档部分
     * @param {*} e 
     * @param {Number} [ver] 存档版本
     * @param {boolean} [send=true] 是否发送提示
     * @returns {Promise<Save|false>} 存档对象或false
     */
    static async getsave_result(e, ver = undefined, send = true) {

        let user_save = null
        const credentials = UserCredentials.fromEvent(e)
        let sessionToken = await credentials.getSessionToken()
        const allowApi = await canUseApi(this.config, e)
        if (allowApi) {
            try {
                user_save = await credentials.getUpdatedSaveFromApi()
                if (user_save) return user_save.save
            } catch (/**@type {any} */ err) {
                logger.warn(`[phi-plugin] getUpdatedSaveFromApi `, err)
            }
        }

        if (!sessionToken) {
            if (send) {
                await this.promptWithAt(e, getBindingReminder(e, this.config), { kind: 'info', actions: bindingPromptActions() })
            }
            return false
        }

        user_save = (await credentials.getUpdatedSaveFromLocal(sessionToken))?.save


        if (!user_save || (ver && (!user_save.Recordver || user_save.Recordver < ver))) {
            if (send) {
                await this.promptWithAt(e, `请先更新数据哦！\n格式：/${PHI_COMMAND_HEAD} update`, { kind: 'warning', actions: [{ command: `/${PHI_COMMAND_HEAD} update`, label: '更新存档' }] })
            }
            return false
        }

        return user_save
    }

    /**
     * 转发到私聊
     * @param {any} e 消息数组e
     * @param {any} msg 发送内容
     */
    static async pick_send(e, msg) {
        try {
            e = platform.wrapEvent(e)
            await platform.sendPrivate(e, msg)
            await platform.sleep(500)
        } catch (err) {
            logger.error(err)
            await this.promptWithAt(e, `转发失败QAQ！请尝试在私聊触发命令！`)
        }
    }

}

export default send
