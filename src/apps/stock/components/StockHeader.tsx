import { Link } from 'react-router-dom'
import { icons } from '../../../lib/icons'
import { STOCK_CONTAINER_CLASS } from '../layouts/stockContainer'

interface StockHeaderProps {
  /** Título da área atual (Dashboard, Materiais, Equipamentos…). */
  title: string
  /** Exibe o botão de voltar (páginas de detalhe/edição). */
  canGoBack?: boolean
  /** Destino do botão de voltar, preservando o prefixo atual. */
  backTo?: string
  /** Ação ao tocar no bloco de título (rolar ao topo), como no header antigo. */
  onTitleClick?: () => void
  /** Unidade/workspace ativo, quando disponível no contexto. */
  unitName?: string | null
}

/**
 * Cabeçalho do app Estoque.
 *
 * Segue o padrão dos demais módulos (Patrimônio, PCare): barra fixa que usa
 * exclusivamente os tokens do Design System global — superfície, borda, texto
 * e a cor de acento ativa (`--accent`). O Estoque não define tema próprio:
 * acompanha o tema global (Claro/Sutil/Escuro) e o acento escolhido pelo
 * usuário, sem paleta fixa.
 *
 * - Identificação do Estoque, título/contexto da área e unidade ativa.
 * - Respeita a área segura superior (`safe-area-inset-top`) na PWA.
 * - Não introduz permissões nem ações novas: mantém apenas o "Voltar" que já
 *   existia nas páginas de detalhe.
 */
export function StockHeader({
  title,
  canGoBack = false,
  backTo,
  onTitleClick,
  unitName,
}: StockHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className={`${STOCK_CONTAINER_CLASS} flex items-center gap-3 py-3`}>
        {canGoBack && backTo && (
          <Link
            to={backTo}
            aria-label="Voltar"
            viewTransition
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg btn-interactive"
          >
            <icons.ui.back size={20} />
          </Link>
        )}

        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-1 ring-inset ring-[var(--accent-ring)]"
        >
          <icons.ui.package size={18} />
        </div>

        <button
          type="button"
          onClick={onTitleClick}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-fg">
            {title}
          </h1>
          <p className="truncate text-[11px] font-medium leading-tight text-[var(--accent-strong)]">
            Estoque{unitName ? ` · ${unitName}` : ''}
          </p>
        </button>
      </div>
    </header>
  )
}
