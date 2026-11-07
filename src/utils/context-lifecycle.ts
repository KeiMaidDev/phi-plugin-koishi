import type { Context } from 'koishi'

/** 判断绑定当前插件的 Koishi 上下文是否仍可注册可逆副作用。 */
export function isPluginContextActive(ctx: Context) {
  return Boolean(ctx.scope?.isActive)
}
