export type Janela = { kind: string; percentUsed: number; resetsAt?: string }

export type Medicao = {
  rateLimits: Janela[]
  contextoPct?: number
  custoUsd?: number
  medidoEm: number
}

declare module 'claude-code' {
  interface PluginState {
    'consumo-do-plano': {
      medicao: Shaped<Medicao | null>
      detalhado: boolean
    }
  }
}
