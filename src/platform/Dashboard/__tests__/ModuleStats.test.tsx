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

  it('--accent-strong está definido para os quatro accents, com 3:1 no tile', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8')
    const accents = [...css.matchAll(/\[data-accent="(\w+)"\]\s*\{([^}]*)\}/g)]
    expect(accents).toHaveLength(4)

    const surfaces = { light: '#ffffff', dim: '#f3e8fc', dark: '#1c1c1e' }
    for (const [, nome, corpo] of accents) {
      const forte = corpo.match(/--accent-strong:\s*(#[0-9a-f]{6})/)?.[1]
      const suave = corpo.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*0\.15\s*\)/)
      expect(forte, `--accent-strong ausente em ${nome}`).toBeTruthy()
      expect(suave, `--accent-soft ausente em ${nome}`).toBeTruthy()

      // tile = accent a 15% sobre a superfície do cartão do tema
      const [r, g, b] = suave!.slice(1).map(Number)
      for (const [tema, fundo] of Object.entries(surfaces)) {
        const tile = blend(fundo, [r, g, b], 0.15)
        expect(
          contrastRatio(forte!, tile),
          `${nome}/${tema}: ${forte} sobre ${tile}`,
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

    const card = cardByName('Inventário')
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
    expect(cardByName('Inventário').textContent).toMatch(/2\s*Com problemas/)
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
    expect(screen.queryByRole('button', { name: /Inventário/ })).not.toBeInTheDocument()
  })

  it('app desativado no workspace esconde o módulo', () => {
    mockDisabledApps.mockReturnValue(['pc-care'])
    renderStats()
    expect(screen.queryByRole('button', { name: /Inventário/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('nenhum módulo acessível: lista vazia, sem quebrar a seção', () => {
    mockCanAccessApp.mockReturnValue(false)
    renderStats()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Resumo por Módulo' })).toBeInTheDocument()
  })
})
