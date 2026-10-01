import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ModuleStats } from '../ModuleStats'

const mockNavigate = vi.hoisted(() => vi.fn())
const mockCanAccessApp = vi.hoisted(() => vi.fn<(id: string) => boolean>(() => true))
const mockDisabledApps = vi.hoisted(() => vi.fn<() => string[]>(() => []))
const pcs = vi.hoisted(() => vi.fn<() => unknown[]>(() => []))
const stock = vi.hoisted(() => vi.fn<() => unknown[]>(() => []))
const tickets = vi.hoisted(() => vi.fn<() => unknown[]>(() => []))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-1', name: 'Lab', slug: 'lab', disabled_apps: [] } }),
}))

vi.mock('../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({ canAccessApp: mockCanAccessApp }),
}))

// RBAC 2.0 (F2-D-L): o componente passou a ler a visibilidade da fonte nova
// (`useModuleVisibilities`). O mock reproduz a mesma semântica dos mocks
// antigos acima — acesso liberado E app não desabilitado no workspace — para que
// os testes de filtro continuem medindo a mesma coisa.
vi.mock('../../../core/permissions/useModuleVisibility', () => ({
  useModuleVisibilities: () => ({
    isVisible: (appId: string | undefined) =>
      !!appId && !mockDisabledApps().includes(appId) && mockCanAccessApp(appId),
  }),
  useModuleLevel: () => ({ visible: true, allowed: true, loading: false }),
}))

vi.mock('../../../core/workspaces/apps', () => ({
  isModuleAvailable: (appId: string, _ws: unknown, canAccessApp: (id: string) => boolean) =>
    !mockDisabledApps().includes(appId) && canAccessApp(appId),
}))

vi.mock('../../../apps/pcare/services/pcService', () => ({ pcService: { getAll: pcs } }))
vi.mock('../../../apps/stock/services/stockService', () => ({ stockService: { getAll: stock } }))
vi.mock('../../../apps/chamados/services/ticketService', () => ({ ticketService: { getAll: tickets } }))

function renderStats() {
  return render(<ModuleStats />)
}

function cardByName(nome: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(nome) })
}

function iconTiles(): HTMLElement[] {
  return screen.getAllByTestId('mod-icon')
}

function toRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Sobrepõe `cor` a `fundo` com opacidade `alpha` (como faz o navegador). */
function blend(fundo: string, cor: [number, number, number], alpha: number): string {
  const f = toRgb(fundo)
  const ch = f.map((c, i) => Math.round(alpha * cor[i] + (1 - alpha) * c))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Distância euclidiana em RGB: "quão diferente uma cor é da outra". */
function colorDistance(a: string, b: string): number {
  const [x, y] = [toRgb(a), toRgb(b)]
  return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 10) / 10
}

/** Lê do index.css a superfície da página, do cartão e do cartão de módulo, por tema. */
function themeSurfaces(css: string): {
  surfaces: Record<string, { fundo: string; card: string; modulo: string }>
} {
  const bloco = (seletor: string) => {
    const m = css.match(new RegExp(`(?:^|\\s)${seletor}\\s*(?:,\\s*\\.dark)?\\s*\\{([^}]*)\\}`, 'm'))
    expect(m, `bloco ${seletor} não encontrado no index.css`).toBeTruthy()
    return m![1]
  }
  const hex = (corpo: string, token: string) => {
    const v = corpo.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`))?.[1]
    expect(v, `${token} ausente ou não-hex`).toBeTruthy()
    return v!
  }

  const surfaces: Record<string, { fundo: string; card: string; modulo: string }> = {}
  for (const [tema, seletor] of [
    ['light', ':root'],
    ['dark', '.dark'],
    ['dim', '.dim'],
  ] as const) {
    const corpo = bloco(seletor)
    surfaces[tema] = {
      fundo: hex(corpo, '--bg-primary'),
      card: hex(corpo, '--bg-card'),
      modulo: hex(corpo, '--bg-module-card'),
    }
  }
  return { surfaces }
}

beforeEach(() => {
  mockCanAccessApp.mockReturnValue(true)
  mockDisabledApps.mockReturnValue([])
  pcs.mockReturnValue([])
  stock.mockReturnValue([])
  tickets.mockReturnValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ModuleStats — a cor vem do tema, não de uma cor fixa por módulo', () => {
  it('o tile usa --accent-soft e o glifo usa --accent-strong, ambos do tema', () => {
    renderStats()
    const tile = iconTiles()[0]
    expect(tile.style.backgroundColor).toBe('var(--accent-soft)')
    // --accent, não --accent-strong, deixaria emerald e cyan a ~2:1 no tile.
    expect(tile.style.color).toBe('var(--accent-strong)')
  })

  it('todo cartão repete o mesmo tratamento de cor, vindo do tema', () => {
    renderStats()
    const tiles = iconTiles()
    // 5 módulos visíveis -> 5 tiles de ícone.
    expect(tiles).toHaveLength(5)
    for (const tile of tiles) {
      expect(tile.style.backgroundColor).toBe('var(--accent-soft)')
      expect(tile.style.color).toBe('var(--accent-strong)')
    }
  })

  it('o cartão usa --bg-module-card, um passo fora do branco na direção da identidade', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8')
    const { surfaces } = themeSurfaces(css)

    // Um passo: longe o bastante para o cartão não ler como branco, perto o
    // bastante para continuar sendo o mesmo cartão, não uma cor nova. A faixa
    // é absoluta de propósito — a distância entre página e cartão muda muito
    // entre os temas (8.7 no Claro, 79.6 no Sutil), então medir em % do que o
    // tema já separa não diria nada.
    for (const [tema, { modulo, card }] of Object.entries(surfaces)) {
      const passo = colorDistance(modulo, card)
      expect(passo, `${tema}: ${modulo} precisa se destacar de ${card}`).toBeGreaterThanOrEqual(10)
      expect(passo, `${tema}: ${modulo} longe demais de ${card}, virou outra cor`).toBeLessThanOrEqual(20)
    }

    // E o passo tem que ser na direção certa: mais claro que o cartão nos
    // temas claros, mais escuro no Escuro. Sem isso, "variação do lilás" viraria
    // "mais lilás ainda" no escuro.
    for (const [tema, { modulo, card }] of Object.entries(surfaces)) {
      const lum = relativeLuminance(modulo) - relativeLuminance(card)
      expect(Math.sign(lum), `${tema}: ${modulo} vs ${card}`).toBe(tema === 'dark' ? 1 : -1)
    }
  })

  it('o cartão do módulo difere do cartão padrão nos três temas', () => {
    const { surfaces } = themeSurfaces(readFileSync(resolve(__dirname, '../../../index.css'), 'utf8'))
    for (const [tema, { modulo, card }] of Object.entries(surfaces)) {
      // Se fossem iguais, o bloco inteiro sumiria dentro de qualquer cartão
      // branco ao redor — que é exatamente o que o token novo evita.
      expect(modulo, `${tema}: ${modulo} === ${card}`).not.toBe(card)
    }
  })

  it('--accent-strong dá 3:1 no tile de cada tema, com os quatro accents', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8')
    const { surfaces } = themeSurfaces(css)
    const darkUsaPuro = /\.dark\s*\{[^}]*--accent-strong:\s*var\(--accent\)/s.test(css)
    expect(darkUsaPuro, 'o Escuro deve devolver o accent puro (fundo escuro dá contraste de sobra)').toBe(true)

    const accents = [...css.matchAll(/\[data-accent="(\w+)"\]\s*\{([^}]*)\}/g)]
    expect(accents).toHaveLength(4)

    for (const [, nome, corpo] of accents) {
      const forte = corpo.match(/--accent-strong:\s*(#[0-9a-f]{6})/)?.[1]
      const puro = corpo.match(/--accent:\s*(#[0-9a-f]{6})/)?.[1]
      const suave = corpo.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*0\.15\s*\)/)
      expect(forte, `--accent-strong ausente em ${nome}`).toBeTruthy()
      expect(puro, `--accent ausente em ${nome}`).toBeTruthy()
      expect(suave, `--accent-soft ausente em ${nome}`).toBeTruthy()

      // tile = accent a 15% sobre a superfície do CARTÃO DE MÓDULO do tema
      const [r, g, b] = suave!.slice(1).map(Number)
      for (const [tema, { modulo }] of Object.entries(surfaces)) {
        // No Escuro vale o accent puro (regra .dark), nos claros o escurecido.
        const glifo = tema === 'dark' ? puro! : forte!
        const tile = blend(modulo, [r, g, b], 0.15)
        expect(
          contrastRatio(glifo, tile),
          `${nome}/${tema}: ${glifo} sobre ${tile}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('nenhuma cor hexadecimal fixa sobreviveu no componente', () => {
    const fonte = readFileSync(resolve(__dirname, '../ModuleStats.tsx'), 'utf8')
    // Só o CSS do tema pode conter hexadecimal — aqui, só o tema.
    // Só comentário pode citar "#" (ex.: referência de cor em texto).
    const semComments = fonte
      .split('\n')
      .filter((l) => {
        const t = l.trim()
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*')
      })
      .join('\n')
    expect(semComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('ModuleStats — números em destaque (o que se quer ver primeiro)', () => {
  it('o stat principal é o número grande, com a etiqueta ao lado', () => {
    pcs.mockReturnValue([
      { id: '1', cleaningStatus: 'done' },
      { id: '2', cleaningStatus: 'pending' },
      { id: '3', cleaningStatus: 'in_progress' },
    ])
    renderStats()

    const card = cardByName('PC Care')
    // 3 PCs: o número vem antes e em destaque, não "PCs 3".
    expect(card.textContent).toMatch(/3\s*PCs/)
    // O secundário vai para a coluna da direita: "1 Com problemas".
    expect(card.textContent).toMatch(/1\s*Com problemas/)
  })

  it('estatística secundária não é perdida quando existe', () => {
    renderStats()
    const card = cardByName('Chamados')
    expect(card.textContent).toMatch(/0\s*Abertos/)
    expect(card.textContent).toMatch(/0\s*Resolvidos hoje/)
  })

  it('quando o valor é texto, ele vira o destaque e a etiqueta não duplica', () => {
    renderStats()
    const card = cardByName('ReservaLab')
    // "Reservas e tablets" é o destaque; "Laboratórios" some para não repetir.
    expect(card.textContent).toContain('Reservas e tablets')
    expect(card.textContent).not.toContain('Laboratórios')
  })

  it('conta por status: só cleaningStatus "pending" conta como problema', () => {
    pcs.mockReturnValue([
      { id: '1', cleaningStatus: 'pending' },
      { id: '2', cleaningStatus: 'pending' },
      { id: '3', cleaningStatus: 'in_progress' },
      { id: '4', cleaningStatus: 'done' },
    ])
    renderStats()
    expect(cardByName('PC Care').textContent).toMatch(/2\s*Com problemas/)
  })

  it('estoque: só status "emprestado" conta como em uso', () => {
    stock.mockReturnValue([
      { id: '1', status: 'emprestado' },
      { id: '2', status: 'ativo' },
      { id: '3', status: 'emprestado' },
      { id: '4', status: 'disponivel' },
    ])
    renderStats()
    const card = cardByName('Estoque')
    expect(card.textContent).toMatch(/4\s*Itens/)
    expect(card.textContent).toMatch(/2\s*Em uso/)
  })

  it('chamados abertos conta os três status em aberto; resolvidos hoje só o dia corrente', () => {
    const hoje = new Date().toISOString()
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    tickets.mockReturnValue([
      { id: '1', status: 'aberto', resolvedAt: null },
      { id: '2', status: 'a_caminho', resolvedAt: null },
      { id: '3', status: 'em_atendimento', resolvedAt: null },
      { id: '4', status: 'fechado', resolvedAt: `${hoje}T10:00:00.000Z` },
      { id: '5', status: 'fechado', resolvedAt: `${ontem}T10:00:00.000Z` },
    ])
    renderStats()

    const card = cardByName('Chamados')
    expect(card.textContent).toMatch(/3\s*Abertos/)
    expect(card.textContent).toMatch(/1\s*Resolvidos hoje/)
  })
})

describe('ModuleStats — navegação e acessibilidade', () => {
  it('cada cartão navega para a rota do seu módulo', () => {
    renderStats()
    fireEvent.click(cardByName('Estoque'))
    expect(mockNavigate).toHaveBeenCalledWith('/stock')
  })

  it('a seção é um landmark rotulado pelo próprio título', () => {
    renderStats()
    const titulo = screen.getByRole('heading', { name: 'Resumo por Módulo' })
    expect(titulo.closest('section')).toHaveAttribute('aria-labelledby', titulo.id)
  })

  it('a lista é semântica: um item por módulo acessível', () => {
    renderStats()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('o tile de ícone é decorativo e o cartão se identifica pelo nome do módulo', () => {
    renderStats()
    const card = cardByName('TV Corporativa')
    expect(card.querySelector('[data-testid="mod-icon"]')).not.toBeNull()
    expect(card).toHaveAccessibleName(/TV Corporativa/)
  })
})

describe('ModuleStats — o filtro de acesso não mudou', () => {
  it('só mostra os módulos liberados para o usuário', () => {
    mockCanAccessApp.mockImplementation((id: string) => id === 'stock')
    renderStats()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(cardByName('Estoque')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /PC Care/ })).not.toBeInTheDocument()
  })

  it('app desativado no workspace esconde o módulo', () => {
    mockDisabledApps.mockReturnValue(['pc-care'])
    renderStats()
    expect(screen.queryByRole('button', { name: /PC Care/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('nenhum módulo acessível: lista vazia, sem quebrar a seção', () => {
    mockCanAccessApp.mockReturnValue(false)
    renderStats()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Resumo por Módulo' })).toBeInTheDocument()
  })
})
