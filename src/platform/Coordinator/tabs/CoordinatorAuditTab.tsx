import { icons } from '../../../lib/icons'

/**
 * Aba "Auditoria" da Central (PR C) — estrutura preparada, conteúdo honesto.
 * Nenhuma tabela/migration/RLS de auditoria é criada nesta fase; a futura visão
 * de auditoria será somente leitura e filtrada pelo escopo de coordenação.
 */
export function CoordinatorAuditTab() {
  return (
    <section data-testid="tab-audit" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
          <icons.ui.shield size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Auditoria</h2>
          <p className="text-[10px] text-fg-muted">Registros auditados do escopo (fase futura)</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
        A visão de auditoria será apresentada aqui quando estiver pronta para consulta somente
        leitura filtrada pelas unidades sob sua coordenação. Nenhuma tabela nova, migration ou
        regra de RLS foi adicionada nesta fase.
      </p>
    </section>
  )
}