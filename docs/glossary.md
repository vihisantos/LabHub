# Glossário

> Referência rápida dos termos do domínio do LabHub.

Termos técnicos que também são identificadores no código (como *workspace*, *membership*, *role* e *Action*) são mantidos em inglês para não divergir da nomenclatura usada no sistema.

---

## Plataforma e multi-tenancy

| Termo | Definição |
|-------|-----------|
| **Plataforma** | O LabHub como um todo: infraestrutura compartilhada, autenticação, autorização, workspaces e aplicações. |
| **Aplicação** | Unidade funcional independente dentro do LabHub (Chamados, PC Care, Estoque, ReservaLab, TV). Cada aplicação tem rotas, serviços, tema e acesso a dados próprios. Também chamada de *sub-app* ou *module* em partes antigas do código. |
| **Workspace** | Campus ou unidade organizacional. Agrupa usuários, aplicações habilitadas e todos os dados. Todo dado do LabHub pertence a um workspace. |
| **Unidade** | Sinônimo de workspace no vocabulário de negócio: um campus ou setor atendido pela plataforma. |
| **Tenant** | Membro de um workspace. Um usuário pode pertencer a vários workspaces. |
| **Membership** | Relação explícita entre um perfil e um workspace, com `role`, `status` e `managed_by`. Fonte de verdade da autorização no RBAC 2.0. |
| **`workspace_ids`** | Coluna de `profiles` que guarda os workspaces de um usuário no modelo legado. Substituída por `memberships` no RBAC 2.0. |
| **`disabled_apps`** | Lista de aplicações desativadas em um workspace. A desativação no workspace sempre prevalece sobre a permissão do usuário. |
| **`workspace_app_settings`** | Configurações de uma aplicação por workspace (por exemplo, a fonte de eventos da TV). |

## Identidade e acesso

| Termo | Definição |
|-------|-----------|
| **Perfil** | Registro em `profiles`, criado no cadastro e vinculado a `auth.users`. Guarda nome, cargo, status e preferências. |
| **Status do usuário** | `pending` (aguardando aprovação, sem acesso), `active` (liberado) ou rejeitado. |
| **Role** | Cargo do usuário. No RBAC 2.0: `tec` (Técnico), `vis` (Visualizador), `est` (Gestor de Estoque), `opv` (Operador TV) e `adm` (Admin de Workspace). No modelo legado: `viewer`, `technician` e `admin`. |
| **Super Admin** | Capacidade de plataforma (`profiles.is_super_admin`), não um cargo. Ignora todas as restrições e vê todos os workspaces. |
| **Permissão** | Concessão de uma Action a uma role, registrada em `role_permissions`. |
| **Override** | Ajuste pontual de permissão por membership (`membership_overrides`), sobrepondo a base da role. |
| **`app_access`** | Visão legada de acesso por aplicação, com níveis `full`, `read` e `none`. |
| **RBAC** | *Role-Based Access Control*. Modelo de autorização baseado em cargos e permissões. |
| **Action** | Operação autorizável e nomeada, como `ticket.view` ou `admin.app.purge`. A lista completa está no [catálogo de Actions](architecture/rbac2.0-actions-catalog.md). |
| **Escopo (*scope*)** | Abrangência de uma Action: `workspace` (válida dentro de um campus) ou `global` (plataforma inteira). |
| **Deny-by-default** | Regra do RBAC 2.0: na ausência de permissão explícita, o acesso é negado. |
| **Fail-closed** | Regra de segurança do backend: qualquer erro no motor de autorização resulta em negação, nunca em liberação. |
| **`RBAC_2_ENABLED`** | Feature flag que liga o enforcement do RBAC 2.0. Desligada, o decorator é *no-op* e apenas as regras legadas valem. |
| **Auditoria de RBAC** | Registro append-only das decisões de autorização em `rbac_audit_logs`. |
| **RLS** | *Row Level Security* — política do PostgreSQL que restringe quais linhas um usuário pode acessar, com base nos workspaces de que participa. |
| **`user_belongs_to_workspace()`** | Função auxiliar de RLS que verifica a participação do usuário em um workspace. |
| **Service Role** | Chave administrativa do Supabase (`SUPABASE_SERVICE_KEY`) que ignora RLS. Usada pelo backend Flask. |
| **App Guard** | Componente de frontend (`AppGuard.tsx`) que verifica o acesso a uma aplicação antes de renderizá-la. |
| **Disponibilidade de aplicação** | Verificação em três camadas: workspace habilitado → permissão do usuário → acesso concedido. |
| **Token de acompanhamento** | Identificador público de um chamado, usado pelo professor para acompanhar o atendimento sem autenticação. |

## Dados e operação

| Termo | Definição |
|-------|-----------|
| **Offline-first** | Padrão em que a aplicação lê e escreve primeiro no `localStorage` e sincroniza com o Supabase em segundo plano. |
| **Cache local** | Dados em `localStorage` gerenciados por `createLocalService()`, com prefixo `labhub_`. Fonte de verdade do frontend. |
| **Fonte remota** | Tabelas PostgreSQL no Supabase para as quais a engine de sync envia e de onde puxa dados. |
| **Sincronização** | Processo de merge entre os dados locais e os remotos, com *dirty-tracking* e merge por timestamp. |
| **Dirty-tracking** | Mecanismo que marca coleções com alterações locais pendentes (`labhub_dirty_collections`). |
| **Engine de sync** | `src/lib/sync.ts` — orquestra push e pull de todas as coleções entre `localStorage` e Supabase. |
| **Tombstone** | Marca de exclusão (`labhub_deleted_ids`) que propaga a remoção local para a fonte remota. |
| **Realtime** | Supabase Realtime (WebSocket) para atualizações instantâneas sem polling. Usado principalmente no Chamados. |
| **IndexedDB** | Banco do navegador usado para dados binários (fotos, arquivos) grandes demais para o `localStorage`. |
| **PWA** | *Progressive Web App* — aplicação web instalável, com funcionamento offline e notificações push. |
| **Push** | Notificação enviada via Web Push (VAPID), com o serviço de inscrições em Redis (Upstash). |
| **Kiosk** | Modo de exibição simplificado, usado em tablets e TVs. |
| **Launcher** | Tela inicial do LabHub, com as aplicações disponíveis em formato de grade. |
| **Quick Actions** | Paleta de comandos (`Ctrl+K`) para navegação e ações rápidas. |
| **Mascote** | Sistema de estados visuais da plataforma, que comunica situação do usuário e do sistema. |

## Domínio das aplicações

| Termo | Definição |
|-------|-----------|
| **Chamado** | Solicitação de suporte ou ordem de serviço criada pelo Chamados, com `ticketNumber` sequencial por workspace. |
| **Evento do chamado** | Entrada no histórico de um chamado (mudança de status, comentário, atribuição). |
| **SLA** | *Service Level Agreement* — prazo de resposta e de resolução por prioridade de chamado, configurado em `sla_configs`. |
| **Ativo** | Bem físico de TI (computador, monitor, impressora) rastreado no Registro Global de Ativos (`public.assets`). |
| **Registro Global de Ativos** | Sistema centralizado de rastreamento de ativos em `public.assets`, com RLS por workspace. Substitui o rastreamento por aplicação. |
| **Parte** | Componente de reposição vinculado a um computador no PC Care (SSD, memória, fonte). |
| **Kit** | Conjunto de itens agrupados no Estoque, com checklist de conferência. |
| **Inventário cíclico** | Contagem física periódica do Estoque, comparada com os dados do sistema. |
| **Reserva** | Agendamento de laboratório ou de tablet no ReservaLab. Reservas de laboratório vêm de planilha; reservas de tablet ficam no Supabase. |
| **Estação TV** | Dispositivo de exibição registrado no TV (`tv_devices`), ativado por código e vinculado a um workspace. |
