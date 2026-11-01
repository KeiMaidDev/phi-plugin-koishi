export const PHI_COMMAND_HEAD = 'phi'
export const PHI_DATA_NAME = 'phi-plugin'

export type PhiMenuPage = 'query' | 'game'

export const PHI_MENU_CALLBACK_PREFIX = 'phi-plugin:menu:'

export function phiMenuCallbackData(page: PhiMenuPage) {
  return `${PHI_MENU_CALLBACK_PREFIX}${page}`
}

export function parsePhiMenuCallbackData(data: unknown): PhiMenuPage | undefined {
  const value = String(data ?? '').trim()
  if (!value.startsWith(PHI_MENU_CALLBACK_PREFIX)) return
  const page = value.slice(PHI_MENU_CALLBACK_PREFIX.length)
  if (page === 'query' || page === 'game') return page
}

export type PhiMarketPageAction = 'prev' | 'next'

export const PHI_MARKET_CALLBACK_PREFIX = 'phi-plugin:market:'

export function phiMarketCallbackData(action: PhiMarketPageAction) {
  return `${PHI_MARKET_CALLBACK_PREFIX}${action}`
}

export function parsePhiMarketCallbackData(data: unknown): PhiMarketPageAction | undefined {
  const value = String(data ?? '').trim()
  if (!value.startsWith(PHI_MARKET_CALLBACK_PREFIX)) return
  const action = value.slice(PHI_MARKET_CALLBACK_PREFIX.length)
  if (action === 'prev' || action === 'next') return action
}
