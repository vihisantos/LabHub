# Estado atual da plataforma LabHub (2026-09)

> Resumo do que foi entregue até setembro de 2026, o que está em produção e o que resta do roadmap. Para o plano futuro, consulte [roadmap-rbac2.0-mascote-multiunidades.md](roadmap-rbac2.0-mascote-multiunidades.md).

---

## Versão em produção

**v2.3.0** (2026-09-16) — veja o [CHANGELOG](../CHANGELOG.md) para o detalhamento por versão.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI |
| Banco remoto | Supabase PostgreSQL (schemas `public`, `pcare`, `stock`) com RLS |
| Backend API | Flask (Python) em Vercel Serverless |
| Realtime | Supabase Realtime (WebSocket) — principalmente Chamados |
| Notificações | Web Push (VAPID) + Upstash Redis |
| Deploy | Vercel (automático em push para `main`) |
| Testes | Vitest (frontend), pytest (backend API) |

---

## Modelo de autorização (RBAC 2.0)

O RBAC 2.0 é a camada **autoritativa e sempre ativa** (ON-only, sem feature flag desde o F2-C).

- Deny-by-default: na ausência de permissão explícita, o acesso é negado.
- Decisão: `super_admin` → `membership` → `role_permissions` → `overrides` → nega.
- Decisões registradas em `rbac_audit_logs` (append-only).

### Roles de workspace (migration 036)

| Slug | Nome | Escopo |
|------|------|--------|
| `tec` | Técnico | workspace |
| `vis` | Visualizador | workspace |
| `est` | Gestor de Estoque | workspace |
| `opv` | Operador TV | workspace |
| `adm` | Admin de Workspace | workspace |
| `coordinator` | Coordenador Multiunidade | workspace (várias memberships) |
| `lider` | Líder | workspace |

`Super Admin` não é uma role — é `profiles.is_super_admin` (capacidade de plataforma global).

### Aplicações por workspace

Cada workspace habilita ou desabilita aplicações independentemente via `disabled_apps`. A desativação no workspace prevalece sobre qualquer acesso do usuário.

Apps: **Chamados**, **ReservaLab**, **PC Care**, **Estoque**, **TV**.

---

## O que cada módulo faz hoje

| Módulo | O que faz | Backend |
|--------|-----------|---------|
| **Chamados** | Chamados técnicos e OS. Abertura pública (sem login), Meus Chamados, Painel de TI, SLA, tempo real, avaliação 1-5 estrelas, fotos Cloudinary, relatórios, em espera / indeferir com motivo | Flask `/api/chamados*` |
| **ReservaLab** | Reservas de laboratório (planilha SharePoint, somente leitura) e empréstimo de tablets (Supabase). Dashboard de ocupação, lembretes push por campus, criar evento na TV a partir de reserva. **Hospeda o backend Flask principal** (todas as rotas `/api/*`) | Flask `src/apps/reservalab/api/app.py` |
| **PC Care** | Inventário, limpeza e manutenção de computadores. Especificações, controle de peças, checklists, manutenção preventiva, QR Codes, relatórios | localStorage + sync Supabase schema `pcare` |
| **Estoque** | Materiais e suprimentos. Movimentações, kits com checklist, inventário cíclico, QR Codes, manutenção preventiva | localStorage + sync Supabase schema `stock` |
| **TV** | Murais digitais: eventos, playlists (YouTube), música, avisos, galerias. Modo admin + modo display (tela cheia) | Supabase direto (`tv_*`), API Flask `/api/tv/*` (YouTube + fontes externas) |

---

## Roadmap — status da implementação (sessão 2026-09-08)

### ✅ Ciclo C — Fases 4 a 6 (cargos, liderança, área do Coordenador em construção)
- Cargo `lider` com `isLeadership` e `leadershipLevel`; hierarquia com `LeadershipLevel`
- Migração idempotente `role-lider` + backfill de `isLeadership`/`leadershipLevel`
- Regra: somente cargo de liderança lidera (guard `LeadershipAreaGuard`)
- Área do Coordenador em estado "em construção" na rota `/coordenador`
- Badge de liderança no admin
- 1705 testes passando

### ✅ Ciclo D — Fase 7 (escopo `team`, Área do Líder)
- Migração `045` com `memberships.managed_by`, trigger de guarda (sem ciclos, sem lider→lider)
- RPC `get_leader_team(workspace_id)` (fail-closed)
- Rota `/lider` real com membros, indicadores, estados de carga/erro/vazio
- Card "Minha Liderança" no Launcher
- 1735 testes passando

### ✅ Ciclo E — Fase 7.7 (auditoria de fechamento)
- 3 lacunas fechadas na migration `046` (managed_by cross-workspace, líder não gerencia líder, ciclo INSERT/UPDATE)
- 48 testes passando

### ✅ Ciclo F — Fase 8 (escopo `coordination`, gestão do Coordenador)
- Migration `047` com 5 helpers SECURITY DEFINER (`is_coordinator_of`, `get_coordinator_units`, `get_coordinator_leaders`, `get_memberships_by_manager`, `coordinator_set_manager`)
- Tela `/coordenador` real (unidades → lideranças → equipes)
- UI de atribuição/remoção de gestor (anti-duplicação, tratamento de erro inline/banner)
- 1754 testes passando

### ⏳ Pendentes (Fases 8+)
- Release real dos recursos do Coordenador (unidades → equipes → lideranças → chamados → indicadores → desktop)
- Auditoria de fechamento da Fase 8 (espelho da 7.7)
- Drift `workspace_ids` (legado) ↔ memberships (Fase 9)
- Expansão do mascote pelo LabHub
- Experiência desktop dos demais módulos (Chamados → Stock → PCare → TV/Música → Launcher)
- Auditoria de segurança pós-RBAC e testes completos

---

## Principais decisões arquiteturais (ADRs)

| ADR | Título | Status |
|-----|--------|--------|
| ADR-001 | Offline-first com localStorage | Aceita |
| ADR-002 | Supabase como banco remoto | Aceita |
| ADR-003 | API Flask para o Chamados | Aceita |
| ADR-004 | Modelo de isolamento por workspace | Aceita |
| ADR-005 | Padrão de isolamento entre aplicações | Aceita |
| ADR-006 | Registro Global de Ativos | Aceita (parcialmente superada por PR-2 #289) |
| ADR-007 | Supabase Realtime para chamados | Aceita |
| ADR-008 | Controle de acesso em três camadas | Substituída pelo RBAC 2.0 no backend |

---

## Dívida técnica conhecida

- `profiles.workspace_ids` (legado) ainda é usado por alguns consumidores frontend; drift para `memberships` em andamento (Fase 9)
- Algumas policies RLS permissivas pré-existentes identificadas na auditoria pós-produção (Issue #158)
- Roles `coordinator`, `est`, `adm`, `opv` sem membros reais, aguardando decisão de negócio (Issue #159)
- Mascote congelado até o RBAC 2.0 estar totalmente consolidado

---

## Relacionados

- [Visão geral do sistema](../concepts/system-overview.md)
- [Workspaces](../concepts/workspaces.md)
- [Autorização](../security/authorization.md)
- [Autenticação](../security/authentication.md)
- [RBAC 2.0](../rbac/README.md)
- [Especificação RBAC 2.0](../architecture/rbac2.0-specification.md)
- [Catálogo de Actions](../architecture/rbac2.0-actions-catalog.md)
- [Referência da API](../../reference/api.md)
- [Referência do banco](../../reference/database.md)
- [CHANGELOG (raiz)](../CHANGELOG.md)
- [Roadmap RBAC 2.0, mascote e multiunidades](roadmap-rbac2.0-mascote-multiunidades.md)