import type { Context } from 'koishi'
import type { EngineRuntime } from '../runtime'
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

async function invokeEngine(runtime: EngineRuntime, spec: EngineCommandSpec, session: any) {
  const app = runtime.apps[spec.app]
  const method = app?.[spec.method]
  if (typeof method !== 'function') throw new Error(`Phi engine method not found: ${spec.app}.${spec.method}`)
  const event = runtime.adapter.fromSession(session)
  event.msg = event.text = buildLegacyMessage(session, `phi.${spec.path}`, spec.legacy)
  app.e = event
  return await method.call(app, event)
}

async function invokeRootHelp(runtime: EngineRuntime, session: any) {
  const result = await invokeEngine(runtime, helpSpec, session)
  return typeof result === 'boolean' ? undefined : result
}

export function registerEngineCommands(ctx: Context, runtime: EngineRuntime) {
  const root = ctx.command('phi', 'Phi 相关功能', { slash: false })

  const register = (spec: EngineCommandSpec) => {
    const command = ctx.command(`phi.${spec.path} [...args]`, spec.description, {
      authority: spec.authority ?? 1,
      slash: false,
    })
    for (const alias of spec.aliases ?? []) command.alias(`phi.${alias}`)
    command.action(async (argv) => {
      try {
        const result = await invokeEngine(runtime, spec, argv.session)
        return typeof result === 'boolean' ? undefined : result
      } catch (error) {
        ctx.logger('phi-plugin').error(error)
        return `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
      }
    })
  }

  for (const spec of engineCommands) register(spec)
  for (const spec of aliasProposalCommands) register(spec)

  root.action(async (argv) => {
    const extraArgs = Array.isArray((argv as any).args) ? (argv as any).args : []
    const hasExtraInput = extraArgs.some((value: any) => String(value ?? '').trim())
      || (Array.isArray((argv as any).tokens)
        && (argv as any).tokens.some((token: any) => String(token?.content ?? '').trim()))
    if (hasExtraInput) return '请发送 phi 查看用法。'
    try {
      return await invokeRootHelp(runtime, argv.session)
    } catch (error) {
      ctx.logger('phi-plugin').error(error)
      return `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
    }
  })
}
