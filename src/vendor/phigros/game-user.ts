// @ts-nocheck
import ByteReader from './byte-reader';
import Util from './util';

class GameUser {
    /**
     * @param {string} data
     */
    constructor(data) {
        this.name = "user";
        this.version = 1;
        let Reader = new ByteReader(data)
        this.showPlayerId = Util.getBit(Reader.getByte(), 0);
        this.selfIntro = Reader.getString();
        this.avatar = Reader.getString();
        this.background = Reader.getString();
    }
}

export default GameUser
