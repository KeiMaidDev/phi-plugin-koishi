# Phi Plugin Koishi

Koishi 版 Phi 插件，提供 Phigros 相关查询、存档与娱乐功能。

## Language

**Balance**:
用户当前可支配的 Note 数量。

**Note**:
插件内用于签到奖励、任务奖励、任务刷新和用户转账的虚拟货币单位。
_Avoid_: money, point, coin

**Sign-in**:
用户在每个配置时区的自然日最多执行一次的签到行为，成功后获得 Note。

**Transfer**:
用户把一笔 Note 转给另一名用户的行为；发送方支付总额，接收方获得扣除手续费后的净额。
_Avoid_: send, gift, payment

**Save**:
用户在 Phigros 中的存档快照，包含成绩、RKS、data 和游戏设置；插件使用它查询成绩与生成任务。
_Avoid_: record, profile

**Task**:
用户在当前任务周期内需要完成的单曲成绩目标，完成后发放 Note。
_Avoid_: mission, quest

**Theme**:
控制渲染页面样式、字体和背景的视觉配置，可来自内置主题或主题市场。
_Avoid_: skin, style

**Binding**:
把 Koishi 用户与一份 Phigros 存档凭证关联起来的行为。
_Avoid_: login, account

**Phi Command**:
用户在聊天中通过 `phi <子命令>` 触发的功能入口；中文名称可以保留，但不构成独立根指令。
_Avoid_: shortcut command, slash command, command head

**Online API**:
插件通过 phi-plugin-api 获取在线查分与同步能力的远程服务；不可用时本地功能仍然可用。
_Avoid_: online service, remote renderer