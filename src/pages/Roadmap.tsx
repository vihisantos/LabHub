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
  { id: 15, cat: 'mid', name: 'Testes E2E (Playwright)', desc: 'Testes de fluxo completo: criar → listar → editar (scripts/browser-verify: signup, sweep, push-button, cleanup)', effort: 'high', done: true },
  { id: 18, cat: 'mid', name: 'Mapa do Laboratório', desc: 'Editor visual de mapa da sala com grid de posições', effort: 'high', done: false },
  { id: 20, cat: 'mid', name: 'Checklist com Foto', desc: 'Capturar foto durante execução de checklist', effort: 'med', done: false },
  { id: 24, cat: 'low', name: 'Comparar PCs Lado a Lado', desc: 'Tela dividida com specs e status comparados', effort: 'med', done: false },
  { id: 26, cat: 'low', name: 'Suporte Multilíngue (i18n)', desc: 'Português e Inglês com react-i18next', effort: 'high', done: false },
  { id: 30, cat: 'low', name: 'Vincular Periféricos aos PCs', desc: 'Mouse, teclado, monitor vinculados ao PC', effort: 'med', done: true },
  { id: 32, cat: 'low', name: 'Tour / Onboarding Integrado', desc: 'Overlay com passos para novo usuário', effort: 'med', done: true },
  { id: 33, cat: 'low', name: 'Resolução de Conflitos de Sync', desc: 'Modal com diff lado a lado para conflitos', effort: 'med', done: false },
  { id: 35, cat: 'low', name: 'Ronda Diária de Laboratório', desc: 'Checklist rápido: todos os PCs ligados e respondendo', effort: 'med', done: false },
  { id: 37, cat: 'low', name: 'Atalho "Desfazer" (Undo)', desc: 'Ctrl+Z e toast com opção de desfazer', effort: 'high', done: false },
  { id: 44, cat: 'low', name: 'Assistente de Migração', desc: 'Migrar dados antigos do localStorage automaticamente', effort: 'med', done: true },
  { id: 45, cat: 'low', name: 'Plugins / Extensões', desc: 'Sistema de plugins para funcionalidades customizadas', effort: 'high', done: false },
  { id: 49, cat: 'low', name: 'Web Vitals', desc: 'Coletar LCP, FID, CLS para monitoramento', effort: 'med', done: false },
  { id: 50, cat: 'low', name: 'IndexedDB (Storage)', desc: 'Migrar dados do localStorage para IndexedDB', effort: 'high', done: true },
  { id: 52, cat: 'low', name: 'Timeline Gráfica', desc: 'Timeline horizontal com bolhas por data', effort: 'med', done: false },
  { id: 75, cat: 'low', name: 'Configurações Customizáveis do Stock', desc: 'Editar seções, subcategorias, condições e campos personalizados do estoque', effort: 'med', done: false },
  { id: 94, cat: 'low', name: 'Push Segmentado por App/Workspace', desc: 'Inscrição com workspace e apps; envio filtrado no backend (_target_subs por módulo/workspace/cargo)', effort: 'med', done: true },

  { id: 95, cat: 'high', name: 'Sync em Tempo Real (Realtime)', desc: 'Dados e sino atualizam instantaneamente sem polling', effort: 'high', done: false },
  { id: 96, cat: 'high', name: 'Login Biométrico / Passkey (WebAuthn)', desc: 'Entrar com digital, face ou chave de segurança no lugar da senha', effort: 'high', done: false },
  { id: 97, cat: 'high', name: 'Monitoramento de PCs em Tempo Real', desc: 'Temperatura, uso de CPU e atividade remota por PC', effort: 'high', done: false },
  { id: 98, cat: 'high', name: 'Calendário Visual de Reservas', desc: 'Grade por laboratório com conflitos destacados e sugestão de horário', effort: 'med', done: false },
  { id: 99, cat: 'high', name: 'SLA de Chamados', desc: 'Prazos por prioridade com atraso destacado no dashboard', effort: 'med', done: true },
  { id: 100, cat: 'high', name: 'Inventário com QR e Impressão de Etiquetas', desc: 'Etiquetas nome/série/QR integradas ao inventário geral', effort: 'med', done: true },
  { id: 101, cat: 'high', name: 'Impersonação de Usuário', desc: 'Admin opera como um usuário para reproduzir problemas', effort: 'med', done: false },
  { id: 102, cat: 'high', name: 'Modo Offline Total com Fila de Operações', desc: 'Parcial: fila de alterações pendentes + re-sync automático ao voltar; falta fila de operações com replay e UI de estado offline', effort: 'high', done: false },
  { id: 103, cat: 'high', name: 'Painel Público de Disponibilidade de Labs', desc: 'Consulta aberta de horários livres sem login', effort: 'med', done: false },
  { id: 104, cat: 'high', name: 'Múltiplas Unidades (Filiais)', desc: 'Multi-tenant por unidade com dados e permissões isoladas', effort: 'high', done: true },

  { id: 105, cat: 'mid', name: 'Reservas Recorrentes', desc: 'Repetir reserva semanal ou mensal em horários fixos', effort: 'low', done: false },
  { id: 106, cat: 'mid', name: 'QR Check-in/Check-out nos Laboratórios', desc: 'Registro de entrada/saída escaneando o QR da sala', effort: 'med', done: false },
  { id: 107, cat: 'mid', name: 'Sugestão Automática de Reposição', desc: 'Parcial: alerta de estoque baixo (qty ≤ mínimo); falta cálculo de consumo médio e sugestão de compra', effort: 'low', done: false },
  { id: 108, cat: 'mid', name: 'Previsão de Consumo de Peças', desc: 'Parcial: resumo de uso por laboratório; falta projeção baseada no histórico de consumo', effort: 'med', done: false },
  { id: 109, cat: 'mid', name: 'Atribuição Automática de Chamados', desc: 'Designar técnico conforme especialidade e disponibilidade', effort: 'med', done: false },
  { id: 110, cat: 'mid', name: 'Feedback do Professor após Resolução', desc: 'Avaliação rápida de satisfação ao encerrar o chamado', effort: 'low', done: true },
  { id: 111, cat: 'mid', name: 'Chat em Tempo Real no Chamado', desc: 'Conversa entre professor e técnico dentro do chamado', effort: 'high', done: false },
  { id: 112, cat: 'mid', name: 'Playlists Agendadas na TV', desc: 'Programar conteúdo por horário e dia da semana', effort: 'med', done: false },
  { id: 113, cat: 'mid', name: 'Widgets de Clima/Relógio na TV', desc: 'Painéis informativos junto aos murais digitais', effort: 'low', done: false },
  { id: 114, cat: 'mid', name: 'Modo Emergência na TV', desc: 'Aviso urgente com destaque sobre todo o conteúdo', effort: 'low', done: false },
  { id: 115, cat: 'mid', name: 'Pedido de Música na TV', desc: 'Colaborador pede uma música pelo hub, admin aprova e ela entra na fila da TV; inclui "tocar a seguir com espera"', effort: 'med', done: true },
  { id: 116, cat: 'mid', name: 'Backup Automático Agendado', desc: 'Parcial: export manual em JSON; falta snapshot periódico com retenção configurável', effort: 'med', done: false },
  { id: 117, cat: 'mid', name: 'Restauração de Workspace a partir de Backup', desc: 'Recuperar dados de um snapshot em um clique', effort: 'med', done: false },
  { id: 118, cat: 'mid', name: 'Exportação de Auditoria (PDF/CSV)', desc: 'Relatório completo de ações com filtros e assinatura', effort: 'med', done: false },
  { id: 119, cat: 'mid', name: 'Métricas de Uso por Usuário/App', desc: 'Quem usa o quê, frequência e funções mais acessadas', effort: 'med', done: false },
  { id: 120, cat: 'mid', name: 'Atalhos de Teclado Configuráveis', desc: 'Personalizar atalhos globais e por app', effort: 'low', done: false },
  { id: 121, cat: 'mid', name: 'Tema por Workspace', desc: 'Cor de destaque e tema independentes por ambiente', effort: 'low', done: false },
  { id: 122, cat: 'mid', name: 'Mapa da Sala com Localização de Itens', desc: 'Posicionar PCs e itens no mapa com busca visual', effort: 'high', done: false },
  { id: 123, cat: 'mid', name: 'Alertas de Validade de Itens', desc: 'Notificar itens com data de validade próxima ou vencida', effort: 'low', done: true },
  { id: 124, cat: 'mid', name: 'Notificações por Email', desc: 'Reservas, chamados e aprovações também por email', effort: 'med', done: false },
  { id: 125, cat: 'mid', name: 'Webhooks de Eventos', desc: 'Disparar integrações externas em eventos do sistema', effort: 'med', done: false },
  { id: 126, cat: 'mid', name: 'Integração com Google Calendar', desc: 'Sincronizar reservas com o calendário institucional', effort: 'med', done: false },
  { id: 127, cat: 'mid', name: 'Dashboard Personalizável (Widgets)', desc: 'Montar a home com os cards que importam', effort: 'med', done: false },
  { id: 128, cat: 'mid', name: 'Checklist Pós-Manutenção Automático', desc: 'Gerar checklist automático ao concluir uma manutenção', effort: 'low', done: false },
  { id: 129, cat: 'mid', name: 'Detecção de PCs Inativos', desc: 'Listar máquinas sem uso recente para realocação', effort: 'low', done: false },
  { id: 130, cat: 'mid', name: 'Histórico Gráfico de Peças por PC', desc: 'Linha do tempo de trocas com visualização em gráfico', effort: 'med', done: false },
  { id: 131, cat: 'mid', name: 'Fila Prioritária de Chamados por Sala', desc: 'Sala com mais chamados sobe na prioridade automaticamente', effort: 'med', done: false },
  { id: 132, cat: 'mid', name: 'Templates de Murais Digitais na TV', desc: 'Layouts prontos para avisos, eventos e resultados', effort: 'low', done: false },
  { id: 133, cat: 'mid', name: 'Duplicar Modelo de Dados entre Workspaces', desc: 'Copiar estrutura (salas, categorias, templates) para outro ambiente', effort: 'med', done: true },
  { id: 134, cat: 'mid', name: 'Itens com Fotos Múltiplas', desc: 'Galeria de fotos por item com vista ampliada', effort: 'low', done: false },

  { id: 135, cat: 'low', name: 'Tour por App', desc: 'Onboarding guiado dentro de cada módulo novo', effort: 'low', done: false },
  { id: 136, cat: 'low', name: 'Alto Contraste / Modo Leitura Fácil', desc: 'Variante acessível com contraste e tipografia ampliados', effort: 'med', done: false },
  { id: 137, cat: 'low', name: 'Compartilhar Relatório por Link', desc: 'Link temporário e público para relatórios', effort: 'med', done: false },
  { id: 138, cat: 'low', name: 'Comentários em Itens do Estoque', desc: 'Notas colaborativas por item com autor e data', effort: 'low', done: false },
  { id: 139, cat: 'low', name: 'Linha do Tempo Visual por Item/PC', desc: 'Histórico de eventos renderizado como timeline', effort: 'med', done: false },
  { id: 140, cat: 'low', name: 'Tags Coloridas Customizadas', desc: 'Etiquetas por cor e texto em PCs e itens', effort: 'low', done: false },
  { id: 141, cat: 'low', name: 'Notificação via WhatsApp', desc: 'Alertas encaminhados para grupos via API', effort: 'high', done: false },
  { id: 142, cat: 'low', name: 'Ajuda Contextual', desc: 'Botão "?" com dicas por tela e formulário', effort: 'low', done: false },
  { id: 143, cat: 'low', name: 'Versão Desktop (Tauri)', desc: 'App nativo leve para Windows/Linux/macOS', effort: 'high', done: false },
  { id: 144, cat: 'low', name: 'Widget "Resumo do Dia" na Home', desc: 'Card com pendências e destaques do dia', effort: 'low', done: false },
  { id: 145, cat: 'low', name: 'Ranking de Manutenções', desc: 'Comparativo de produtividade e tempo médio por técnico', effort: 'low', done: false },
  { id: 146, cat: 'low', name: 'Sonorização de Alertas Críticos', desc: 'Som para notificações urgentes quando ativo', effort: 'low', done: false },
  { id: 147, cat: 'low', name: 'Integração com Slack/Discord', desc: 'Enviar eventos para canais de equipe', effort: 'med', done: false },
  { id: 148, cat: 'low', name: 'Favoritos de Salas', desc: 'Marcar salas/labs favoritos e filtrar por eles', effort: 'low', done: false },
  { id: 149, cat: 'low', name: 'Impressão de Relatórios', desc: 'Parcial: PDF via jsPDF; falta CSS @media print genérico para relatórios e detalhes', effort: 'low', done: false },
  { id: 150, cat: 'low', name: 'Pesquisa com Voz', desc: 'Buscar itens, PCs e salas falando', effort: 'med', done: false },
  { id: 151, cat: 'low', name: 'Tema Especial por Evento', desc: 'Visual temático em datas comemorativas no hub', effort: 'low', done: false },
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
