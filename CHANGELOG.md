# Changelog

## Unreleased

### Breaking changes

- 聊天入口统一为 `phi <子命令>`；`phib30` 和根级旧指令不再执行，中文名称仅作为 `phi` 下的别名。
- 控制台不再提供命令头、快捷指令和渲染器选择。旧配置中的 `cmdhead`、`renderer`、`koishiShortcuts`、`koishiShortcutCommands`、`koishiShortcutCategories` 和 `koishiDiscordCommands` 会被忽略。
- 图片渲染固定使用 Koishi 共享 `puppeteer` 服务，Shotium 与插件自有浏览器分支已移除。

### Interactive flows

- 解绑、清理、恢复、清空 API 数据和谱面标签等确认步骤重新接入 Koishi 消息流；猜曲等自由文本回复会继续交给发起交互的 App 处理。

### Online API

- 插件启动后立即异步探测 Online API，不阻塞本地查询、Note 和其他离线功能。
- 首个在线能力请求最多等待探测 5 秒；失败后按 30 秒、60 秒、120 秒、最长 300 秒退避重试。
- API 大版本不兼容时关闭在线能力并给出可读提示；服务恢复后自动恢复在线能力与后台同步。
- 探测、请求与重试定时器由 Koishi 生命周期管理，插件卸载或热重载时会被清理。

### Distribution

- `peerDependencies` 只要求 `koishi`；`database`、`monetary` 和 `puppeteer` 通过 Koishi 服务元信息声明为必需服务。
- 根构建产物 `lib` 继续被忽略，源码需要的 `src/vendor/phigros` 纳入版本控制。

### Migration

1. 将 `phi.b30`、`#phihelp` 等旧写法改为 `phi b30`、`phi help`。
2. 删除控制器中的命令头、快捷指令和渲染器配置；这些旧值不会迁移。
3. 确认已启用 `database`、`monetary` 和 `puppeteer` 服务。
4. 网络恢复后无需重启插件，Online API 会按退避策略自动重新探测。
