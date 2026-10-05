import { Routes, Route, useSearchParams } from 'react-router-dom'
import { ChamadosLayout } from './layouts/ChamadosLayout'
import { Dashboard } from './pages/Dashboard'
import { SlaDashboard } from './pages/SlaDashboard'
import { Reports } from './pages/Reports'
import { Ranking } from './pages/Ranking'
import { TicketList } from './pages/TicketList'
import { MyTickets } from './pages/MyTickets'
import { TicketDetail } from './pages/TicketDetail'
import { Settings } from './pages/Settings'

/**
 * P0 — deep links da Central do Coordenador: quando a URL raiz /chamados traz um
 * filtro contextual (?status=, ?unassigned=1, ?priority=, ?sla=), a intenção é
 * abrir a fila filtrada. Sem filtro, a raiz continua exibindo o Dashboard.
 */
function ChamadosIndex() {
  const [searchParams] = useSearchParams()
  const hasContextualFilter =
    searchParams.has('status') ||
    searchParams.has('priority') ||
    searchParams.get('unassigned') === '1' ||
    searchParams.has('sla')
  return hasContextualFilter ? <TicketList /> : <Dashboard />
}

export function ChamadosApp() {
  return (
    <Routes>
      <Route element={<ChamadosLayout />}>
        <Route index element={<ChamadosIndex />} />
        <Route path="sla" element={<SlaDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="tickets" element={<TicketList />} />
        {/* Meus Chamados = ÁREA PESSOAL do solicitante (rota e tela próprias).
            Os dados vêm de `GET /api/chamados?mine=true` (#331) e são agrupados
            por data; não há filtro, ordenação ou ação da fila operacional aqui.
            NÃO é uma permissão nova e NÃO é `ticket.view`. */}
        <Route path="meus" element={<MyTickets />} />
        <Route path="tickets/:id" element={<TicketDetail />} />
        <Route path="settings" element={<Settings />} />
        </Route>
    </Routes>
  )
}
