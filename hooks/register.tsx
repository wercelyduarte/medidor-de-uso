import { atom, read, update } from 'claude-code'
import type { Register, SessionUsage } from 'claude-code'

import type { Janela, Medicao } from '../types'

const PANE = 'medidor-de-uso'
const TITULO = 'Medidor de uso'
// Change the tag when Medicao's fields change: it declines what an earlier
// version stored, which outlives a reload.
const medicao = atom(
  { plugin: 'medidor-de-uso', key: 'medicao' } as const,
  null as Medicao | null,
  { shape: 'medicao-2' },
)
// The view the person chose; kept across sessions in $.store under this key.
const detalhado = atom({ plugin: 'medidor-de-uso', key: 'detalhado' } as const, false)
const PREFERENCIA = 'detalhado'

const NOMES: Record<string, string> = {
  five_hour: 'Limite de 5 horas',
  seven_day: 'Limite semanal (7 dias)',
  seven_day_opus: 'Semanal: Opus',
  seven_day_sonnet: 'Semanal: Sonnet',
  spend_limit: 'Limite de gastos',
}
const CURTOS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  seven_day_opus: '7d Opus',
  seven_day_sonnet: '7d Sonnet',
  spend_limit: 'Gastos',
}
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const hora = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`

// "hoje 18:40" or "sex 03/11 09:00"; '' without a reset time.
function quando(iso: string | undefined, agora: number): string {
  const ms = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(ms)) return ''
  const d = new Date(ms)
  const dia =
    d.toDateString() === new Date(agora).toDateString()
      ? 'hoje'
      : `${DIAS[d.getDay()]} ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`

  return `${dia} ${hora(d)}`
}

function barra(pct: number, largura: number): string {
  const cheio = Math.round((Math.min(100, Math.max(0, pct)) / 100) * largura)

  return '█'.repeat(cheio) + '░'.repeat(largura - cheio)
}

const cor = (pct: number) => (pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green')

const medir = (
  u: Pick<SessionUsage, 'rateLimits' | 'context' | 'cost'>,
  agora: number,
): Medicao => ({
  rateLimits: u.rateLimits,
  contextoPct: u.context.percent,
  custoUsd: u.cost?.usd,
  medidoEm: agora,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consumo',
      description: 'Abre o medidor de uso do plano',
    })
    const u = await $.session.usage()
    const agora = await $.clock.now()
    await update($, medicao, () => medir(u, agora))
    const preferencia = (await $.store.get(PREFERENCIA)) === true
    await update($, detalhado, () => preferencia)
    void $.ui.open({ id: PANE, title: TITULO, columns: 32 })

    return next(e)
  })

  on('command.run', { command: 'consumo' }, async $ => {
    await $.ui.open({ id: PANE, title: TITULO, columns: 32 })

    return { text: 'Medidor de uso aberto.' }
  })

  on('session.measure', async ($, e, next) => {
    const agora = await $.clock.now()
    await update($, medicao, () => medir(e, agora))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const m = await read($, medicao)
    const isDetalhado = await read($, detalhado)
    const agora = await $.clock.now()

    const alternar = async () => {
      const novo = await update($, detalhado, v => !v)
      await $.store.set(PREFERENCIA, novo)
    }

    // The percentage sits right after the bar, not pushed to the far edge.
    const linha = (rotulo: string, pct: number, largura: number, detalhe: string) => (
      <Text key={rotulo}>
        {rotulo && `${rotulo} `}
        <Text color={cor(pct)}>{barra(pct, largura)}</Text>{' '}
        <Text bold color={cor(pct)}>
          {pct}%
        </Text>
        {detalhe && <Text dimColor> {detalhe}</Text>}
      </Text>
    )

    const compacta = (r: Janela) =>
      linha(CURTOS[r.kind] ?? r.kind, r.percentUsed, 10, quando(r.resetsAt, agora))

    const detalhada = (r: Janela) => (
      <Box flexDirection="column" key={r.kind}>
        <Text bold>{NOMES[r.kind] ?? r.kind}</Text>
        {linha('', r.percentUsed, 16, '')}
        {r.resetsAt && <Text dimColor>reinicia {quando(r.resetsAt, agora)}</Text>}
      </Box>
    )

    const semDados = !m || m.rateLimits.length === 0

    return (
      <Box flexDirection="column" gap={isDetalhado ? 1 : 0}>
        {semDados ? (
          <Text dimColor>
            Os limites aparecem após a primeira resposta do Claude.
          </Text>
        ) : (
          m.rateLimits.map(isDetalhado ? detalhada : compacta)
        )}
        {m?.contextoPct !== undefined &&
          (isDetalhado ? (
            <Box flexDirection="column">
              <Text bold>Contexto desta conversa</Text>
              {linha('', m.contextoPct, 16, '')}
            </Box>
          ) : (
            linha('ctx', m.contextoPct, 10, '')
          ))}
        {isDetalhado && m?.custoUsd !== undefined && (
          <Text dimColor>
            Custo estimado da sessão (preço de API): US$ {m.custoUsd.toFixed(2)}
          </Text>
        )}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor size="caption">
            {m ? `atualizado ${hora(new Date(m.medidoEm))}` : ''}
          </Text>
          <Button
            key="alternar"
            label={isDetalhado ? 'Compacto' : 'Detalhes'}
            plain
            dimColor
            onPress={alternar}
          />
        </Box>
      </Box>
    )
  })
}
