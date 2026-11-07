import 'koishi'

declare module 'koishi' {
  interface Monetary {
    gain(userId: string | number, amount: number, currency?: string, reason?: string): Promise<unknown>
    cost(userId: string | number, amount: number, currency?: string, reason?: string): Promise<unknown>
  }

  interface Context {
    monetary: Monetary
  }

  interface Tables {
    monetary: {
      uid: string | number
      currency: string
      value: number
    }
  }
}
