import type { PhiRuntime } from '../../runtime-context'
import phiPluginBase from '../base-class'
import { GrksApplication, parseHintArgs, parseRankArgs } from './grks/application'

export { GrksApplication, parseHintArgs, parseRankArgs }

export class phiGrks extends phiPluginBase {
  readonly application: GrksApplication

  constructor(runtime: PhiRuntime) {
    super({
      config: runtime.config,
      data: runtime.data,
      name: 'phi-grks',
      dsc: 'phi-plugin 猜 RKS',
      event: 'message',
      priority: 900,
      rule: [],
    })
    this.application = new GrksApplication(runtime)
  }

  configure(ctx: any, adapter?: any) {
    this.application.configure(ctx, adapter)
  }

  async dispatch(event: any) {
    this.e = event
    return await this.application.dispatch(event)
  }

  async ans(event: any) {
    this.e = event
    return await this.application.ans(event)
  }

  async match(event: any) {
    this.e = event
    return await this.application.match(event)
  }

  async cancel(event: any) {
    this.e = event
    return await this.application.cancel(event)
  }

  async hint(event: any) {
    this.e = event
    return await this.application.hint(event, parseHintArgs(event.msg))
  }

  async lb(event: any) {
    this.e = event
    return await this.application.leaderboard(event, parseRankArgs(event.msg))
  }

  async dispose() {
    await this.application.dispose()
  }
}

export default phiGrks