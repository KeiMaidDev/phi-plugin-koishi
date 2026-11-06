// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'
import { PHI_COMMAND_HEAD } from '../../constants'

import phiPluginBase from '../base-class';
import defaultLogger from '../../utils/logger';
import defaultSender from '../../render/send';
import defaultIdentityService from '../../providers/phi-api/bot-api-auth';
import {
    getPhiApiUserMessage,
    isApiConnectionError,
    isRetryableBotRegistrationError,
} from '../../providers/phi-api/phi-api-errors';
import { getApiPluginVersion } from '../../providers/phi-api/api-version';

export class phiBotClient extends phiPluginBase {
    constructor(runtime: PhiRuntime, dependencies: any = {}) {
        super({
            config: runtime.config,
            data: runtime.data,
            name: 'phi-api-bot-client',
            dsc: '查分API Bot身份管理',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})\\s*(重置API Bot身份|resetApiBot)$`,
                    fnc: 'resetApiBot',
                },
                {
                    reg: `^[#/](${PHI_COMMAND_HEAD})\\s*(获取Bot认领链接|botClaimLink)$`,
                    fnc: 'claimLink',
                },
            ],
        });
        this.identityService = dependencies.identityService || defaultIdentityService;
        this.sender = dependencies.sender || defaultSender;
        this.logger = dependencies.logger || defaultLogger;
        this.pluginVersion = dependencies.pluginVersion || runtime.config?.apiPluginVersion;
        this.onIdentityRecoveryError = dependencies.onIdentityRecoveryError;
    }

    /** 身份管理命令只允许在私聊中执行。 */
    ensurePrivate(e) {
        if (e.isPrivate) return true;
        this.sender.send_with_At(e, '该命令仅限私聊使用，未执行任何操作。');
        return false;
    }

    /** 身份命令直接调用鉴权服务，瞬时失败时需要主动接回 Online API 退避。 */
    scheduleRecoveryIfNeeded(error) {
        if (!isApiConnectionError(error) && !isRetryableBotRegistrationError(error)) return;
        try {
            if (this.onIdentityRecoveryError) {
                this.onIdentityRecoveryError(error);
            } else {
                require('../../providers/phi-api/auto-seek-api.ts').default.seekApi(error);
            }
        } catch (scheduleError) {
            this.logger.warn('[phi-plugin] Bot身份命令失败后安排重试失败', scheduleError);
        }
    }

    /** @param {import('../base-class').botEvent} e */
    async resetApiBot(e) {
        if (!e.isMaster) return false;
        if (!this.ensurePrivate(e)) return true;
        try {
            const pluginVersion = this.pluginVersion || getApiPluginVersion();
            const issued = await this.identityService.reset(pluginVersion);
            this.logger.mark(`[phi-plugin] API Bot身份已由master重置：${issued.clientId}`);
            const message = `API Bot身份已重置。\nclientId: ${issued.clientId}\n认领链接: ${issued.claimUrl || '请重新获取'}`;
            this.sender.send_with_At(e, message);
        } catch (/** @type {any} */ error) {
            this.scheduleRecoveryIfNeeded(error);
            this.sender.send_with_At(e, `重置失败：${getPhiApiUserMessage(error)}`);
        }
        return true;
    }

    /** @param {import('../base-class').botEvent} e */
    async claimLink(e) {
        if (!e.isMaster) return false;
        if (!this.ensurePrivate(e)) return true;
        try {
            const claim = await this.identityService.getClaimLink();
            this.sender.send_with_At(e, `Bot认领链接（15分钟有效）：\n${claim.claimUrl}`);
        } catch (/** @type {any} */ error) {
            this.scheduleRecoveryIfNeeded(error);
            this.sender.send_with_At(e, `获取失败：${getPhiApiUserMessage(error)}`);
        }
        return true;
    }
}
