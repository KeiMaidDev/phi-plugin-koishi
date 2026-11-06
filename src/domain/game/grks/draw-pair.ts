// @ts-nocheck
/**
 * @template T
 * @param {string[]} sourceIds
 * @param {string} redSourceId
 * @param {string} blueSourceId
 * @param {(sourceId: string) => Promise<T | null>} load
 * @returns {Promise<[T, T] | null>}
 */
export async function drawPair(sourceIds, redSourceId, blueSourceId, load) {
    if (!redSourceId || !blueSourceId) throw new Error('无法识别参赛者存档')
    const candidates = [...new Set(sourceIds)]
    /** @type {{sourceId: string, answer: T} | null} */
    let first = null
    while (candidates.length) {
        const index = Math.floor(Math.random() * candidates.length)
        const sourceId = candidates[index]
        candidates[index] = candidates[candidates.length - 1]
        candidates.pop()
        if (sourceId === redSourceId && sourceId === blueSourceId) continue
        const answer = await load(sourceId)
        if (answer === null) continue
        if (!first) {
            first = { sourceId, answer }
            continue
        }
        if (first.sourceId !== blueSourceId && sourceId !== redSourceId) return [first.answer, answer]
        if (sourceId !== blueSourceId && first.sourceId !== redSourceId) return [answer, first.answer]
    }
    return null
}
