// @ts-nocheck
import crypto from 'node:crypto';
import axios from 'axios';
import defaultLogger from '../../utils/logger';
import { APIBASEURL } from '../../domain/game/const-num';
import { classifyApiConnectionError, isFatalBotIdentityError, PhiApiError } from './phi-api-errors';
import { isApiVersionBlocked, SUPPORTED_API_VERSION } from './api-version';

const TIMEOUT = 5000;

function normalizeConfigIdentity(config) {
    return {
        clientId: String(config?.apiBotClientId || '').trim(),
        secret: String(config?.apiBotClientSecret || '').trim(),
        secretVersion: Number(config?.apiBotSecretVersion || 0),
    };
}

function normalizeRegistrationIdentity(data) {
    return {
        clientId: String(data?.clientId || '').trim(),
        secret: String(data?.secret || '').trim(),
        secretVersion: Number(data?.secretVersion || 0),
    };
}

function configValues(identity) {
    return {
        apiBotClientId: identity.clientId,
        apiBotClientSecret: identity.secret,
        apiBotSecretVersion: identity.secretVersion,
    };
}

function isCompleteIdentity(identity) {
    return Boolean(
        identity
        && typeof identity.clientId === 'string'
        && identity.clientId.length > 0
        && typeof identity.secret === 'string'
        && identity.secret.length > 0
        && Number.isSafeInteger(identity.secretVersion)
        && identity.secretVersion >= 1,
    );
}

function identityFingerprint(identity) {
    return [
        identity?.clientId || '',
        Number(identity?.secretVersion || 0),
        crypto.createHash('sha256').update(String(identity?.secret || '')).digest('hex'),
    ].join(':');
}

function sameIdentity(left, right) {
    return Boolean(left && right && identityFingerprint(left) === identityFingerprint(right));
}

function abortError(signal) {
    return signal?.reason instanceof Error
        ? signal.reason
        : new PhiApiError('API Bot身份操作已取消', 0, 'bot_identity_aborted');
}

function mergeAbortSignals(...signals) {
    const sources = signals.filter(Boolean);
    if (!sources.length) return { signal: undefined, cleanup() {} };
    if (sources.length === 1) return { signal: sources[0], cleanup() {} };

    const controller = new AbortController();
    const listeners = [];
    const abort = source => () => controller.abort(abortError(source));
    for (const source of sources) {
        if (source.aborted) {
            controller.abort(abortError(source));
            break;
        }
        const listener = abort(source);
        source.addEventListener('abort', listener, { once: true });
        listeners.push([source, listener]);
    }
    return {
        signal: controller.signal,
        cleanup() {
            for (const [source, listener] of listeners) source.removeEventListener('abort', listener);
        },
    };
}

/** @param {any} response */
function parseResponse(response) {
    const data = response.data;
    const nestedError = data?.error && typeof data.error === 'object' ? data.error : null;
    if (response.status < 200 || response.status >= 300 || data?.error) {
        throw new PhiApiError(
            nestedError?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || `API request failed (${response.status})`,
            response.status,
            nestedError?.code || data?.code || data?.errorCode || 'api_request_failed',
            { body: data, retryAfter: response.headers?.['retry-after'] },
        );
    }
    return data;
}

export class BotApiAuth {
    constructor(options = {}) {
        this.http = options.http || axios;
        this.logger = options.logger || defaultLogger;
        this.config = undefined;
        this.updateConfig = undefined;
        this.activeIdentity = undefined;
        this.ready = false;
        this.initializing = null;
        this.registrationPromise = null;
        this.persistencePromise = null;
        this.persistenceDirty = false;
        this.automaticReissueUsed = false;
        this.automaticReissueBlocked = false;
        this.lifecycleController = null;
        this.generation = 0;
        this.disposed = true;
    }

    /** 绑定插件实例配置与凭据写回函数。旧实例的异步操作会立即失效。 */
    configure(config, updateConfig) {
        const previous = this.lifecycleController;
        this.lifecycleController = new AbortController();
        this.generation += 1;
        this.disposed = false;
        if (previous) previous.abort(new PhiApiError('API Bot身份实例已替换', 0, 'bot_identity_aborted'));

        this.config = config;
        this.updateConfig = updateConfig;
        this.activeIdentity = normalizeConfigIdentity(config);
        this.ready = false;
        this.initializing = null;
        this.registrationPromise = null;
        this.persistencePromise = null;
        this.persistenceDirty = false;
        this.automaticReissueUsed = false;
        this.automaticReissueBlocked = false;
    }

    /** 中止当前实例的全部身份网络请求与后续写回。 */
    dispose() {
        this.disposed = true;
        this.generation += 1;
        const controller = this.lifecycleController;
        this.lifecycleController = null;
        if (controller) controller.abort(new PhiApiError('API Bot身份实例已卸载', 0, 'bot_identity_aborted'));
        this.ready = false;
        this.initializing = null;
        this.registrationPromise = null;
        this.persistencePromise = null;
        this.persistenceDirty = false;
    }

    /** @returns {string} 当前进程活动身份中的 Bot clientId，不发起网络请求 */
    getClientId() {
        return String(this.activeIdentity?.clientId || '');
    }

    assertUsable(generation = this.generation) {
        if (this.disposed || !this.lifecycleController || generation !== this.generation) {
            throw new PhiApiError('API Bot身份实例已失效', 0, 'bot_identity_aborted');
        }
    }

    async initialize(pluginVersion = SUPPORTED_API_VERSION, signal = undefined) {
        this.assertVersion();
        this.assertUsable();
        if (this.ready && isCompleteIdentity(this.activeIdentity)) return { ...this.activeIdentity };
        if (this.initializing) return this.initializing;

        const generation = this.generation;
        const task = this.initializeOnce(pluginVersion, signal, generation);
        this.initializing = task;
        const cleanup = () => {
            if (this.initializing === task) this.initializing = null;
        };
        void task.then(cleanup, cleanup);
        return task;
    }

    /** @param {string} pluginVersion */
    async initializeOnce(pluginVersion, signal, generation) {
        this.assertUsable(generation);
        if (!isCompleteIdentity(this.activeIdentity)) {
            await this.ensureRegistration(pluginVersion, signal);
            return { ...this.activeIdentity };
        }

        try {
            await this.signedRequest('/bot-clients/self', undefined, 'GET', this.activeIdentity, {}, { signal });
            this.assertUsable(generation);
            this.ready = true;
            return { ...this.activeIdentity };
        } catch (/** @type {any} */ error) {
            this.ready = false;
            if (!isFatalBotIdentityError(error)) {
                this.logger.warn(`[phi-plugin] API Bot身份暂时无法验证，将在API恢复后重试：${error.code || error.message}`);
            }
            throw error;
        }
    }

    assertVersion() {
        if (isApiVersionBlocked()) {
            throw new PhiApiError(
                'API协议大版本不兼容，请更新 phi-plugin 后重启',
                0,
                'api_version_incompatible',
            );
        }
    }

    /** 注册一套新身份；并发调用共享同一个网络请求。 */
    async ensureRegistration(pluginVersion = SUPPORTED_API_VERSION, signal = undefined) {
        this.assertVersion();
        this.assertUsable();
        if (this.registrationPromise) return this.registrationPromise;

        const generation = this.generation;
        const task = this.registerOnce(pluginVersion, signal, generation);
        this.registrationPromise = task;
        const cleanup = () => {
            if (this.registrationPromise === task) this.registrationPromise = null;
        };
        void task.then(cleanup, cleanup);
        return task;
    }

    async registerOnce(pluginVersion, signal, generation) {
        this.assertUsable(generation);
        const merged = mergeAbortSignals(this.lifecycleController.signal, signal);
        let response;
        try {
            response = await this.http.post(`${APIBASEURL}/bot-clients/register`, JSON.stringify({
                pluginName: 'phi-plugin',
                pluginVersion,
            }), {
                headers: { 'Content-Type': 'application/json' },
                timeout: TIMEOUT,
                validateStatus: () => true,
                signal: merged.signal,
            });
        } catch (error) {
            if (this.disposed || generation !== this.generation || signal?.aborted) {
                throw new PhiApiError('API Bot注册已取消', 0, 'bot_identity_aborted');
            }
            throw classifyApiConnectionError(error);
        } finally {
            merged.cleanup();
        }

        if (this.disposed || generation !== this.generation || signal?.aborted) {
            throw new PhiApiError('API Bot注册已取消', 0, 'bot_identity_aborted');
        }

        const data = parseResponse(response);
        const identity = normalizeRegistrationIdentity(data);
        if (
            typeof data?.clientId !== 'string'
            || typeof data?.secret !== 'string'
            || typeof data?.secretVersion !== 'number'
            || !isCompleteIdentity(identity)
        ) {
            throw new PhiApiError('API returned an invalid Bot credential', 502, 'invalid_registration_response');
        }

        // 身份先对当前进程生效，配置写回失败不能影响在线能力。
        this.activateIdentity(identity, generation);
        this.logger.mark(`[phi-plugin] API Bot身份已签发：${identity.clientId}`);
        if (data.claimUrl) this.logger.mark(`[phi-plugin] Bot认领链接（15分钟有效）：${data.claimUrl}`);

        await this.persistPendingIdentity();
        return {
            ...identity,
            claimUrl: data.claimUrl,
            claimExpiresAt: data.claimExpiresAt,
        };
    }

    activateIdentity(identity, generation) {
        this.assertUsable(generation);
        this.activeIdentity = { ...identity };
        this.ready = true;
        this.persistenceDirty = true;
    }

    async persistPendingIdentity() {
        if (!this.persistenceDirty) return true;
        if (this.persistencePromise) return this.persistencePromise;

        const generation = this.generation;
        const task = this.persistIdentityLoop(generation);
        this.persistencePromise = task;
        const cleanup = () => {
            if (this.persistencePromise === task) this.persistencePromise = null;
        };
        void task.then(cleanup, cleanup);
        return task;
    }

    async persistIdentityLoop(generation) {
        while (this.persistenceDirty && !this.disposed && generation === this.generation) {
            const identity = this.activeIdentity;
            if (!isCompleteIdentity(identity)) return false;
            try {
                if (typeof this.updateConfig !== 'function') {
                    throw new PhiApiError('API Bot身份无法写回配置', 0, 'bot_identity_write_unavailable');
                }
                await this.updateConfig(configValues(identity), this.lifecycleController.signal);
            } catch (/** @type {any} */ error) {
                if (!this.disposed && generation === this.generation) {
                    this.logger.warn(`[phi-plugin] API Bot身份配置写回失败，将在后续请求重试：${error?.code || error?.message || 'unknown'}`);
                }
                return false;
            }

            if (this.disposed || generation !== this.generation) return false;
            if (sameIdentity(this.activeIdentity, identity)) {
                this.persistenceDirty = false;
                this.logger.info(`[phi-plugin] API Bot身份已写回 Koishi 配置：${identity.clientId}`);
            }
        }
        return !this.persistenceDirty;
    }

    async recoverAfterReconnect(pluginVersion = SUPPORTED_API_VERSION, signal = undefined) {
        return this.initialize(pluginVersion, signal);
    }

    /** 主人主动重置身份；成功后会清空本进程的自动重签限制。 */
    async reset(pluginVersion = SUPPORTED_API_VERSION) {
        this.assertVersion();
        this.assertUsable();

        if (this.registrationPromise) {
            try { await this.registrationPromise } catch {}
        }
        const issued = await this.ensureRegistration(pluginVersion);
        this.automaticReissueUsed = false;
        this.automaticReissueBlocked = false;
        return issued;
    }

    async getClaimLink(signal = undefined) {
        await this.initialize(SUPPORTED_API_VERSION, signal);
        return this.signedRequest('/bot-clients/self/claim-code', {}, 'POST', undefined, {}, { signal });
    }

    /** @param {string} method @param {string} originalPath @param {string} rawBody @param {{clientId:string, secret:string, secretVersion:number}} [identity] @returns {Record<string, string>} */
    sign(method, originalPath, rawBody, identity = this.activeIdentity) {
        if (!isCompleteIdentity(identity)) {
            throw new PhiApiError('API Bot身份尚未初始化', 0, 'bot_identity_missing');
        }
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomBytes(18).toString('base64url');
        const bodyHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');
        const canonical = [method.toUpperCase(), originalPath, timestamp, nonce, bodyHash].join('\n');
        const signature = crypto.createHmac('sha256', identity.secret).update(canonical).digest('base64url');
        return {
            'X-Phi-Bot-Client-Id': identity.clientId,
            'X-Phi-Bot-Key-Version': String(identity.secretVersion),
            'X-Phi-Bot-Timestamp': timestamp,
            'X-Phi-Bot-Nonce': nonce,
            'X-Phi-Bot-Signature': signature,
            // 声明本插件适配的 API 协议版本，供服务端决定绑定协议可升级到的最高版本。
            'X-Phi-Bot-Api-Version': SUPPORTED_API_VERSION,
        };
    }

    /** 发送一次签名请求，不在本层做重试。 */
    async sendSigned(originalPath, body, method, identity, extraHeaders, requestOptions, generation) {
        this.assertUsable(generation);
        const upperMethod = method.toUpperCase();
        const rawBody = upperMethod === 'GET' ? '' : JSON.stringify(body ?? {});
        const headers = { ...this.sign(upperMethod, originalPath, rawBody, identity), ...extraHeaders };
        if (upperMethod !== 'GET') headers['Content-Type'] = 'application/json';
        const merged = mergeAbortSignals(this.lifecycleController.signal, requestOptions.signal);
        let response;
        try {
            response = await this.http.request({
                url: `${APIBASEURL}${originalPath}`,
                method: upperMethod,
                headers,
                data: upperMethod === 'GET' ? undefined : rawBody,
                timeout: requestOptions.timeout ?? TIMEOUT,
                validateStatus: () => true,
                signal: merged.signal,
            });
        } catch (error) {
            if (this.disposed || generation !== this.generation || requestOptions.signal?.aborted) {
                throw new PhiApiError('API Bot请求已取消', 0, 'bot_identity_aborted');
            }
            throw classifyApiConnectionError(error);
        } finally {
            merged.cleanup();
        }
        this.assertUsable(generation);
        return parseResponse(response);
    }

    recoveryFailure(cause) {
        return new PhiApiError(
            'API Bot身份自动恢复失败',
            cause?.status || 0,
            'bot_identity_recovery_failed',
            { cause },
        );
    }

    blockAutomaticRecovery(cause, message) {
        this.automaticReissueBlocked = true;
        this.logger.error(`[phi-plugin] ${message}：${cause?.code || cause?.message}`);
        return this.recoveryFailure(cause);
    }

    async signedRequest(originalPath, body, method = 'POST', identity = undefined, extraHeaders = {}, requestOptions = {}) {
        this.assertVersion();
        this.assertUsable();
        const generation = this.generation;
        const initialIdentity = identity || this.activeIdentity;
        const hadUsableIdentity = isCompleteIdentity(initialIdentity);
        const registeredForThisRequest = !hadUsableIdentity;

        if (!hadUsableIdentity) {
            await this.ensureRegistration(SUPPORTED_API_VERSION, requestOptions.signal);
        } else if (this.persistenceDirty) {
            await this.persistPendingIdentity();
        }

        const usedIdentity = isCompleteIdentity(identity) ? identity : this.activeIdentity;
        try {
            return await this.sendSigned(originalPath, body, method, usedIdentity, extraHeaders, requestOptions, generation);
        } catch (/** @type {any} */ error) {
            if (!isFatalBotIdentityError(error)) throw error;

            const currentIdentity = this.activeIdentity;
            if (isCompleteIdentity(currentIdentity) && !sameIdentity(currentIdentity, usedIdentity)) {
                return this.retryWithActiveIdentity(originalPath, body, method, currentIdentity, extraHeaders, requestOptions, generation);
            }

            if (registeredForThisRequest) {
                throw this.blockAutomaticRecovery(error, 'API Bot身份注册后首个请求仍不可用，本进程已停止自动重签');
            }
            return this.recoverFatalRequest(originalPath, body, method, extraHeaders, requestOptions, generation, error);
        }
    }

    async retryWithActiveIdentity(originalPath, body, method, identity, extraHeaders, requestOptions, generation) {
        try {
            return await this.sendSigned(originalPath, body, method, identity, extraHeaders, requestOptions, generation);
        } catch (/** @type {any} */ error) {
            if (isFatalBotIdentityError(error)) {
                throw this.blockAutomaticRecovery(error, 'API Bot身份重试后仍不可用，本进程已停止自动重签');
            }
            throw error;
        }
    }

    async retryAfterRegistration(originalPath, body, method, extraHeaders, requestOptions, generation) {
        await this.ensureRegistration(SUPPORTED_API_VERSION, requestOptions.signal);
        this.assertUsable(generation);
        this.automaticReissueUsed = true;
        try {
            return await this.sendSigned(originalPath, body, method, this.activeIdentity, extraHeaders, requestOptions, generation);
        } catch (/** @type {any} */ error) {
            if (isFatalBotIdentityError(error)) {
                throw this.blockAutomaticRecovery(error, 'API Bot身份重签后仍不可用，本进程已停止自动重签');
            }
            throw error;
        }
    }

    async recoverFatalRequest(originalPath, body, method, extraHeaders, requestOptions, generation, cause) {
        if (this.automaticReissueUsed || this.automaticReissueBlocked) {
            throw this.blockAutomaticRecovery(cause, 'API Bot身份再次失效，本进程不会重复自动重签');
        }
        return this.retryAfterRegistration(originalPath, body, method, extraHeaders, requestOptions, generation);
    }
}

export default new BotApiAuth();
