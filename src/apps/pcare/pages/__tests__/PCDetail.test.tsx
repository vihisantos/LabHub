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

    expect(screen.getAllByText('TAG-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('i5')).toBeInTheDocument()
    expect(screen.getByText('8GB')).toBeInTheDocument()
    expect(screen.getByText('256GB')).toBeInTheDocument()
  })

  it('mostra empty state quando ativo nao existe', () => {
    renderWithRoute('/pc-care/pcs/id-inexistente')

    expect(screen.getByText('Ativo não encontrado.')).toBeInTheDocument()
    expect(screen.getByText('Voltar ao inventário')).toBeInTheDocument()
  })

  it('exibe garantia e licenças com status de vencimento', () => {
    seedLocalStorage('assets', [
      {
        id: 'a-1', assetTag: 'TAG-W', equipmentType: 'Desktop', manufacturer: 'Dell', model: 'OptiPlex', serialNumber: 'SN-1', location: 'Sala 1', status: 'in_use', observations: '', technical: { operatingSystem: '', architecture: '', processor: '', memory: '', storageType: '', storageCapacity: '', storageBrand: '' }, network: { hostname: '', macEthernet: '', macWifi: '', ip: '', domain: '' }, parentAssetId: null, childAssetIds: [], photos: [],
        warranty: { vendor: 'Dell Brasil', expiresAt: '2020-01-01' },
        licenses: [{ id: 'lic-1', name: 'Windows 11 Pro', key: 'XXXX', expiresAt: '2026-01-01' }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ])

    renderWithRoute('/pc-care/pcs/a-1')

    expect(screen.getByText('Dell Brasil')).toBeInTheDocument()
    expect(screen.getByText('Windows 11 Pro')).toBeInTheDocument()
    expect(screen.getAllByText('Venceu').length).toBeGreaterThanOrEqual(1)
  })
})
