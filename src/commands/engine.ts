import type { Context } from 'koishi'
import type { EngineRuntime } from '../runtime'
import { engineCommands, aliasProposalCommands, type EngineCommandSpec } from './spec'

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

  root.action(() => '请发送 phi help 查看用法。')
}
