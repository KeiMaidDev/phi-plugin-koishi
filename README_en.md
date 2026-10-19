<div align="center">
  <h1>
    <picture>
      <source srcset="https://github.com/user-attachments/assets/c18cd28c-220e-445d-9001-3f7a8f25ac51" type="image/avif" width="80%" />
      <img src="https://github.com/Catrong/phi-plugin/assets/117198625/731e11cb-71d3-4575-8c0d-b9cedcd442d4" width="80%" />
    </picture>
  
### [中文](./README.md) | English
  </h1>

[![Guild](https://img.shields.io/badge/QQGuild-Hutao114Pgr939-9cf?style=flat-square&logo=GroupMe)](https://pd.qq.com/s/e3z86q6bw)
[![Guild](https://img.shields.io/badge/Discord-RkBwFBaRqa-9cf?style=flat-square&logo=Discord)](https://discord.gg/invite/RkBwFBaRqa)
[![npm](https://img.shields.io/npm/v/koishi-plugin-phi-plugin-koishi?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-phi-plugin-koishi)
![version](https://img.shields.io/badge/Phigros-4.0.1-9cf?style=flat-square)
![version](https://img.shields.io/badge/PhigrosVer-157-9cf?style=flat-square)
![version](https://img.shields.io/badge/Koishi-4.8.11-9cf?style=flat-square&logo=dependabot)
</div>

### Introduction

`phi-plugin-koishi` is a Koishi plugin for querying Phigros information, including b30, score, userinfo, and other Phigros-related features. It is ported from [phi-plugin](https://github.com/Catrong/phi-plugin). For suggestions and issues, please use this project's [Issues](../../issues); [PRs](../../pulls) are welcome.

After installation, run `phi help` to view the detailed commands.

---

### Installation

Run the following command in the Koishi root directory:
```bash
yarn clone https://github.com/KeiMaidDev/phi-plugin-koishi
```

#### Todo

* [ ] Optimize the UI design

* [ ] Add galleries for collectibles, avatars, and more

* [ ] Song selection via phi

* [ ] Improve QR code sessionToken retrieval

* [ ] Modify some settings via commands

* [ ] Query historical chart constants

* [ ] Chart tags

* [ ] Support TapTap International

* [ ] ...
---

### Features

#### **User Features**

| **Command** | **Description** |
| :- | :- |
| `phi help` | Show help |
| `phi bind <sessionToken>` | Bind sessionToken; supports CN/Global and defaults to CN |
| `phi unbind` | Clear only the current Bot's locally stored sessionToken, API ID, save, and history; API platform bindings are unchanged |
| `phi clean` | Delete all records |
| `phi update` | Update the save |
| `phi b30` (aliases: `phi rks`, `phi pgr`) | Query RKS and display the resulting b30 |
| `phi info [1\|2]` | Query personal statistics |
| `phi lmtacc [0-100]` | Calculate RKS after limiting to a minimum ACC |
| `phi lvscore <rating range> <difficulty>` | Get scores in a range |
| `phi chap <chapter name\|help>` | Get chapter scores |
| `phi ahv <rating>[-v version]` | Get the constant rating table |
| `phi 理论分表 [-v version]` | View the theoretical RKS table for the specified version (simulated data, save data not required) |
| `phi list <-dif rating range> <-acc ACC range> <EZ\|HD\|IN\|AT> <NEW\|C\|B\|A\|S\|V\|FC\|PHI>` | Get the score of every song in the range |
| `phi hisb30` | Calculate B30 changes from history |
| `phi best1(+)` | Query a text b30 (or more), up to b99 |
| `phi score <song> [-dif difficulty] [-or acc\|score\|fc\|time] [-unrank]` | Get a single song's score and improvement suggestions; the parameters control score ranking, currently available only after enabling the API |
| `phi suggest` | Get songs that can increase RKS by 0.01 and the ACC required |
| `phi ranklist [rank]` | Get the RKS leaderboard |
| `phi rankfind <rks>` | Get how many users have a higher RKS than the queried RKS |
| `phi data` | Get the user's data count |
| `phi guess [-l <0-3>]` | Guess the song illustration. Reply directly without a command. The bot stays silent if the reply is not a song name and responds if it is an incorrect song name. Use `phi ans` to end |
| `phi ltr` | Guess the song name from letters. Use `phi open <letter>` to reveal a letter, reply directly to answer, and use `phi ans` to get the answer |
| `phi tipgame` | Guess the song name from hints. Use `phi tip` for the next hint and `phi ans` for the answer; reply directly to answer |
| `phi fri [difficulty=EZ\|HD\|IN\|AT] [minimum rating]` | Friberg song guessing. Reply directly with a song name guess. Each guess compares the charters (verified names from daogemm.github.io; when both sides have verified names, one shared name among multiple charters counts as close), first-release version (including release time), chapter, exclusivity, difficulty, BPM, and note count against the answer. Use `phi ans` to get the answer. Difficulty and note count use the selected difficulty's chart. Answers have personal and group cooldowns, and more participants allow more guesses |
| `phi song <song>` | Query a Phigros song's info and supports aliases |
| `phi chart <song> [difficulty=IN]` | Query detailed information about a Phigros chart |
| `phi tag <song> [difficulty=IN] <tag>` | View chart tags; available tags are shown in the response, and the default difficulty is IN |
| `phi settag <song> [difficulty=IN] <tag>` | Add a tag to a chart. It is recommended to query the tag list with `phi tag` first; the default difficulty is IN |
| `phi comment <song> [difficulty=IN]` (enter the content on a new line) | Comment on a song; the default difficulty is IN |
| `phi recmt <comment ID>` | View and confirm whether to delete a comment; only the sender and owner have permission, and a second confirmation is required |
| `phi mycmt` | View your own cloud comments |
| `phi table <rating>` | Query the Phigros constant rating table |
| `phi difhis` | Query historical chart constants |
| `phi new` | Query newly added songs |
| `phi tips` | Random tips |
| `phi jrrp` | Today's luck |
| `phi song-alias xxx` | Query a song's aliases |
| `phi rand [rating] [difficulty]` | Randomly select a song by conditions; supports difficulty and rating, difficulties can be multi-selected, and ratings use `-` as the separator |
| `phi randclg [assignment total] [difficulty] ([song rating range])` | Random assignment, e.g. `phi rand 40 (IN 13-15)` |
| `phi ill <song>` | Query a Phigros song's illustration |
| `phi search <condition> <value>` | Search songs by BPM, rating, or note count; conditions are `bpm`, `dif`, and `cmb`, and values can be ranges separated by `-` |
| `phi theme [number]` | Switch the drawing theme; page-level styles are applied according to the theme package configuration |
| `phi myset` | View and modify user settings; the parameter is the setting name, values can be selected by number, and viewing the setting list first is recommended |
| `phi sign` | Check in to receive Notes |
| `phi task` | View your tasks |
| `phi retask` | Refresh tasks for 20 Notes |
| `phi transfer <target> <amount>` | Send Notes to a target; supports @ or QQ number |

#### **Admin Features**

| Command | Description |
| :- | :- |
| `phi backup (back)?` | Back up save files; add `back` to send the backup file, which is automatically saved in the `/phi-plugin/backup/` directory |
| `phi restore` | Restore from a backup without losing existing data; place the file in the `/phi-plugin/backup/` directory |
| `phi setnick xxx ---> xxx` | Set a song alias in the format `original name (or existing alias) ---> alias` (spaces around `--->` are automatically trimmed) |
| `phi gx` | Update this plugin |
| `phi repu` | Restart puppeteer |
| `phi downill` | Download song illustrations locally |
| `phi get <rank>` | Get the sessionToken of a rank on the leaderboard |
| `phi del <sessionToken>` | Disable a sessionToken |
| `phi allow <sessionToken>` | Restore a sessionToken |
| `phi ban <feature>` | Disable a feature category; see [Feature Parameter Description](#phi-ban-feature-parameters) |
| `phi botclaimlink` | **Owner command** Get a Bot platform claim link valid for 15 minutes; sending it in a private chat is recommended |
| `phi resetapibot` | **Owner command** Request a new API Bot identity; only use it when credentials are lost, revoked, or intentionally being replaced |

<details open>  
<summary>Feature Parameter Description</summary>

#### `phi ban` Feature Parameters

| Parameter | Feature | Affected Commands |
| :- | :- | :- |
| all | All features | All |
| help | Help features | `phi help` `phi tkhelp` `phi myset` |
| bind | Binding features | `phi bind` `phi unbind` |
| b19 | Image score queries | `phi b30` `phi update` `phi info` `phi list` `phi p30` `phi lmtacc` `phi score` `phi lvscore` `phi chap` `phi suggest` |
| wb19 | Text score queries | `phi data` `phi best` |
| song | Song info features | `phi song` `phi chart` `phi ill` `phi search` `phi song-alias` `phi rand` `phi randclg` `phi table` `phi comment` `phi recmt` |
| ranklist | Leaderboard features; does not disable user ranking | `phi ranklist` `phi rankfind` |
| fnc | Utilities | `phi com` `phi tips` `phi newlog` |
| tipgame | Hint guessing game | `phi tipgame` |
| guessgame | Song guessing game | `phi guess` |
| ltrgame | Letter guessing game | `phi ltr` |
| fribgame | Friberg game | `phi fri` `phi friberg` `phi fib` |
| sign | Entertainment features | `phi sign` `phi transfer` `phi task` `phi retask` `phi jrrp` |
| setting | System settings | `phi theme` |
</details>

## API Feature Testing Now Open

API features can be enabled or disabled manually in the settings. Once enabled, user activity records and historical scores from Phi-Plugin applications (web and Yunzai, excluding Koishi for now) are automatically synced to the API server. Some features require the API to be enabled.

| Command | Description |
| :- | :- |
| `phi (bind\|绑定) <userId>` | Enable the score query API and bind an API account |
| `phi setapitoken <token>` | Set the API Token |
| `phi tokenList` | Get the list of currently bound platforms |
| `phi auth <api Token>` | Get a sessionToken using an API Token |
| `phi alias-submit song \| alias \| note` | Submit a song alias proposal via private chat |
| `phi alias-mine` | Query your alias proposals |
| `phi alias-appeal proposal ID \| reason` | Request a public review via private chat |
| `phi alias-public` | Query proposals currently under public voting |
| `phi alias-vote proposal ID approve/reject` | Participate in public voting or change your vote |
| `phi alias-unvote proposal ID` | Withdraw your public vote |
| `phi clearApiData` | Permanently delete the phi-api account and clear cloud data; requires Phigros SSTK permission and second confirmation |
| `phi updateHistory` | Update historical scores from the BOT to the API server |
| `phi updateUserToken` | **Owner command** Upload the current BOT's user tokens to the API server |

#### Bot Platform Claim (Bot Owner)

Claiming associates the current phi-plugin deployment with a signed-in web account so that you can view the Bot's status, binding statistics, and management options in the web console. After successfully registering with the API, the Bot already works normally; leaving it unclaimed does not affect Bot activation or user score queries.

Claim steps:

1. Update phi-plugin to a version that supports Bot platform authentication and confirm that `openPhiPluginApi` is enabled.
2. Start or restart the Bot once. If the plugin lacks an API Bot identity, it automatically registers with the API and writes the credentials to the local configuration. Never disclose or manually send `apiBotClientSecret`.
3. As the Bot owner, send `phi 获取Bot认领链接` (or `phi botClaimLink`) in a **private chat**.
4. Open the claim link returned by the Bot within 15 minutes. If the web page is not signed in, sign in first and then continue from the original claim page.
5. Verify the Bot name and `clientId` shown on the page, then confirm the claim. Afterward, you can view and manage the Bot on the Bot management page in the web console.

A claim link is single-use. If it expires or has been used, send the command again to get a new one. When executed in a group chat, the plugin does not send the link to the group; it outputs the link to the Bot console instead. Using a private chat is recommended.

`phi resetapibot` requests a completely new `clientId` and secret and replaces the current Bot identity. This is not a normal claim step. Only use it if the local credentials are lost, the identity has been revoked by the API, or you have decided to replace the Bot identity; it must be claimed again after resetting. To prevent sensitive information from leaking, when executed in a group chat, the new identity information and claim link are output only to the Bot console.

#### Detailed Permission Explanation:

Binding and retrieving saves only require a score query ID. When binding with a `sessionToken` for the first time, the `API Token` is set to the `sessionToken`; if the user provides a `sessionToken` during binding, the bot saves it locally.



---

### Previews

|**Best30 Preview**<br><picture><source srcset="https://github.com/user-attachments/assets/22670da2-cd67-4da3-9589-e139f3db6d82" type="image/avif" width="80%" /><img src="https://github.com/user-attachments/assets/7faf1dba-2cd5-44d5-bc9d-d880fd2f2201" width="80%" /></picture><br>Preview by [@Steve喵~](https://github.com/S-t-e-v-e-e) | **Single Score Preview**<br><picture><source srcset="https://github.com/user-attachments/assets/8a5adadb-3cdf-4371-b1d3-cc869f89a545" type="image/avif" width="40%" /><img src="https://github.com/user-attachments/assets/4594ef39-dacf-4079-9612-5090626f572b" width="40%"></picture><br>Preview by [@Steve喵~](https://github.com/S-t-e-v-e-e)<br><br>**Single Score Preview (Legacy)**<br><picture><source srcset="https://github.com/user-attachments/assets/83296c38-2181-479f-ad26-dfb2e09bccf8" type="image/avif" width="40%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/093e3d30-7f9e-48cb-9e12-bb9f0bb3b40c" width="40%"></picture><br>Preview by [@Steve喵~](https://github.com/S-t-e-v-e-e)<br><br>**Song Info Preview**<br><picture><source srcset="https://github.com/user-attachments/assets/e332c88d-ecd0-49e7-aa6b-310645f14a5a" type="image/avif" width="40%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/c6eb9694-8f72-4d3f-85d9-5120375b047b" width="40%"></picture> |
|:-------------------:|:------------------------:|
|**Range Scores Preview**<br><picture><source srcset="https://github.com/user-attachments/assets/b1a4ff41-d26b-4ccc-942d-087797ff02b3" type="image/avif" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/411dff8e-ec93-4ebe-80ff-510105fd3f65"></picture><br>Preview by [@东城Eastown](https://space.bilibili.com/171389567) <br><br>**User Info Preview**<br><picture><source srcset="https://github.com/user-attachments/assets/1361b1e9-510f-4140-a87d-a74b2ee70337" type="image/avif" /><img src="https://github.com/user-attachments/assets/ed20abfa-5bb1-4215-8b2b-8c5171126432"></picture><br>Preview by [@Steve喵~](https://github.com/S-t-e-v-e-e)|**User Info Preview (Legacy)**<br><picture><source srcset="https://github.com/user-attachments/assets/c876119b-d98f-4751-85ba-675e6f2ba55f" type="image/avif" width="60%" /><img src="https://github.com/Catrong/phi-plugin/assets/117198625/9e536f1a-4cbe-41da-b2da-94d1bcd70488" width="60%"></picture><br>Preview by [@东城Eastown](https://space.bilibili.com/171389567)|

---

### Disclaimer

1. The features are intended only for internal communication and limited use. Do not use `phi-Plugin-koishi` for any profit-making purpose.
2. Images and other assets come from the internet and are intended only for learning and exchange. If there is any infringement, please contact us and they will be removed immediately.
3. The cloud save system is adapted from [7aGiven/PhigrosLibrary](https://github.com/7aGiven/PhigrosLibrary).
4. Charter data is sourced from [DP-Tool](https://daogemm.github.io/).

### Related Projects

<table>
    <tr>
        <td align="center"> <a href="https://github.com/Catrong/phi-plugin"><b>phi-plugin</b></a></td>
        <td align="center"> <a href="https://github.com/koishijs/koishi"><b>Koishi</b></a></td>
        <td align="center"> <a href="https://daogemm.github.io/"><b>DP-Tool</b></a></td>
    </tr>
</table>
