export const grksHintWords = {
  exhausted: 'B30 成绩已全部公开，可继续猜测或放弃。',
  recordsHeader: '本次公开的成绩：',
  positionHidden: '（位置尚未公开）',
  recordLine: (position: string, rank: string, difficulty: string, song: string, score: number, acc: string) =>
    `${position}${rank} ${difficulty} ${song} · ${score} · ${acc}%`,
  range: (min: string, max: string) => `B30 单曲等效 rks 区间：${min} ~ ${max}`,
  histogramHeader: 'B30 等效 rks 分布：',
  histogramRange: (min: string, max: string, average: string) => `区间 ${min} ~ ${max}，平均 ${average}`,
  challenge: (name: string, level: string | number, score: string | number) =>
    `课题模式：${name} ${level}（${score} 分）`,
  completionHeader: '谱面完成度：',
  statsLine: (title: string, cleared: number, tot: number, fc: number, phi: number) =>
    `${title}：通关 ${cleared}/${tot} · FC ${fc} · φ ${phi}`,
  totalLine: (cleared: number, tot: number, fc: number, phi: number) =>
    `合计：通关 ${cleared}/${tot} · FC ${fc} · φ ${phi}`,
  revealed: (count: number, total: number) => `已公开 ${count}/${total} 个槽位`,
}

export const grksViewWords = {
  anonymous: '？？？',
  waitingHint: '等待提示',
  unanswered: '—',
  historyTitle: '猜测记录',
  historyMeta: (answered: number) => `已回答 ${answered} / 10 次`,
  historyHint: (hint: string, giver = false) => `${giver ? '已给提示' : '提示'}：${hint}`,
  historyAnswer: (answer: string, giver = false) => `${giver ? '对手答' : '答'} ${answer}`,
  giver: {
    title: '提示者视角',
    slotHidden: (slot: string) => `未向对手公开 · ${slot}`,
    hiddenStats: '统计与课题分尚未向对手公开',
    hiddenSheet: '直方图尚未向对手公开',
    sheetExclusive: '直方图与上下界仅可选择一种',
    historyTitle: '对手猜测记录',
    historyMeta: (answered: number) => `对手已回答 ${answered} / 10 次`,
  },
  guessResult: {
    pending: '待回答', correct: '正确', wrong: '错误',
    timeout: '超时放弃', abandoned: '已放弃', empty: '未开始',
  },
  slotName: (index: number) => index < 3 ? `P${index + 1}` : `B${index - 2}`,
  date: (timestamp?: number) => {
    const date = typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp) : new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },
  answerRks: (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '----',
  recordRks: (value: number | null) => value === null ? '???' : value.toFixed(2),
  tickRks: (value: number) => value.toFixed(2),
  answer(value?: number | null) {
    return value === null || value === undefined ? grksViewWords.unanswered : String(value)
  },
}

export const grksClassWords = {
  hint: {
    summary(data: { type: 'record' | 'info' | 'sheet'; indices: number[]; orderKnown: boolean; sheetKind: string; orderRevealed: boolean }) {
      let text: string
      if (data.type === 'record') {
        text = data.orderKnown
          ? `公开 ${data.indices.map(grksViewWords.slotName).join(' / ')}`
          : `公开随机成绩 ${data.indices.length} 条`
      } else if (data.type === 'info') {
        text = '存档统计与课题分'
      } else {
        text = data.sheetKind === 'histogram' ? '等效 RKS 直方图' : '等效 RKS 上下界'
      }
      return data.orderRevealed ? `${text}；公开成绩顺序` : text
    },
    append: (previous: string, hint: string) => `${previous}；${hint}`,
    noNew: '无新增提示',
    missingHistory: '猜测记录未创建',
  },
  hintRecord: { noUnKnown: '抽取未知的成绩失败' },
  getKnownData: { noAnswer: '没有已知的成绩' },
}