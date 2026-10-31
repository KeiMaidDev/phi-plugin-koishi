// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import { createRequire } from "module";
import lodash from "lodash";
import common from "../common";
import getInfo from "../../domain/game/get-info";
import { originalIllPath, pluginRoot } from "../../utils/path";
import fs from 'node:fs';
import phiPluginBase from "../base-class";
import logger from "../../utils/logger";
import platform from "../../platform/index";

const require = createRequire(__filename);
const { exec, execSync, spawn } = require("child_process");

// 是否在更新中
let uping = false;

/**
 * @param {string} filePath
 */
function shellPath(filePath) {
    return `"${filePath.replace(/\\/g, '/').replace(/"/g, '\\"')}"`
}

/**
 * 将 Git 的 \r 进度流拆成可读日志，并按阶段/百分比去重。
 * @param {string} label
 */
function createProgressReporter(label) {
    let buffer = ""
    const seen = new Set()
    const report = line => {
        const text = line.trim()
        if (!text || !/(\d+%|Receiving objects|Resolving deltas|Counting objects|Compressing objects|remote:)/i.test(text)) return
        const phase = text.replace(/^remote:\s*/, "").split(":")[0].trim()
        const percent = text.match(/(\d+)%/)?.[1]
        // 每 10% 区间只保留首次出现的真实进度，避免 Git 每个百分比都刷日志。
        const bucket = percent ? Math.floor(Number(percent) / 10) : null
        if (bucket === 0) return
        const key = bucket ? `${phase}:${bucket}` : text
        if (seen.has(key)) return
        seen.add(key)
        logger.info(`[phi-plugin][曲绘] ${label} ${text}`)
    }
    return {
        push(chunk) {
            buffer += chunk.toString()
            const lines = buffer.split(/\r|\n/)
            buffer = lines.pop() || ""
            lines.forEach(report)
        },
        flush() {
            if (buffer) report(buffer)
            buffer = ""
        },
    }
}
/** 处理插件更新 */
export class phiupdate extends phiPluginBase {
    constructor(runtime: PhiRuntime) {
        super({
            config: runtime.config,
            data: runtime.data,
            name: "phi-plugin更新",
            event: "message",
            priority: 1009,
            rule: [
                {
                    reg: `^[/#](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)(强制|qz)?(更新|gx)$`,
                    fnc: "update",
                },
                {
                    reg: `^[#/](pgr|PGR|屁股肉|phi|Phi|(${PHI_COMMAND_HEAD}))(\\s*)(下载|更新|gx|down|up)\\s*(曲绘|ill)$`,
                    fnc: "ill_update",
                },
            ],
        });
    }

    /**
     * rule - 更新phi-plugin
     * @returns
     */
    async update() {
        if (!this.e.isMaster) {
            this.reply("无权限");
            return false;
        }
        this.reply("Koishi 模式下请通过插件控制台或包管理器更新插件。")
        return false;

        /** 检查是否正在更新中 */
        if (uping) {
            await this.reply("已有命令更新中..请勿重复操作");
            return;
        }

        /** 检查git安装 */
        if (!(await this.checkGit())) return;

        const isForce = this.e.msg.includes("强制") || this.e.msg.includes("qz");

        /** 执行更新 */
        var ifrestart

        try {
            ifrestart = await this.runUpdate(isForce);
        } catch (err) {
            this.reply("phi-plugin更新失败QAQ!" + err)
            console.error(err)
        }

        if (this.config.autoPullPhiIll) {
            try {
                await this.ill_update()
            } catch (err) {
                this.reply("曲绘文件更新失败QAQ!" + err)
                console.error(err)
            }
        }


        /** 是否需要重启 */
        if (this.isUp) {
            if (ifrestart) {
                await this.reply("更新完毕，正在重启云崽以应用更新")
                setTimeout(() => this.restart(), 2000)
            } else {
                getInfo.init()
                await this.reply("更新完毕，本次更新不需要进行重启")
            }
        }
    }

    restart() {
        platform.restartBot(this.e)
    }

    /**
     * 更新
     * @param {boolean} isForce 是否为强制更新
     * @returns
     */
    async runUpdate(isForce) {
        const repoPath = shellPath(pluginRoot);
        let command = `git -C ${repoPath} pull --no-rebase`;
        if (isForce) {
            command = [
                `git -C ${repoPath} fetch --all --prune`,
                `git -C ${repoPath} reset --hard origin/main`,
                // 即使 .gitignore 被用户修改，也不能让强制更新删除已安装主题。
                `git -C ${repoPath} clean -fd -e assets/themes/`
            ].join(" && ");
            this.reply("开始执行强制更新操作，请稍等");
        } else {
            this.reply("开始执行更新操作，请稍等");
        }
        /** 获取上次提交的commitId，用于获取日志时判断新增的更新日志 */
        this.oldCommitId = await this.getcommitId("phi-plugin");
        uping = true;
        let ret = await this.execSync(command);
        uping = false;

        if (ret.error) {
            logger.mark(`${this.e.logFnc} 更新失败：phi-plugin`);
            this.gitErr(ret.error, ret.stdout);
            return false;
        }

        /** 获取插件提交的最新时间 */
        let time = await this.getTime("phi-plugin");

        var ifrestart = false

        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(ret.stdout)) {
            await this.reply(`phi-plugin已经是最新版本\n最后更新时间：${time}`);
        } else {
            await this.reply(`phi-plugin\n最后更新时间：${time}`);
            this.isUp = true;
            /** 获取phi-plugin的更新日志 */
            ifrestart = await this.getLog("phi-plugin");
        }

        logger.mark(`${this.e.logFnc} 最后更新时间：${time}`);

        return ifrestart;
    }

    /**
     * 获取phi-plugin的更新日志
     * @param {string} plugin 插件名称
     * @returns
     */
    async getLog(plugin = "") {
        let cm = `cd ${shellPath(pluginRoot)} && git log  -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`;

        let logAll;
        try {
            logAll = await execSync(cm, { encoding: "utf-8" });
        } catch (error) {
            // @ts-ignore
            logger.error(error.toString());
            // @ts-ignore
            this.replyRaw(error.toString());
        }

        if (!logAll) return false;

        logAll = logAll.split("\n");

        /**检测是否需要重启 */
        var ifrestart = false

        let log = [];
        for (let str of logAll) {
            // @ts-ignore
            str = str.split("||");
            if (str[0] == this.oldCommitId) break;
            if (str[1].includes("Merge branch")) continue;
            log.push(str[1]);
            if (!(str[1].includes('√') || str[1].includes('✓'))) {
                ifrestart = true
            }
        }

        log.reverse()

        let line = log.length;

        if (line <= 0) return false;
        log.unshift(`phi-plugin更新日志，共${line}条`);

        if (!this.config.isGuild) {
            log.push("更多详细信息，请前往github查看\nhttps://github.com/Catrong/phi-plugin");
            await this.replyRaw(await common.makeForwardMsg(this.e, log, `phi-plugin更新日志，共${line}条`))
        } else {
            await this.replyRaw(log.join("\n"))
        }

        return ifrestart;
    }

    /**
     * 获取上次提交的commitId
     * @param {string} plugin 插件名称
     * @returns
     */
    async getcommitId(plugin = "") {
        let cm = `git -C ${shellPath(pluginRoot)} rev-parse --short HEAD`;

        let commitId = await execSync(cm, { encoding: "utf-8" });
        commitId = lodash.trim(commitId);

        return commitId;
    }

    /**
     * 获取本次更新插件的最后一次提交时间
     * @param {string} plugin 插件名称
     * @returns
     */
    async getTime(plugin = "") {
        let cm = `cd ${shellPath(pluginRoot)} && git log -1 --oneline --pretty=format:"%cd" --date=format:"%m-%d %H:%M"`;

        let time = "";
        try {
            time = await execSync(cm, { encoding: "utf-8" });
            time = lodash.trim(time);
        } catch (error) {
            // @ts-ignore
            logger.error(error.toString());
            time = "获取时间失败";
        }
        return time;
    }


    /**
     * rule - 更新曲绘
     * @returns
     */
    async ill_update() {
        if (!this.e.isMaster) {
            this.reply("无权限");
            return false;
        }

        /** 检查是否正在更新中 */
        if (uping) {
            await this.reply("已有命令更新中..请勿重复操作");
            return;
        }

        /** 检查git安装 */
        if (!(await this.checkGit())) return;

        const isForce = 1


        if (await this.ill_hasValidHead()) {
            /** 执行更新 */
            await this.ill_runUpdate();
        } else if (await this.ill_recoverIncompleteRepo()) {
            /** 执行安装 */
            await this.ill_clone();
        }


        /** 是否成功 */
        if (this.isUp) {
            await this.reply("更新完毕")
        }
    }

    async ill_hasValidHead() {
        if (!fs.existsSync(`${originalIllPath}/.git`)) return false;
        const ret = await this.execSync(`git -C ${shellPath(originalIllPath)} rev-parse --verify HEAD`);
        return !ret.error;
    }

    async ill_recoverIncompleteRepo() {
        if (!fs.existsSync(originalIllPath)) return true;

        const entries = fs.readdirSync(originalIllPath);
        const canReset = entries.length === 0 || (entries.length === 1 && entries[0] === ".git");
        if (!canReset) {
            await this.reply(`检测到未完成的曲绘目录，请先手动删除：${originalIllPath}`);
            return false;
        }

        fs.rmSync(originalIllPath, { recursive: true, force: true });
        return true;
    }

    async ill_clone() {
        let command = `git clone --progress --depth=1 ${this.getDownIllUrl()} ${shellPath(originalIllPath)}`;

        this.reply("开始下载曲绘文件");

        uping = true;
        let ret;
        try {
            ret = await this.execWithProgress(command, "下载曲绘");
        } finally {
            uping = false;
        }
        if (ret.error) {
            logger.mark(`${this.e.logFnc} 曲绘文件更新失败QAQ!`);
            this.gitErr(ret.error, [ret.stdout, ret.stderr].filter(Boolean).join("\n"));
            return false;
        }

        /** 获取插件提交的最新时间 */
        let time = await this.ill_getTime();

        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(ret.stdout)) {
            await this.reply(`曲绘文件已经是最新版本\n最后更新时间：${time}`);
        } else {
            await this.reply(`phi-plugin-ill\n最后更新时间：${time}`);
            this.isUp = true;
            /** 获取phi-plugin-ill的更新日志 */
            let log = await this.ill_getLog();
            await this.replyRaw(log);
        }

        logger.mark(`${this.e.logFnc} 最后更新时间：${time}`);

        return true;

    }

    /**
     * 更新
     * @returns
     */
    async ill_runUpdate() {

        try {
            var gitCfg = fs.readFileSync(`${originalIllPath}/.git/config`, "utf8")

            // console.info(gitCfg)

            gitCfg = gitCfg.replace(/url\s*=\s*(.*)/, `url = ${this.getDownIllUrl()}`)
            // console.info(gitCfg)

            fs.writeFileSync(`${originalIllPath}/.git/config`, gitCfg, "utf8")
        } catch (err) {
            logger.error(err)
        }


        let repoPath = shellPath(originalIllPath);
        // --depth=1 把历史截断回单个提交；但被截断的旧提交仍被 reflog 引用而保持可达，
        // 必须先清掉 reflog 再 repack，才能真正丢弃它们，否则 .git 会随每次更新持续变大。
        let command = [
            `git -C ${repoPath} fetch --all --prune --depth=1 --progress`,
            `git -C ${repoPath} reset --hard origin/main`,
            `git -C ${repoPath} clean -fd`,
            `git -C ${repoPath} reflog expire --expire=now --expire-unreachable=now --all`,
            `git -C ${repoPath} repack -a -d -q`
        ].join(" && ");
        this.reply("开始更新曲绘文件，请稍等");

        /** 获取上次提交的commitId，用于获取日志时判断新增的更新日志 */
        try {
            this.oldCommitId = await this.ill_getcommitId();
        } catch (error) {
            logger.warn(`[phi-plugin][曲绘] 读取本地版本失败`, error);
            await this.reply("读取本地曲绘版本失败，请稍后重试");
            return false;
        }
        uping = true;
        let ret;
        try {
            ret = await this.execWithProgress(command, "更新曲绘");
        } finally {
            uping = false;
        }

        if (ret.error) {
            logger.mark(`${this.e.logFnc} 曲绘文件更新失败QAQ!`);
            this.gitErr(ret.error, [ret.stdout, ret.stderr].filter(Boolean).join("\n"));
            return false;
        }

        /** 获取插件提交的最新时间 */
        let time = await this.ill_getTime();

        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(ret.stdout)) {
            await this.reply(`曲绘文件已经是最新版本\n最后更新时间：${time}`);
        } else {
            await this.reply(`phi-plugin-ill\n最后更新时间：${time}`);
            this.isUp = true;
            /** 获取phi-plugin-ill的更新日志 */
            let log = await this.ill_getLog();
            await this.replyRaw(log);
        }

        logger.mark(`${this.e.logFnc} 最后更新时间：${time}`);

        return true;
    }

    getDownIllUrl() {
        const downIllUrl = String(this.config.downIllUrl || '').trim()
        let url
        try {
            url = new URL(downIllUrl)
        } catch (err) {
            return downIllUrl
        }
        if (url.hostname !== 'github.com') {
            return downIllUrl
        }

        const githubProxy = this.config.githubProxy
        if (githubProxy === false || githubProxy === 'false' || githubProxy === '') {
            return downIllUrl
        }
        if (!githubProxy) {
            return downIllUrl
        }
        return `${String(githubProxy).replace(/\/$/, '')}/${downIllUrl}`
    }

    /**
     * 获取phi-plugin-ill的更新日志
     * @returns
     */
    async ill_getLog() {
        let cm = `cd ${shellPath(originalIllPath)} && git log  -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`;

        let logAll;
        try {
            logAll = await execSync(cm, { encoding: "utf-8" });
        } catch (error) {
            // @ts-ignore
            logger.error(error.toString());
            // @ts-ignore
            this.replyRaw(error.toString());
        }

        if (!logAll) return false;

        logAll = logAll.split("\n");

        let log = [];
        for (let str of logAll) {
            // @ts-ignore
            str = str.split("||");
            if (str[0] == this.oldCommitId) break;
            if (str[1].includes("Merge branch")) continue;
            log.push(str[1]);
        }
        if (!this.config.isGuild) {
            log.push("更多详细信息，请前往github查看\nhttps://github.com/Catrong/phi-plugin-ill");
        }

        let line = log.length;

        if (line <= 1) return "";


        log = await common.makeForwardMsg(this.e, log, `phi-plugin-ill更新日志，共${line - 1}条`)
        return log;
    }

    /**
     * 获取上次提交的commitId
     * @returns
     */
    async ill_getcommitId() {
        let cm = `git -C ${shellPath(originalIllPath)} rev-parse --short HEAD`;

        let commitId = await execSync(cm, { encoding: "utf-8" });
        commitId = lodash.trim(commitId);

        return commitId;
    }

    /**
     * 获取本次更新插件的最后一次提交时间
     * @returns
     */
    async ill_getTime() {
        let cm = `cd ${shellPath(originalIllPath)} && git log -1 --oneline --pretty=format:"%cd" --date=format:"%m-%d %H:%M"`;

        let time = "";
        try {
            time = await execSync(cm, { encoding: "utf-8" });
            time = lodash.trim(time);
        } catch (error) {
            // @ts-ignore
            logger.error(error.toString());
            time = "获取时间失败";
        }
        return time;
    }

    /**
     * 处理更新失败的相关函数
     * @param {string} err
     * @param {string} stdout
     * @returns
     */
    async gitErr(err, stdout) {
        let msg = "更新失败QAQ！";
        let errMsg = err.toString();
        stdout = stdout.toString();
        const details = [errMsg, stdout].filter(Boolean).join("\n");

        if (details.includes("Timed out")) {
            let remote = details.match(/'([^']+)'/)?.[1] || "远端";
            await this.reply(msg + `\n连接超时：${remote}`);
            return;
        }

        if (/Failed to connect|unable to access/g.test(details)) {
            let remote = details.match(/'([^']+)'/)?.[1] || "远端";
            await this.reply(msg + `\n连接失败：${remote}`);
            return;
        }

        if (errMsg.includes("be overwritten by merge")) {
            await this.replyRaw(
                msg +
                `存在冲突：\n${errMsg}\n` +
                "请解决冲突后再更新，或者执行#phi强制更新，放弃本地修改"
            );
            return;
        }

        if (stdout.includes("CONFLICT")) {
            // @ts-ignore
            await this.replyRaw([
                msg + "存在冲突\n",
                errMsg,
                stdout,
                "\n请解决冲突后再更新，或者执行#phi强制更新，放弃本地修改",
            ]);
            return;
        }

        // @ts-ignore
        await this.replyRaw([errMsg, stdout]);
    }

    /**
     * 执行 Git 命令并把进度流式写入控制台。
     * @param {string} command
     * @param {string} label
     */
    async execWithProgress(command, label) {
        logger.info(`[phi-plugin][曲绘] 开始${label}`)
        return new Promise(resolve => {
            const child = spawn(command, { shell: true, windowsHide: true })
            const progress = createProgressReporter(label)
            let stdout = ""
            let stderr = ""
            let settled = false

            child.stdout?.on("data", chunk => {
                stdout += chunk.toString()
                progress.push(chunk)
            })
            child.stderr?.on("data", chunk => {
                stderr += chunk.toString()
                progress.push(chunk)
            })

            const finish = error => {
                if (settled) return
                settled = true
                progress.flush()
                if (error) logger.warn(`[phi-plugin][曲绘] ${label}失败`, error)
                else logger.info(`[phi-plugin][曲绘] ${label}完成`)
                resolve({ error, stdout, stderr })
            }

            child.on("error", finish)
            child.on("close", code => finish(code === 0 ? undefined : new Error(`git exited with code ${code}`)))
        })
    }
    /**
     * 异步执行git相关命令
     * @param {string} cmd git命令
     * @returns
     */
    async execSync(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
                resolve({ error, stdout, stderr });
            });
        });
    }

    /**
     * 检查git是否安装
     * @returns
     */
    async checkGit() {
        let ret = await execSync("git --version", { encoding: "utf-8" });
        if (!ret || !ret.includes("git version")) {
            await this.reply("请先安装git");
            return false;
        }
        return true;
    }
}
