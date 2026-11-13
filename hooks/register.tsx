import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Janela, Medicao } from '../types'

const PANE = 'medidor-de-uso'
const TITULO = 'Medidor de uso'
// Change the tag when Medicao's fields change: it declines what an earlier
// version stored, which outlives a reload.
const medicao = atom(
  { plugin: 'medidor-de-uso', key: 'medicao' } as const,
  null as Medicao | null,
  { shape: 'medicao-3' },
)
// The view the person chose; kept across sessions in $.store under this key.
const detalhado = atom({ plugin: 'medidor-de-uso', key: 'detalhado' } as const, false)
const PREFERENCIA = 'detalhado'
// The last reading of every window, kept across sessions in $.store: a session whose
// responses never report the 5-hour window still shows the last one seen.
const ULTIMAS = 'janelas'

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
// Kinds the app's own usage card names, e.g. "Weekly · Fable" -> seven_day_fable.
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const modeloDe = (kind: string) => capitalizar(kind.replace(/^seven_day_/, ''))
const nomeDe = (kind: string) =>
  NOMES[kind] ?? (kind.startsWith('seven_day_') ? `Semanal: ${modeloDe(kind)}` : kind)
const curtoDe = (kind: string) =>
  CURTOS[kind] ?? (kind.startsWith('seven_day_') ? `7d ${modeloDe(kind)}` : kind)

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

// Order the windows always appear in; unknown kinds go last.
const ORDEM = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'spend_limit']
const posicao = (kind: string) => (ORDEM.includes(kind) ? ORDEM.indexOf(kind) : ORDEM.length)

const HORA = 3600_000
// How long a window lasts, for readings that came without a reset time.
const duracao = (kind: string) => (kind.startsWith('seven_day') ? 7 * 24 * HORA : 5 * HORA)

// Whether an old reading still describes the current window.
function valeAinda(r: Janela, agora: number): boolean {
  if (r.resetsAt !== undefined) return Date.parse(r.resetsAt) > agora
  return r.lidaEm !== undefined && agora - r.lidaEm < duracao(r.kind)
}

// A response often reports only some windows (often just the 7-day one). A window it
// leaves out keeps its last reading until that window resets, so the 5-hour figure
// does not vanish between responses, nor between sessions.
function juntar(novas: Janela[], antigas: Janela[] | undefined, agora: number): Janela[] {
  const vistas = new Set(novas.map(r => r.kind))
  const mantidas = (antigas ?? []).filter(r => !vistas.has(r.kind) && valeAinda(r, agora))

  return [...novas.map(r => ({ ...r, lidaEm: agora })), ...mantidas].sort(
    (a, b) => posicao(a.kind) - posicao(b.kind),
  )
}

// The app's usage card ("5-hour limit", "Weekly · all models", "Weekly · Fable") as
// windows. It answers even when no response has reported the 5-hour window.
function tipoDoRotulo(rotulo: string): string | undefined {
  const r = rotulo.toLowerCase()
  if (r.includes('5-hour') || r.includes('5 hour') || r.includes('session')) return 'five_hour'
  if (!r.startsWith('weekly')) return undefined
  const modelo = r.split('·')[1]?.trim() ?? 'all models'
  if (modelo === 'all models' || modelo === '') return 'seven_day'
  return `seven_day_${modelo.replace(/[^a-z0-9]+/g, '_')}`
}

function janelasDoPlano(texto: string): Janela[] {
  let dados: unknown
  try {
    dados = JSON.parse(texto)
  } catch {
    return []
  }
  const plano = (dados as { plan?: { status?: string; windows?: unknown } })?.plan
  if (plano?.status !== 'ok' || !Array.isArray(plano.windows)) return []
  const janelas: Janela[] = []
  for (const w of plano.windows as { label?: unknown; percentUsed?: unknown; resetsAt?: unknown }[]) {
    const kind = typeof w?.label === 'string' ? tipoDoRotulo(w.label) : undefined
    if (!kind || typeof w.percentUsed !== 'number') continue
    janelas.push({
      kind,
      percentUsed: w.percentUsed,
      ...(typeof w.resetsAt === 'string' ? { resetsAt: w.resetsAt } : {}),
    })
  }
  return janelas
}

// The desktop app's usage tool; absent elsewhere (the terminal), where the meter keeps
// to what responses report.
const SERVIDOR = 'ccd_session_mgmt'
const INTERVALO = 60_000
let consultadoEm = 0

async function lerPlano($: EngineInterface, agora: number, forcar = false): Promise<void> {
  if (!forcar && agora - consultadoEm < INTERVALO) return
  consultadoEm = agora
  let janelas: Janela[] = []
  try {
    const r = await $.mcp.call(SERVIDOR, 'get_usage', {})
    if (r.isError) return
    for (const bloco of r.content) {
      if (bloco.type === 'text' && typeof (bloco as { text?: unknown }).text === 'string') {
        janelas = janelasDoPlano((bloco as { text: string }).text)
        if (janelas.length > 0) break
      }
    }
  } catch {
    return
  }
  if (janelas.length === 0) return
  const m = await update($, medicao, anterior => ({
    rateLimits: juntar(janelas, anterior?.rateLimits, agora),
    contextoPct: anterior?.contextoPct,
    custoUsd: anterior?.custoUsd,
    medidoEm: agora,
  }))
  if (m) await $.store.set(ULTIMAS, m.rateLimits)
}

const ehJanelas = (v: unknown): v is Janela[] =>
  Array.isArray(v) &&
  v.every(r => r && typeof r.kind === 'string' && typeof r.percentUsed === 'number')

// A reading not from the latest response: shown with the time it was read.
const antiga = (r: { lidaEm?: number }, m: Medicao) =>
  r.lidaEm !== undefined && m.medidoEm - r.lidaEm > 60_000

const medir = (
  u: Pick<SessionUsage, 'rateLimits' | 'context' | 'cost'>,
  agora: number,
  anterior: Medicao | null,
): Medicao => ({
  rateLimits: juntar(u.rateLimits, anterior?.rateLimits, agora),
  contextoPct: u.context.percent ?? anterior?.contextoPct,
  custoUsd: u.cost?.usd ?? anterior?.custoUsd,
  medidoEm: agora,
})

// With any subscription reading, the 5-hour window always has its place: "—" until
// a response reports it.
type Vaga = { kind: string; percentUsed?: undefined; resetsAt?: undefined; lidaEm?: undefined }
const comCincoHoras = (janelas: Janela[]): (Janela | Vaga)[] =>
  janelas.length === 0 || janelas.some(r => r.kind === 'five_hour')
    ? janelas
    : [{ kind: 'five_hour' }, ...janelas]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consumo',
      description: 'Abre o medidor de uso do plano',
    })
    const u = await $.session.usage()
    const agora = await $.clock.now()
    const guardadas = await $.store.get(ULTIMAS)
    await update($, medicao, anterior =>
      medir(u, agora, anterior ?? (ehJanelas(guardadas) ? { rateLimits: guardadas, medidoEm: agora } : null)),
    )
    const preferencia = (await $.store.get(PREFERENCIA)) === true
    await update($, detalhado, () => preferencia)
    await lerPlano($, agora, true)

    return next(e)
  })

  on('command.run', { command: 'consumo' }, async $ => {
    await lerPlano($, await $.clock.now(), true)
    await $.ui.open({ id: PANE, title: TITULO, columns: 32 })

    return { text: 'Medidor de uso aberto.' }
  })

  on('session.measure', async ($, e, next) => {
    const agora = await $.clock.now()
    const m = await update($, medicao, anterior => medir(e, agora, anterior))
    if (e.rateLimits.length > 0 && m) await $.store.set(ULTIMAS, m.rateLimits)
    await lerPlano($, agora)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, medicao)
    if (e.props.hasSurvey || !m || (m.rateLimits.length === 0 && m.contextoPct === undefined)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const partes: [string, number | undefined, string][] = comCincoHoras(m.rateLimits).map(r => [
      curtoDe(r.kind),
      r.percentUsed,
      r.lidaEm !== undefined && antiga(r, m) ? ` (${hora(new Date(r.lidaEm))})` : '',
    ])
    if (m.contextoPct !== undefined) partes.push(['ctx', m.contextoPct, ''])

    return (
      <Box justifyContent="center">
        <Text>
          {partes.map(([rotulo, pct, lido]) => (
            <Text key={rotulo}>
              <Text dimColor>{rotulo} </Text>
              {pct === undefined ? (
                <Text dimColor>aguardando</Text>
              ) : (
                <Text color={cor(pct)}>{Math.round(pct)}%</Text>
              )}
              {lido && <Text dimColor>{lido}</Text>}
              <Text dimColor> · </Text>
            </Text>
          ))}
          <Text dimColor>atualizado {hora(new Date(m.medidoEm))}</Text>
        </Text>
      </Box>
    )
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

    const SEM_LEITURA = 'aguardando o Claude informar'

    const lida = (r: Janela) =>
      m && r.lidaEm !== undefined && antiga(r, m) ? `lido ${quando(new Date(r.lidaEm).toISOString(), agora)}` : ''

    const compacta = (r: Janela | Vaga) =>
      r.percentUsed === undefined ? (
        <Text key={r.kind}>
          {curtoDe(r.kind)} <Text dimColor>{SEM_LEITURA}</Text>
        </Text>
      ) : (
        linha(curtoDe(r.kind), r.percentUsed, 10, quando(r.resetsAt, agora) || lida(r))
      )

    const detalhada = (r: Janela | Vaga) => (
      <Box flexDirection="column" key={r.kind}>
        <Text bold>{nomeDe(r.kind)}</Text>
        {r.percentUsed === undefined ? <Text dimColor>{SEM_LEITURA}</Text> : linha('', r.percentUsed, 16, '')}
        {r.resetsAt && <Text dimColor>reinicia {quando(r.resetsAt, agora)}</Text>}
        {r.percentUsed !== undefined && lida(r) && (
          <Text dimColor>{lida(r)} (o Claude não informou de novo)</Text>
        )}
      </Box>
    )

    const semDados = !m || m.rateLimits.length === 0

    return (
      <Box flexDirection="column" alignItems="center" gap={isDetalhado ? 1 : 0}>
        {semDados ? (
          <Text dimColor>
            Os limites aparecem após a primeira resposta do Claude.
          </Text>
        ) : (
          comCincoHoras(m.rateLimits).map(isDetalhado ? detalhada : compacta)
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
