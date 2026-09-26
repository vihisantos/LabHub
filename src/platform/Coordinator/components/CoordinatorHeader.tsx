import { icons } from '../../../lib/icons'

interface CoordinatorHeaderProps {
  onBack: () => void
}

/**
 * Cabeçalho da Área do Coordenador: voltar ao início, selo "Coordenação" e
 * título + resumo. Extraído do shell para manter a tela como composição de
 * blocos funcionais; sem lógica de dados própria.
 *
 * PR4 — identidade visual: hierarquia em camadas (voltar → selo → título),
 * hairline de accent discretíssimo na base do cabeçalho e ring de foco no
 * botão de voltar. Mantém os textos/semânticos já contratados (h1 "Área do
 * Coordenador") e usa só tokens + accent violeta da Central, de forma
 * controlada.
 */
export function CoordinatorHeader({ onBack }: CoordinatorHeaderProps) {
  return (
    <header className="relative mb-6 pb-6 sm:mb-8 sm:pb-7">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-card text-fg-dim shadow-[var(--shadow-card)] transition-colors hover:bg-input hover:text-fg active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          title="Voltar ao início"
        >
          <icons.ui.back size={20} />
        </button>
        <span className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1 text-[10px] font-semibold tracking-wide text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
          <icons.ui.shield size={12} />
          Coordenação
        </span>
      </div>
      <div className="mt-5">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Área do Coordenador
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
          Gestão entre as unidades sob sua coordenação — dados reais do seu escopo.
        </p>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-violet-500/50 via-violet-500/15 to-transparent"
      />
    </header>
  )
}