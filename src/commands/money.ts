import type { Context } from 'koishi'
import type { Config } from '../config'
import { getNoteBalance, NOTE_CURRENCY } from '../database/index'

class UserLocks {
  private tails = new Map<number, Promise<void>>()

  async run<T>(uid: number, callback: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(uid) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    this.tails.set(uid, tail)
    await previous
    try {
      return await callback()
    } finally {
      release()
      if (this.tails.get(uid) === tail) this.tails.delete(uid)
    }
  }
}

function getLocalDateKey(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parseTransferAmount(source: string) {
  if (!/^[1-9]\d*$/.test(source)) return
  const amount = Number(source)
  if (!Number.isSafeInteger(amount)) return
  return amount
}

function parseTransferTarget(source: string) {
  const index = source.indexOf(':')
  if (index <= 0 || index === source.length - 1) return
  return { platform: source.slice(0, index), userId: source.slice(index + 1) }
}

export function registerMoneyCommands(ctx: Context, config: Config) {
  const locks = new UserLocks()
  ctx.command('phi', 'Phi 相关功能', { slash: false })

  const register = (names: string[], description: string, action: (...args: any[]) => any) => {
    const [primary, ...aliases] = names
    const command = ctx.command(`phi.${primary}`, description, { slash: false })
    for (const alias of aliases) command.alias(`phi.${alias.split(' ', 1)[0]}`)
    command.userFields(['id']).action(action)
  }

  register(['balance', '余额'], '查看 Note Balance', async ({ session }: any) => {
    return session.text('commands.balance.messages.balance', [await getNoteBalance(ctx, session.user.id)])
  })

  register(['sign', '签到', '打卡'], '每日签到领取 Note', async ({ session }: any) => locks.run(session.user.id, async () => {
    const uid = session.user.id
    const dateKey = getLocalDateKey(config.timezone)
    const [user] = await ctx.database.get('phi_user', { uid })
    const signDates = user?.signDates ?? []
    if (user?.lastSignDate === dateKey || signDates.includes(dateKey)) {
      return session.text('commands.sign.messages.sign.duplicate')
    }

    const reward = Math.floor(Math.random() * (config.signInRewardMax - config.signInRewardMin + 1))
      + config.signInRewardMin
    const now = new Date()
    const nextDates = [...signDates, dateKey]
    const previousSignState = user && { lastSignDate: user.lastSignDate, signDates, updatedAt: user.updatedAt }
    let stateSaved = false
    try {
      if (user) {
        await ctx.database.set('phi_user', { uid }, { lastSignDate: dateKey, signDates: nextDates, updatedAt: now })
      } else {
        await ctx.database.create('phi_user', {
          uid,
          lastSignDate: dateKey,
          signDates: nextDates,
          tasks: [],
          taskTime: null,
          theme: null,
          extra: {},
          createdAt: now,
          updatedAt: now,
        })
      }
      stateSaved = true
      await ctx.monetary.gain(uid, reward, NOTE_CURRENCY)
    } catch (error) {
      if (stateSaved) {
        try {
          if (previousSignState) await ctx.database.set('phi_user', { uid }, previousSignState)
          else await ctx.database.remove('phi_user', { uid })
        } catch (rollbackError) {
          ctx.logger('phi-plugin').warn('failed to roll back Sign-in state for user %s: %o', uid, rollbackError)
        }
      }
      throw error
    }

    return session.text('commands.sign.messages.sign.success', [reward, await getNoteBalance(ctx, uid)])
  }))

  register(['transfer <target:user> <amount:string>', '转账 <target:user> <amount:string>', 'send <target:user> <amount:string>', '送 <target:user> <amount:string>', '转 <target:user> <amount:string>'], 'Transfer Note', async ({ session }: any, target: string, amountSource: string) => locks.run(session.user.id, async () => {
    const amount = parseTransferAmount(amountSource)
    if (!amount) return session.text('commands.transfer.messages.transfer.invalidAmount')
    const targetInfo = parseTransferTarget(target)
    if (!targetInfo) return session.text('commands.transfer.messages.transfer.invalidTarget')
    const targetUser = await ctx.database.getUser(targetInfo.platform, targetInfo.userId, ['id'])
    if (!targetUser) return session.text('commands.transfer.messages.transfer.invalidTarget')
    if (targetUser.id === session.user.id) return session.text('commands.transfer.messages.transfer.self')
    if (await getNoteBalance(ctx, session.user.id) < amount) return session.text('commands.transfer.messages.transfer.insufficient')

    const fee = Number(BigInt(amount) * BigInt(config.transferFee) / 100n)
    const net = amount - fee
    let debited = false
    try {
      await ctx.monetary.cost(session.user.id, amount, NOTE_CURRENCY)
      debited = true
      await ctx.monetary.gain(targetUser.id, net, NOTE_CURRENCY)
    } catch (error) {
      if (debited) {
        try {
          await ctx.monetary.gain(session.user.id, amount, NOTE_CURRENCY)
        } catch (compensationError) {
          ctx.logger('phi-plugin').error('failed to compensate Transfer for user %s: %o', session.user.id, compensationError)
          return session.text('commands.transfer.messages.transfer.compensationFailed')
        }
      }
      ctx.logger('phi-plugin').warn('failed to process Transfer from user %s to user %s: %o', session.user.id, targetUser.id, error)
      return session.text('commands.transfer.messages.transfer.failed')
    }

    return session.text('commands.transfer.messages.transfer.success', [
      amount,
      fee,
      net,
      await getNoteBalance(ctx, session.user.id),
      await getNoteBalance(ctx, targetUser.id),
    ])
  }))

  ctx.i18n.define('zh-CN', {
    'commands.phi.description': 'Phi 相关功能',
    'commands.phi.usage': '使用 phi 查看 Balance、签到或转账。',
    'commands.phi.examples': 'phi balance\nphi sign\nphi transfer',
    'commands.balance.description': '查看 Note Balance',
    'commands.balance.usage': '查看你当前可支配的 Note Balance。',
    'commands.balance.messages.balance': '余额：{0} Note',
    'commands.balance.examples': 'phi balance\nphi 余额',
    'commands.sign.description': '每日签到领取 Note',
    'commands.sign.usage': '每个配置时区的自然日只能签到一次，签到后随机获得指定范围内的 Note。',
    'commands.sign.examples': 'phi sign\nphi 签到',
    'commands.sign.messages.sign.success': '签到成功，获得 {0} Note！当前余额：{1} Note。',
    'commands.sign.messages.sign.duplicate': '今天已经签到过了，明天再来吧。',
    'commands.transfer.arguments.target': '目标用户，使用 @用户 形式。',
    'commands.transfer.arguments.amount': '转账总额，必须是大于 0 的整数。',
    'commands.transfer.description': '转账 Note',
    'commands.transfer.usage': '向另一名用户转账。发送方支付总额与手续费，接收方收到扣除手续费后的净额。手续费按 floor(总额 × 费率 / 100) 计算。',
    'commands.transfer.examples': 'phi transfer @user 100\nphi 转账 @user 100',
    'commands.transfer.messages.transfer.success': '转账成功：支出 {0} Note，手续费 {1} Note，对方收到 {2} Note。你的余额：{3} Note，对方余额：{4} Note。',
    'commands.transfer.messages.transfer.invalidAmount': '转账金额必须是大于 0 的整数。',
    'commands.transfer.messages.transfer.invalidTarget': '找不到目标用户。',
    'commands.transfer.messages.transfer.self': '不能给自己转账。',
    'commands.transfer.messages.transfer.insufficient': 'Note Balance 不足。',
    'commands.transfer.messages.transfer.failed': '转账失败，Note 已退回。',
    'commands.transfer.messages.transfer.compensationFailed': '转账失败，且退款未完成，请联系管理员。',
  })

  ctx.i18n.define('en-US', {
    'commands.phi.description': 'Phi features',
    'commands.phi.usage': 'Use phi to view your Balance, Sign in, or Transfer Note.',
    'commands.phi.examples': 'phi balance\nphi sign\nphi transfer',
    'commands.balance.description': 'View Note Balance',
    'commands.balance.usage': 'View your current Note Balance.',
    'commands.balance.messages.balance': 'Balance: {0} Note',
    'commands.balance.examples': 'phi balance',
    'commands.sign.description': 'Sign in daily to receive Note',
    'commands.sign.usage': 'You can Sign in once per local calendar day. Each Sign-in grants a random amount of Note within the configured range.',
    'commands.sign.examples': 'phi sign',
    'commands.sign.messages.sign.success': 'Signed in successfully. You received {0} Note! Current balance: {1} Note.',
    'commands.sign.messages.sign.duplicate': 'You have already signed in today. Come back tomorrow.',
    'commands.transfer.arguments.target': 'Target user, mention them with @.',
    'commands.transfer.arguments.amount': 'Gross amount to transfer; must be a positive integer.',
    'commands.transfer.description': 'Transfer Note',
    'commands.transfer.usage': 'Transfer Note to another user. The sender pays the gross amount and fee; the recipient receives the gross amount minus the fee. The fee is floor(gross amount × fee percent / 100).',
    'commands.transfer.examples': 'phi transfer @user 100',
    'commands.transfer.messages.transfer.success': 'Transfer complete: gross {0} Note, fee {1} Note, recipient received {2} Note. Your balance: {3} Note; recipient balance: {4} Note.',
    'commands.transfer.messages.transfer.invalidAmount': 'The transfer amount must be a positive integer.',
    'commands.transfer.messages.transfer.invalidTarget': 'The target user could not be found.',
    'commands.transfer.messages.transfer.self': 'You cannot transfer Note to yourself.',
    'commands.transfer.messages.transfer.insufficient': 'Your Note Balance is insufficient.',
    'commands.transfer.messages.transfer.failed': 'The transfer failed and your Note was refunded.',
    'commands.transfer.messages.transfer.compensationFailed': 'The transfer failed and the refund did not complete. Please contact an administrator.',
  })
}
