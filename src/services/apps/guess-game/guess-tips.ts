// @ts-nocheck
import fCompute from "../../../domain/game/f-compute"
import getInfo from "../../../domain/game/get-info"
import { allLevel } from "../../../domain/game/const-num"
import send from "../../../render/send"
import picmodle from "../../../render/pic-model"
import getPic from "../../../render/get-pic"
import logger from "../../../utils/logger"
import { resolveSongGuess } from './game-interaction'
import { sendGameStatus } from './game-message'



/**
 * @typedef {Object} guessIllDataLite
 * @property {string} illustration 曲绘路径
 * @property {number} width 展示的宽度
 * @property {number} height 展示的高度
 * @property {number} x 展示的X位置
 * @property {number} y 展示的Y位置
 * @property {number|boolean} style 是否全局视野 (0/1 or false/true)
 * @property {string} [ans] 答案图片路径(游戏结束时)
 */
class GuessTipsGameData {
    /**
     * @param {idString} songId 
     * @param {string[]} tips
     * @param {number} width 
     * @param {number} height 
     * @param {number} x 
     * @param {number} y 
     * 
     */
    constructor(songId, tips, width, height, x, y) {
        /**答案曲目id */
        this.songId = songId;
        /**开始时间 */
        this.startTime = new Date().getTime();
        /**上次提示时间 */
        this.tipTime = new Date().getTime();
        /**提示列表 */
        this.tips = tips;
        /**已发送提示的数量 */
        this.tipNum = 1;
        /**曲绘区域 */
        this.ill = {
            illustration: getInfo.getill(songId),
            width,
            height,
            x,
            y,
        }
    }
}

/**
 * @type {Record<string, GuessTipsGameData>}
 */
const tipsGameData = {}


/**
 * @import {GameList} from '../guess-game'
 */

export default class guessTips {
    config

    constructor(runtime) {
        this.config = runtime.config
    }

    replayCommand(group_id, gameList) {
        return gameList[group_id]?.replayCommand || '/phi tipgame'
    }

    async start(e, gameList) {
        const { group_id } = e
        if (gameList[group_id]) {
            await sendGameStatus(e, '**请不要重复发起**', '请不要重复发起。', this.config, 'answer-hint')
            return false
        }

        const hasIllIdList = (getInfo.idList || []).filter(id => getInfo.getill(id) && getInfo.info(id))
        if (!hasIllIdList.length) {
            logger.error('[phi-plugin] 提示猜歌无有效曲目')
            await sendGameStatus(e, '**当前曲库暂无可用于提示猜歌的曲绘**', '当前曲库暂无可用于提示猜歌的曲绘，更改曲库后需要重启。', this.config, 'answer-hint')
            return false
        }

        const songId = hasIllIdList[fCompute.randInt(0, hasIllIdList.length - 1)]
        const info = getInfo.info(songId)
        if (!info) {
            await sendGameStatus(e, '**获取曲目信息失败**', '获取曲目信息发生未知错误。', this.config, 'answer-hint')
            return false
        }

        let tips = [
            `这首曲目隶属于 ${info.chapter}`,
            `这首曲目的⌈BPM⌋值为 ${info.bpm}`,
            `这首曲目的⌈作曲者⌋为 ${info.composer}`,
            `这首曲目的⌈时长⌋为 ${info.length}`,
            `这首曲目的⌈画师⌋为 ${info.illustrator}`,
        ]
        for (const level of Object.keys(info.chart)) {
            if (!info.chart[level]) continue
            tips.push(`这首曲目的 ⌈${level}⌋ 难度 ⌈定数⌋ 为 ${info.chart[level].difficulty}`)
            tips.push(`这首曲目的 ⌈${level}⌋ 难度 ⌈物量⌋ 为 ${info.chart[level].combo}`)
            tips.push(`这首曲目的 ⌈${level}⌋ 难度 ⌈谱师⌋ 为 ${info.chart[level].charter}`)
        }
        tips = fCompute.randArray(tips).slice(0, this.config.GuessTipsTipNum)

        const width = fCompute.randInt(100, 150)
        const height = fCompute.randInt(100, 150)
        const x = fCompute.randInt(0, 2048 - width)
        const y = fCompute.randInt(0, 1080 - height)
        gameList[group_id] = { gameType: 'guessTips', replayCommand: e.replayCommand || '/phi tipgame' }
        tipsGameData[group_id] = new GuessTipsGameData(songId, tips, width, height, x, y)
        const currentGame = tipsGameData[group_id]
        const startTime = currentGame.startTime

        await sendGameStatus(
            e,
            `**提示猜歌开始**\n\n直接回复曲名作答；每过 ${this.config.GuessTipsTipCD}s 可以发送“提示”或点击按钮获取下一条提示，共 ${this.config.GuessTipsTipNum + 1} 条。全部提示结束后 ${this.config.GuessTipsAnsTime}s 自动公布答案，也可以发送“不玩了”提前结束。`,
            `提示猜歌开始。直接回复曲名作答；每过 ${this.config.GuessTipsTipCD}s 可以发送“提示”获取下一条提示，共 ${this.config.GuessTipsTipNum + 1} 条。全部提示结束后 ${this.config.GuessTipsAnsTime}s 自动公布答案，也可以发送“不玩了”提前结束。`,
            this.config,
            'answer-hint',
        )

        let resMsg = ''
        for (let i = 0; i < currentGame.tipNum; i++) resMsg += `${i + 1}. ${currentGame.tips[i]}\n`
        await sendGameStatus(e, resMsg.trim(), resMsg.trim(), this.config, 'answer-hint')

        setTimeout(async () => {
            if (tipsGameData[group_id]?.startTime !== startTime) return
            const expired = tipsGameData[group_id]
            const replay = this.replayCommand(group_id, gameList)
            gameover(group_id, gameList)
            await sendGameStatus(
                e,
                `**很遗憾，没有人答对**\n\n正确答案是：${info.song}`,
                `很遗憾，没有人答对。正确答案是：${info.song}`,
                this.config,
                'replay',
                replay,
            )
            if (expired.tipNum > expired.tips.length) {
                await send.reply(e, await picmodle.guess(e, { ...expired.ill, blur: 0, style: 1 }))
            }
        }, this.config.GuessTipsTimeout * 1000)
        return true
    }

    async getTip(e, gameList) {
        const { group_id } = e
        const currentGame = tipsGameData[group_id]
        if (!currentGame) return false
        const nowTime = Date.now()
        if (nowTime - currentGame.tipTime < this.config.GuessTipsTipCD * 1000) {
            const left = Math.ceil((this.config.GuessTipsTipCD * 1000 - (nowTime - currentGame.tipTime)) / 1000)
            await sendGameStatus(e, `**提示冷却还有 ${left}s**`, `提示冷却还有 ${left}s。`, this.config, 'answer-hint')
            return true
        }
        if (currentGame.tipNum > currentGame.tips.length) {
            await sendGameStatus(e, '**已经没有提示了**', '已经没有提示了，再仔细想想吧。', this.config, 'answer-hint')
            return true
        }

        currentGame.tipTime = nowTime
        if (currentGame.tipNum === currentGame.tips.length) {
            currentGame.tipNum += 1
            await sendGameStatus(
                e,
                `**接下来是曲绘提示**\n\n如果在 ${this.config.GuessTipsAnsTime}s 内没有回答正确，将自动公布答案。`,
                `接下来是曲绘提示。如果在 ${this.config.GuessTipsAnsTime}s 内没有回答正确，将自动公布答案。`,
                this.config,
                'answer-hint',
            )
            await send.reply(e, await picmodle.guess(e, { ...currentGame.ill, blur: 0, style: 0 }))
            const startTime = currentGame.startTime
            setTimeout(async () => {
                if (tipsGameData[group_id]?.startTime !== startTime) return
                const expired = tipsGameData[group_id]
                const info = getInfo.info(expired.songId)
                const replay = this.replayCommand(group_id, gameList)
                gameover(group_id, gameList)
                await sendGameStatus(
                    e,
                    `**很遗憾，没有人答对**\n\n正确答案是：${info?.song}`,
                    `很遗憾，没有人答对。正确答案是：${info?.song}`,
                    this.config,
                    'replay',
                    replay,
                )
                await send.reply(e, await picmodle.guess(e, { ...expired.ill, blur: 0, style: 1 }))
                await send.reply(e, await getPic.GetSongsInfoAtlas(e, expired.songId))
            }, 30 * 1000)
            return true
        }

        currentGame.tipNum += 1
        let resMsg = ''
        for (let i = 0; i < currentGame.tipNum; i++) resMsg += `${i + 1}. ${currentGame.tips[i]}\n`
        await sendGameStatus(e, resMsg.trim(), resMsg.trim(), this.config, 'answer-hint')
        return true
    }

    async guess(e, gameList) {
        const { group_id, msg } = e
        const currentGame = tipsGameData[group_id]
        if (!currentGame) return false
        const resolution = resolveSongGuess(msg, [currentGame.songId])
        if (resolution.status === 'none') return false

        if (resolution.status === 'correct') {
            const replay = this.replayCommand(group_id, gameList)
            gameover(group_id, gameList)
            await sendGameStatus(
                e,
                '**恭喜你，答对啦！**',
                '恭喜你，答对啦！',
                this.config,
                'replay',
                replay,
            )
            if (currentGame.tipNum > currentGame.tips.length) {
                await send.reply(e, await picmodle.guess(e, { ...currentGame.ill, blur: 0, style: 0 }))
            }
            await send.reply(e, await getPic.GetSongsInfoAtlas(e, currentGame.songId))
            return true
        }

        const name = resolution.status === 'ambiguous' ? msg : (getInfo.info(resolution.ids[0])?.song || msg)
        await sendGameStatus(
            e,
            `**不是「${name}」**\n\n再想想，或者发送“提示”。`,
            `不是「${name}」。再想想，或者发送“提示”。`,
            this.config,
            'answer-hint',
        )
        return true
    }

    async ans(e, gameList) {
        const { group_id } = e
        const currentGame = tipsGameData[group_id]
        if (!currentGame) return false
        const info = getInfo.info(currentGame.songId)
        const replay = this.replayCommand(group_id, gameList)
        gameover(group_id, gameList)
        await sendGameStatus(
            e,
            `**游戏已结束**\n\n正确答案是：${info?.song}`,
            `游戏已结束。正确答案是：${info?.song}`,
            this.config,
            'replay',
            replay,
        )
        if (currentGame.tipNum > currentGame.tips.length) {
            await send.reply(e, await picmodle.guess(e, { ...currentGame.ill, blur: 0, style: 1 }))
        }
        await send.reply(e, await getPic.GetSongsInfoAtlas(e, currentGame.songId))
        return true
    }
}

function gameover(group_id, gameList) {
    delete tipsGameData[group_id]
    delete gameList[group_id]
}
