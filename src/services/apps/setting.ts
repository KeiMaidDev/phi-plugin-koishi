// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import picmodle from '../../render/pic-model'
import getInfo from '../../domain/game/get-info'
import getNotes from '../../domain/user/get-notes'
import phiPluginBase from '../base-class'
import { USER_SETTING_META, USER_SETTING_OPTIONS } from '../../domain/game/const-num'
import themeManager from '../theme/manager'
import themeUseService, { marketThemeErrorMessage } from '../theme/use-service'
import { getThemeInstallRequesterId } from '../theme/install-guard'
import getBanGroup from '../../domain/user/get-ban-group'
import send from '../../render/send'
import { getApiAccessState } from '../../domain/user/api-permission'
import { sendQuickCommandSections, userSettingQuickCommandSections } from '../../domain/game/markdown'

/**@import {botEvent} from '../base-class' */



export class phihelp extends phiPluginBase {
    constructor(runtime: PhiRuntime) {
        super({
            config: runtime.config,
            data: runtime.data,
            name: 'phi-setting',
            dsc: 'phigros屁股肉设置',
            event: 'message',
            priority: 1001,
            rule: [
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)(用户设置|个人设置|mysetting|myset)(\\s*.*)?$`,
                    fnc: 'showUserSetting'
                }
            ]
        })

    }

    /**
     * 渲染用户个性化设置展示图
     * @param {botEvent} e
     */
    async showUserSetting(e) {
        if (await getBanGroup.get(e, 'help')) {
            send.send_with_At(e, '这里被管理员禁止使用这个功能了呐QAQ！')
            return false
        }
        let pluginData = await getNotes.getNotesData(e.user_id)

        /**@type {Record<'theme' | 'b30AvgKind' | 'b30AvgColor' | 'allowApiUsage' | 'showB30Analysis', string[]>} */
        const settingKeyAlias = {
            theme: ['theme', '主题', '主题风格'],
            b30AvgKind: ['b30avgkind', 'b30kind', 'avgkind', '均值范围', '统计范围', '均值类型'],
            b30AvgColor: ['b30avgcolor', 'avgcolor', '颜色', '配色', '均值颜色'],
            allowApiUsage: ['api', 'allowapiusage', 'api开关', 'api功能', 'api功能开关', '在线api', '是否允许使用api'],
            showB30Analysis: ['showb30analysis', 'b30analysis', 'b30分析', '统计分析', 'b30统计分析', '分析区域']
        }

        /**@type {Record<'theme' | 'b30AvgKind' | 'b30AvgColor' | 'allowApiUsage' | 'showB30Analysis', Record<string, string>>} */
        const settingValueAlias = {
            theme: {
                default: 'default',
                snow: 'snow',
                star: 'star',
                dss2: 'dss2',
                默认: 'default',
                寒冬: 'snow',
                星空: 'star',
                使一颗心免于哀伤: 'star',
                大师赛2: 'dss2'
            },
            b30AvgKind: {
                all: 'all',
                b30: 'b30',
                top: 'top',
                none: 'none',
                全部: 'all',
                全部统计: 'all',
                仅b30: 'b30',
                仅top: 'top',
                不展示: 'none',
                关: 'none',
                隐藏: 'none'
            },
            b30AvgColor: {
                red: 'red',
                gold: 'gold',
                blue: 'blue',
                green: 'green',
                红: 'red',
                红色: 'red',
                金: 'gold',
                金色: 'gold',
                蓝: 'blue',
                蓝色: 'blue',
                绿: 'green',
                绿色: 'green'
            },
            allowApiUsage: {
                true: 'true',
                false: 'false',
                on: 'true',
                off: 'false',
                开: 'true',
                关: 'false',
                开启: 'true',
                关闭: 'false',
                允许: 'true',
                禁止: 'false',
                启用: 'true',
                禁用: 'false',
                是: 'true',
                否: 'false',
                1: 'true',
                0: 'false'
            },
            showB30Analysis: {
                true: 'true',
                false: 'false',
                on: 'true',
                off: 'false',
                开: 'true',
                关: 'false',
                开启: 'true',
                关闭: 'false',
                显示: 'true',
                隐藏: 'false',
                是: 'true',
                否: 'false',
                1: 'true',
                0: 'false'
            }
        }

        const usage = [
            '用法示例：',
            `/${PHI_COMMAND_HEAD} 用户设置`,
            `/${PHI_COMMAND_HEAD} 用户设置 主题 star`,
            `/${PHI_COMMAND_HEAD} 用户设置 主题 3`,
            `/${PHI_COMMAND_HEAD} 用户设置 均值范围 b30`,
            `/${PHI_COMMAND_HEAD} 用户设置 配色 gold`,
            `/${PHI_COMMAND_HEAD} 用户设置 API开关 关闭`,
            `/${PHI_COMMAND_HEAD} 用户设置 B30分析 关闭`
        ].join('\n')

        const rawArgs = e.msg.replace(new RegExp(`^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)(用户设置|个人设置|mysetting|myset)`), '').trim()

        if (rawArgs) {
            const normalized = rawArgs.replace(/[：:=]/g, ' ').replace(/\s+/g, ' ').trim()
            const args = normalized.split(' ')

            if (args.length < 2) {
                send.send_with_At(e, `参数不足，请提供“设置项 + 目标值”。\n${usage}`)
                return true
            }

            const keyInput = args[0].toLowerCase()
            const valueInputRaw = args.slice(1).join('')
            const valueInput = valueInputRaw.toLowerCase()

            /**@type {'theme' | 'b30AvgKind' | 'b30AvgColor' | 'allowApiUsage' | 'showB30Analysis' | null} */
            let settingKey = null
            for (const key of /**@type {('theme' | 'b30AvgKind' | 'b30AvgColor' | 'allowApiUsage' | 'showB30Analysis')[]} */ (Object.keys(settingKeyAlias))) {
                if (settingKeyAlias[key].map(i => i.toLowerCase()).includes(keyInput)) {
                    settingKey = key
                    break
                }
            }

            if (!settingKey) {
                send.send_with_At(e, `未知设置项：${args[0]}\n支持：主题 / 均值范围 / 配色 / API开关 / B30分析\n${usage}`)
                return true
            }

            if (settingKey === 'theme' && await getBanGroup.get(e, 'theme')) {
                send.send_with_At(e, '这里被管理员禁止使用这个功能了呐QAQ！')
                return false
            }

            /** 主题选项动态合并内置 + 自定义主题，其余设置项保持静态数据源 */
            /** @param {string} key */
            const getOptions = (key) => key === 'theme'
                ? themeManager.getThemeOptions(pluginData.theme)
                : /** @type {any} */ (USER_SETTING_OPTIONS)[key]
            let optionMap = /** @type {Record<string, { title: string, description: string }>} */ (getOptions(settingKey))
            let optionKeys = Object.keys(optionMap)
            const valueAliasMap = settingValueAlias[settingKey]

            let canonicalValue = valueAliasMap[valueInput] || valueAliasMap[valueInputRaw] || valueInputRaw
            if (settingKey === 'theme' && /^[a-z][a-z0-9_-]{0,119}$/.test(valueInput)) canonicalValue = valueInput

            // 支持通过 1 开始的序号选择：1=第一个选项
            if (/^\d+$/.test(valueInputRaw)) {
                const optionIndex = Number(valueInputRaw)
                if (optionIndex >= 0 && optionIndex < optionKeys.length) {
                    canonicalValue = optionKeys[optionIndex]
                }
            }

            const selectedTheme = settingKey === 'theme' ? themeManager.getTheme(canonicalValue) : null
            const shouldPrepareTheme = settingKey === 'theme'
                && /^[a-z][a-z0-9_-]{0,119}$/.test(canonicalValue)
                && (!optionMap[canonicalValue] || selectedTheme?.marketInstalled)
            if (shouldPrepareTheme) {
                if (!selectedTheme) {
                    const apiAccess = await getApiAccessState(this.config, e, 'customTheme')
                    if (!apiAccess.enabled) {
                        send.send_with_At(e, apiAccess.message)
                        return true
                    }
                }
                send.send_with_At(e, `正在校验并准备主题 ${canonicalValue}，请稍候。`)
                try {
                    await themeUseService.use(canonicalValue, { requesterId: getThemeInstallRequesterId(e) })
                    // 下载期间用户数据可能已由其他命令更新；保存前重新读取，避免覆盖并发修改。
                    pluginData = await getNotes.getNotesData(e.user_id)
                    optionMap = /** @type {Record<string, { title: string, description: string }>} */ (getOptions(settingKey))
                    optionKeys = Object.keys(optionMap)
                } catch (error) {
                    send.send_with_At(e, marketThemeErrorMessage(error))
                    return true
                }
            }

            if (!optionMap[canonicalValue]) {
                const optionalValues = optionKeys.map((value, index) => `${index}. ${value}`).join(' / ')
                send.send_with_At(e, `无效值：${valueInputRaw}\n${USER_SETTING_META[settingKey].title} 可选：${optionalValues}`)
                return true
            }

            if (settingKey === 'allowApiUsage' || settingKey === 'showB30Analysis') {
                pluginData[settingKey] = canonicalValue === 'true'
            } else if (settingKey === 'theme' && typeof pluginData.setThemePreference === 'function') {
                pluginData.setThemePreference(canonicalValue)
            } else {
                // @ts-ignore
                pluginData[settingKey] = canonicalValue
            }
            if (!getNotes.putNotesData(e.user_id, pluginData)) {
                send.send_with_At(e, '主题或用户设置已准备完成，但保存失败，请稍后重试。')
                return true
            }

            send.send_with_At(e, `设置成功：${USER_SETTING_META[settingKey].title} -> ${optionMap[canonicalValue].title}`)
        }

        /**
         * @param {'theme' | 'b30AvgKind' | 'b30AvgColor' | 'allowApiUsage' | 'showB30Analysis'} key
         * @param {string} current
         */
        const buildItem = (key, current) => {
            const options = /** @type {Record<string, { title: string, description: string }>} */ (key === 'theme'
                ? themeManager.getThemeOptions(current)
                : USER_SETTING_OPTIONS[key])
            return {
                key,
                title: USER_SETTING_META[key].title,
                description: USER_SETTING_META[key].description,
                currentTitle: options[current]?.title || current,
                options: Object.keys(options).map((value) => ({
                    value,
                    title: options[value].title,
                    description: options[value].description,
                    selected: value === current
                }))
            }
        }

        /** 主题展示固定为四个内置项 + 一个整行的市场主题入口。 */
        /** @param {string} current */
        const buildThemeItem = (current) => {
            const builtins = /** @type {Record<string, {title:string, description:string}>} */ (USER_SETTING_OPTIONS.theme)
            const customTheme = themeManager.isCustomTheme(current) ? themeManager.getTheme(current) : null
            const commandHead = `${PHI_COMMAND_HEAD}`
            const marketGuide = `/${commandHead} market 查看列表；/${commandHead} market detail <slug> 查看详情；/${commandHead} market <slug> 使用主题，首次使用会自动下载。`
            return {
                key: 'theme',
                title: USER_SETTING_META.theme.title,
                description: USER_SETTING_META.theme.description,
                currentTitle: customTheme?.name || builtins[current]?.title || current,
                options: [
                    ...Object.keys(builtins).map(value => ({
                        value,
                        title: builtins[value].title,
                        description: builtins[value].description,
                        selected: value === current,
                    })),
                    {
                        value: customTheme?.id || '__market__',
                        title: customTheme?.name || '自定义',
                        description: marketGuide,
                        selected: Boolean(customTheme),
                        fullWidth: true,
                    },
                ],
            }
        }

        const data = {
            pageTitle: 'Phi-Plugin 用户设置',
            pageDescription: '以下选项为你的个人偏好展示，选择结果将用于对应图片渲染。',
            items: [
                buildThemeItem(pluginData?.theme || 'default'),
                buildItem('b30AvgKind', pluginData?.b30AvgKind || 'all'),
                buildItem('b30AvgColor', pluginData?.b30AvgColor || 'red'),
                buildItem('allowApiUsage', String(pluginData?.allowApiUsage !== false)),
                buildItem('showB30Analysis', String(pluginData?.showB30Analysis !== false))
            ]
        }

        send.send_with_At(e, await picmodle.common(e, 'setting', {
            ...data,
            background: getInfo.getill(getInfo.illlist[Number((Math.random() * (getInfo.illlist.length - 1)).toFixed(0))]),
            theme: pluginData?.theme || 'default'
        }, 'userSetting'))
        await sendQuickCommandSections(e, userSettingQuickCommandSections(PHI_COMMAND_HEAD), '用户设置快捷操作', this.config)
        return true
    }
}
