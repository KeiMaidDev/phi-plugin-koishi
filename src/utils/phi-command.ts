/** 去掉命令头外层的斜线或井号。 */
export function normalizePhiCommandHead(commandHead: unknown) {
  return String(commandHead ?? '').replace(/^[/#]+/, '').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 从一条 Phi 指令中提取原始子命令，不保留任何后续参数。 */
export function getPhiSubcommand(value: unknown, commandHead: unknown) {
  const head = normalizePhiCommandHead(commandHead)
  if (!head) return ''
  let rest = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!rest) return ''
  rest = rest.replace(new RegExp(`^(?:[#/杠刚钢纲]\\s*)?${escapeRegExp(head)}\\s*`, 'i'), '')
  return /^(\S+)/.exec(rest)?.[1] ?? ''
}

/** 生成只包含 Phi 根命令和原始子命令的快捷指令。 */
export function phiSubcommandCommand(commandHead: unknown, currentCommand: unknown, subcommand?: unknown) {
  const head = normalizePhiCommandHead(commandHead)
  if (!head) return ''
  const source = String(subcommand ?? '').trim() || currentCommand
  const value = getPhiSubcommand(source, head)
  return value ? `/${head} ${value}` : `/${head}`
}
