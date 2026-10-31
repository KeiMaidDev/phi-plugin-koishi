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

const rootHelpAliases = new Set(['help', '帮助', '菜单', '命令', '说明', '功能', '指令', '使用说明'])

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

function isRootHelpInput(session: any) {
  const content = String(session?.stripped?.content ?? session?.content ?? '').trim()
  const match = /^(?:[/#]\s*)?phi\s+(\S+)\s*$/i.exec(content)
  return Boolean(match && rootHelpAliases.has(match[1].toLowerCase()))
}

export function registerEngineCommands(ctx: Context, runtime: EngineRuntime) {
  const root = ctx.command('phi', 'Phi 相关功能', { slash: false })
  root.alias('phihelp')

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

  ctx.middleware?.(async (session, next) => {
    if (!isRootHelpInput(session)) return next()
    try {
      return await invokeRootHelp(runtime, session)
    } catch (error) {
      ctx.logger('phi-plugin').error(error)
      return `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
    }
  }, true)

  root.action(async (argv) => {
    try {
      return await invokeRootHelp(runtime, argv.session)
    } catch (error) {
      ctx.logger('phi-plugin').error(error)
      return `Phi 功能执行失败：${error instanceof Error ? error.message : String(error)}`
    }
  })
}
