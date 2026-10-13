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
 * Cabeçalho exclusivo do app Estoque (identidade Industrial Premium).
 *
 * - Azul-marinho profundo como superfície estrutural e ciano como acento.
 * - Identificação do LabHub Stock, título/contexto da área e unidade ativa.
 * - Pertence ao app Stock: não é usado pela Home global nem por outros apps.
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
      className="sticky top-0 z-30 border-b border-stock-cyan/20 bg-gradient-to-r from-stock-navy via-stock-navy to-stock-navy-soft text-stock-ink"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className={`${STOCK_CONTAINER_CLASS} flex items-center gap-3 py-3`}>
        {canGoBack && backTo && (
          <Link
            to={backTo}
            aria-label="Voltar"
            viewTransition
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-stock-ink transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stock-cyan btn-interactive"
          >
            <icons.ui.back size={20} />
          </Link>
        )}

        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stock-cyan/15 text-stock-cyan ring-1 ring-inset ring-stock-cyan/30"
        >
          <icons.ui.package size={19} />
        </div>

        <button
          type="button"
          onClick={onTitleClick}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stock-cyan"
        >
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-stock-ink">
            {title}
          </h1>
          <p className="truncate text-[11px] font-medium leading-tight text-stock-ink-dim">
            Estoque{unitName ? ` · ${unitName}` : ''}
          </p>
        </button>
      </div>
    </header>
  )
}
