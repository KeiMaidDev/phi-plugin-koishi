import type { Config } from './config'
import type { BusinessDataStore } from './services/business-data'

/** 插件实例级依赖，显式传给应用与单例服务。 */
export interface PhiRuntime {
  config: Config
  data: BusinessDataStore
}
