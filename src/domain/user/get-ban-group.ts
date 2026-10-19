// @ts-nocheck
import logger from "../../utils/logger";
import { redisPath } from "../game/const-num"
import { UserCredentials } from './user-credentials';
import userCredentialStore from './user-credential-store';
import send from "../../render/send";
import { canUseApi } from './api-permission';
import { redis } from "../../platform/index";

/**@import {botEvent} from "../../services/base-class" */

export default class getBanGroup {

    /**
     * @param {string} group 
     * @param {string} fnc 
     * @returns 
     */
    static async redis(group, fnc) {
        // @ts-ignore
        return await redis.get(`${redisPath}:banGroup:${group}:${fnc}`) ? true : false
    }

    /**
     * 
     * @param {botEvent} e 
     * @param {allFnc} fnc 
     * @returns 
     */
    static async get(e, fnc) {
        const { group_id } = e;
        const credentials = UserCredentials.fromEvent(e)
        if (await canUseApi(this.config, e)) {
            if (await credentials.getUserAPIBanStatus({ ignoreUnboundError: true })) {
                send.send_with_At(e, "当前账户被加入黑名单，详情请联系管理员(1)。")
                return true;
            }
        }
        if (await credentials.getUserLoaclBanStatus()) {
            send.send_with_At(e, "当前账户被加入黑名单，详情请联系管理员(2)。")
            return true;
        }
        if (!group_id) {
            return false
        }
        switch (fnc) {
            case 'help':
            case 'tkhelp':
                return await this.redis(group_id, 'help')
            case 'bind':
            case 'unbind':
                return await this.redis(group_id, 'bind')
            case 'b19':
            case 'p30':
            case 'lmtAcc':
            case 'arcgrosB19':
            case 'update':
            case 'info':
            case 'list':
            case 'singlescore':
            case 'lvscore':
            case 'chap':
            case 'achievement':
            case 'suggest':
            case 'analyze2025SaveHistory':
            case 'hisb30':
                return await this.redis(group_id, 'b19')
            case 'bestn':
            case 'data':
                return await this.redis(group_id, 'wb19')
            case 'song':
            case 'ill':
            case 'chart':
            case 'tag':
            case 'addtag':
            case 'retag':
            case 'search':
            case 'alias':
            case 'randmic':
            case 'randClg':
            case 'table':
            case 'comment':
            case 'recallComment':
            case 'myComment':
                return await this.redis(group_id, 'song')
            case 'rankList':
            case 'godList':
                return await this.redis(group_id, 'ranklist')
            case 'comrks':
            case 'tips':
            case 'newSong':
                return await this.redis(group_id, 'fnc')
            case 'tipgame':
                return await this.redis(group_id, 'tipgame')
            case 'guessgame':
                return await this.redis(group_id, 'guessgame')
            case 'ltrgame':
                return await this.redis(group_id, 'ltrgame')
            case 'fribgame':
                return await this.redis(group_id, 'fribgame')
            case 'sign':
            case 'send':
            case 'tasks':
            case 'retask':
            case 'jrrp':
                return await this.redis(group_id, 'sign')
            case 'theme':
                return await this.redis(group_id, 'setting')
            case 'dan':
            case 'danupdate':
                return await this.redis(group_id, 'dan')
            case 'auth':
            case 'clearApiData':
            case 'updateHistory':
            case 'setApiToken':
            case 'tokenList':
                return await this.redis(group_id, 'apiSetting')
            default:
                return false;
        }
    }
}
