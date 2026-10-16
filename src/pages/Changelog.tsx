import { useMemo } from 'react'

interface ChangelogItem {
  id: string
  type: 'bug' | 'melhoria'
  title: string
  desc: string
  done: boolean
}

interface Release {
  version: string
  date: string
  title: string
  bugs: ChangelogItem[]
  melhorias: ChangelogItem[]
}

const RELEASES: Release[] = [
  {
    version: 'v2.3.0',
    date: '16 de setembro de 2026',
    title: 'Tela de Novidades e correções de documentação',
    bugs: [],
    melhorias: [
      {
        id: 'tela-novidades',
        type: 'melhoria',
        title: 'Nova tela de Novidades (/changelog)',
        desc: 'Substitui o antigo Roadmap. Exibe checkboxes por atualização, separa Corrigido (bugs) de Melhoria (features), e mostra estatísticas de progresso por versão e no geral.',
        done: true,
      },
      {
        id: 'guia-changelog',
        type: 'melhoria',
        title: 'Guia de manutenção do changelog da home',
        desc: 'Novo documento `docs/guides/changelog-app.md` explica como adicionar releases, marcar itens como entregues e manter o changelog atualizado.',
        done: true,
      },
      {
        id: 'redirect-roadmap',
        type: 'melhoria',
        title: 'Redirecionamento /roadmap → /changelog',
        desc: 'A rota antiga redireciona automaticamente para a nova tela de Novidades.',
        done: true,
      },
    ],
  },
  {
    version: 'v2.2.0',
    date: '07 de setembro de 2026',
    title: 'Segurança e autorização (RBAC 2.0)',
    bugs: [
      {
        id: 'fix-036-diagnostics',
        type: 'bug',
        title: 'Correção de sintaxe inválida no `GET DIAGNOSTICS` da migration 036',
        desc: 'Corrigido o acúmulo de ROW_COUNT na backfill do RBAC 2.0 com variável intermediária.',
        done: true,
      },
    ],
    melhorias: [
      {
        id: 'rbac-activation',
        type: 'melhoria',
        title: 'Ativação controlada do RBAC 2.0',
        desc: 'Ativação com flag `RBAC_2_ENABLED=1` e rollback por flag; gates legados preservados.',
        done: true,
      },
      {
        id: 'etapa-7-closed',
        type: 'melhoria',
        title: 'Etapa 7 fechada',
        desc: 'Decisões de rollout explícitas (multi-workspace diferido, mixed push endpoints diferido, `adm` como autoridade canônica RBAC, compatibilidade legacy mantida).',
        done: true,
      },
      {
        id: 'rls-044',
        type: 'melhoria',
        title: 'RLS Hardening 044',
        desc: 'Remoção de `USING(true)` nas políticas de `profiles` e `workspaces`; helper `profile_visible_to_me`; isolamento cross-workspace e fail-closed reforçados.',
        done: true,
      },
      {
        id: 'rbac-engine',
        type: 'melhoria',
        title: 'Engine RBAC 2.0 + schema 036 + enforcement de backend',
        desc: 'Autorização por Action com deny-by-default, bypass de `super_admin`, resolução por membership, overrides por ação e trilha de auditoria append-only (`rbac_audit_logs`).',
        done: true,
      },
      {
        id: 'rbac-roles',
        type: 'melhoria',
        title: '5 roles sistêmicas + 55 permissões + 8 memberships',
        desc: 'Cargos `tec`, `vis`, `est`, `opv`, `adm` semeados com 55 `role_permissions` e 8 memberships backfilladas do modelo legado.',
        done: true,
      },
      {
        id: 'rbac-decorator',
        type: 'melhoria',
        title: 'Decorator `require_action_rbac` em 11 rotas de produção',
        desc: 'Proteção de rotas admin, backups, push, TV e relatórios de chamados.',
        done: true,
      },
      {
        id: 'rbac-in-handler',
        type: 'melhoria',
        title: 'Enforcement in-handler em 5 endpoints de chamados',
        desc: '`_require_action_in_handler` para view, delete, edit, status, assign e comment.',
        done: true,
      },
    ],
  },
  {
    version: 'v2.1.0',
    date: '16 de agosto de 2026',
    title: 'Push, workspaces e SLA',
    bugs: [],
    melhorias: [
      {
        id: 'push-imediato-chamados',
        type: 'melhoria',
        title: 'Push imediato ao abrir chamado',
        desc: '`POST /api/chamados` dispara `_notify_new_ticket` (evento, sem cron): filtra por módulo `chamados` + workspace, respeita `notify_settings` do perfil e falha de push nunca impede a criação do chamado.',
        done: true,
      },
      {
        id: 'cron-vercel',
        type: 'melhoria',
        title: 'Cron do Vercel substitui cron-jobs.org',
        desc: '`vercel.json` agenda `GET /api/push/check-all` a cada 5 minutos.',
        done: true,
      },
      {
        id: 'cron-secret',
        type: 'melhoria',
        title: 'Proteção por `CRON_SECRET` nos endpoints de cron',
        desc: 'Endpoints `check`, `check-overdue`, `check-pcare` e `check-all` exigem `Authorization: Bearer ${CRON_SECRET}` quando a env var está configurada.',
        done: true,
      },
      {
        id: 'docs-database',
        type: 'melhoria',
        title: 'Novo `docs/database.md` com diagrama ER',
        desc: 'Mapa completo do banco (schemas `public`/`pcare`/`stock`) e consumo de cada dado pelo app.',
        done: true,
      },
      {
        id: 'popup-notificacoes',
        type: 'melhoria',
        title: 'Popup de ativação de notificações redesenhado',
        desc: 'Card com benefícios, dismiss persistente e estado bloqueado com atalho de configuração do navegador.',
        done: true,
      },
      {
        id: 'cleanup-push-subs',
        type: 'melhoria',
        title: 'Script de limpeza de inscrições de push',
        desc: '`scripts/cleanup_push_subs.py` deduplica por endpoint e remove órfãs do Upstash (dry-run por padrão).',
        done: true,
      },
      {
        id: 'push-admin-url',
        type: 'melhoria',
        title: 'Admin usa `VITE_RESERVALAB_API_URL` no envio de push',
        desc: 'Antes usava `VITE_PUSH_API_URL` inexistente; o push do admin nunca disparava.',
        done: true,
      },
      {
        id: 'workspaces-avancado',
        type: 'melhoria',
        title: 'Gestão avançada de workspaces',
        desc: 'Exclusão com backup de 2 dias + auditoria de quem excluiu; configurar nome/localização/link da planilha/cor; ativar/desativar apps por workspace (bloqueio no AppGuard); duplicar configuração; mover dados (estoque e chamados); switcher rápido no launcher; mini-stats no gate; página Backups no admin com restauração.',
        done: true,
      },
      {
        id: 'pagina-backups',
        type: 'melhoria',
        title: 'Página de backups e auditoria em `/admin/backups`',
        desc: 'Restaura workspace a partir do snapshot de 2 dias.',
        done: true,
      },
      {
        id: 'migracao-021',
        type: 'melhoria',
        title: 'Migration 021 com cascata nas tabelas TV',
        desc: 'Cron de limpeza de backups expirados (fallback pelo app).',
        done: true,
      },
      {
        id: 'sla-chamados',
        type: 'melhoria',
        title: 'SLA com prazos por prioridade e dashboard dedicado',
        desc: 'Análise de cumprimento de SLA com dashboard próprio.',
        done: true,
      },
      {
        id: 'status-ao-vivo',
        type: 'melhoria',
        title: 'Status ao vivo com mensagens pre-definidas',
        desc: 'Aberto, a caminho, em atendimento, resolvido — com reabertura pelo TI.',
        done: true,
      },
      {
        id: 'push-status-professor',
        type: 'melhoria',
        title: 'Push de status para o professor',
        desc: 'Notificação por chamado (aberto, a caminho, em atendimento, resolvido).',
        done: true,
      },
      {
        id: 'foto-comentarios-chamados',
        type: 'melhoria',
        title: 'Foto opcional no chamado e histórico de comentários com fotos',
        desc: 'Upload via Cloudinary (máximo 600 KB).',
        done: true,
      },
      {
        id: 'relatorios-chamados',
        type: 'melhoria',
        title: 'Relatórios por período e por técnico',
        desc: 'Disponível em `/chamados/reports`.',
        done: true,
      },
      {
        id: 'campus-form-publico',
        type: 'melhoria',
        title: 'Professor escolhe o campus no formulário público',
        desc: '`workspace_id` gravado no chamado.',
        done: true,
      },
      {
        id: 'realtime-chamados',
        type: 'melhoria',
        title: 'Realtime via Supabase (fase 6)',
        desc: 'Novos chamados e comentários aparecem sem recarregar a página.',
        done: true,
      },
      {
        id: 'push-teste-usuario',
        type: 'melhoria',
        title: 'Teste de push para o usuário logado',
        desc: 'Indicador de status das notificações nas configurações.',
        done: true,
      },
      {
        id: 'planilha-reservas-campus',
        type: 'melhoria',
        title: 'Planilha de reservas por campus no ReservaLab',
        desc: 'Link e quantidade de labs configurados no workspace (sem fallback global).',
        done: true,
      },
      {
        id: 'ocupacao-semanal',
        type: 'melhoria',
        title: 'Ocupação semanal por lab no dashboard',
        desc: 'Alerta de reserva próxima filtrado por workspace.',
        done: true,
      },
      {
        id: 'stats-reais-reservalab',
        type: 'melhoria',
        title: 'Stats reais do módulo na home do ReservaLab',
        desc: 'Reservas hoje/semana e ocupação via API com cache.',
        done: true,
      },
      {
        id: 'form-publico-workspace',
        type: 'melhoria',
        title: 'Formulário público cria chamados com controle por workspace',
        desc: 'Controle de acesso por workspace (`canManageQr`).',
        done: true,
      },
    ],
  },
  {
    version: 'v2.0.0',
    date: '11 de agosto de 2026',
    title: 'Plataforma modular e login',
    bugs: [],
    melhorias: [
      {
        id: 'niveis-acesso-app',
        type: 'melhoria',
        title: 'Níveis de acesso por app com overrides por usuário',
        desc: `Per-app access levels (dash/read/full) com sobrescrita individual.`,
        done: true,
      },
      {
        id: 'stock-sync',
        type: 'melhoria',
        title: 'Sync do Estoque + docs + schema Supabase',
        desc: 'Sincronização do Estoque com banco remoto.',
        done: true,
      },
      {
        id: 'paginas-admin',
        type: 'melhoria',
        title: 'Páginas admin de perfis, roles e seleção de workspace',
        desc: 'Theme store incluído.',
        done: true,
      },
      {
        id: 'sub-app-admin',
        type: 'melhoria',
        title: 'Sub-app admin + SQL migrations + auth obrigatório',
        desc: 'Criação da área administrativa.',
        done: true,
      },
      {
        id: 'gestao-notificacoes',
        type: 'melhoria',
        title: 'Gestão de notificações por app e workspace',
        desc: 'Painel Regras / Enviar / Entrada.',
        done: true,
      },
      {
        id: 'aprovacao-workspaces',
        type: 'melhoria',
        title: 'Poderes de aprovação e workspaces restritos ao super admin',
        desc: 'Aprovação de usuários e gestão de workspaces.',
        done: true,
      },
      {
        id: 'login-supabase',
        type: 'melhoria',
        title: 'Login com Supabase Auth',
        desc: 'Implementação de autenticação via Supabase.',
        done: true,
      },
      {
        id: 'flag-super-admin',
        type: 'melhoria',
        title: 'Flag de super admin no perfil',
        desc: 'Capacidade de plataforma global.',
        done: true,
      },
      {
        id: 'launcher-apps',
        type: 'melhoria',
        title: 'Launcher vira launcher de apps',
        desc: 'Dashboard vira app restrito e perfil ganha seletor de workspace.',
        done: true,
      },
    ],
  },
  {
    version: 'v1.0.0',
    date: '01 de julho de 2026',
    title: 'Versão inicial',
    bugs: [],
    melhorias: [
      {
        id: 'versao-inicial',
        type: 'melhoria',
        title: 'LabHub v1.0.0',
        desc: 'Lançamento inicial com TV app, greeting, Radix UI, PWA, roadmap interativo, Estoque redesign e recursos iniciais.',
        done: true,
      },
    ],
  },
  {
    version: 'Em breve',
    date: '',
    title: 'Próxima atualização',
    bugs: [],
    melhorias: [
      {
        id: 'coord-multiunidades-release',
        type: 'melhoria',
        title: 'Release real do Coordenador Multiunidades',
        desc: 'Unidades → lideranças → equipes → chamados → indicadores → dashboard desktop (Fase 8+).',
        done: false,
      },
      {
        id: 'auditoria-fase-8',
        type: 'melhoria',
        title: 'Auditoria de fechamento da Fase 8',
        desc: 'Espelho da auditoria 7.7 (validação de segurança e consistência).',
        done: false,
      },
      {
        id: 'drift-workspace-ids',
        type: 'melhoria',
        title: 'Fechamento do drift `workspace_ids` ↔ memberships',
        desc: 'Memberships como fonte única de verdade (Fase 9).',
        done: false,
      },
      {
        id: 'mascote-expansao',
        type: 'melhoria',
        title: 'Expansão do mascote pelo LabHub',
        desc: 'Sistema de estados do mascote em login, carregando, processando, erro, notificação, celebração.',
        done: false,
      },
      {
        id: 'desktop-modulos',
        type: 'melhoria',
        title: 'Experiência desktop nos demais módulos',
        desc: 'Chamados → Estoque → PC Care → TV/Música → Launcher (layout responsivo progressivo).',
        done: false,
      },
      {
        id: 'auditoria-seguranca',
        type: 'melhoria',
        title: 'Auditoria de segurança pós-RBAC',
        desc: 'Testes adversariais: cross-workspace, escalada de privilégio, pending sem acesso.',
        done: false,
      },
      {
        id: 'testes-completos',
        type: 'melhoria',
        title: 'Testes completos (unit, integration, e2e)',
        desc: 'Suíte expandida para aprovação, RBAC, workspace e hierarquia.',
        done: false,
      },
    ],
  },
]

export function Changelog() {
  const stats = useMemo(() => {
    let total = 0
    let done = 0
    RELEASES.forEach((r) => {
      [...r.bugs, ...r.melhorias].forEach((i) => {
        total += 1
        if (i.done) done += 1
      })
    })
    return { total, done, pending: total - done, pct: Math.round((done / total) * 100) }
  }, [])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Novidades do LabHub</h1>
          <p className="mt-1 text-sm text-fg-muted">
            O que mudou, o que melhorou e o que foi corrigido em cada atualização
          </p>
        </header>

        <div className="mb-10 rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>Progresso geral</span>
            <span className="text-emerald-500">{stats.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-input">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.done}</div>
              <div className="text-[11px] font-medium text-fg-muted">Entregues</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <div className="text-[11px] font-medium text-fg-muted">Planejadas</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-[11px] font-medium text-fg-muted">Total</div>
            </div>
          </div>
        </div>

        {RELEASES.map((release) => {
          const allItems = [...release.bugs, ...release.melhorias]
          const releaseDone = allItems.filter((i) => i.done).length
          const releaseTotal = allItems.length
          const releasePct = Math.round((releaseDone / releaseTotal) * 100)

          return (
            <section key={release.version} className="mb-12">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{release.version}</h2>
                  <p className="text-xs text-fg-muted">{release.date} · {release.title}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-fg">{releasePct}%</div>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-input mt-1">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${releasePct}%` }} />
                  </div>
                </div>
              </div>

              {release.bugs.length > 0 && (
                <div className="mb-3">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                      ✦
                    </span>
                    Corrigido
                  </h3>
                  <ul className="space-y-1.5">
                    {release.bugs.map((item) => (
                      <li key={item.id} className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-white transition-colors">
                          {item.done ? (
                            <span className="bg-emerald-500 border-emerald-500">✓</span>
                          ) : (
                            <span className="bg-surface border-line">☐</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium leading-tight ${item.done ? 'line-through text-fg-dim' : 'text-fg-red-600 dark:text-red-400'}`}>
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{item.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    ✦
                  </span>
                  Melhoria
                </h3>
                <ul className="space-y-1.5">
                  {release.melhorias.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-white transition-colors">
                        {item.done ? (
                          <span className="bg-emerald-500 border-emerald-500">✓</span>
                        ) : (
                          <span className="bg-surface border-line">☐</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium leading-tight ${item.done ? 'line-through text-fg-dim' : 'text-fg'}`}>
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}

        <footer className="py-6 text-center text-[11px] text-fg-dim border-t border-line mt-12">
          LabHub · Novidades e correções por atualização
        </footer>
      </div>
    </div>
  )
}
