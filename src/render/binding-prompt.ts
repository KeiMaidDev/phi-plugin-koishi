import { PHI_COMMAND_HEAD } from '../constants'
import { isQqMarkdownPlatform } from '../platform/qq-markdown'
import type { PromptAction } from './prompt'

const BINDING_REMINDER_HEADER = '还没有完成 Phigros 绑定，暂时无法读取存档。'
const BINDING_REMINDER_SECURITY = '登录链接和 sessionToken 仅限本人使用，请勿转交或公开。'
const BINDING_HELP_MANUAL = `手动绑定：发送 /${PHI_COMMAND_HEAD} bind <sessionToken>。`
const BINDING_HELP_GUIDE = '详细指引：https://kdocs.cn/l/cvMDjWPTNaz4'

type BindingPromptConfig = {
  LetterMarkdown?: boolean
  openPhiPluginApi?: boolean
  enableOnlineScoreApi?: boolean
}

function isOnlineApiConfigured(config?: BindingPromptConfig) {
  return Boolean(config?.openPhiPluginApi && config?.enableOnlineScoreApi !== false)
}

function buildBindingReminder(interactive: boolean, apiEnabled: boolean) {
  const action = interactive
    ? '点击下方「TapTap」按钮完成绑定。'
    : `发送 /${PHI_COMMAND_HEAD} bind qrcode 获取 TapTap 登录链接。`
  const manualBinding = apiEnabled
    ? `也可以发送 /${PHI_COMMAND_HEAD} bind <sessionToken> 或 /${PHI_COMMAND_HEAD} bind <查分ID> 手动绑定。`
    : `也可以发送 /${PHI_COMMAND_HEAD} bind <sessionToken> 手动绑定。`
  const lines = [
    BINDING_REMINDER_HEADER,
    action,
    manualBinding,
    BINDING_REMINDER_SECURITY,
  ]
  return lines.join('\n')
}

function buildBindingHelp(interactive: boolean, apiEnabled: boolean) {
  const lines = [
    '绑定帮助',
    interactive
      ? '推荐：点击下方「TapTap」按钮完成绑定。'
      : `推荐：发送 /${PHI_COMMAND_HEAD} bind qrcode 获取 TapTap 登录链接。`,
    BINDING_HELP_MANUAL,
  ]
  if (apiEnabled) lines.push(`查分 ID 绑定：发送 /${PHI_COMMAND_HEAD} bind <查分ID>。`)
  lines.push(BINDING_HELP_GUIDE, BINDING_REMINDER_SECURITY)
  return lines.join('\n')
}

/** 未开启交互式 Markdown 时使用的未绑定提醒。 */
export const BINDING_REMINDER = buildBindingReminder(false, false)

/** 开启交互式 Markdown 时使用的未绑定提醒。 */
export const BINDING_REMINDER_INTERACTIVE = buildBindingReminder(true, false)

/** 未开启交互式 Markdown 时使用的绑定帮助。 */
export const BINDING_HELP = buildBindingHelp(false, false)

/** 开启交互式 Markdown 时使用的绑定帮助。 */
export const BINDING_HELP_INTERACTIVE = buildBindingHelp(true, false)

/** 按当前事件与配置选择是否使用按钮式未绑定提醒。 */
export function getBindingReminder(event: any, config?: BindingPromptConfig) {
  return buildBindingReminder(
    Boolean(config?.LetterMarkdown && isQqMarkdownPlatform(event)),
    isOnlineApiConfigured(config),
  )
}

/** 按当前事件与配置选择是否使用按钮式绑定帮助。 */
export function getBindingHelp(event: any, config?: BindingPromptConfig) {
  return buildBindingHelp(
    Boolean(config?.LetterMarkdown && isQqMarkdownPlatform(event)),
    isOnlineApiConfigured(config),
  )
}

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

/** 解绑确认提示的操作。 */
export function unbindConfirmActions(): PromptAction[] {
  return [
    { command: '确认', label: '确认解绑' },
    { command: '取消', label: '取消' },
  ]
}

/** 解绑失败后的重试与帮助操作。 */
export function unbindFailureActions(): PromptAction[] {
  return [
    { command: `/${PHI_COMMAND_HEAD} unbind`, label: '重试解绑' },
    { command: `/${PHI_COMMAND_HEAD}`, label: '帮助' },
  ]
}

/** 解绑完成或取消后的重新绑定与帮助操作。 */
export function unbindResultActions(): PromptAction[] {
  return [
    { command: `/${PHI_COMMAND_HEAD} bind qrcode`, label: '重新绑定' },
    { command: `/${PHI_COMMAND_HEAD}`, label: '帮助' },
  ]
}
