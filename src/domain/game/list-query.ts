/** @typedef {'NEW'|'F'|'C'|'B'|'A'|'S'|'V'|'FC'|'PHI'} ScoreRating */

export const SCORE_LIST_RATINGS = ['NEW', 'F', 'C', 'B', 'A', 'S', 'V', 'FC', 'PHI']
export const SCORE_LIST_LEVELS = ['EZ', 'HD', 'IN', 'AT']

/**
 * 解析成绩筛选参数中的数值区间。
 * @param {string} source
 * @param {number[]} range
 */
function matchRange(source, range) {
    if (source.match(/[0-9]+(\.[0-9]+)?\s*[-～~]\s*[0-9]+(\.[0-9]+)?/g)) {
        const matched = source.match(/[0-9]+(\.[0-9]+)?\s*[-～~]\s*[0-9]+(\.[0-9]+)?/g)?.[0]
        if (!matched) return range
        const result = matched.split(/\s*[-～~]\s*/g)
        range[0] = Number(result[0])
        range[1] = Number(result[1])
        if (range[0] > range[1]) {
            const value = range[1]
            range[1] = range[0]
            range[0] = value
        }
        if (range[1] % 1 === 0 && !result.includes('.0')) range[1] += 0.9
    } else if (source.match(/[0-9]+(\.[0-9]+)?\s*[-+]/g)) {
        const matched = source.match(/[0-9]+(\.[0-9]+)?\s*[-+]/g)?.[0]
        if (!matched) return range
        const result = matched.replace(/\s*[-+]/g, '')
        if (matched.includes('+')) {
            range[0] = Number(result)
        } else {
            range[1] = Number(result)
            if (range[1] % 1 === 0 && !result.includes('.0')) range[1] += 0.9
        }
    } else if (source.match(/[0-9]+(\.[0-9]+)?/g)) {
        const matched = source.match(/[0-9]+(\.[0-9]+)?/g)?.[0]
        if (!matched) return range
        range[0] = range[1] = Number(matched)
        if (!matched.includes('.')) range[1] += 0.9
    }
    return range
}

/**
 * 解析 phi list 的数量、定数、ACC、难度和评级条件。
 * @param {string} source
 * @param {number} maxListSize
 * @param {number} maxDifficulty
 */
export function parseScoreListQuery(source, maxListSize, maxDifficulty) {
    const difficultyRange = [0, maxDifficulty]
    const accRange = [0, 100]
    let msg = String(source ?? '').replace(/^[#/](.*?)list/, '').toUpperCase()

    let levelFilters = [true, true, true, true]

    const accText = msg.match(/-ACC\s*\d+(\.\d+)?(\s*[-～~]\s*\d+(\.\d+)?|\s*[+-])?/i)?.[0]
    if (accText) {
        matchRange(accText, accRange)
        msg = msg.replace(accText, '')
    }
    if (!(accRange[0] >= 0 && accRange[1] <= 100 && accRange[0] <= accRange[1])) {
        return { ok: false, error: 'ACC 范围无效，应在 0-100 之间。' }
    }

    const difficultyText = msg.match(/-DIF\s*\d+(\.\d+)?(\s*[-～~]\s*\d+(\.\d+)?|\s*[+-])?/i)?.[0]
    if (difficultyText) {
        matchRange(difficultyText, difficultyRange)
        msg = msg.replace(difficultyText, '')
    }
    if (!(difficultyRange[0] >= 0 && difficultyRange[1] <= maxDifficulty && difficultyRange[0] <= difficultyRange[1])) {
        return { ok: false, error: `定数范围无效，应在 0-${maxDifficulty} 之间。` }
    }

    let limit = null
    const countText = msg.match(/(?:^|\s)(\d+)(?=\s|$)/)
    if (countText) {
        limit = Number(countText[1])
        if (!Number.isSafeInteger(limit) || limit < 1) {
            return { ok: false, error: '数量必须是正整数。' }
        }
        if (limit > maxListSize) {
            return { ok: false, error: `请求数量过大：${limit} 大于设置的最大值(${maxListSize})。` }
        }
        msg = msg.replace(countText[0], ' ')
    }

    if (msg.includes('EZ') || msg.includes('HD') || msg.includes('IN') || msg.includes('AT')) {
        levelFilters = [false, false, false, false]
        for (let index = 0; index < SCORE_LIST_LEVELS.length; index++) {
            if (msg.includes(SCORE_LIST_LEVELS[index])) levelFilters[index] = true
        }
    }
    msg = msg.replace(/(list|AT|IN|HD|EZ)*/g, '')

    let scoreFilters = Object.fromEntries(SCORE_LIST_RATINGS.map(rating => [rating, true]))
    const selectedRatings = msg.match(/\b(?:NEW|F|C|B|A|S|V|FC|PHI|AP)\b/g)
    if (selectedRatings) {
        scoreFilters = Object.fromEntries(SCORE_LIST_RATINGS.map(rating => [rating, false]))
        for (const rating of selectedRatings) {
            scoreFilters[rating === 'AP' ? 'PHI' : rating] = true
        }
    }
    msg = msg.replace(/\b(?:NEW|F|C|B|A|S|V|FC|PHI|AP)\b/g, '')
    msg = msg.replace(/\s+/g, '').trim()
    if (msg) return { ok: false, error: `无法识别的参数：${msg}` }

    return {
        ok: true,
        query: {
            limit,
            difficultyRange,
            accRange,
            levelFilters,
            scoreFilters,
        },
    }
}
