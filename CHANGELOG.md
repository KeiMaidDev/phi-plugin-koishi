# Changelog

## Unreleased

### Breaking changes

- 聊天入口统一为 `phi <子命令>`；`phib30` 和根级旧指令不再执行，中文名称仅作为 `phi` 下的别名。
- 帮助入口只保留根命令 `phi`；`phi.help`、`phihelp` 和 `phi help` 均不再提供。
- 控制台不再提供命令头、快捷指令和渲染器选择。旧配置中的 `cmdhead`、`renderer`、`koishiShortcuts`、`koishiShortcutCommands`、`koishiShortcutCategories` 和 `koishiDiscordCommands` 会被忽略。
- 图片渲染固定使用 Koishi 共享 `puppeteer` 服务，Shotium 与插件自有浏览器分支已移除。
- `phi list` 的裸数字改为单次数量上限，定数只能通过 `-dif` 指定；无数量且命中超过上限时仍会拒绝执行。

### Interactive flows

- 四个猜歌游戏统一为“直接回复曲名 + 提示 / 不玩了”的局内交互；移除 `phi open`、`phi tip`、`phi ans` 及其别名，结算键盘按当前模式和参数重开。开字母支持 `开字母`、`开歌`、`提示`、`不玩了`，保留 phi 的曲库、冷却、待机与 winner 记录。
- 开字母结算按是否猜中显示 ✅/❌；弗一把与猜曲绘的核心图片改为 Markdown 内嵌，猜曲绘内嵌图显示渲染耗时。
- 解绑、清理、恢复、清空 API 数据和谱面标签等确认步骤重新接入 Koishi 消息流；猜曲等自由文本回复会继续交给发起交互的 App 处理。
- QQ 菜单直接发送 `qq:rawmarkdown`，操作入口改用标准 Keyboard；开字母改用 mai 风格面板，曲绘优先嵌入 Markdown，assets 不可用时图文分开降级。
- 开启交互式 Markdown 时，`phi` 与 `phi apihelp` 只发送一条带 Keyboard 的 Raw Markdown 帮助菜单，不再先渲染帮助图片；正文按 mai-plugin 使用标题、简短介绍和“支持以下功能指令”三行，关闭开关时保留原图片帮助。
- Phi 产生的聊天提示统一经过业务层提示入口；QQ 原生 Markdown 可用时支持语义标签、`qqbot-at-user`、图片直链和显式动作按钮，关闭开关或发送失败时回退原消息。
- 查询结果与快捷 Keyboard 合并为同一条消息；主题市场、成绩筛选、排行榜、设置和历史等页面不再追加独立菜单消息，图片直链转换失败时回退为单条无键盘消息。
- 所有 QQ Raw Markdown 提示默认携带通用 Keyboard；成绩筛选的入口按钮改为“我也要查”，执行 `phi list`。图片消息会显示渲染耗时。
- 移除 Raw Markdown 的“提示”“状态”“警告”“错误”等语义前缀，正文直接展示业务内容。
- 统一为 Markdown 内容块补充换行，图片、说明和耗时不再与后续文本粘连。
- `phi bind qrcode` 默认发送 TapTap 登录链接按钮，不再发送二维码图片；`LetterMarkdown=false` 或链接按钮发送失败时回退现有二维码流程。

### Online API

- 插件启动后立即异步探测 Online API，不阻塞本地查询、Note 和其他离线功能。
- 首个在线能力请求最多等待探测 5 秒；失败后按 30 秒、60 秒、120 秒、最长 300 秒退避重试。
- API 大版本不兼容时关闭在线能力并给出可读提示；服务恢复后自动恢复在线能力与后台同步。
- 探测、请求与重试定时器由 Koishi 生命周期管理，插件卸载或热重载时会被清理。

### Distribution

- `peerDependencies` 只要求 `koishi`；`database`、`monetary` 和 `puppeteer` 通过 Koishi 服务元信息声明为必需服务。
- 根构建产物 `lib` 继续被忽略，源码需要的 `src/vendor/phigros` 纳入版本控制。

### Migration

1. 将 `phi.b30`、`#phihelp`、`phi help` 等旧写法改为 `phi b30`、`phi`。
2. 删除控制器中的命令头、快捷指令和渲染器配置；这些旧值不会迁移。
3. 确认已启用 `database`、`monetary` 和 `puppeteer` 服务。
4. 网络恢复后无需重启插件，Online API 会按退避策略自动重新探测。
