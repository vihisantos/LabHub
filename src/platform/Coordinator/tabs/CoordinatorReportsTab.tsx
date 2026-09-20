import { icons } from '../../../lib/icons'

/**
 * Aba "Relatórios" da Central (PR C) — estrutura preparada, conteúdo honesto.
 * O endpoint `/api/chamados/reports` NÃO é consumido nesta fase: a agregação
 * multiunidade exige tratamento de workspace/autorização antes de ser usada
 * pela Central (nenhuma consulta ampla sem validação de escopo).
 */
export function CoordinatorReportsTab() {
  return (
    <section data-testid="tab-reports" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
          <icons.ui.fileBarChart size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Relatórios</h2>
          <p className="text-[10px] text-fg-muted">Relatórios do escopo (fase futura)</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
        A infraestrutura de relatórios existente do app de Chamados ainda não foi habilitada na
        Central por agenda: consumir `/api/chamados/reports` aqui exige validar workspace,
        autorização e a agregação multiunidade antes de exibir qualquer número. Esta aba fica
        registrada para essa fase — sem consultas antecipadas.
      </p>
    </section>
  )
}