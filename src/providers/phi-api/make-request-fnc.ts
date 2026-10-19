// @ts-nocheck
import fCompute from '../../domain/game/f-compute'

export default class makeRequestFnc {
    /**
     * 
    * @param {import('../../services/base-class').botEvent } e
     * @returns {import('./make-request').platformAuth}
     */
    static makePlatform(e) {
        return {
            platform: fCompute.getAdapterName(e),
            platform_id: typeof e.user_id == 'string' ? e.user_id.replace('', ':') : `${e.user_id}`,
            _local_user_id: `${e.user_id}`,
        }
    }

}
