import { Link, Outlet, useLocation } from 'react-router-dom'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { icons } from '../../../lib/icons'

/**
 * Moldura do módulo Patrimônio: cabeçalho fixo com a unidade ativa (contexto
 * global — sem seletor de unidade aqui) e o conteúdo das páginas.
 */
export function PatrimonioLayout() {
  const location = useLocation()
  const { workspace } = useWorkspace()
  const isDetail = location.pathname !== '/patrimonio' && location.pathname !== '/patrimonio/'

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/80 px-4 py-3.5 backdrop-blur-xl">
        {isDetail && (
          <Link
            to="/patrimonio"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Voltar para a lista"
          >
            <icons.ui.back size={20} />
          </Link>
        )}
        <div className="flex min-w-0 flex-col">
          <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-fg">
            Patrimônio
          </h1>
          <p className="truncate text-[11px] font-medium leading-tight text-sky-500">
            {workspace?.name ?? 'Unidade não selecionada'}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full flex-1 px-4 py-4 md:max-w-3xl">
        <Outlet />
      </main>
    </div>
  )
}
