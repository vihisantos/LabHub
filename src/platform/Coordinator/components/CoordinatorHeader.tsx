import { icons } from '../../../lib/icons'

interface CoordinatorHeaderProps {
  onBack: () => void
}

/**
 * Cabeçalho da Área do Coordenador: voltar ao início, selo "Coordenação" e
 * título + resumo. Extraído do shell para manter a tela como composição de
 * blocos funcionais; sem lógica de dados própria.
 *
 * PR1 — versão premium: mais respiro (`mb-8`), botão de voltar com toque
 * suave e título maior com tracking, mantendo os textos e semanticos já
 * contratados (h1 "Área do Coordenador"). Só tokens de tema; accent apenas no
 * selo (informação de papel).
 */
export function CoordinatorHeader({ onBack }: CoordinatorHeaderProps) {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-card text-fg-dim shadow-[var(--shadow-card)] transition-colors hover:bg-input hover:text-fg active:scale-[0.97]"
          title="Voltar ao início"
        >
          <icons.ui.back size={20} />
        </button>
        <span className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
          <icons.ui.shield size={12} />
          Coordenação
        </span>
      </div>
      <div className="mt-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Área do Coordenador
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
          Gestão entre as unidades sob sua coordenação — dados reais do seu escopo.
        </p>
      </div>
    </header>
  )
}