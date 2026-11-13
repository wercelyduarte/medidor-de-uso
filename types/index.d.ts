// lidaEm: when this window was last reported (ms), so a reading from an earlier
// response or session can be told apart and expire.
export type Janela = { kind: string; percentUsed: number; resetsAt?: string; lidaEm?: number }

export type Medicao = {
  rateLimits: Janela[]
  contextoPct?: number
  custoUsd?: number
  medidoEm: number
}

declare module 'claude-code' {
  interface PluginState {
    'medidor-de-uso': {
      medicao: Shaped<Medicao | null>
      detalhado: boolean
    }
  }
}
