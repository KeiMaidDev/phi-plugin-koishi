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
    defaultGlobal: Schema.boolean().default(false).description("默认使用国际服：开启后默认使用国际服查询，关闭后默认使用国服查询"),
    onLinePhiIllUrl: Schema.union([Schema.const(1).description("GitHub raw"), Schema.const(2).description("Gitee raw"), Schema.const(3).description("弦塔资源站"), Schema.const(4).description("cnb.cool")]).default(1).description("在线曲绘来源：仅在未下载曲绘时有效，不影响下载曲绘指令。在线曲绘将重复下载曲绘资源，建议使用 /下载曲绘 将曲绘缓存到本地"),
    githubProxy: Schema.union([Schema.const(false).description('不使用代理'), Schema.string().description('使用代理')]).default("https://gh-proxy.com").description("GitHub代理：仅在在线曲绘来源为 GitHub raw 或下载曲绘源为 GitHub 时生效。填 false 为不使用代理，也可填写代理地址，如 https://gh-proxy.com"),
    downIllUrl: Schema.union([Schema.const("https://gitee.com/Steveeee-e/phi-plugin-ill.git").description("gitee（暂时弃用）"), Schema.const("https://github.com/Catrong/phi-plugin-ill.git").description("github"), Schema.string().description('自定义地址')]).default("https://github.com/Catrong/phi-plugin-ill.git").description("下载曲绘源：下载曲绘的源，实时生效。选择 GitHub 时会使用上面的 GitHub代理配置"),
    watchInfoPath: Schema.boolean().default(false).description("监听信息文件：是否监听信息文件变化，按文件粒度只重载受影响的曲目数据；如果机器人有自动更新插件功能建议开启，如遇监听文件数量超限请尝试关闭"),
    allowComment: Schema.boolean().default(true).description("曲目评论：是否开启曲目评论功能，该功能目前暂无敏感词校验"),
    autoPullPhiIll: Schema.boolean().default(false).description("自动更新曲绘：开启后手动更新插件时自动更新曲绘文件"),
    isGuild: Schema.boolean().default(false).description("频道模式：开启后文字版仅限私聊，关闭文字版图片，文字版将折叠为长消息"),
    TapTapLoginQRcode: Schema.boolean().default(true).description("绑定二维码：登录TapTap绑定是否发送二维码，开启仅发送二维码，关闭直接发送链接"),
    SimpleBindReply: Schema.boolean().default(false).description("绑定精简回复：开启后绑定流程仅发送二维码、绑定成功提示、成绩更新图与API不可用提示，避免官方Bot被动回复超出条数限制（群聊5条/私信4条）"),
    mutiNickWaitTimeOut: Schema.number().min(5).max(999).default(10).description("多个曲目回复序号等待时长：别名重复触发多个曲目选择时，等待回复序号的时长，单位：秒"),
    otherinfo: Schema.union([Schema.const(0).description("原版曲库"), Schema.const(1).description("原版+自定义"), Schema.const(2).description("仅自定义")]).default(0).description("曲库：使用曲库的模式，若启用自定义则重名的以自定义为准"),
    allowChartTag: Schema.boolean().default(false).description("谱面标签：是否开启谱面标签功能，目前暂无敏感词校验。"),
  }).description("系统设置"),
  Schema.object({
    renderScale: Schema.number().min(50).max(200).default(100).description("渲染精度：对所有的图片生效，设置渲染精度"),
    randerQuality: Schema.number().min(1).max(100).default(100).description("渲染质量：JPEG/WebP 压缩质量，保存后动态生效；数值越高，细节越清晰、图片越大，PNG 不受影响"),
    timeout: Schema.number().min(1000).max(120000).default(20000).description("渲染超时时间：渲染请求超时时间，单位 ms；超时后关闭当前共享 Puppeteer 页面，修改后动态生效"),
    waitingTimeout: Schema.number().min(1000).max(120000).default(10000).description("等待超时时间：对所有的图片生效，单位ms"),
    renderQueueLimit: Schema.number().min(0).max(1000).step(1).default(32).description("等待队列上限：最多等待渲染的请求数，不含正在渲染的请求；0 为不排队，满载立即提示繁忙，修改后立即生效"),
    renderNum: Schema.number().min(1).max(10).step(1).default(1).description("并行渲染数量：共享 Puppeteer 页面的并发上限，修改后动态生效"),
    commentsAPage: Schema.number().min(1).max(20).default(10).description("每页评论条数：/song 每页评论最大渲染条数"),
    B19MaxNum: Schema.number().min(22).max(1000).default(50).description("B19最大限制：用户可以获取B19图片成绩的最大数量，建议不要太大"),
    HistoryDayNum: Schema.number().min(2).max(10000).default(10).description("历史成绩单日数量：/update 展现历史成绩的单日最大数量，至少为2"),
    HistoryScoreDate: Schema.number().min(1).max(100).default(10).description("历史成绩展示天数：/update 展现历史成绩的最大天数"),
    HistoryScoreNum: Schema.number().min(10).max(10000).default(50).description("历史成绩展示数量：/update 展现历史成绩的最大数量"),
    listScoreMaxNum: Schema.number().min(3).max(10000).default(180).description("/list 最大数量：/list 最大渲染成绩数量，建议为3的倍数"),
    WordB19Img: Schema.boolean().default(false).description("文字版B19曲绘图片：关闭可大幅度提升发送速度"),
    WordSuggImg: Schema.boolean().default(false).description("Suggest曲绘图片：关闭可大幅度提升发送速度"),
  }).description("渲染设置"),
  Schema.object({
    openPhiPluginApi: Schema.boolean().default(true).description("API 总开关：关闭后自定义主题、查分统计和在线查分 API 均不可用"),
    enableCustomThemeApi: Schema.boolean().default(true).description("自定义主题 API：允许浏览、下载和使用 API 提供的自定义主题，受 API 总开关控制"),
    enableScoreStatisticsApi: Schema.boolean().default(true).description("查分数据统计 API：允许使用无需用户认证的成绩统计、排行汇总与谱面分析，受 API 总开关控制"),
    enableOnlineScoreApi: Schema.boolean().default(true).description("在线查分 API：允许使用需要用户认证的在线查分能力，受 API 总开关和用户个人 API 开关控制"),
    enableAliasSyncTask: Schema.boolean().default(true).description("状态别名同步任务：是否开启 Bot 状态心跳、API 消息拉取与正式别名快照同步的定时任务，受 API 总开关控制，修改后立即生效"),
    aliasSyncTaskCron: Schema.string().pattern(/^[\d*,\-/?A-Za-z]+(?: +[\d*,\-/?A-Za-z]+){4,5}$/).default("0 * * * * ?").description("同步任务周期：同步任务的 cron 表达式，支持标准 5 位格式或带秒的 6 位格式，如 0 * * * * ? 或 * * * * * 为每分钟；修改后重载插件或重启生效"),
    aliasSyncTaskLog: Schema.boolean().default(false).description("同步任务日志：是否在每次任务触发时打印开始处理/完成日志，默认关闭以免刷屏，异常日志不受影响，修改后立即生效"),
    themeMarketDownloadOrigin: Schema.string().role('link').pattern(/^https:\/\/[^/?#]+$/).default("https://lyh.org.cn:18473").description("主题下载来源：主题市场下载链接允许的唯一 HTTPS 来源，不含路径。"),
    apiBotClientId: Schema.string().default("").description("Bot 客户端 ID：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
    apiBotClientSecret: Schema.string().role('secret').default("").description("Bot 客户端密钥：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
    apiBotSecretVersion: Schema.number().min(0).step(1).default(0).description("Bot 密钥版本：由 API 自动签发，也可手动修改；客户端 ID、密钥及版本号须保持匹配。"),
  }).description("API 设置"),
  Schema.object({
    timezone: Schema.string().default("Asia/Shanghai").description("签到时区：Sign-in 使用的 IANA 时区。"),
    signInRewardMin: Schema.number().min(0).step(1).default(5).description("签到奖励下限：Sign-in 奖励的最小 Note 数量。"),
    signInRewardMax: Schema.number().min(0).step(1).default(20).description("签到奖励上限：Sign-in 奖励的最大 Note 数量。"),
    transferFee: Schema.number().min(0).max(100).step(1).default(20).description("转账手续费：Transfer 手续费百分比，范围为 0 到 100。"),
  }).description("Note 设置"),
  Schema.object({
    GuessTipCd: Schema.number().min(0).max(120).default(15).description("提示间隔：猜曲绘的提示间隔时间，单位：秒"),
    GuessTipRecall: Schema.boolean().default(false).description("猜曲绘撤回：是否在下一条提示发出的时候撤回上一条"),
    GuessTipDefaultLevel: Schema.union([Schema.const(-1).description("随机"), Schema.const(0).description("0 · 无干扰"), Schema.const(1).description("1 · 单一干扰"), Schema.const(2).description("2 · 双重干扰"), Schema.const(3).description("3 · 高难干扰")]).default(-1).description("默认难度：未通过 -l 指定难度时使用的干扰难度；随机为原有加权（0/1/2/3 权重 2/5/2/1）"),
    GuessTipChapter: Schema.boolean().default(true).description("章节提示：追加提示是否包含曲目所属章节"),
    GuessTipBpm: Schema.boolean().default(true).description("BPM提示：追加提示是否包含曲目 BPM"),
    GuessTipComposer: Schema.boolean().default(true).description("曲师提示：追加提示是否包含曲目作者（曲师），部分曲师名会直接点明曲目，可按需关闭"),
    GuessTipLength: Schema.boolean().default(true).description("时长提示：追加提示是否包含曲目时长"),
    GuessTipIllustrator: Schema.boolean().default(true).description("画师提示：追加提示是否包含曲绘画师"),
    GuessTipChartDifficulty: Schema.boolean().default(true).description("谱面定数提示：追加提示是否包含谱面定数"),
    GuessTipChartCombo: Schema.boolean().default(true).description("谱面物量提示：追加提示是否包含谱面物量"),
    GuessTipChartCharter: Schema.boolean().default(true).description("谱师提示：追加提示是否包含谱师，特色谱师名会直接点明曲目，建议关闭"),
  }).description("猜曲绘设置"),
  Schema.object({
    LetterNum: Schema.number().min(1).max(99999).default(8).description("字母条数：开字母的条数"),
    LetterMarkdown: Schema.boolean().default(true).description("交互式MD消息：控制开字母、主题市场及 QQ 官方机器人页面的 Markdown 快捷操作消息"),
    LetterIllustration: Schema.union([Schema.const("水印版").description("水印版"), Schema.const("原版").description("原版"), Schema.const("不发送").description("不发送")]).default("水印版").description("发送曲绘：猜对后是否发送以及发送什么曲绘，水印版需要占用渲染资源，不发图片更快"),
    LetterRevealCd: Schema.number().min(0).max(120).default(0).description("翻开字母间隔：开字母的全局开字母间隔时间，单位：秒"),
    LetterGuessCd: Schema.number().min(0).max(120).default(0).description("猜字母回答间隔：开字母的全局开启间隔时间，单位：秒"),
    LetterTipCd: Schema.number().min(0).max(120).default(0).description("字母提示间隔：开字母的全局提示间隔时间，单位：秒"),
    LetterTimeLength: Schema.number().min(0).max(9999999).default(300).description("猜字母待机时长：无人回答多长时间后结束，单位：秒"),
  }).description("开字母设置"),
  Schema.object({
    GuessTipsTipCD: Schema.number().min(0).max(120).default(5).description("提示冷却：提示猜歌提示的冷却时间间隔，单位：秒"),
    GuessTipsTipNum: Schema.number().min(0).max(17).default(6).description("提示条数：提示猜歌的提示条数（除曲绘外），若总提示条数小于设定条数则将会发送全部提示"),
    GuessTipsTimeout: Schema.number().min(30).max(600).default(600).description("游戏时长：提示猜歌超时时长，单位：秒"),
    GuessTipsAnsTime: Schema.number().min(5).max(600).default(30).description("额外时间：发送曲绘后多久公布答案，单位：秒"),
  }).description("提示猜歌设置"),
  Schema.object({
    FribGuessNumTable: Schema.string().default("8,9,10,12,14,17,20").description("参与人数次数表：按参与人数依次对应的可猜次数，用英文逗号分隔，人数超过表长时取最后一个值"),
    FribTimeout: Schema.number().min(30).max(9999999).default(600).description("待机时长：连续多少秒没有有效猜测后自动公布答案，单位：秒"),
    FribSelfGuessCd: Schema.number().min(0).max(3600).default(3).description("个人回答冷却：同一个人在群里的连续回答间隔，单位：秒，建议比群冷却更长"),
    FribGroupGuessCd: Schema.number().min(0).max(3600).default(0).description("群内回答冷却：本群所有人共享的回答间隔，单位：秒，避免刷屏"),
    FribDefaultLevel: Schema.union([Schema.const("EZ").description("EZ"), Schema.const("HD").description("HD"), Schema.const("IN").description("IN"), Schema.const("AT").description("AT")]).default("IN").description("默认难度：未指定难度时使用的谱面，定数与物量均以该难度为准"),
    FribNearVersion: Schema.number().min(0).max(20).step(1).default(2).description("版本相近范围：曲目加入版本相差几代内视为相近"),
    FribNearDifficulty: Schema.number().min(0).max(5).step(0.1).default(0.3).description("定数相近范围：定数相差多少以内视为相近"),
    FribNearBpm: Schema.number().min(0).max(500).default(20).description("BPM相近范围：BPM 相差多少以内视为相近"),
    FribNearCombo: Schema.number().min(0).max(10000).default(200).description("物量相近范围：物量相差多少以内视为相近"),
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
