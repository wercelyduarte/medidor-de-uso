import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'medidor-de-uso',
  component: 'Pane',
  requestId: 'medidor-de-uso',
  props: {
    title: 'Medidor de uso',
    isFocused: false,
    bodyColumns: 32,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('compacto por padrão, Detalhes alterna e lembra a escolha', async ($, on) => {
  const guardado: Record<string, unknown> = {}
  on('command.register', () => ({ value: { command: 'consumo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: Date.parse('2026-10-31T18:00:00Z') }))
  on('store.get', (_, e) => ({ value: guardado[e.key] }))
  on('store.set', (_, e) => {
    guardado[e.key] = e.value

    return { value: undefined }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const vazio = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await vazio.find({ type: 'Text', text: /primeira resposta/ }))?.text).toContain('primeira resposta')
  await vazio.unmount()

  await $.session.measure({
    context: { window: 200000, tokens: 50000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42.5, resetsAt: '2026-10-31T20:00:00Z' },
      { kind: 'seven_day', percentUsed: 91 },
    ],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('42.5%')
    expect((await ui.find({ type: 'Text', text: /^7d/ }))?.text).toContain('91%')
    expect((await ui.find({ type: 'Text', text: /^ctx/ }))?.text).toContain('25%')
    expect(await ui.find({ type: 'Text', text: /US\$/ })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'alternar' })
  expect((await ui.find({ type: 'Text', text: /5 horas/ }))?.text).toBe('Limite de 5 horas')
  expect((await ui.find({ type: 'Text', text: /US\$/ }))?.text).toContain('1.23')
  expect(guardado.detalhado).toBe(true)
  await ui.unmount()
})

const FAIXA = {
  plugin: 'medidor-de-uso',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
  },
} as const

test('linha acima da caixa: painel não abre sozinho e cores por faixa', async ($, on) => {
  const abertos: string[] = []
  on('command.register', () => ({ value: { command: 'consumo' } }))
  on('ui.open', (_, e) => {
    abertos.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('clock.now', () => ({ value: Date.parse('2026-10-31T18:00:00Z') }))
  on('store.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(abertos).toEqual([])

  await $.session.measure({
    context: { window: 200000, tokens: 50000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42.5 },
      { kind: 'seven_day', percentUsed: 91 },
    ],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount(FAIXA)
  expect((await ui.find({ type: 'Text', text: /^91%$/ }))?.props.color).toBe('red')
  expect((await ui.find({ type: 'Text', text: /^43%$/ }))?.props.color).toBe('green')
  expect((await ui.find({ type: 'Text', text: /^25%$/ }))?.props.color).toBe('green')
  expect((await ui.find({ type: 'Text', text: /atualizado/ }))?.text).toContain('atualizado')
  await ui.unmount()
})

test('5 horas não some quando a resposta traz só o limite semanal', async ($, on) => {
  let agora = Date.parse('2026-11-12T12:00:00Z')
  on('command.register', () => ({ value: { command: 'consumo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: agora }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Only the weekly window so far: the 5-hour one keeps its place.
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 10 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 30, resetsAt: '2026-11-18T09:00:00Z' }],
    changed: ['context', 'rateLimits'],
  })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('aguardando')
  expect((await ui.find({ type: 'Text', text: /^7d/ }))?.text).toContain('30%')
  await ui.unmount()

  // Both windows, then a response with the weekly one only: the 5-hour reading stays.
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 10 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-11-18T09:00:00Z' },
      { kind: 'five_hour', percentUsed: 12, resetsAt: '2026-11-12T15:00:00Z' },
    ],
    changed: ['rateLimits'],
  })
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 11 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 32, resetsAt: '2026-11-18T09:00:00Z' }],
    changed: ['context', 'rateLimits'],
  })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('12%')
  expect((await ui.find({ type: 'Text', text: /^7d/ }))?.text).toContain('32%')
  await ui.unmount()

  // After the 5-hour window resets, its old reading is dropped.
  agora = Date.parse('2026-11-12T16:00:00Z')
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 11 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 33, resetsAt: '2026-11-18T09:00:00Z' }],
    changed: ['rateLimits'],
  })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('aguardando')
  await ui.unmount()
})

test('a leitura de 5 horas de outra sessão aparece com o horário em que foi lida', async ($, on) => {
  const lidaEm = Date.parse('2026-11-13T09:10:00Z')
  const guardado: Record<string, unknown> = {
    janelas: [
      { kind: 'five_hour', percentUsed: 81, lidaEm },
      { kind: 'seven_day', percentUsed: 70, resetsAt: '2026-11-18T09:00:00Z', lidaEm },
    ],
  }
  let agora = Date.parse('2026-11-13T11:00:00Z')
  on('command.register', () => ({ value: { command: 'consumo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: agora }))
  on('store.get', (_, e) => ({ value: guardado[e.key] }))
  on('store.set', (_, e) => {
    guardado[e.key] = e.value

    return { value: undefined }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 10 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 72, resetsAt: '2026-11-18T09:00:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  let ui = await $.ui.mount(FAIXA)
  expect((await ui.find({ type: 'Text', text: /^81%$/ }))?.props.color).toBe('yellow')
  expect(await ui.find({ type: 'Text', text: /aguardando/ })).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('lido')
  expect((await ui.find({ type: 'Text', text: /^7d/ }))?.text).toContain('72%')
  await ui.unmount()
  expect((guardado.janelas as { kind: string }[]).map(r => r.kind)).toEqual(['five_hour', 'seven_day'])

  // Five hours after it was read, the old 5-hour reading no longer counts.
  agora = Date.parse('2026-11-13T14:20:00Z')
  await $.session.measure({
    context: { window: 200000, tokens: 20000, percent: 10 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 73, resetsAt: '2026-11-18T09:00:00Z' }],
    changed: ['rateLimits'],
  })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toContain('aguardando')
  await ui.unmount()
})

test('lê o limite de 5 horas do cartão de uso do app', async ($, on) => {
  const guardado: Record<string, unknown> = {}
  on('command.register', () => ({ value: { command: 'consumo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: Date.parse('2026-11-13T12:00:00Z') }))
  on('store.get', (_, e) => ({ value: guardado[e.key] }))
  on('store.set', (_, e) => {
    guardado[e.key] = e.value

    return { value: undefined }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
  }))
  on('mcp.call', (_, e) => {
    expect(e.tool).toBe('get_usage')
    const plan = {
      status: 'ok',
      windows: [
        { label: '5-hour limit', percentUsed: 95, resetsAt: '2026-11-13T16:09:59Z' },
        { label: 'Weekly · all models', percentUsed: 74, resetsAt: '2026-11-17T00:59:59Z' },
        { label: 'Weekly · Fable', percentUsed: 53, resetsAt: '2026-11-17T00:59:59Z' },
      ],
    }

    return { value: { isError: false, content: [{ type: 'text', text: JSON.stringify({ plan }) }] } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount(FAIXA)
  expect((await ui.find({ type: 'Text', text: /^95%$/ }))?.props.color).toBe('red')
  expect((await ui.find({ type: 'Text', text: /^74%$/ }))?.props.color).toBe('yellow')
  expect(await ui.find({ type: 'Text', text: /aguardando/ })).toBeUndefined()
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^7d Fable/ }))?.text).toContain('53%')
  await ui.unmount()
  expect((guardado.janelas as { kind: string }[]).map(r => r.kind)).toEqual(['five_hour', 'seven_day', 'seven_day_fable'])
})
