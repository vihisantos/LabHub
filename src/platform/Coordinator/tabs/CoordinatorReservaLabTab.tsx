import { icons } from '../../../lib/icons'

/**
 * Aba "ReservaLab" da Central (PR C) — estrutura preparada, conteúdo honesto.
 * Nenhuma integração nova é feita nesta fase: o app ReservaLab segue
 * workspace-scoped e a visão consolidada por escopo de coordenação será
 * apresentada aqui quando existir validação multiunidade adequada.
 */
export function CoordinatorReservaLabTab() {
  return (
    <section data-testid="tab-reservalab" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
          <icons.ui.flaskConical size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">ReservaLab</h2>
          <p className="text-[10px] text-fg-muted">Visão consolidada do ReservaLab</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
        Nesta fase a Central prepara o espaço, mas ainda não traz reservas/labs consolidados:
        o ReservaLab é um app por unidade e a visão multiunidade exige validação de autorização
        por escopo antes de agregar qualquer dado aqui. Enquanto isso, cada unidade continua
        operando no próprio ReservaLab — sem bypass do workspace ativo.
      </p>
    </section>
  )
}