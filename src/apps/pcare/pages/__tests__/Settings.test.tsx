import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../hooks/useParts', () => ({ useParts: vi.fn() }))
vi.mock('../../hooks/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))

// RBAC 2.0 (F2-D-K): o gate destrutivo vem da nova fonte de visibilidade.
const { mockUseModuleLevel } = vi.hoisted(() => ({ mockUseModuleLevel: vi.fn() }))
vi.mock('../../../../core/permissions/useModuleVisibility', () => ({
  useModuleLevel: (...args: unknown[]) => mockUseModuleLevel(...args),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useOnlineSync } from '../../hooks/useOnlineSync'
import { usePCs } from '../../hooks/usePCs'
import { useParts } from '../../hooks/useParts'
import { Settings } from '../Settings'

function renderSettings() {
  return render(<MemoryRouter><Settings /></MemoryRouter>)
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: [], reload: vi.fn() })
    ;(useParts as any).mockReturnValue({ parts: [], reload: vi.fn() })
    ;(useOnlineSync as any).mockReturnValue({
      online: true, syncing: false, syncError: null, lastSync: null,
      pendingChanges: 0, triggerSync: vi.fn(), syncLog: [],
    })
    // Default: `pc-care` em 'full' (técnico) — a política atual do botão
    // destrutivo. O comportamento por cargo tem bloco próprio abaixo.
    mockUseModuleLevel.mockReturnValue({ level: 'full', visible: true, loading: false })
  })

  it('renderiza título', () => {
    renderSettings()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })

  it('exibe seção Exportar Dados', () => {
    renderSettings()
    expect(screen.getByText('Exportar Dados')).toBeInTheDocument()
  })

  it('exibe seção Importar Dados', () => {
    renderSettings()
    expect(screen.getByText('Importar Dados')).toBeInTheDocument()
  })

  it('exibe zona de perigo', () => {
    renderSettings()
    expect(screen.getByText('Zona de Perigo')).toBeInTheDocument()
  })

  it('exibe botão Limpar Todos os Dados', () => {
    renderSettings()
    expect(screen.getByText('Limpar Todos os Dados')).toBeInTheDocument()
  })

  it('exibe seção Sincronização', () => {
    renderSettings()
    expect(screen.getByText('Sincronização')).toBeInTheDocument()
  })

  it('exibe botão Sincronizar agora', () => {
    renderSettings()
    expect(screen.getByText('Sincronizar agora')).toBeInTheDocument()
  })

  it('exibe botão Testar conexão', () => {
    renderSettings()
    expect(screen.getByText('Testar conexão')).toBeInTheDocument()
  })

  it('exibe seção Sobre', () => {
    renderSettings()
    expect(screen.getByText('Sobre')).toBeInTheDocument()
  })

  it('exibe botão Voltar ao Início', () => {
    renderSettings()
    expect(screen.getByText('Voltar ao Início')).toBeInTheDocument()
  })

  it('navega para / ao clicar Voltar ao Início', () => {
    renderSettings()
    screen.getByText('Voltar ao Início').click()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

/**
 * F2-D-K — `pcare.data.clear` (operação DESTRUTIVA local) migrou de
 * `isFullAccess('pc-care')` para a nova fonte de visibilidade
 * (`membership → roles.slug → matriz`), preservando a política: `full` em
 * `pc-care` existe só para `tec`.
 *
 * Nenhuma Action nova foi criada (exigiria migration, fora do escopo §19) — a
 * lacuna está documentada no código e no relatório.
 */
describe('Settings — gate destrutivo de pcare.data.clear (RBAC 2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: [], reload: vi.fn() })
    ;(useParts as any).mockReturnValue({ parts: [], reload: vi.fn() })
    ;(useOnlineSync as any).mockReturnValue({
      online: true, syncing: false, syncError: null, lastSync: null,
      pendingChanges: 0, triggerSync: vi.fn(), syncLog: [],
    })
    mockUseModuleLevel.mockReturnValue({ level: 'full', visible: true, loading: false })
  })

  it('consulta o nível de pc-care na nova fonte (não usa mais isFullAccess)', () => {
    renderSettings()
    expect(mockUseModuleLevel).toHaveBeenCalledWith('pc-care')
  })

  it('pc-care em full (técnico) ⇒ botão de limpar VISÍVEL (política preservada)', () => {
    renderSettings()
    expect(screen.getByText('Limpar Todos os Dados')).toBeInTheDocument()
  })

  it.each(['read', 'dash', 'none'] as const)(
    'pc-care em %s (viewer/lider/coordinator) ⇒ botão de limpar OCULTO — não abre acidentalmente',
    (level) => {
      mockUseModuleLevel.mockReturnValue({ level, visible: level !== 'none', loading: false })
      renderSettings()
      expect(screen.queryByText('Limpar Todos os Dados')).not.toBeInTheDocument()
    },
  )

  it('fail-closed enquanto a fonte carrega ⇒ botão de limpar OCULTO (não vaza por loading)', () => {
    mockUseModuleLevel.mockReturnValue({ level: 'none', visible: false, loading: true })
    renderSettings()
    expect(screen.queryByText('Limpar Todos os Dados')).not.toBeInTheDocument()
  })
})
