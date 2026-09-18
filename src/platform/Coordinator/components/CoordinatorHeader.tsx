import { icons } from '../../../lib/icons'

interface CoordinatorHeaderProps {
  onBack: () => void
}

/**
 * Cabeçalho da Área do Coordenador: voltar ao início, selo "Coordenação" e
 * título + resumo. Extraído do shell para manter a tela como composição de
 * blocos funcionais; sem lógica de dados própria.
 */
export function CoordinatorHeader({ onBack }: CoordinatorHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
          title="Voltar ao início"
        >
          <icons.ui.back size={20} />
        </button>
        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
          Coordenação
        </span>
      </div>
      <div className="mt-5">
        <h1 className="text-2xl font-bold text-fg">Área do Coordenador</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Gestão entre as unidades sob sua coordenação — dados reais do seu escopo.
        </p>
      </div>
    </header>
  )
}