import { PHI_COMMAND_HEAD } from '../constants'
import type { PromptAction } from './prompt'

/** 未绑定 sessionToken 时统一使用的提醒文案。 */
export const BINDING_REMINDER = [
  '还没有绑定 sessionToken，暂时无法读取存档。',
  `发送 /${PHI_COMMAND_HEAD} bind qrcode 获取 TapTap 登录链接，也可以直接发送 /${PHI_COMMAND_HEAD} bind <sessionToken> 手动绑定。`,
  '请勿使用他人的登录链接或 token。',
].join('\n')

/** 绑定入口、失败与未绑定拦截使用的操作。 */
export function bindingPromptActions(): PromptAction[] {
  return [
    { command: `/${PHI_COMMAND_HEAD} bind qrcode`, label: 'TapTap' },
    { command: `/${PHI_COMMAND_HEAD} tkhelp`, label: '绑定帮助' },
  ]
}

/** 绑定成功但无法生成成绩图时的操作。 */
export function bindingSuccessActions(): PromptAction[] {
  return [
    { command: `/${PHI_COMMAND_HEAD} update`, label: '更新存档' },
    { command: `/${PHI_COMMAND_HEAD} pgr`, label: 'B30成绩' },
    { command: `/${PHI_COMMAND_HEAD} myset`, label: '用户设置' },
  ]
}
