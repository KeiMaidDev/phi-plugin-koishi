// @ts-nocheck
function store() {
    const value = globalThis.__PHI_COMMENT_STORE
    if (!value) throw new Error('Phi comment store is not initialized')
    return value
}

export default new class getComment {
    get data() { return store().data }
    get(songId) { return store().get(songId) }
    getByCommentId(commentId) { return store().getByCommentId(commentId) }
    add(songId, comment) { return store().add(songId, comment) }
    del(commentId) { return store().del(commentId) }
}()
