import { randomUUID } from 'node:crypto'
import type { Context } from 'koishi'

export interface PhiUser {
  uid: number
  lastSignDate: string | null
  signDates: string[]
  tasks: any[]
  taskTime: string | null
  theme: string | null
  extra: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

declare module 'koishi' {
  interface Tables {
    phi_user: PhiUser
  }
}

export const NOTE_CURRENCY = 'note'
export const DEFAULT_SIGN_DATE = 'Wed Apr 03 2024 23:03:52 GMT+0800 (中国标准时间)'
export const DEFAULT_TASK_TIME = 'Wed Apr 03 2024 23:03:52 GMT+0800 (中国标准时间)'

const knownFields = new Set(['money', 'sign_in', 'sign_history', 'task_time', 'task', 'theme'])
const pending = new Map<number, Promise<void>>()

export function installPhiModels(ctx: Context) {
  ctx.model.extend('phi_user', {
    uid: 'unsigned',
    lastSignDate: { type: 'string', nullable: true },
    signDates: 'json',
    tasks: 'json',
    taskTime: { type: 'string', nullable: true },
    theme: { type: 'string', nullable: true },
    extra: 'json',
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }, { primary: 'uid' })
}

export async function getNoteBalance(ctx: Context, uid: number) {
  const [record] = await ctx.database.get('monetary', { uid, currency: NOTE_CURRENCY }, ['value'])
  return record?.value ?? 0
}

async function readPhiUser(ctx: Context, uid: number) {
  const [user] = await ctx.database.get('phi_user', { uid })
  return user
}

async function writePhiUser(ctx: Context, uid: number, data: any) {
  const [existing] = await ctx.database.get('phi_user', { uid })
  const nextMoney = Number(data.money) || 0
  const oldMoney = await getNoteBalance(ctx, uid)
  const delta = nextMoney - oldMoney
  let changed = false
  if (delta > 0) {
    await ctx.monetary.gain(uid, delta, NOTE_CURRENCY)
    changed = true
  } else if (delta < 0) {
    await ctx.monetary.cost(uid, -delta, NOTE_CURRENCY)
    changed = true
  }

  const extra = { ...(existing?.extra || {}) }
  for (const [key, value] of Object.entries(data)) {
    if (!knownFields.has(key)) extra[key] = value
  }

  const now = new Date()
  try {
    await ctx.database.upsert('phi_user', [{
      uid,
      lastSignDate: typeof data.sign_in === 'string' ? data.sign_in : null,
      signDates: Array.isArray(data.sign_history) ? data.sign_history : [],
      tasks: Array.isArray(data.task) ? data.task : [],
      taskTime: typeof data.task_time === 'string' ? data.task_time : null,
      theme: typeof data.theme === 'string' ? data.theme : null,
      extra,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }], ['uid'])
  } catch (error) {
    if (changed) {
      if (delta > 0) await ctx.monetary.cost(uid, delta, NOTE_CURRENCY).catch(() => {})
      else await ctx.monetary.gain(uid, -delta, NOTE_CURRENCY).catch(() => {})
    }
    throw error
  }
}

export function installNotesStore(ctx: Context) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('phi-plugin') : ctx.logger
  const store = {
    async get(uid: number) {
      await pending.get(uid)
      const user = await readPhiUser(ctx, uid)
      return {
        ...(user?.extra || {}),
        money: await getNoteBalance(ctx, uid),
        sign_in: user?.lastSignDate || DEFAULT_SIGN_DATE,
        sign_history: user?.signDates || [],
        task_time: user?.taskTime || DEFAULT_TASK_TIME,
        task: user?.tasks || [],
        theme: user?.theme || 'common',
      }
    },
    put(uid: number, data: any) {
      const previous = pending.get(uid) || Promise.resolve()
      const next = previous.then(() => writePhiUser(ctx, uid, typeof data?.toJSON === 'function' ? data.toJSON() : data))
      pending.set(uid, next)
      next.finally(() => {
        if (pending.get(uid) === next) pending.delete(uid)
      }).catch(error => logger.warn('Phi notes write failed for user %s: %o', uid, error))
      return true
    },
    async delete(uid: number) {
      await pending.get(uid)
      const balance = await getNoteBalance(ctx, uid)
      if (balance > 0) await ctx.monetary.cost(uid, balance, NOTE_CURRENCY).catch(() => {})
      await ctx.database.remove('phi_user', { uid })
      pending.delete(uid)
      return true
    },
  }
  ;(globalThis as any).__PHI_NOTES_STORE = store
  return store
}

export interface PhiComment {
  id: string
  songId: string
  payload: Record<string, any>
  createdAt: Date
}

export interface PhiChartTag {
  id: string
  songId: string
  rank: string
  tag: string
  agree: string[]
  disagree: string[]
  updatedAt: Date
}

declare module 'koishi' {
  interface Tables {
    phi_comment: PhiComment
    phi_chart_tag: PhiChartTag
  }
}

export function installCommunityModels(ctx: Context) {
  ctx.model.extend('phi_comment', {
    id: 'string',
    songId: 'string',
    payload: 'json',
    createdAt: 'timestamp',
  }, { primary: 'id' })
  ctx.model.extend('phi_chart_tag', {
    id: 'string',
    songId: 'string',
    rank: 'string',
    tag: 'string',
    agree: 'json',
    disagree: 'json',
    updatedAt: 'timestamp',
  }, { primary: 'id' })
}

export async function installCommunityStore(ctx: Context) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('phi-plugin') : ctx.logger
  const [comments, tags] = await Promise.all([
    ctx.database.get('phi_comment', {}),
    ctx.database.get('phi_chart_tag', {}),
  ])

  const commentData: Record<string, any[]> = {}
  const commentMap: Record<string, string> = {}
  for (const row of comments) {
    const item = { ...row.payload, thisId: row.id }
    ;(commentData[row.songId] ||= []).push(item)
    commentMap[row.id] = row.songId
  }

  const comment = {
    data: commentData,
    get(songId: string) { return commentData[songId] || [] },
    getByCommentId(commentId: string) {
      const songId = commentMap[commentId]
      if (!songId) return null
      const item = commentData[songId]?.find(entry => entry.thisId === commentId)
      return item ? { ...item, songId } : null
    },
    add(songId: string, value: any) {
      const id = randomUUID()
      const item = { ...value, thisId: id }
      ;(commentData[songId] ||= []).push(item)
      commentMap[id] = songId
      void ctx.database.upsert('phi_comment', [{ id, songId, payload: item, createdAt: new Date() }], ['id'])
        .catch(error => logger.warn('Phi comment write failed: %o', error))
      return true
    },
    del(commentId: string) {
      const songId = commentMap[commentId]
      if (!songId) return false
      const index = commentData[songId]?.findIndex(entry => entry.thisId === commentId) ?? -1
      if (index < 0) return false
      commentData[songId].splice(index, 1)
      delete commentMap[commentId]
      void ctx.database.remove('phi_comment', { id: commentId })
        .catch(error => logger.warn('Phi comment delete failed: %o', error))
      return true
    },
  }

  const tagData: Record<string, Record<string, Record<string, { agree: string[], disagree: string[] }>>> = {}
  for (const row of tags) {
    ;((tagData[row.songId] ||= {})[row.rank] ||= {})[row.tag] = {
      agree: Array.isArray(row.agree) ? row.agree : [],
      disagree: Array.isArray(row.disagree) ? row.disagree : [],
    }
  }

  const tagKey = (songId: string, rank: string, tag: string) => `${songId}\u0000${rank}\u0000${tag}`
  const writeTag = (songId: string, rank: string, tag: string) => {
    const value = tagData[songId]?.[rank]?.[tag]
    if (!value) {
      void ctx.database.remove('phi_chart_tag', { id: tagKey(songId, rank, tag) })
        .catch(error => logger.warn('Phi chart tag delete failed: %o', error))
      return
    }
    void ctx.database.upsert('phi_chart_tag', [{
      id: tagKey(songId, rank, tag), songId, rank, tag,
      agree: value.agree, disagree: value.disagree, updatedAt: new Date(),
    }], ['id']).catch(error => logger.warn('Phi chart tag write failed: %o', error))
  }

  const chartTag = {
    data: tagData,
    get(songId: string, rank: string, all = false) {
      const values = tagData[songId]?.[rank] || {}
      return Object.entries(values)
        .map(([name, value]) => ({ name, value: value.agree.length - value.disagree.length }))
        .filter(item => all || item.value > 0)
    },
    add(songId: string, tag: string, rank: string, agree: boolean, userId: string) {
      const value = (((tagData[songId] ||= {})[rank] ||= {})[tag] ||= { agree: [], disagree: [] })
      const target = agree ? value.agree : value.disagree
      const other = agree ? value.disagree : value.agree
      if (!target.includes(userId)) target.push(userId)
      const index = other.indexOf(userId)
      if (index >= 0) other.splice(index, 1)
      writeTag(songId, rank, tag)
      return true
    },
    cancel(songId: string, tag: string, rank: string, userId: string) {
      const value = tagData[songId]?.[rank]?.[tag]
      if (!value) return false
      for (const list of [value.agree, value.disagree]) {
        const index = list.indexOf(userId)
        if (index >= 0) list.splice(index, 1)
      }
      if (!value.agree.length && !value.disagree.length) delete tagData[songId][rank][tag]
      writeTag(songId, rank, tag)
      return true
    },
  }

  ;(globalThis as any).__PHI_COMMENT_STORE = comment
  ;(globalThis as any).__PHI_TAG_STORE = chartTag
}
