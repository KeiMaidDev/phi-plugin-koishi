import { Schema } from 'koishi'

export interface Config {
  timezone: string
  signInRewardMin: number
  signInRewardMax: number
  transferFee: number
  renderScale: number
  randerQuality: number
  timeout: number
  waitingTimeout: number
  renderQueueLimit: number
  renderNum: number
  commentsAPage: number
  B19MaxNum: number
  HistoryDayNum: number
  HistoryScoreDate: number
  HistoryScoreNum: number
  listScoreMaxNum: number
  WordB19Img: boolean
  WordSuggImg: boolean
  defaultGlobal: boolean
  onLinePhiIllUrl: 1 | 2 | 3 | 4
  githubProxy: string | false
  downIllUrl: string
  watchInfoPath: boolean
  allowComment: boolean
  autoPullPhiIll: boolean
  isGuild: boolean
  TapTapLoginQRcode: boolean
  SimpleBindReply: boolean
  openPhiPluginApi: boolean
  enableCustomThemeApi: boolean
  enableScoreStatisticsApi: boolean
  enableOnlineScoreApi: boolean
  enableAliasSyncTask: boolean
  aliasSyncTaskCron: string
  aliasSyncTaskLog: boolean
  mutiNickWaitTimeOut: number
  otherinfo: 0 | 1 | 2
  GuessTipCd: number
  GuessTipRecall: boolean
  GuessTipDefaultLevel: -1 | 0 | 1 | 2 | 3
  GuessTipChapter: boolean
  GuessTipBpm: boolean
  GuessTipComposer: boolean
  GuessTipLength: boolean
  GuessTipIllustrator: boolean
  GuessTipChartDifficulty: boolean
  GuessTipChartCombo: boolean
  GuessTipChartCharter: boolean
  LetterNum: number
  LetterMarkdown: boolean
  LetterIllustration: "水印版" | "原版" | "不发送"
  LetterRevealCd: number
  LetterGuessCd: number
  LetterTipCd: number
  LetterTimeLength: number
  GuessTipsTipCD: number
  GuessTipsTipNum: number
  GuessTipsTimeout: number
  GuessTipsAnsTime: number
  FribGuessNumTable: string
  FribTimeout: number
  FribSelfGuessCd: number
  FribGroupGuessCd: number
  FribDefaultLevel: "EZ" | "HD" | "IN" | "AT"
  FribNearVersion: number
  FribNearDifficulty: number
  FribNearBpm: number
  FribNearCombo: number
  allowChartTag: boolean
  themeMarketDownloadOrigin: string
  debug: number
  apiBotClientId: string
  apiBotClientSecret: string
  apiBotSecretVersion: number
}

export const DEFAULT_CONFIG = {
  timezone: "Asia/Shanghai",
  signInRewardMin: 5,
  signInRewardMax: 20,
  transferFee: 20,
  renderScale: 100,
  randerQuality: 100,
  timeout: 20000,
  waitingTimeout: 10000,
  renderQueueLimit: 32,
  renderNum: 1,
  commentsAPage: 10,
  B19MaxNum: 50,
  HistoryDayNum: 10,
  HistoryScoreDate: 10,
  HistoryScoreNum: 50,
  listScoreMaxNum: 180,
  WordB19Img: false,
  WordSuggImg: false,
  defaultGlobal: false,
  onLinePhiIllUrl: 1,
  githubProxy: "https://gh-proxy.com",
  downIllUrl: "https://github.com/Catrong/phi-plugin-ill.git",
  watchInfoPath: false,
  allowComment: true,
  autoPullPhiIll: false,
  isGuild: false,
  TapTapLoginQRcode: true,
  SimpleBindReply: false,
  openPhiPluginApi: true,
  enableCustomThemeApi: true,
  enableScoreStatisticsApi: true,
  enableOnlineScoreApi: true,
  enableAliasSyncTask: true,
  aliasSyncTaskCron: "0 * * * * ?",
  aliasSyncTaskLog: false,
  mutiNickWaitTimeOut: 10,
  otherinfo: 0,
  GuessTipCd: 15,
  GuessTipRecall: false,
  GuessTipDefaultLevel: -1,
  GuessTipChapter: true,
  GuessTipBpm: true,
  GuessTipComposer: true,
  GuessTipLength: true,
  GuessTipIllustrator: true,
  GuessTipChartDifficulty: true,
  GuessTipChartCombo: true,
  GuessTipChartCharter: true,
  LetterNum: 8,
  LetterMarkdown: true,
  LetterIllustration: "水印版",
  LetterRevealCd: 0,
  LetterGuessCd: 0,
  LetterTipCd: 0,
  LetterTimeLength: 300,
  GuessTipsTipCD: 5,
  GuessTipsTipNum: 6,
  GuessTipsTimeout: 600,
  GuessTipsAnsTime: 30,
  FribGuessNumTable: "8,9,10,12,14,17,20",
  FribTimeout: 600,
  FribSelfGuessCd: 3,
  FribGroupGuessCd: 0,
  FribDefaultLevel: "IN",
  FribNearVersion: 2,
  FribNearDifficulty: 0.3,
  FribNearBpm: 20,
  FribNearCombo: 200,
  allowChartTag: false,
  themeMarketDownloadOrigin: "https://lyh.org.cn:18473",
  debug: 0,
  apiBotClientId: "",
  apiBotClientSecret: "",
  apiBotSecretVersion: 0,
} as const satisfies Config

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultGlobal: Schema.boolean().default(false).description("默认使用国际服"),
    onLinePhiIllUrl: Schema.union([Schema.const(1).description("GitHub raw"), Schema.const(2).description("Gitee raw"), Schema.const(3).description("弦塔资源站"), Schema.const(4).description("cnb.cool")]).default(1).description("在线曲绘源(暂不可用)"),
    githubProxy: Schema.union([Schema.const(false).description('不使用代理'), Schema.string().description('使用代理')]).default("https://gh-proxy.org").description("GitHub代理"),
    downIllUrl: Schema.union([Schema.const("https://gitcode.com/bluerosion/phi-plugin-ill.git").description("gitcode"), Schema.const("https://github.com/Catrong/phi-plugin-ill.git").description("github"), Schema.string().description('自定义地址')]).default("https://github.com/Catrong/phi-plugin-ill.git").description("下载曲绘源"),
    watchInfoPath: Schema.boolean().default(false).description("监听信息文件"),
    allowComment: Schema.boolean().default(true).description("曲目评论"),
    autoPullPhiIll: Schema.boolean().default(false).description("自动更新曲绘"),
    isGuild: Schema.boolean().default(false).description("频道模式"),
    TapTapLoginQRcode: Schema.boolean().default(true).description("发送绑定二维码"),
    SimpleBindReply: Schema.boolean().default(false).description("绑定精简回复(QQ官方bot推荐开启)"),
    LetterMarkdown: Schema.boolean().default(true).description("交互式Markdown消息"),
    mutiNickWaitTimeOut: Schema.number().min(5).max(999).default(10).description("多个曲目回复序号等待时长，单位：秒"),
    otherinfo: Schema.union([Schema.const(0).description("原版曲库"), Schema.const(1).description("原版+自定义"), Schema.const(2).description("仅自定义")]).default(0).description("曲库"),
    allowChartTag: Schema.boolean().default(false).description("谱面标签"),
  }).description("系统设置"),
  Schema.object({
    renderScale: Schema.number().min(50).max(200).default(100).description("渲染精度"),
    randerQuality: Schema.number().min(1).max(100).default(100).description("渲染质量"),
    timeout: Schema.number().min(1000).max(120000).default(20000).description("渲染超时时间，单位：毫秒"),
    waitingTimeout: Schema.number().min(1000).max(120000).default(10000).description("等待超时时间，单位：毫秒"),
    renderQueueLimit: Schema.number().min(0).max(1000).step(1).default(32).description("等待队列上限"),
    renderNum: Schema.number().min(1).max(10).step(1).default(1).description("并行渲染数量"),
    commentsAPage: Schema.number().min(1).max(20).default(10).description("每页评论条数"),
    B19MaxNum: Schema.number().min(22).max(1000).default(50).description("B19最大限制"),
    HistoryDayNum: Schema.number().min(2).max(10000).default(10).description("历史成绩单日数量"),
    HistoryScoreDate: Schema.number().min(1).max(100).default(10).description("历史成绩展示天数"),
    HistoryScoreNum: Schema.number().min(10).max(10000).default(50).description("历史成绩展示数量"),
    listScoreMaxNum: Schema.number().min(3).max(10000).default(180).description("/list 最大数量，建议为3的倍数"),
    WordB19Img: Schema.boolean().default(false).description("文字版B19曲绘图片"),
    WordSuggImg: Schema.boolean().default(false).description("Suggest曲绘图片"),
  }).description("渲染设置"),
  Schema.object({
    openPhiPluginApi: Schema.boolean().default(true).description("API 总开关"),
    enableCustomThemeApi: Schema.boolean().default(true).description("自定义主题 API，受 API 总开关控制"),
    enableScoreStatisticsApi: Schema.boolean().default(true).description("查分数据统计 API，受 API 总开关控制"),
    enableOnlineScoreApi: Schema.boolean().default(true).description("在线查分 API，受 API 总开关和用户个人 API 开关控制"),
    enableAliasSyncTask: Schema.boolean().default(true).description("状态别名同步，受 API 总开关控制"),
    aliasSyncTaskCron: Schema.string().pattern(/^[\d*,\-/?A-Za-z]+(?: +[\d*,\-/?A-Za-z]+){4,5}$/).default("0 * * * * ?").description("同步任务周期，支持 cron 表达式"),
    aliasSyncTaskLog: Schema.boolean().default(false).description("同步任务日志"),
    themeMarketDownloadOrigin: Schema.string().role('link').pattern(/^https:\/\/[^/?#]+$/).default("https://lyh.org.cn:18473").description("主题下载来源"),
    apiBotClientId: Schema.string().default("").description("Bot 客户端 ID：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
    apiBotClientSecret: Schema.string().role('secret').default("").description("Bot 客户端密钥：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
    apiBotSecretVersion: Schema.number().min(0).step(1).default(0).description("Bot 密钥版本：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
  }).description("API 设置"),
  Schema.object({
    timezone: Schema.string().default("Asia/Shanghai").description("签到时区"),
    signInRewardMin: Schema.number().min(0).step(1).default(5).description("签到奖励下限"),
    signInRewardMax: Schema.number().min(0).step(1).default(20).description("签到奖励上限"),
    transferFee: Schema.number().min(0).max(100).step(1).default(20).description("转账手续费"),
  }).description("Note 设置"),
  Schema.object({
    GuessTipCd: Schema.number().min(0).max(120).default(15).description("提示间隔，单位：秒"),
    GuessTipRecall: Schema.boolean().default(false).description("猜曲绘撤回"),
    GuessTipDefaultLevel: Schema.union([Schema.const(-1).description("随机"), Schema.const(0).description("0 · 无干扰"), Schema.const(1).description("1 · 单一干扰"), Schema.const(2).description("2 · 双重干扰"), Schema.const(3).description("3 · 高难干扰")]).default(-1).description("默认难度"),
    GuessTipChapter: Schema.boolean().default(true).description("章节提示"),
    GuessTipBpm: Schema.boolean().default(true).description("BPM提示"),
    GuessTipComposer: Schema.boolean().default(true).description("曲师提示"),
    GuessTipLength: Schema.boolean().default(true).description("时长提示"),
    GuessTipIllustrator: Schema.boolean().default(true).description("画师提示"),
    GuessTipChartDifficulty: Schema.boolean().default(true).description("谱面定数提示"),
    GuessTipChartCombo: Schema.boolean().default(true).description("谱面物量提示"),
    GuessTipChartCharter: Schema.boolean().default(true).description("谱师提示"),
  }).description("猜曲绘设置"),
  Schema.object({
    LetterNum: Schema.number().min(1).max(99999).default(8).description("字母条数"),
    LetterIllustration: Schema.union([Schema.const("水印版").description("水印版"), Schema.const("原版").description("原版"), Schema.const("不发送").description("不发送")]).default("水印版").description("发送曲绘"),
    LetterRevealCd: Schema.number().min(0).max(120).default(0).description("翻开字母间隔，单位：秒"),
    LetterGuessCd: Schema.number().min(0).max(120).default(0).description("猜字母回答间隔，单位：秒"),
    LetterTipCd: Schema.number().min(0).max(120).default(0).description("字母提示间隔，单位：秒"),
    LetterTimeLength: Schema.number().min(0).max(9999999).default(300).description("猜字母待机时长，单位：秒"),
  }).description("开字母设置"),
  Schema.object({
    GuessTipsTipCD: Schema.number().min(0).max(120).default(5).description("提示冷却，单位：秒"),
    GuessTipsTipNum: Schema.number().min(0).max(17).default(6).description("提示条数"),
    GuessTipsTimeout: Schema.number().min(30).max(600).default(600).description("游戏时长，单位：秒"),
    GuessTipsAnsTime: Schema.number().min(5).max(600).default(30).description("额外时间，单位：秒"),
  }).description("提示猜歌设置"),
  Schema.object({
    FribGuessNumTable: Schema.string().default("8,9,10,12,14,17,20").description("参与人数次数表，参与人数对应的猜测次数，逗号分隔"),
    FribTimeout: Schema.number().min(30).max(9999999).default(600).description("待机时长，单位：秒"),
    FribSelfGuessCd: Schema.number().min(0).max(3600).default(3).description("个人回答冷却，单位：秒，建议比群冷却更长"),
    FribGroupGuessCd: Schema.number().min(0).max(3600).default(0).description("群内回答冷却，单位：秒"),
    FribDefaultLevel: Schema.union([Schema.const("EZ").description("EZ"), Schema.const("HD").description("HD"), Schema.const("IN").description("IN"), Schema.const("AT").description("AT")]).default("IN").description("默认难度"),
    FribNearVersion: Schema.number().min(0).max(20).step(1).default(2).description("版本相近范围"),
    FribNearDifficulty: Schema.number().min(0).max(5).step(0.1).default(0.3).description("定数相近范围"),
    FribNearBpm: Schema.number().min(0).max(500).default(20).description("BPM相近范围"),
    FribNearCombo: Schema.number().min(0).max(10000).default(200).description("物量相近范围"),
  }).description("弗一把设置"),
  Schema.object({
    debug: Schema.number().min(0).default(0).description("调试日志：设置为 0 关闭测试日志。"),
  }).description("其他设置"),
]) as Schema<Config>

export function resolveConfig(input: Partial<Config> = {}): Config {
  const config = Config(input as Config) as Config
  if (config.githubProxy === 'false') config.githubProxy = false
  if (config.isGuild) {
    config.WordB19Img = false
    config.WordSuggImg = false
  }
  return config
}

export function validateConfig(config: Config) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.timezone })
  } catch {
    throw new Schema.ValidationError(`invalid timezone "${config.timezone}"`, { path: ['timezone'] })
  }
  if (config.signInRewardMin > config.signInRewardMax) {
    throw new Schema.ValidationError('signInRewardMin must not exceed signInRewardMax', { path: ['signInRewardMin'] })
  }
}

export function isValidCron(value: unknown): value is string {
  return typeof value === 'string' && /^[\d*,\-/?A-Za-z]+(?: +[\d*,\-/?A-Za-z]+){4,5}$/.test(value)
}
