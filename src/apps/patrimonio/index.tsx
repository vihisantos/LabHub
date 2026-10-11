import { Navigate, Route, Routes } from 'react-router-dom'
import { PatrimonioLayout } from './layouts/PatrimonioLayout'
import { AssetListPage } from './pages/AssetListPage'
import { AssetDetailPage } from './pages/AssetDetailPage'

/**
 * Módulo Patrimônio (issue #289, PR-3): interface de consulta do acervo.
 * Somente leitura — criação/edição e movimentações ficam para PRs seguintes.
 */
export function PatrimonioApp() {
  return (
    <Routes>
      <Route element={<PatrimonioLayout />}>
        <Route index element={<AssetListPage />} />
        <Route path=":id" element={<AssetDetailPage />} />
        <Route path="*" element={<Navigate to="/patrimonio" replace />} />
      </Route>
    </Routes>
  )
}
