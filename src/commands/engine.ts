import type { Context } from 'koishi'
import type { EngineRuntime } from '../runtime'
import { parsePhiMarketCallbackData, parsePhiMenuCallbackData, PHI_COMMAND_HEAD } from '../constants'
import { getPhiSubcommand } from '../utils/phi-command'
import { engineCommands, aliasProposalCommands, type EngineCommandSpec } from './spec'

const helpSpec: EngineCommandSpec = {
  path: 'help',
  legacy: 'help',
  app: 'help',
  method: 'help',
  description: '查看 Phi 帮助',
}

function stripCommandPrefix(source: string, commandName: string) {
  const raw = source.trim()
  if (!raw) return ''
  let offset = 0
  const count = commandName.split('.').length
  for (let i = 0; i < count; i++) {
    const match = /^\S+\s*/.exec(raw.slice(offset))
    if (!match) return ''
    offset += match[0].length
  }
  return raw.slice(offset)
}

function buildLegacyMessage(session: any, commandName: string, legacy: string) {
  const source = String(session?.stripped?.content ?? session?.content ?? '')
  const rest = stripCommandPrefix(source, commandName)
  return `/phi ${legacy}${rest ? ` ${rest}` : ''}`
}

async function invokeEngine(runtime: EngineRuntime, spec: EngineCommandSpec, session: any, legacyMessage?: string) {
  const app = runtime.apps[spec.app]
  const method = app?.[spec.method]
  if (typeof method !== 'function') throw new Error(`Phi engine method not found: ${spec.app}.${spec.method}`)
  const event = runtime.adapter.fromSession(session)
  event.msg = event.text = legacyMessage ?? buildLegacyMessage(session, `phi.${spec.path}`, spec.legacy)
  event.phiSubcommand = getPhiSubcommand(session?.stripped?.content ?? session?.content, PHI_COMMAND_HEAD)
  app.e = event
  return await method.call(app, event)
}

/** 将上游 `越30` / `越级30` / `越 30` 单 token 形式规范为旧的越级 B30 消息。 */
export function normalizeOverLevelMessage(source: unknown) {
  const text = String(source ?? '').trim()
  const match = text.match(/^\S+\s*越级?\s*(?:b\s*)?(\d{0,3})\s*(flick|fl|fk|划键|划)?\s*$/i)
  if (!match) return null
  const count = match[1] || ''
  const rest = match[2] || ''
  return `/phi 越级${count ? ` ${count}` : ''}${rest ? ` ${rest}` : ''}`
}

async function invokeRootHelp(runtime: EngineRuntime, session: any) {
  const result = await invokeEngine(runtime, helpSpec, session)
  return typeof result === 'boolean' ? undefined : result
}

async function sendCommandResult(runtime: EngineRuntime, session: any, result: any, kind?: 'info' | 'error') {
  if (typeof result !== 'string' || !result) return typeof result === 'boolean' ? undefined : result
  const event = runtime.adapter.fromSession(session)
  const { default: send } = await import('../render/send.ts')
  await send.prompt(event, result, { kind })
  return undefined
}

export async function dispatchButtonCallback(runtime: EngineRuntime, session: any) {
  const data = session?.event?.button?.data
  const page = parsePhiMenuCallbackData(data)
  if (page) {
    const app = runtime.apps.help
    const method = page === 'game' ? app?.gameMenu : app?.showMenu
    if (typeof method !== 'function') throw new Error(`Phi menu callback not found: ${page}`)

    const event = runtime.adapter.fromSession(session)
    app.e = event
    if (page === 'game') await method.call(app, event)
    else await method.call(app, event, page)
    return true
  }

  const action = parsePhiMarketCallbackData(data)
  if (action) {
    const app = runtime.apps.market
    const method = app?.marketPage
    if (typeof method !== 'function') throw new Error(`Phi market callback not found: ${action}`)

    const event = runtime.adapter.fromSession(session)
    event.msg = event.text = `/phi ${action === 'next' ? 'nx' : 'pr'}`
    app.e = event
    await method.call(app, event)
    return true
  }

  return false
}

export function registerEngineCommands(ctx: Context, runtime: EngineRuntime) {
  const root = ctx.command('phi', 'Phi 相关功能', { slash: false, checkArgCount: false })

  const register = (spec: EngineCommandSpec) => {
    const command = ctx.command(`phi.${spec.path} [...args]`, spec.description, {
      authority: spec.authority ?? 1,
      slash: false,
    })
    for (const alias of spec.aliases ?? []) command.alias(`phi.${alias}`)
    command.action(async (argv) => {
      try {
        const result = await invokeEngine(runtime, spec, argv.session)
        return await sendCommandResult(runtime, argv.session, result)
      } catch (error) {
        ctx.logger('phi-plugin').error(error)
        const message = `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
        await sendCommandResult(runtime, argv.session, message, 'error')
      }
    })
  }

  for (const spec of engineCommands) register(spec)
  for (const spec of aliasProposalCommands) register(spec)

  root.action(async (argv) => {
    try {
      const source = argv.session?.stripped?.content ?? argv.session?.content
      const normalized = normalizeOverLevelMessage(source)
      if (normalized) {
        const spec = engineCommands.find(item => item.path === 'overlevelb30')
        if (!spec) throw new Error('越级 B30 命令未注册')
        const result = await invokeEngine(runtime, spec, argv.session, normalized)
        return await sendCommandResult(runtime, argv.session, result)
      }
      const result = await invokeRootHelp(runtime, argv.session)
      return await sendCommandResult(runtime, argv.session, result)
    } catch (error) {
      ctx.logger('phi-plugin').error(error)
      const message = `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
      await sendCommandResult(runtime, argv.session, message, 'error')
    }
  })

  ctx.on('interaction/button', async (session) => {
    try {
      await dispatchButtonCallback(runtime, session)
    } catch (error) {
      ctx.logger('phi-plugin').error(error)
    }
  })
}
