/**
 * F2-D-L — equivalência dos CONSUMIDORES de visibilidade.
 *
 * O F2-D-K provou que a matriz nova é idêntica a `DEFAULT_ROLES`. Aqui se
 * prova que cada consumidor migrado chega ao MESMO resultado, e que os guards
 * que NÃO DEVEM ser migrados continuam com o mecanismo próprio.
 *
 * Consumers exercitados: AppGuard, HomePage (Dashboard vs Launcher), Launcher e
 * ReservaLab (`dash`/`read`/`full`). `visibility.ts` é coberto no próprio
 * arquivo dele; `NotificationRulesTab`, QuickActions, ModuleStats,
 * CommandPalette e as abas do Coordinator continuam cobertos pelos testes que
 * já existiam (adaptados à nova fonte).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { moduleLevelForSlug } from '../moduleVisibility'

// O Launcher/ReservaLab usam `matchMedia` e o ecosystemo do Coordinator consulta
// `get_coordinator_units`; ambos são irrelevantes para a visibilidade testada.
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as never
}
vi.mock('../../../platform/Coordinator/tabs/CoordinatorEcosystemTab', () => ({
  CoordinatorEcosystemTab: () => null,
}))
// Componentes do shell do ReservaLab, irrelevantes para o nível do módulo.
vi.mock('../../../apps/reservalab/components/BackgroundAI', () => ({ BackgroundAI: () => null }))
vi.mock('../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))

// ── Matriz espelhada do F2-D-K (célula a célula) ────────────────────────────
const MATRIX: Record<string, Partial<Record<string, string>>> = {
  tec: { 'pc-care': 'full', stock: 'full', reservalab: 'read', chamados: 'full' },
  vis: { 'pc-care': 'read', stock: 'read', reservalab: 'dash', chamados: 'read' },
  lider: { 'pc-care': 'read', stock: 'read', chamados: 'full' },
  coordinator: { 'pc-care': 'read', stock: 'read', tv: 'read', chamados: 'full', reservalab: 'read' },
}
const MODULES = ['dashboard', 'pc-care', 'stock', 'reservalab', 'tv', 'chamados', 'admin']

const { mockUseModuleLevel, mockUseModuleVisibilities } = vi.hoisted(() => ({
  mockUseModuleLevel: vi.fn(),
  mockUseModuleVisibilities: vi.fn(),
}))

vi.mock('../../permissions/useModuleVisibility', () => ({
  useModuleLevel: (...args: unknown[]) => mockUseModuleLevel(...args),
  useModuleVisibilities: (...args: unknown[]) => mockUseModuleVisibilities(...args),
}))

// A fonte real é testada em moduleVisibility.test.ts; aqui o hook é controlado
// pelo slug resolvido, para dirigir cada consumidor por cargo.
function primeSource(slug: keyof typeof MATRIX | 'super' | null) {
  mockUseModuleLevel.mockImplementation((appId: string) => {
    if (slug === 'super') return { level: 'full', visible: true, loading: false }
    const level = slug ? (moduleLevelForSlug(slug, appId) as 'dash' | 'read' | 'full' | 'none') : 'none'
    return { level, visible: level !== 'none', loading: false }
  })
  mockUseModuleVisibilities.mockImplementation((_appIds: readonly string[]) => ({
    levelOf: (appId: string | undefined) => {
      if (!appId) return 'none' as const
      if (slug === 'super') return 'full' as const
      return moduleLevelForSlug(slug, appId)
    },
    isVisible: (appId: string | undefined) => {
      if (!appId) return false
      if (slug === 'super') return true
      return moduleLevelForSlug(slug, appId) !== 'none'
    },
    loading: false,
  }))
}

import { AppGuard } from '../../auth/AppGuard'
import { HomePage } from '../../../platform/Dashboard/HomePage'
import { Launcher } from '../../../platform/Launcher/Launcher'
import { ReservaLabLayout } from '../../../apps/reservalab/layouts/ReservaLabLayout'

vi.mock('../../workspaces/store', () => ({
  workspaceStore: {
    get activeWorkspaceId() { return 'ws-a' },
    get isAdmin() { return false },
    get userWorkspaceIds() { return ['ws-a'] },
    filter: <T,>(rows: T[]) => rows,
    matches: () => true,
    set: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}))

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', is_super_admin: slugIs('super') }, loading: false }),
}))
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', is_super_admin: slugIs('super') }, loading: false }),
}))
vi.mock('../../workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: currentWorkspace(), workspaces: [currentWorkspace()] }),
}))
vi.mock('../../../platform/Dashboard/DashboardPage', () => ({ DashboardPage: () => <div>PAINEIS</div> }))

let slugAtual: string | null = null
let wsAtual: { id: string; name: string; slug: string; disabled_apps: string[] } = {
  id: 'ws-a', name: 'Campus A', slug: 'ws-a', disabled_apps: [],
}
function slugIs(s: string) { return slugAtual === s }
function currentWorkspace() { return wsAtual }

beforeEach(() => {
  vi.clearAllMocks()
  slugAtual = null
  wsAtual = { id: 'ws-a', name: 'Campus A', slug: 'ws-a', disabled_apps: [] }
  primeSource(null)
})

function renderGuard(appId: string) {
  return render(
    <MemoryRouter>
      <AppGuard appId={appId}>
        <div>CONTEUDO</div>
      </AppGuard>
    </MemoryRouter>,
  )
}

describe('AppGuard — nova fonte (F2-D-L)', () => {
  it.each(['tec', 'vis', 'lider', 'coordinator'] as const)(
    '%s: cada módulo visível pela matriz entra; os ocultos, não',
    (slug) => {
      primeSource(slug)
      for (const appId of MODULES) {
        const esperado = MATRIX[slug][appId]
        const { unmount } = renderGuard(appId)
        if (esperado) {
          expect(screen.getByText('CONTEUDO'), `${slug} devia entrar em ${appId}`).toBeInTheDocument()
        } else {
          expect(
            screen.queryByText('CONTEUDO'),
            `${slug} NÃO devia entrar em ${appId}`,
          ).not.toBeInTheDocument()
          expect(screen.getByText(/Acesso restrito/)).toBeInTheDocument()
        }
        unmount()
      }
    },
  )

  it('super admin entra em todos os módulos, inclusive dashboard/admin', () => {
    slugAtual = 'super'
    primeSource('super')
    for (const appId of MODULES) {
      const { unmount } = renderGuard(appId)
      expect(screen.getByText('CONTEUDO'), appId).toBeInTheDocument()
      unmount()
    }
  })

  it('dashboard e admin não são abertos por nenhum cargo da matriz', () => {
    for (const slug of ['tec', 'vis', 'lider', 'coordinator'] as const) {
      primeSource(slug)
      for (const appId of ['dashboard', 'admin']) {
        const { unmount } = renderGuard(appId)
        expect(screen.queryByText('CONTEUDO')).not.toBeInTheDocument()
        unmount()
      }
    }
  })

  it('módulo desabilitado na unidade ⇒ tela "Indisponível", NÃO "Acesso restrito"', () => {
    primeSource('tec')
    wsAtual = { ...wsAtual, disabled_apps: ['pc-care'] }
    renderGuard('pc-care')
    expect(screen.getByText(/Indisponível neste workspace/)).toBeInTheDocument()
    expect(screen.queryByText(/Acesso restrito/)).not.toBeInTheDocument()
  })

  it('fail-closed enquanto a fonte carrega (não mostra conteúdo)', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'none', visible: false, loading: true })
    renderGuard('pc-care')
    expect(screen.queryByText('CONTEUDO')).not.toBeInTheDocument()
    expect(screen.getByText('Verificando acesso...')).toBeInTheDocument()
  })
})

describe('HomePage — a Home não decide mais Dashboard vs Launcher (F2-D-L)', () => {
  function renderHome() {
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
  }

  /* A Home virou composição única (PR #316): ela renderiza `HomeView` para
     qualquer cargo, e as métricas do Dashboard saíram de `/` para a rota
     `/dashboard`, atrás do `AppGuard appId="dashboard"` — que é onde a fonte
     nova é exercitada de verdade (bloco "AppGuard - nova fonte" acima).
     O teste original deste arquivo ainda exigia o split antigo
     (Dashboard para super admin, Launcher para os demais) e passou a esperar um
     componente que a Home não monta mais. Aqui o que se prova é o que vale
     hoje: a Home não vaza métrica de módulo para nenhum cargo. */

  it('nenhum cargo, nem super admin, recebe os painéis na Home', () => {
    for (const slug of ['tec', 'vis', 'lider', 'coordinator', 'super'] as const) {
      primeSource(slug)
      const { unmount } = renderHome()
      expect(screen.getByText('Que bom te ver por aqui!')).toBeInTheDocument()
      expect(screen.queryByText('PAINEIS')).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('Launcher — cards pela nova fonte (F2-D-L)', () => {
  function renderLauncher() {
    return render(
      <MemoryRouter>
        <Launcher />
      </MemoryRouter>,
    )
  }

  it('técnico vê PC Care, Estoque e Chamados (e não TV/Admin/Dashboard)', () => {
    primeSource('tec')
    renderLauncher()
    expect(screen.getAllByText('PC Care').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Estoque').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Chamados').length).toBeGreaterThan(0)
    expect(screen.queryByText('TV')).not.toBeInTheDocument()
    expect(screen.queryByText('Administração')).not.toBeInTheDocument()
  })

  it('viewer vê PC Care/Estoque/Chamados, mas o Launcher não mostra nível', () => {
    primeSource('vis')
    renderLauncher()
    expect(screen.getAllByText('PC Care').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Chamados').length).toBeGreaterThan(0)
  })

  it('coordenador vê TV (read) — caso em que Action e visibilidade divergem', () => {
    primeSource('coordinator')
    renderLauncher()
    expect(screen.getAllByText('TV').length).toBeGreaterThan(0)
  })

  it('lider NÃO vê TV nem ReservaLab', () => {
    primeSource('lider')
    renderLauncher()
    expect(screen.queryByText('TV')).not.toBeInTheDocument()
    expect(screen.queryByText('ReservaLab')).not.toBeInTheDocument()
    expect(screen.getAllByText('Chamados').length).toBeGreaterThan(0)
  })
})

describe('ReservaLab — níveis preservados (F2-D-L)', () => {
  // Rotas aninhadas REAIS: o `Outlet` do Layout precisa de um contexto de rota
  // para que o redirect de `dash` seja observável (é o comportamento que o
  // F2-D-J marcou como "não achatar em booleano").
  function renderReservaLab(path = '/reservalab') {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reservalab" element={<ReservaLabLayout />}>
            <Route index element={<div>RAIZ_RESERVAS</div>} />
            <Route path="dashboard" element={<div>PAINEL_RESERVAS</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  it("viewer (dash) ⇒ a raiz REDIRECIONA para o painel (Layout preservado)", () => {
    primeSource('vis')
    expect(moduleLevelForSlug('vis', 'reservalab')).toBe('dash')
    renderReservaLab('/reservalab')
    expect(screen.getByText('PAINEL_RESERVAS')).toBeInTheDocument()
    expect(screen.queryByText('RAIZ_RESERVAS')).not.toBeInTheDocument()
  })

  it('técnico (read) NÃO redireciona: a raiz é acessível', () => {
    primeSource('tec')
    expect(moduleLevelForSlug('tec', 'reservalab')).toBe('read')
    renderReservaLab('/reservalab')
    expect(screen.getByText('RAIZ_RESERVAS')).toBeInTheDocument()
    expect(screen.queryByText('PAINEL_RESERVAS')).not.toBeInTheDocument()
  })

  it('coordenador (read) também não redireciona', () => {
    primeSource('coordinator')
    renderReservaLab('/reservalab')
    expect(screen.getByText('RAIZ_RESERVAS')).toBeInTheDocument()
  })

  it('nenhum cargo da matriz tem full em reservalab (só o bypass do super admin)', () => {
    for (const slug of ['tec', 'vis', 'lider', 'coordinator']) {
      expect(moduleLevelForSlug(slug, 'reservalab')).not.toBe('full')
    }
    // `full` abre o UpcomingReservationPopup (que consulta reservas) — segue
    // restrito ao super admin, exatamente como antes.
    primeSource('super')
    expect(mockUseModuleLevel('reservalab', { ignoreDisabledApps: true }).level).toBe('full')
  })
})

describe('guards que NÃO migraram (devem continuar próprios)', () => {
  it('a nova fonte não é usada por AdminGuard/LeadershipAreaGuard', () => {
    // Estrutural: nenhum dos dois importa `useModuleVisibility`.
    // Eles decidem por `is_super_admin` e por membership + RPC, respectivamente.
    const appGuard = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../auth/AdminGuard.tsx'), 'utf8')
    const leadership = require('fs').readFileSync(
      require('path').resolve(__dirname, '../LeadershipAreaGuard.tsx'), 'utf8')
    expect(appGuard).not.toContain('useModuleVisibility')
    expect(leadership).not.toContain('useModuleVisibility')
    // E o AdminGuard decide por is_super_admin.
    expect(appGuard).toContain('is_super_admin')
  })
})

describe('nenhum consumidor de produção ficou na fonte legada', () => {
  // Trava permanente do §22 (F2-D-L) — ampliada no F2-D-N1 e F2-D-N2.
  //
  // A primeira versão cobria só a VISIBILIDADE (`useAppAccess`/`getLevel`/
  // `canAccessApp`/`isFullAccess`). O F2-D-N1 somou os gates de ESCRITA
  // (`canWriteApp`/`requireWrite`, que decidem por `resolveAppAccess` → `User.
  // app_access`/`Role.appAccess`). O F2-D-N2 removeu toda a implementação, então
  // a lista de permitidos ficou VAZIA: nenhuma exceção é necessária.
  //
  // Se alguém reintroduzir qualquer uma destas APIs, o teste falha. Os padrões
  // casam o IDENTIFICADOR (não só a chamada), cobrindo consumo desestruturado,
  // referência e passagem como callback — todas continuam sendo autorização
  // legada.
  const LEGADO_PERMITIDO = new Set<string>([
    // NENHUMA exceção. A implementação legada foi removida; os três services
    // que ainda a usavam (roomService, partUsageService, pcChecklistService)
    // tiveram os métodos de escrita removidos, e o último foi deletado.
  ])
  const PADROES: Array<[RegExp, string]> = [
    [/useAppAccess\b/, 'useAppAccess'],
    [/\bgetLevel\b/, 'getLevel'],
    [/\bcanAccessApp\b/, 'canAccessApp'],
    [/\bisFullAccess\b/, 'isFullAccess'],
    // Gates de escrita legados (F2-D-N1 §8): decidem por resolveAppAccess.
    [/\bcanWriteApp\b/, 'canWriteApp'],
    [/\brequireWrite\b/, 'requireWrite'],
    // A resolução raiz, de onde saía `user.app_access` (F2-D-N2 §4).
    [/\bresolveAppAccess\b/, 'resolveAppAccess'],
    [/\bappAccess\b/, 'appAccess'],
  ]

  it('nenhum arquivo de produção consome a visibilidade legada', () => {
    const raiz = require('path').resolve(__dirname, '../../..')
    const offenders: string[] = []

    const andar = (dir: string) => {
      for (const entrada of require('fs').readdirSync(dir, { withFileTypes: true })) {
        const abs = require('path').join(dir, entrada.name)
        const rel = abs.slice(raiz.length + 1).replace(/\\/g, '/')
        if (entrada.isDirectory()) {
          if (['__tests__', 'node_modules', 'dist'].includes(entrada.name)) continue
          andar(abs)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entrada.name) || LEGADO_PERMITIDO.has(rel)) continue
        // Comentários explicam a migração e citam a API legada de propósito
        // (`canAccessApp` era o que o componente usava antes). A trava vale para
        // CÓDIGO, então as listas de comentários saem antes do teste.
        const fonte = require('fs')
          .readFileSync(abs, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        for (const [re, rotulo] of PADROES) {
          if (re.test(fonte)) offenders.push(`${rel} usa ${rotulo}`)
        }
      }
    }
    andar(raiz)

    expect(offenders).toEqual([])
  })

  it('o detector realmente pega a cadeia legada (trava não-vazia)', () => {
    // Uma trava que nunca falharia não é trava. Aqui a MESMA lógica de
    // detecção (padrões + remoção de comentários) é exercitada contra fontes
    // sintéticas, cobrindo as formas como a cadeia volta de fato:
    //   · acesso por propriedade — `permissionService.requireWrite('x')`
    //   · acesso desestruturado  — `const { requireWrite } = usePermissions()`
    const detectar = (fonte: string): string[] => {
      const limpo = fonte
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      return PADROES.filter(([re]) => re.test(limpo)).map(([, rotulo]) => rotulo)
    }

    expect(detectar(`permissionService.requireWrite('chamados')`)).toEqual(['requireWrite'])
    expect(detectar(`permissionService.canWriteApp('stock')`)).toEqual(['canWriteApp'])
    expect(detectar(`const { requireWrite, canWriteApp } = usePermissions()`)).toEqual(
      expect.arrayContaining(['requireWrite', 'canWriteApp']),
    )
    expect(detectar(`permissionService.resolveAppAccess(role, user, 'tv')`)).toEqual(['resolveAppAccess'])
    expect(detectar(`const { getLevel } = useAppAccess()`)).toEqual(
      expect.arrayContaining(['useAppAccess', 'getLevel']),
    )
    // E NÃO dispara em código legítimo: quem escreve de verdade usa a Action,
    // quem vê módulo usa a matriz RBAC2.
    expect(detectar(`const { allowed } = useCanAccessAction('ticket.edit')`)).toEqual([])
    expect(detectar(`const { isVisible } = useModuleVisibilities(['tv'])`)).toEqual([])
    // Mesmo uma referência sem chamada é consumo legado e é barrada: passar o
    // gate adiante (callback, comparação) autorizaria igual.
    expect(detectar(`if (roomService.requireWrite) {}`)).toEqual(['requireWrite'])
    // Comentário mencionando a API legada não pode trippingar a trava.
    expect(detectar(`// antes era permissionService.requireWrite('pc-care')`)).toEqual([])
  })
})

describe('a matriz do F2-D-K não foi alterada', () => {
  it('segue idêntica à política do F2-D-J (e adm continua fora dela)', () => {
    for (const [slug, esperado] of Object.entries(MATRIX)) {
      for (const appId of MODULES) {
        expect(moduleLevelForSlug(slug, appId)).toBe(esperado[appId] ?? 'none')
      }
    }
    // Decisão F2-D-L (A1): `adm` não ganha linha na matriz.
    for (const appId of MODULES) {
      expect(moduleLevelForSlug('adm', appId)).toBe('none')
    }
    // F2-D-N2: o oráculo passou a ser a matriz RBAC2, e não mais
    // `DEFAULT_ROLES[].appAccess` (removido junto com a cadeia legada).
  })
})
