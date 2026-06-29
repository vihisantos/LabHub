import { useMemo } from 'react'

interface Feature {
  id: number
  cat: 'high' | 'mid' | 'low'
  name: string
  desc: string
  effort: 'low' | 'med' | 'high'
  done: boolean
}

const FEATURES: Feature[] = [
  { id: 1, cat: 'high', name: 'Autenticação (Supabase Auth)', desc: 'Login com email/senha, rastreabilidade de quem fez o quê', effort: 'med', done: false },
  { id: 2, cat: 'high', name: 'Indicador de Sync em Tempo Real', desc: 'Badge de status: Salvo / Sincronizando / Offline', effort: 'low', done: true },
  { id: 3, cat: 'high', name: 'Upload de Fotos (Supabase Storage)', desc: 'Fotos de PCs e itens de estoque no Supabase Storage', effort: 'med', done: false },
  { id: 4, cat: 'high', name: 'Dashboard com Gráficos', desc: 'Gráficos de barras/pizza, timeline de manutenções (Recharts)', effort: 'med', done: true },
  { id: 56, cat: 'high', name: 'Redesign Visual Stock (Apple Design)', desc: 'Redesign completo com cards, segmented controls, tipografia Apple', effort: 'high', done: true },

  { id: 5, cat: 'mid', name: 'Operações em Lote', desc: 'Selecionar múltiplos PCs/itens e ações coletivas', effort: 'med', done: false },
  { id: 6, cat: 'mid', name: 'Notificações Push', desc: 'Alertas de manutenção e sync via Push API', effort: 'high', done: false },
  { id: 7, cat: 'mid', name: 'Importar Dados (CSV/Excel)', desc: 'Importar planilhas existentes do laboratório', effort: 'med', done: false },
  { id: 8, cat: 'mid', name: 'Tema Customizável (Cor de Destaque)', desc: 'Seletor de cor primária nas Configurações', effort: 'med', done: true },
  { id: 57, cat: 'mid', name: 'Tema Isolado por App', desc: 'Cada app mantém seu próprio tema (dark/light) independente', effort: 'low', done: true },
  { id: 9, cat: 'mid', name: 'Relatórios com Filtros Avançados', desc: 'Filtrar por período, laboratório, tipo antes de exportar', effort: 'med', done: false },
  { id: 10, cat: 'mid', name: 'Deploy Automático (Vercel)', desc: 'Deploy automático ao push na main', effort: 'low', done: true },
  { id: 11, cat: 'mid', name: 'Atalhos de Teclado', desc: 'Ctrl+N, Ctrl+F, Escape para navegação rápida', effort: 'low', done: true },
  { id: 12, cat: 'mid', name: 'Detecção de Tema do Sistema', desc: 'Respeitar prefers-color-scheme do SO', effort: 'low', done: true },
  { id: 13, cat: 'mid', name: 'Histórico de Atividades Global', desc: 'Timeline consolidada de todas as ações', effort: 'med', done: false },
  { id: 14, cat: 'mid', name: 'Página Offline Customizada', desc: 'offline.html com identidade visual do LabHub', effort: 'low', done: true },
  { id: 15, cat: 'mid', name: 'Testes E2E (Playwright)', desc: 'Testes de fluxo completo: criar → listar → editar', effort: 'high', done: false },
  { id: 16, cat: 'mid', name: 'Gerador de Etiquetas QR', desc: 'Folha A4 com múltiplos QR codes para impressão', effort: 'low', done: true },
  { id: 17, cat: 'mid', name: 'Wizard de Cadastro em Massa', desc: 'Cadastro rápido com numeração sequencial', effort: 'low', done: true },
  { id: 18, cat: 'mid', name: 'Mapa do Laboratório', desc: 'Editor visual de mapa da sala com grid de posições', effort: 'high', done: false },
  { id: 19, cat: 'mid', name: 'Multilab — Troca Rápida', desc: 'Seletor de laboratório ativo no header', effort: 'low', done: true },
  { id: 20, cat: 'mid', name: 'Checklist com Foto', desc: 'Capturar foto durante execução de checklist', effort: 'med', done: false },

  { id: 21, cat: 'low', name: 'Histórico por Peça', desc: 'Rastreabilidade completa de peças trocadas', effort: 'med', done: false },
  { id: 22, cat: 'low', name: 'Sync Periódico (Polling)', desc: 'Re-sincronizar a cada 30s via Service Worker', effort: 'med', done: false },
  { id: 23, cat: 'low', name: 'Atalho "Avançar Status" no Card', desc: 'Botão rápido para avançar status sem abrir detalhe', effort: 'low', done: true },
  { id: 24, cat: 'low', name: 'Comparar PCs Lado a Lado', desc: 'Tela dividida com specs e status comparados', effort: 'med', done: false },
  { id: 25, cat: 'low', name: 'Backup Manual (Exportar/Importar JSON)', desc: 'Exportar/importar todos os dados como .json', effort: 'low', done: true },
  { id: 26, cat: 'low', name: 'Suporte Multilíngue (i18n)', desc: 'Português e Inglês com react-i18next', effort: 'high', done: false },
  { id: 27, cat: 'low', name: 'Gestão de Garantia e Licenças', desc: 'Alertas de vencimento de garantia e software', effort: 'med', done: false },
  { id: 28, cat: 'low', name: 'Rastreamento por QR Code', desc: 'Leitura de QR code com navegação direta para o PC cadastrado', effort: 'med', done: true },
  { id: 29, cat: 'low', name: 'Modo Foco / Kiosk', desc: 'Interface mínima sem distrações para tablets', effort: 'med', done: true },
  { id: 30, cat: 'low', name: 'Vincular Periféricos aos PCs', desc: 'Mouse, teclado, monitor vinculados ao PC', effort: 'med', done: false },
  { id: 31, cat: 'low', name: 'Histórico de Conexão (Sync Status)', desc: 'Status de sync, ping, log de erros', effort: 'low', done: true },
  { id: 32, cat: 'low', name: 'Tour / Onboarding Integrado', desc: 'Overlay com passos para novo usuário', effort: 'med', done: false },
  { id: 33, cat: 'low', name: 'Resolução de Conflitos de Sync', desc: 'Modal com diff lado a lado para conflitos', effort: 'med', done: false },
  { id: 34, cat: 'low', name: 'Compartilhar PC via QR', desc: 'QR code com link direto para detalhe do PC', effort: 'low', done: true },
  { id: 35, cat: 'low', name: 'Ronda Diária de Laboratório', desc: 'Checklist rápido: todos os PCs ligados e respondendo', effort: 'med', done: false },
  { id: 36, cat: 'low', name: 'Sugestão de Reposição de Peças', desc: 'Calcular consumo médio e sugerir compra', effort: 'low', done: true },
  { id: 37, cat: 'low', name: 'Atalho "Desfazer" (Undo)', desc: 'Ctrl+Z e toast com opção de desfazer', effort: 'high', done: false },
  { id: 38, cat: 'low', name: 'Feed de Atividades Global', desc: 'Timeline consolidada com filtros por dia', effort: 'med', done: false },
  { id: 39, cat: 'low', name: 'Inventário Cíclico (Stock)', desc: 'Contagem física periódica com divergência', effort: 'high', done: true },
  { id: 40, cat: 'low', name: 'Pré-visualização QR na Lista', desc: 'Ícone de QR no card com preview em modal', effort: 'low', done: true },
  { id: 41, cat: 'low', name: 'Modo Noturno Automático', desc: 'Tema escuro à noite, claro de dia', effort: 'low', done: true },
  { id: 42, cat: 'low', name: 'Grade de Horários de Manutenção', desc: 'Calendário com manutenções agendadas', effort: 'med', done: true },
  { id: 43, cat: 'low', name: 'Consolidado de Estoque por Lab', desc: 'Visão de estoque por laboratório', effort: 'med', done: true },
  { id: 44, cat: 'low', name: 'Assistente de Migração', desc: 'Migrar dados antigos do localStorage automaticamente', effort: 'med', done: false },
  { id: 45, cat: 'low', name: 'Plugins / Extensões', desc: 'Sistema de plugins para funcionalidades customizadas', effort: 'high', done: false },
  { id: 46, cat: 'low', name: 'Exportar Dashboard como Imagem', desc: 'Download do dashboard como PNG via html2canvas', effort: 'low', done: true },
  { id: 47, cat: 'low', name: 'Central de Notificações', desc: 'Ícone de sino com badge e lista de alertas', effort: 'high', done: false },
  { id: 48, cat: 'low', name: 'Rascunho Automático', desc: 'Auto-save de formulários a cada 5s', effort: 'low', done: true },
  { id: 49, cat: 'low', name: 'Web Vitals', desc: 'Coletar LCP, FID, CLS para monitoramento', effort: 'med', done: false },
  { id: 50, cat: 'low', name: 'IndexedDB (Storage)', desc: 'Migrar dados do localStorage para IndexedDB', effort: 'high', done: false },
  { id: 51, cat: 'low', name: 'LED Virtual de Status', desc: 'Indicador colorido no card: verde/amarelo/vermelho', effort: 'low', done: true },
  { id: 52, cat: 'low', name: 'Timeline Gráfica', desc: 'Timeline horizontal com bolhas por data', effort: 'med', done: false },
  { id: 53, cat: 'low', name: 'Print Styles', desc: 'CSS @media print para relatórios e detalhes', effort: 'low', done: true },
  { id: 54, cat: 'low', name: 'Laboratórios Favoritos', desc: 'Marcar labs como favoritos e filtrar', effort: 'low', done: true },
  { id: 55, cat: 'low', name: 'Quick Stats Widget', desc: 'Resumo colapsável: pendências e urgências', effort: 'low', done: true },

  { id: 58, cat: 'high', name: 'Workflow Entrada/Saída (Stock)', desc: 'Registrar entrada e saída de itens com movimentação automática', effort: 'med', done: true },

  { id: 59, cat: 'mid', name: 'Editar/Deletar Itens no Stock', desc: 'Botões de edição e exclusão no StockDetail', effort: 'low', done: true },
  { id: 60, cat: 'mid', name: 'Editar/Deletar Kits', desc: 'Edição de nome/sala/itens e exclusão de kits', effort: 'low', done: true },
  { id: 61, cat: 'mid', name: 'Alerta Empréstimo Atrasado', desc: 'Badge e filtro para empréstimos com prazo vencido', effort: 'low', done: true },
  { id: 62, cat: 'mid', name: 'Duplicar Item no Stock', desc: 'Botão duplicar pré-preenche formulário com dados existentes', effort: 'low', done: true },
  { id: 63, cat: 'mid', name: 'Testes Unitários do Stock', desc: 'Cobertura de testes para services e páginas do stock', effort: 'high', done: false },
  { id: 64, cat: 'mid', name: 'Editar/Deletar Movimentações', desc: 'Corrigir ou remover movimentações com soft-delete', effort: 'med', done: true },

  { id: 65, cat: 'low', name: 'BottomNav Stock Expandido', desc: 'Adicionar tabs de Inventário e QR ao BottomNav', effort: 'low', done: true },
  { id: 66, cat: 'low', name: 'Corrigir Rota general-stock', desc: 'Generalizar paths no StockLayout para sufixo /general-stock', effort: 'low', done: false },
  { id: 67, cat: 'low', name: 'Sync Inventário p/ Supabase', desc: 'Migrar inventoryService para createSyncService', effort: 'low', done: false },
]

const CATEGORIES = [
  { key: 'high' as const, emoji: '🔥', label: 'Alto Impacto' },
  { key: 'mid' as const, emoji: '📋', label: 'Média Prioridade' },
  { key: 'low' as const, emoji: '🎯', label: 'Baixa Prioridade' },
]

const effortLabels = { low: 'Baixo', med: 'Médio', high: 'Alto' }
const effortColors = { low: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', med: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', high: 'text-red-600 dark:text-red-400 bg-red-500/10' }

export function Roadmap() {
  const stats = useMemo(() => {
    const total = FEATURES.length
    const done = FEATURES.filter((f) => f.done).length
    return { total, done, pending: total - done, pct: Math.round((done / total) * 100) }
  }, [])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-2xl px-5 pb-20 pt-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">LabHub Roadmap</h1>
          <p className="mt-1 text-sm text-fg-muted">{stats.total} features · progresso global</p>
        </header>

        <div className="mb-8 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>Progresso Geral</span>
            <span className="text-emerald-500">{stats.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-input">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.done}</div>
              <div className="text-[11px] font-medium text-fg-muted">Concluídas</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <div className="text-[11px] font-medium text-fg-muted">Pendentes</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-[11px] font-medium text-fg-muted">Total</div>
            </div>
          </div>
        </div>

        {CATEGORIES.map((cat) => {
          const items = FEATURES.filter((f) => f.cat === cat.key)
          const catDone = items.filter((f) => f.done).length
          const catPct = Math.round((catDone / items.length) * 100)

          return (
            <div key={cat.key} className="mb-7">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">
                  {cat.emoji} {cat.label}
                  <span className="ml-1.5 text-xs font-medium text-fg-muted">
                    {catDone}/{items.length}
                  </span>
                </h2>
                <div className="h-1 w-20 overflow-hidden rounded-full bg-input">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${catPct}%` }} />
                </div>
              </div>

              {items.map((f) => (
                <div
                  key={f.id}
                  className={`mb-1.5 flex items-start gap-3 rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)] transition-all ${
                    f.done ? 'opacity-50' : ''
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-white transition-colors ${
                      f.done ? 'border-emerald-500 bg-emerald-500' : 'border-line'
                    }`}
                  >
                    {f.done && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium leading-tight ${f.done ? 'line-through text-fg-dim' : 'text-fg'}`}>
                      {f.name}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{f.desc}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${effortColors[f.effort]}`}>
                        {effortLabels[f.effort]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        <footer className="py-6 text-center text-[11px] text-fg-dim">
          LabHub Roadmap
        </footer>
      </div>
    </div>
  )
}
