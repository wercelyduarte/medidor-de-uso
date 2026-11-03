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
