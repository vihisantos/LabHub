import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../hooks/useParts', () => ({ useParts: vi.fn() }))
vi.mock('../../hooks/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))
vi.mock('../../../../lib/useKioskMode', () => ({ useKioskMode: vi.fn() }))
vi.mock('../../../../lib/ThemeContext', () => ({ useTheme: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useTheme } from '../../../../lib/ThemeContext'
import { useKioskMode } from '../../../../lib/useKioskMode'
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
    ;(useTheme as any).mockReturnValue({ theme: 'dark', accent: 'cyan', setTheme: vi.fn(), setAccent: vi.fn() })
    ;(useKioskMode as any).mockReturnValue({ kioskMode: false, enterKiosk: vi.fn(), exitKiosk: vi.fn() })
  })

  it('renderiza título', () => {
    renderSettings()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })

  it('exibe seção Aparência', () => {
    renderSettings()
    expect(screen.getByText('Aparência')).toBeInTheDocument()
  })

  it('exibe opções de tema (Escuro, Suave, Claro)', () => {
    renderSettings()
    expect(screen.getByText('Escuro')).toBeInTheDocument()
    expect(screen.getByText('Suave')).toBeInTheDocument()
    expect(screen.getByText('Claro')).toBeInTheDocument()
  })

  it('exibe opções de cor de destaque', () => {
    renderSettings()
    expect(screen.getByText('Verde')).toBeInTheDocument()
    expect(screen.getByText('Ciano')).toBeInTheDocument()
    expect(screen.getByText('Azul')).toBeInTheDocument()
    expect(screen.getByText('Roxo')).toBeInTheDocument()
  })

  it('exibe seção Modo Quiosque', () => {
    renderSettings()
    expect(screen.getByText('Modo quiosque')).toBeInTheDocument()
  })

  it('exibe botão Ativar modo quiosque', () => {
    renderSettings()
    expect(screen.getByText('Ativar')).toBeInTheDocument()
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
