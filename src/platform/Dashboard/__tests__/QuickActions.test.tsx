import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QuickActions } from '../QuickActions'

const mockNavigate = vi.hoisted(() => vi.fn())
const mockCanAccessApp = vi.hoisted(() => vi.fn<(id: string) => boolean>(() => true))
const mockDisabledApps = vi.hoisted(() => vi.fn<() => string[]>(() => []))

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
  isAppDisabled: (appId: string) => mockDisabledApps().includes(appId),
  isModuleAvailable: (appId: string, _ws: unknown, canAccessApp: (id: string) => boolean) =>
    !mockDisabledApps().includes(appId) && canAccessApp(appId),
}))

function css(): string {
  return readFileSync(resolve(__dirname, '../../../index.css'), 'utf8')
}

/** Lê o valor de um token em um bloco de seletor do index.css. */
function token(seletor: string, nome: string): string | undefined {
  const bloco = css().match(new RegExp(`(?:^|\\s)${seletor}\\s*\\{([^}]*)\\}`))?.[1]
  if (!bloco) return undefined
  return bloco.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1]?.trim()
}

function tiles(): HTMLElement[] {
  return screen.getAllByTestId('quick-icon')
}

function renderQuick() {
  return render(<QuickActions />)
}

beforeEach(() => {
  mockCanAccessApp.mockReturnValue(true)
  mockDisabledApps.mockReturnValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('QuickActions — a cor de fundo segue o tema', () => {
  it('o cartão usa --bg-quick-card, não --bg-card direto', () => {
    renderQuick()
    const botao = screen.getByRole('button', { name: /Estoque/ })
    expect(botao.className).toContain('bg-quick-card')
    // Se voltar a bg-card, o Sutil perde o pareamento com o Resumo.
    expect(botao.className).not.toMatch(/\bbg-card\b/)
  })

  it('no Sutil, Ações Rápidas usa a MESMA superfície do Resumo por Módulo', () => {
    // Só no Sutil. Nos outros temas o cartão é o de sempre.
    expect(token('.dim', '--bg-quick-card')).toBe('var(--bg-module-card)')
    expect(token(':root', '--bg-quick-card')).toBe('var(--bg-card)')
    expect(token('.dark', '--bg-quick-card')).toBe('var(--bg-card)')
  })

  it('o Sutil realmente resolve os dois para a mesma cor', () => {
    const dim = token('.dim', '--bg-module-card')
    // var(--bg-module-card) precisa apontar para um hex, não para outra
    // variável, senão o teste acima passaria sem resolver nada.
    expect(dim).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('QuickActions — as cores dos ícones continuam distintas', () => {
  it('cada ação mantém a sua cor, e são todas diferentes entre si', () => {
    renderQuick()
    const cores = tiles().map((t) => t.style.color)
    expect(cores).toHaveLength(4)
    expect(new Set(cores).size, `cores repetidas: ${cores.join(' ')}`).toBe(4)
    // O navegador normaliza hex para rgb(); por isso rgb() e não #rrggbb.
    for (const cor of cores) expect(cor).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('o tile do ícone é a própria cor da ação a 15%, como antes', () => {
    renderQuick()
    for (const tile of tiles()) {
      // 0x15 = 21/255 ≈ 0.082: o sufixo '15' do código continua o mesmo.
      expect(tile.style.backgroundColor).toBe(tile.style.color.replace('rgb(', 'rgba(').replace(')', ', 0.082)'))
    }
  })

  it('a cor do ícone não virou a cor do tema', () => {
    renderQuick()
    // Se alguém "unificar" os ícones no accent, este teste quebra.
    const accent = css().match(/\[data-accent="(\w+)"\]\s*\{[^}]*--accent:\s*(#[0-9a-f]{6})/)?.[2]
    expect(tiles().some((t) => t.style.color === accent)).toBe(false)
  })
})

describe('QuickActions — o filtro de acesso não mudou', () => {
  it('só mostra as ações permitidas', () => {
    mockCanAccessApp.mockImplementation((id: string) => id === 'stock')
    // Novo Chamado tem regra própria: basta estar desabilitado no workspace.
    mockDisabledApps.mockReturnValue(['chamados', 'reservalab', 'pc-care'])
    renderQuick()
    expect(screen.getByRole('button', { name: /Estoque/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('navigate vai para a rota da ação', () => {
    renderQuick()
    fireEvent.click(screen.getByRole('button', { name: /Reservas/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/reservalab')
  })
})
