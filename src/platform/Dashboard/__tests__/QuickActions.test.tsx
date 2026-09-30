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

// RBAC 2.0 (F2-D-L): o componente passou a ler a visibilidade da fonte nova
// (`useModuleVisibilities`). O mock reproduz a mesma semântica dos mocks
// antigos abaixo, para que os testes de filtro continuem medindo a mesma coisa.
vi.mock('../../../core/permissions/useModuleVisibility', () => ({
  useModuleVisibilities: () => ({
    isVisible: (appId: string | undefined) =>
      !!appId && !mockDisabledApps().includes(appId) && mockCanAccessApp(appId),
  }),
  useModuleLevel: () => ({ visible: true, allowed: true, loading: false }),
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
    const botao = screen.getByRole('button', { name: /Pedir Música/ })
    expect(botao.className).toContain('bg-quick-card')
    // Se voltar a bg-card, o Sutil perde o pareamento com o Resumo.
    expect(botao.className).not.toMatch(/\bbg-card\b/)
  })

  it('nos três temas, Ações Rápidas usa a MESMA superfície do Resumo por Módulo', () => {
    for (const tema of [':root', '.dark', '.dim']) {
      expect(token(tema, '--bg-quick-card'), tema).toBe('var(--bg-module-card)')
    }
  })

  it('os três temas realmente resolvem --bg-module-card para um hex', () => {
    for (const tema of [':root', '.dark', '.dim']) {
      // Se virar var() de var(), o teste acima passaria sem resolver nada.
      expect(token(tema, '--bg-module-card'), tema).toMatch(/^#[0-9a-f]{6}$/i)
    }
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

describe('QuickActions — Estoque saiu, Pedir Música entrou', () => {
  it('não tem mais o atalho de Estoque', () => {
    renderQuick()
    expect(screen.queryByRole('button', { name: /Estoque/ })).not.toBeInTheDocument()
  })

  it('Pedir Música navega para /pedir-musica', () => {
    renderQuick()
    fireEvent.click(screen.getByRole('button', { name: /Pedir Música/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/pedir-musica')
  })

  it('Pedir Música não depende de módulo: fica visível mesmo com tudo desligado', () => {
    // A rota /pedir-musica só exige login (sem AppGuard), então o atalho não
    // pode sumir por workspace desabilitado nem por falta de permissão.
    mockCanAccessApp.mockReturnValue(false)
    mockDisabledApps.mockReturnValue(['chamados', 'reservalab', 'pc-care'])
    renderQuick()
    expect(screen.getByRole('button', { name: /Pedir Música/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('QuickActions — o filtro de acesso não mudou', () => {
  it('só mostra as ações permitidas, mais Pedir Música', () => {
    mockCanAccessApp.mockImplementation((id: string) => id === 'reservalab')
    // Novo Chamado tem regra própria: basta estar desabilitado no workspace.
    mockDisabledApps.mockReturnValue(['chamados', 'pc-care'])
    renderQuick()
    expect(screen.getByRole('button', { name: /Reservas/ })).toBeInTheDocument()
    // Reservas + Pedir Música (sempre visível).
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('navigate vai para a rota da ação', () => {
    renderQuick()
    fireEvent.click(screen.getByRole('button', { name: /Reservas/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/reservalab')
  })
})
