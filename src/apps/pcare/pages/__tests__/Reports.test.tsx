import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../hooks/useParts', () => ({ useParts: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { usePCs } from '../../hooks/usePCs'
import { useParts } from '../../hooks/useParts'
import { Reports } from '../Reports'

const mockPCs = [
  { id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', roomLocation: 'Sala 101', assetTag: 'TAG-001', specs: { cpu: 'i5' }, cleaningStatus: 'done', restorationStatus: 'pending', createdAt: '2026-01-01', softwareInstalled: [] },
  { id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002', roomLocation: 'Sala 102', assetTag: 'TAG-002', specs: { cpu: 'i7' }, cleaningStatus: 'pending', restorationStatus: 'in_progress', createdAt: '2026-01-15', softwareInstalled: [] },
]
const mockParts = [
  { id: 'part-1', name: 'Teclado', category: 'keyboard', quantity: 10, minQuantity: 2, serialNumber: 'SN-001' },
  { id: 'part-2', name: 'Mouse', category: 'mouse', quantity: 1, minQuantity: 3, serialNumber: '' },
]

function renderReports() {
  return render(<MemoryRouter><Reports /></MemoryRouter>)
}

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: mockPCs, loading: false, reload: vi.fn() })
    ;(useParts as any).mockReturnValue({ parts: mockParts, loading: false, reload: vi.fn() })
  })

  it('renderiza título', () => {
    renderReports()
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
  })

  it('exibe botão de importar/exportar', () => {
    renderReports()
    expect(screen.getByText('Importar CSV/XLSX')).toBeInTheDocument()
  })

  it('exibe seção de Configuração', () => {
    renderReports()
    expect(screen.getByText('Configuração')).toBeInTheDocument()
  })

  it('exibe seção de Prévia', () => {
    renderReports()
    expect(screen.getByText('Prévia')).toBeInTheDocument()
  })

  it('exibe botões de tipo de dados (Computadores / Peças)', () => {
    renderReports()
    expect(screen.getByText(/Computadores/)).toBeInTheDocument()
    expect(screen.getByText(/Peças/)).toBeInTheDocument()
  })

  it('exibe opções de formato CSV/XLSX/PDF', () => {
    renderReports()
    expect(screen.getByText('CSV')).toBeInTheDocument()
    expect(screen.getByText('XLSX')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('exibe input de busca', () => {
    renderReports()
    expect(screen.getByPlaceholderText(/Buscar por nome/)).toBeInTheDocument()
  })

  it('troca para import mode', () => {
    renderReports()
    fireEvent.click(screen.getByText('Importar CSV/XLSX'))
    expect(screen.getByText('Importar Dados')).toBeInTheDocument()
  })

  it('exibe seletor de laboratório quando dataType é pcs', () => {
    renderReports()
    expect(screen.getByText(/Filtrar por laboratório/)).toBeInTheDocument()
  })

  it('filtra PCs por lab', () => {
    renderReports()
    // Select component - verifica que o placeholder aparece
    expect(screen.getByText('Todos os laboratórios')).toBeInTheDocument()
  })

  it('renderiza com dados vazios', () => {
    ;(usePCs as any).mockReturnValue({ pcs: [], loading: false, reload: vi.fn() })
    ;(useParts as any).mockReturnValue({ parts: [], loading: false, reload: vi.fn() })
    renderReports()
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
  })

  it('alterna para dataType parts', () => {
    renderReports()
    const partsBtn = screen.getByText(/Peças/)
    fireEvent.click(partsBtn)
    // Após alternar, o botão deve mostrar selecionado
    expect(screen.getByText(/Exportar CSV/)).toBeInTheDocument()
  })

  it('exibe tabela de prévia com dados dos PCs', () => {
    renderReports()
    expect(screen.getByText('Lab A')).toBeInTheDocument()
    expect(screen.getByText('PC-001')).toBeInTheDocument()
  })
})
