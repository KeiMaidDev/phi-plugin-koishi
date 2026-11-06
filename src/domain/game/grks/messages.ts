export const grksHintWords = {
  exhausted: '30 个成绩槽位已全部公开。',
  recordsHeader: '🔎 新线索',
  positionHidden: '槽位顺序仍隐藏，后续提示会公开。',
  recordLine: (position: string, rank: string, difficulty: string, song: string, score: number, acc: string) =>
    `${position}${rank} ${difficulty} · ${song} · ${score} 分 · ${acc}%`,
  range: (min: string, max: string) => `单曲等效 RKS 范围：${min} ~ ${max}`,
  histogramHeader: '单曲等效 RKS 分布',
  histogramRange: (min: string, max: string, average: string) => `范围 ${min} ~ ${max} · 平均 ${average}`,
  challenge: (name: string, level: string | number, score: string | number) =>
    `课题模式：${name} ${level} · ${score} 分`,
  completionHeader: '谱面完成度',
  statsLine: (title: string, cleared: number, tot: number, fc: number, phi: number) =>
    `${title}：通关 ${cleared}/${tot} · FC ${fc} · φ ${phi}`,
  totalLine: (cleared: number, tot: number, fc: number, phi: number) =>
    `合计：通关 ${cleared}/${tot} · FC ${fc} · φ ${phi}`,
  revealed: (count: number, total: number) => `线索进度：${count}/${total} 个槽位`,
}

export const grksViewWords = {
  anonymous: '？？？',
  waitingHint: '等待线索',
  unanswered: '—',
  historyTitle: '作答记录',
  historyMeta: (answered: number) => `已作答 ${answered}/10`,
  historyHint: (hint: string, giver = false) => `${giver ? '已给线索' : '线索'}：${hint}`,
  historyAnswer: (answer: string, giver = false) => `${giver ? '对手作答' : '作答'} ${answer}`,
  giver: {
    title: '出题视角',
    slotHidden: (slot: string) => `未公开 · ${slot}`,
    hiddenStats: '统计与课题分尚未公开',
    hiddenSheet: 'RKS 统计图尚未公开',
    sheetExclusive: '直方图和区间只能公开一种',
    historyTitle: '对手作答记录',
    historyMeta: (answered: number) => `对手已作答 ${answered}/10`,
  },
  guessResult: {
    pending: '待作答', correct: '正确', wrong: '错误',
    timeout: '超时', abandoned: '已放弃', empty: '未开始',
  },
  slotName: (index: number) => index < 3 ? `P${index + 1}` : `B${index - 2}`,
  date: (timestamp?: number) => {
    const date = typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp) : new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },
  answerRks: (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '----',
  recordRks: (value: number | null) => value === null ? '待公开' : value.toFixed(2),
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
          : `公开 ${data.indices.length} 条随机成绩`
      } else if (data.type === 'info') {
        text = '公开存档统计与课题分'
      } else {
        text = data.sheetKind === 'histogram' ? '公开 RKS 直方图' : '公开 RKS 区间'
      }
      return data.orderRevealed ? `${text}，并公开成绩顺序` : text
    },
    append: (previous: string, hint: string) => `${previous}；${hint}`,
    noNew: '没有新线索',
    missingHistory: '作答记录未创建',
  },
  hintRecord: { noUnKnown: '没有可公开的未揭示成绩' },
  getKnownData: { noAnswer: '暂无可展示的成绩' },
}
