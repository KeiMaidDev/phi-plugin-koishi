// @ts-nocheck
import type { PhiRuntime } from '../../runtime-context'

import { phiRankList } from './rank-list'
import { aliasProposal } from './alias-proposal'
import { phihelp as phiApiSetting } from './api-setting'
import { phib19 } from './b19'
import { phiBotClient } from './bot-client'
import { phihelp as phiChart } from './chart'
import { phiGames } from './guess-game'
import { phihelp as phiHelp } from './help'
import { phiset as phiManage } from './manage'
import { phiMarket } from './market'
import { phimoney } from './money'
import { phisong } from './phisong'
import { phisstk } from './session'
import { phihelp as phiSetting } from './setting'
import { phiTheoryTable } from './theory-table'
import { phiupdate } from './update'
import { phiuser } from './user'

const appClasses = {
    RankList: phiRankList,
    aliasProposal,
    apiSetting: phiApiSetting,
    b19: phib19,
    botClient: phiBotClient,
    chart: phiChart,
    guessGame: phiGames,
    help: phiHelp,
    manage: phiManage,
    market: phiMarket,
    money: phimoney,
    phisong,
    session: phisstk,
    setting: phiSetting,
    theoryTable: phiTheoryTable,
    update: phiupdate,
    user: phiuser,
}

export function createApps(runtime: PhiRuntime) {
    return Object.fromEntries(Object.entries(appClasses).map(([key, Class]) => [key, new Class(runtime)]))
}
