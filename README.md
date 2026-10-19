<div align="center">
  <h1>
    <picture>
      <source srcset="https://github.com/user-attachments/assets/c18cd28c-220e-445d-9001-3f7a8f25ac51" type="image/avif" width="80%" />
      <img src="https://github.com/Catrong/phi-plugin/assets/117198625/731e11cb-71d3-4575-8c0d-b9cedcd442d4" width="80%" />
    </picture>
  
### 中文 | [English](./README_en.md)
  </h1>

[![Guild](https://img.shields.io/badge/频道-Hutao114Pgr939-9cf?style=flat-square&logo=GroupMe)](https://pd.qq.com/s/e3z86q6bw)
[![Guild](https://img.shields.io/badge/频道-RkBwFBaRqa-9cf?style=flat-square&logo=Discord)](https://discord.gg/invite/RkBwFBaRqa)
[![npm](https://img.shields.io/npm/v/koishi-plugin-phi-plugin-koishi?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-phi-plugin-koishi)
![version](https://img.shields.io/badge/Phigros-4.0.1-9cf?style=flat-square)
![version](https://img.shields.io/badge/PhigrosVer-157-9cf?style=flat-square)
![version](https://img.shields.io/badge/Koishi-4.8.11-9cf?style=flat-square&logo=dependabot)
</div>

### 介绍

`phi-plugin-koishi` 为查询Phigros信息的插件，包括b30、score、userinfo以及更多Phigros相关功能，本项目移植自[phi-plugin](https://github.com/Catrong/phi-plugin)，有相关的建议和问题请在本项目[Issues](../../issues)中提出，欢迎[PR](../../pulls)。

具体功能可在安装插件后通过 `phi help` 查看详细指令

---

### 安装

在koishi根目录执行
```bash
yarn clone https://github.com/KeiMaidDev/phi-plugin-koishi
```

#### Todo

* [ ] 优化界面设计

* [ ] 加入收集品、头像等的图鉴

* [ ] 点phi的歌

* [ ] 优化扫码获取sessionToken

* [ ] 指令修改部分设置

* [ ] 曲目历史定数查询

* [ ] 谱面标签

* [ ] 适配TapTap国际版

* [ ] ……
---

### 功能

#### **以下为用户功能**

| **功能名称** | **功能说明**
| :- | :-
| `phi 帮助` | 获取帮助
| `phi bind <sessionToken>` | 绑定sessionToken，支持国服/国际服，默认为国服
| `phi unbind` | 仅清除当前 Bot 本地保存的 sessionToken、API ID、存档和历史，不修改 API 平台绑定
| `phi clean` | 删除所有记录
| `phi update` | 更新存档
| `phi b30`（别名 `phi rks`、`phi pgr`） | 查询rks，会提供得出的b30结果
| `phi info [1\|2]` | 查询个人统计信息
| `phi lmtacc [0-100]` | 计算限制最低 ACC 后的 RKS
| `phi lvscore <定数范围> <难度>` | 获取区间成绩
| `phi chap <章节名称\|help>` | 获取章节成绩
| `phi ahv <定数>[-v 版本]` | 获取定数成绩表
| `phi 理论分表 [-v 版本]` | 查看指定版本的理论RKS分表（模拟数据，不依赖存档）
| `phi list <-dif 定数范围> <-acc ACC范围> <EZ\|HD\|IN\|AT> <NEW\|C\|B\|A\|S\|V\|FC\|PHI>` | 获取区间每首曲目的成绩
| `phi hisb30` | 根据历史记录计算B30变化情况
| `phi best1(+)` | 查询文字版b30（或更多），最高b99
| `phi score <曲名> [-dif 难度] [-or acc\|score\|fc\|time] [-unrank]` | 获取单曲成绩及这首歌的推分建议，参数为对分数排行的参数，目前仅开启API后有效
| `phi suggest` | 获取可以让RKS+0.01的曲目及其所需ACC
| `phi ranklist [名次]` | 获取 RKS 排行榜
| `phi rankfind <rks>` | 获取有多少人大于查询 RKS
| `phi data` | 获取用户data数量
| `phi guess [-l <0-3>]` | 猜曲绘，回答无特殊命令，直接回复，如果不是曲名就不会说话，如果是不正确的曲名会回复。phi ans 结束
| `phi ltr` | 根据字母猜曲名，`phi open <字母>` 开指定的字母，直接回复进行回答，phi ans 获取答案
| `phi tipgame` | 根据提示猜曲名，`phi tip` 获得下一条提示，phi ans 获取答案，回答直接回复
| `phi fri [难度=EZ\|HD\|IN\|AT] [定数下限]` | 弗一把猜歌，直接回复曲名猜测，每次猜测都会对比谱师（真实名录来源于 daogemm.github.io；双方都有真实名录时，多名谱师有一人重合即视为相近）、首次收录版本（含上线时间）、章节、是否独占、定数、BPM、物量与答案的异同，phi ans 获取答案；定数与物量以指定难度的谱面为准，回答有个人与群聊冷却，参与人数越多可猜次数越多
| `phi song <曲名>` | 查询phigros中某一曲目的图鉴，支持设定别名
| `phi chart <曲名> [难度=IN]` | 查询phigros中某一谱面的详细信息
| `phi tag <曲名> [难度=IN] <标签>` | 查看谱面标签，标签可选项见回复说明，难度默认为IN
| `phi settag <曲名> [难度=IN] <标签>` | 给谱面打标签，推荐先使用/tag查询标签列表，难度默认为IN
| `phi comment <曲名> [难度=IN]`（换行后输入内容） | 评论曲目，难度默认为IN
| `phi recmt <评论ID>` | 查看并确认是否删评，仅发送者和主人权限，需要二次确认
| `phi mycmt` | 查看自己的云端评论
| `phi table <定数>` | 查询phigros定数表
| `phi difhis` | 查询曲目历史定数
| `phi new` | 查询更新的曲目
| `phi tips` | 随机tips
| `phi jrrp` | 今日人品
| `phi song-alias xxx` | 查询某一曲目的别名
| `phi rand [定数] [难度]` | 根据条件随机曲目，条件支持难度、定数，难度可以多选，定数以-作为分隔
| `phi randclg [课题总值] [难度] ([曲目定数范围])` | 随机课题 eg: `phi rand 40 (IN 13-15)`
| `phi ill <曲名>` | 查询phigros中某一曲目的曲绘
| `phi search <条件> <值>` | 检索曲库中的曲目，支持BPM 定数 物量，条件 bpm dif cmb，值可以为区间，以 - 间隔
| `phi theme [编号]` | 切换绘图主题，页面级样式按主题包配置生效
| `phi myset` | 查看和修改用户设置，参数为设置项名称，值支持使用序号选择，建议先查看设置项列表
| `phi sign` | 签到获取Notes
| `phi task` | 查看自己的任务
| `phi retask` | 刷新任务，需要花费20Notes
| `phi transfer <目标> <数量>` | 送给目标Note，支持@或QQ号

#### **以下为管理功能**

| 功能名称 | 功能说明
| :- | :-
| `phi backup (back)?` | 备份存档文件，+ back 发送该备份文件，自动保存在 /phi-plugin/backup/ 目录下
| `phi restore` | 从备份中还原，不会丢失已有数据，需要将文件放在 /phi-plugin/backup/ 目录下
| `phi setnick xxx ---> xxx` | 设置某一歌曲的别名，格式为 原名(或已有别名) ---> 别名（会自动过滤--->两边的空格）
| `phi gx` | 更新本插件
| `phi repu` | 重启puppeteer
| `phi downill` | 下载曲绘到本地
| `phi get <名次>` | 获取排行榜上某一名次的sessionToken
| `phi del <sessionToken>` | 禁用某一sessionToken
| `phi allow <sessionToken>` | 恢复某一sessionToken
| `phi ban <功能>` | 禁用某一类功能，详见 [功能参数说明](#phi-ban-%E5%8A%9F%E8%83%BD%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E)
| `phi botclaimlink` | **主人命令** 获取 15 分钟内有效的 Bot 平台认领链接，建议私聊发送
| `phi resetapibot` | **主人命令** 重新申请一套 API Bot 身份，仅用于凭据丢失、被撤销或主动更换身份

<details open>  
<summary>功能参数说明</summary>

#### `phi ban` 功能参数说明

| 参数 | 功能 | 影响指令
| :- | :- | :-
| 全部 | 全部功能 | 所有
| help | 帮助功能 | `phi help` `phi tkhelp` `phi myset`
| bind | 绑定功能 | `phi bind` `phi unbind`
| b19 | 图片查分功能 | `phi b30` `phi update` `phi info` `phi list` `phi p30` `phi lmtacc` `phi score` `phi lvscore` `phi chap` `phi suggest`
| wb19 | 文字查分功能 | `phi data` `phi best`
| song | 图鉴功能 | `phi song` `phi chart` `phi ill` `phi search` `phi song-alias` `phi rand` `phi randclg` `phi table` `phi comment` `phi recmt`
| ranklist | 排行榜功能，不会禁用用户排名 | `phi ranklist` `phi rankfind`
| fnc | 小功能 | `phi com` `phi tips` `phi newlog`
| tipgame | tip猜歌 | `phi tipgame`
| guessgame | 猜歌 | `phi guess`
| ltrgame | 猜字母 | `phi ltr`
| fribgame | 弗一把 | `phi fri` `phi friberg` `phi fib`
| sign | 娱乐功能 | `phi sign` `phi transfer` `phi task` `phi retask` `phi jrrp`
| setting | 系统设置 | `phi theme`
</details>

## API功能正式开启测试

可在设置项手动设置打开与关闭，开启后，将自动同步用户在Phi-Plugin系列应用（网页、云崽，暂不含koishi）使用记录与历史成绩到API端，且部分功能需要开启API后才能使用

| 功能名称 | 功能说明
| :- | :-
| `phi (bind\|绑定) <userId>` | 开启查分API可用，绑定API账号
| `phi setapitoken <token>` | 设置API Token
| `phi tokenList` | 获取当前绑定的平台列表
| `phi auth <api Token>` | 通过API Token 获取 sessionToken
| `phi alias-submit 曲目 \| 别名 \| 备注` | 私聊提交曲目别名提案 |
| `phi alias-mine` | 查询自己的别名提案 |
| `phi alias-appeal 提案ID \| 理由` | 私聊申请公开评审 |
| `phi alias-public` | 查询正在公开投票的提案 |
| `phi alias-vote 提案ID 赞成/反对` | 参与公开投票或改票 |
| `phi alias-unvote 提案ID` | 撤回公开投票 |
| `phi clearApiData` | 永久注销 phi-api 账号并清除云端数据，需要 Phigros SSTK 权限及二次确认
| `phi updateHistory` | 将BOT端的历史成绩更新到API端
| `phi updateUserToken` | **主人命令** 上传当前BOT端的用户Token到API端

#### Bot 平台认领（Bot 主人）

认领用于把当前 phi-plugin 部署关联到已登录的网页账号，以便在网页控制台查看 Bot 状态、绑定统计和进行管理。Bot 在 API 注册成功后已经可以正常工作，未认领不会影响 Bot 激活或用户查分。

认领步骤：

1. 将 phi-plugin 更新到支持 Bot 平台认证的版本，并确认配置项 `openPhiPluginApi` 已开启。
2. 启动或重启一次 Bot。插件缺少 API Bot 身份时会自动向 API 注册，并将凭据写入本地配置；请勿公开或手工发送 `apiBotClientSecret`。
3. Bot 主人在**私聊**中发送 `phi 获取Bot认领链接`（也可使用 `phi botClaimLink`）。
4. 在 15 分钟内打开 Bot 返回的认领链接。若网页尚未登录，请先完成登录，随后继续原认领页面。
5. 核对页面显示的 Bot 名称和 `clientId`，确认认领。完成后可在网页控制台的 Bot 管理页面查看和管理该 Bot。

认领链接为一次性链接，过期或使用后需重新发送命令获取。在群聊中执行时，插件不会把链接发到群内，而会将链接输出到 Bot 控制台；建议改为私聊执行。

`phi resetapibot`会申请全新的 `clientId` 和 secret，并替换当前 Bot 身份。该命令不是正常认领步骤，只应在本地凭据丢失、身份被 API 撤销或确定要更换 Bot 身份时使用；重置后需要重新认领。为避免敏感信息泄露，在群聊中执行时，新的身份信息和认领链接只会输出到 Bot 控制台。

#### 关于权限的详细说明：

仅通过查分ID即可绑定与获取存档，首次使用`sessionToken`绑定时会将`API Token`设置为`sessionToken`，且用户绑定时若提供`sessionToken`，bot端本地会保存。



---

### 部分功能预览

|**Best30效果图**<br><picture><source srcset="https://github.com/user-attachments/assets/22670da2-cd67-4da3-9589-e139f3db6d82" type="image/avif" width="80%" /><img src="https://github.com/user-attachments/assets/7faf1dba-2cd5-44d5-bc9d-d880fd2f2201" width="80%" /></picture><br>效果图来自[@Steve喵~](https://github.com/S-t-e-v-e-e) | **单曲成绩效果图**<br><picture><source srcset="https://github.com/user-attachments/assets/8a5adadb-3cdf-4371-b1d3-cc869f89a545" type="image/avif" width="40%" /><img src="https://github.com/user-attachments/assets/4594ef39-dacf-4079-9612-5090626f572b" width="40%"></picture><br>效果图来自[@Steve喵~](https://github.com/S-t-e-v-e-e)<br><br>**单曲成绩效果图（Legacy）**<br><picture><source srcset="https://github.com/user-attachments/assets/83296c38-2181-479f-ad26-dfb2e09bccf8" type="image/avif" width="40%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/093e3d30-7f9e-48cb-9e12-bb9f0bb3b40c" width="40%"></picture><br>效果图来自[@Steve喵~](https://github.com/S-t-e-v-e-e)<br><br>**单曲图鉴效果图**<br><picture><source srcset="https://github.com/user-attachments/assets/e332c88d-ecd0-49e7-aa6b-310645f14a5a" type="image/avif" width="40%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/c6eb9694-8f72-4d3f-85d9-5120375b047b" width="40%"></picture> |
|:-------------------:|:------------------------:|
|**范围成绩效果图**<br><picture><source srcset="https://github.com/user-attachments/assets/b1a4ff41-d26b-4ccc-942d-087797ff02b3" type="image/avif" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/411dff8e-ec93-4ebe-80ff-510105fd3f65"></picture><br>效果图来自[@东城Eastown](https://space.bilibili.com/171389567) <br><br>**个人信息效果图**<br><picture><source srcset="https://github.com/user-attachments/assets/1361b1e9-510f-4140-a87d-a74b2ee70337" type="image/avif" /><img src="https://github.com/user-attachments/assets/ed20abfa-5bb1-4215-8b2b-8c5171126432"></picture><br>效果图来自[@Steve喵~](https://github.com/S-t-e-v-e-e)|**个人信息效果图（Legacy）**<br><picture><source srcset="https://github.com/user-attachments/assets/c876119b-d98f-4751-85ba-675e6f2ba55f" type="image/avif" width="60%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/9e536f1a-4cbe-41da-b2da-94d1bcd70488" width="60%"></picture><br>效果图来自[@东城Eastown](https://space.bilibili.com/171389567)|

---

### 免责声明

1. 功能仅限内部交流与小范围使用，请勿将`phi-Plugin-koishi`用于任何以盈利为目的的场景.
2. 图片与其他素材均来自于网络，仅供交流学习使用，如有侵权请联系，会立即删除.
3. 云存档由 [7aGiven/PhigrosLibrary](https://github.com/7aGiven/PhigrosLibrary) 改写而来
4. 谱师数据来源于 [DP-Tool](https://daogemm.github.io/)

### 友情链接

<table>
    <tr>
        <td align="center"> <a href="https://github.com/Catrong/phi-plugin"><b>phi-plugin</b></a></td>
        <td align="center"> <a href="https://github.com/koishijs/koishi"><b>Koishi</b></a></td>
        <td align="center"> <a href="https://daogemm.github.io/"><b>DP-Tool</b></a></td>
    </tr>
</table>

