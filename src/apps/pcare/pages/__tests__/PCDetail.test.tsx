import { screen, render } from '@testing-library/react'
import { Routes, Route, MemoryRouter } from 'react-router-dom'
import { PCDetail } from '../PCDetail'
import { ThemeProvider } from '../../../../lib/ThemeContext'
import { seedLocalStorage, makePC, makePart } from '../../../../test/helpers'

function renderWithRoute(initialEntry: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/pc-care/pcs/:id" element={<PCDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('PCDetail', () => {
  it('renderiza detalhes do PC', () => {
    seedLocalStorage('pcs', [
      makePC({
        id: 'pc-1',
        labName: 'Lab A',
        pcNumber: 'PC-001',
        assetTag: 'TAG-001',
        roomLocation: 'Sala 101',
        specs: { cpu: 'i5', ram: '8GB', storage: '256GB' },
        config: { osType: 'windows11', osVersion: '24H2', osEdition: 'enterprise', pcType: 'academico', domain: 'animaedu.intranet' },
        cleaningStatus: 'done',
        restorationStatus: 'pending',
        softwareInstalled: ['Chrome', 'VS Code'],
      }),
    ])
    seedLocalStorage('parts', [
      makePart({ id: 'part-1', name: 'Teclado', category: 'periferico', quantity: 5, minQuantity: 2 }),
    ])

    renderWithRoute('/pc-care/pcs/pc-1')

    expect(screen.getByText(/PC-001/)).toBeInTheDocument()
    expect(screen.getByText(/Lab A/)).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('i5')).toBeInTheDocument()
    expect(screen.getByText('8GB')).toBeInTheDocument()
    expect(screen.getByText('256GB')).toBeInTheDocument()
    expect(screen.getByText('Windows 11 Enterprise 24H2')).toBeInTheDocument()
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.getByText('VS Code')).toBeInTheDocument()
  })

  it('mostra empty state quando PC nao existe', () => {
    renderWithRoute('/pc-care/pcs/id-inexistente')

    expect(screen.getByText('PC não encontrado')).toBeInTheDocument()
    expect(screen.getByText('Voltar')).toBeInTheDocument()
  })
})
