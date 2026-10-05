# Chamados — Referência

> Referência técnica de tipos, endpoints, configuração, componentes e camada de serviços.

## Tipos

```typescript
interface Ticket {
  id: string
  workspace_id: string
  roomId: string
  roomName: string
  assetId: string
  assetSource: 'stock' | 'pcare'
  assetName: string
  assetPatrimony: string
  problemCategory: string
  problemArea: 'administrativa' | 'academica'
  problemDescription: string
  status: TicketStatus
  priority: TicketPriority
  reportedBy: string
  reportedByEmail: string
  /**
   * UUID do solicitante autenticado (`auth.uid()` na criação). É a ÚNICA
   * identidade de solicitante confiável — `reportedBy`/`reportedByEmail` são
   * texto livre. `null`/ausente = chamado anônimo ou anterior à migration 056.
   * É o campo que a listagem `?mine=true` e a via pessoal do detalhe comparam
   * com `g.user_id`. Fica de fora de `TicketFormData`, então nenhum payload de
   * criação pode declarar de quem é o chamado.
   */
  reportedByUserId?: string | null
  assignedTo: string
  assignedToUserId: string
  ticketNumber: number
  photos: string[]
  feedbackRating: number | null
  feedbackComment: string
  feedbackAt: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  closedBy: string
  statusNote: string
  archived: boolean
}

type TicketStatus = 'aberto' | 'a_caminho' | 'em_atendimento' | 'resolvido' | 'fechado'
type TicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente'
```

### Rótulos e cores de status

```typescript
const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  a_caminho: 'A Caminho',
  em_atendimento: 'Em Atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500',
  a_caminho: 'bg-blue-500',
  em_atendimento: 'bg-indigo-500',
  resolvido: 'bg-emerald-500',
  fechado: 'bg-zinc-500',
}
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/chamados` | Abrir chamado (formulário público, sem autenticação) |
| GET | `/api/chamados` | Listar chamados |
| GET | `/api/chamados/:id` | Buscar chamado por identificador |
| PATCH | `/api/chamados/:id` | Atualizar campos do chamado |
| POST | `/api/public/chamados/:tracking_token/feedback` | Registrar avaliação (público) |
| POST | `/api/chamados/:id/events` | Adicionar comentário |
| GET | `/api/chamados/:id/events` | Histórico do chamado |
| GET | `/api/chamados/reports` | Relatório agregado |
| POST | `/api/chamados/reports/weekly-email` | Enviar resumo semanal por e-mail |
| POST | `/api/chamados/workspaces` | Listar campi disponíveis para o formulário público |

### POST /api/chamados

```json
{
  "workspace_id": "uuid-do-campus",
  "roomName": "Sala 201",
  "roomId": "opcional",
  "reportedBy": "Nome do professor",
  "reportedByEmail": "opcional",
  "problemCategory": "hardware",
  "problemArea": "administrativa",
  "problemDescription": "O computador não liga",
  "priority": "normal",
  "photos": "base64 ou URL do Cloudinary"
}
```

**Resposta:** `200 { ticket: Ticket }` com o `ticketNumber` gerado sequencialmente.

**Erros:**

- `400` — campos obrigatórios ausentes
- `403` — aplicação desabilitada no workspace (`MODULE_DISABLED`); nenhum chamado é criado e nenhum push é disparado
- `503` — backend não configurado

### GET /api/chamados

Parâmetros de consulta opcionais: `workspace_id`, `status`, `reportedBy`, `mine`.

Dois escopos no mesmo endpoint e no mesmo formato de resposta:

| Consulta | Escopo | Autorização |
|---|---|---|
| `GET /api/chamados` | Lista **operacional** (a fila da unidade) | Action `ticket.view` por workspace (RBAC 2.0) |
| `GET /api/chamados?mine=true` | **Meus Chamados** — só os chamados que o chamador abriu | `reportedByUserId` = identidade autenticada. **Não exige `ticket.view`** |

#### `mine=true` — escopo pessoal do solicitante

```text
GET /api/chamados?mine=true
GET /api/chamados?mine=true&workspace_id=<uuid>
```

O filtro de dono é aplicado **obrigatoriamente pelo servidor**, a partir de
`g.user_id` — o `sub` do JWT já validado por `@require_auth`:

```text
reportedByUserId = g.user_id
```

Regras:

- **A identidade vem sempre da sessão.** `?reportedByUserId=<uuid>` do cliente
  **não é lido** em nenhum ramo: `?mine=true&reportedByUserId=<outro-uuid>`
  devolve exatamente os chamados do chamador. Sem `mine`, o parâmetro enviado
  pelo cliente também não autoriza nada.
- **`reportedBy` / `reportedByEmail` nunca são identidade.** São texto livre
  digitado pelo solicitante e não entram na autorização deste escopo. Um
  chamado anônimo (`reportedByUserId = NULL`) nunca aparece, mesmo que o nome ou
  o e-mail coincida com o do usuário autenticado.
- **Não exige `ticket.view`.** É o que permite a um papel solicitante — hoje
  `lider`, que tem `chamados` visível na matriz mas nenhuma Action `ticket.*` —
  acompanhar o que abriu sem ganhar acesso à fila interna.
- **A consulta geral não muda.** `GET /api/chamados` continua exigindo
  `ticket.view`; `mine=true` é adicional e não enfraquece essa proteção.
- **É histórica.** Resolvidos, fechados e arquivados entram: não há filtro de
  `archived`, ao contrário da fila de "Meus Atendimentos". O filtro de status
  (`?status=`) continua disponível.
- **`workspace_id` só estreita.** É validado como membership ativa e nunca
  amplia o escopo pessoal. Sem ele, o resultado é limitado às unidades onde o
  chamador tem membership ativa; super admin não é cargo e pode não ter
  membership — para ele o filtro de dono é a fronteira.
- `mine` só liga com literal verdadeiro (`1`, `true`, `yes`). `?mine=0` e
  `?mine=false` mantêm a lista operacional.

> **O frontend filtra a apresentação, nunca define a identidade.** O recorte de
> "Meus Chamados" é decidido no backend; o cliente apenas filtra, agrupa e
> formata um conjunto já autorizado. `ticketService.listMine()` chama este
> endpoint e seu retorno **não** é mesclado na coleção local da fila — se fosse,
> o filtro do cliente voltaria a ser a única fronteira.

Isto **não é RBAC**: nenhuma Action foi criada, `role_permissions`, `roles`,
`memberships`, `membership_overrides` e RLS não foram alterados, e o
comportamento de `ticket.view` é o de antes. É uma regra de acesso ao recurso
baseada na identidade autenticada, como qualquer "minha conta".

Cobertura: `api/tests/test_chamados_mine_scope.py` (Casos A–G).

### `?status=` no escopo pessoal

Continua disponível no endpoint, mas **a tela de Meus Chamados não o usa**:
lá não existe filtro de status. O parâmetro permanece apenas para clientes que
consumem a API diretamente.

## Telas: duas experiências distintas

"Chamados" e "Meus Chamados" são áreas diferentes do produto, com rota, tela e
coleção próprias. Não há filtro que ligue uma à outra.

| | Chamados (fila operacional) | Meus Chamados (área pessoal) |
|---|---|---|
| Rota | `/chamados/tickets` | `/chamados/meus` |
| Componente | `pages/TicketList.tsx` | `pages/MyTickets.tsx` |
| Dados | `useTickets` → `ticketService.getAll()` (IndexedDB + realtime + fila remota) | `useMyTickets` → `ticketService.listMine()` (`?mine=true`, leitura remota) |
| Autorização | Action `ticket.view` por workspace | Identidade do JWT no servidor; não exige `ticket.view` |
| Pesquisa | Operacional (nº, sala, ativo, problema) | Uma única pesquisa simples (nº, assunto, local) |
| Filtros | Status, prioridade, responsável, sala, SLA, ordenação, arquivados | Nenhum |
| Apresentação | Linha operacional com prioridade, responsável, SLA, nota de status | Card simples agrupado por data de atualização (`Hoje` / `Ontem` / `DD/MM/AAAA`) |
| Estados | Fila local com sincronização em segundo plano | Loading (skeleton), vazio (com CTA para abrir chamado), erro (com retry) |

Regras da tela pessoal:

- **Um único conjunto.** A coleção vem inteira de `?mine=true`. Não há
  `queueTickets + mineTickets`, nem fallback para `GET /api/chamados` quando a
  consulta pessoal falha — nesse caso a tela mostra o erro.
- **A pesquisa é apresentação, não autorização.** Ela filtra apenas o conjunto já
  autorizado e nunca amplia o escopo. `reportedByUserId` não é lido no
  frontend.
- **Falha não vira fila.** Se `?mine=true` falhar, o estado é de erro com
  "Tentar novamente"; os chamados da equipe nunca aparecem no lugar.
- **"Meus Atendimentos" continua sendo um chip da fila** — é recorte de trabalho
  atribuído (só abertos), não histórico pessoal.
- **Abrir um chamado usa o endpoint individual.** O item navega para
  `/chamados/tickets/:id`, e `pages/TicketDetail.tsx` resolve o registro em duas
  etapas: usa a coleção local da fila quando ela tem o chamado (caminho
  operacional, sem chamada extra) e, quando não tem — que é o caso do
  solicitante, cuja lista pessoal vem de `listMine()`, por outro caminho — busca
  em `GET /api/chamados/:id` via `ticketService.getByIdRemote`. A autorização é a
  do servidor, pelas duas vias descritas abaixo. `403` vira "você não tem acesso",
  `404` continua "não encontrado", e falha de rede não é apresentada como
  registro ausente.

Pendências conhecidas no detalhe, deixadas fora do escopo da #341 de propósito:

- **Linha do tempo vazia para o solicitante.** `TicketDetail` carrega o histórico
  por `GET /api/chamados/:id/events`, que exige `ticket.view`; para o solicitante a
  chamada volta `403` e o erro é absorvido. Ele vê o detalhe, mas não os eventos.
  Decidir quais eventos um solicitante pode ver é uma alteração de autorização
  própria — misturá-la aqui confundiria as duas regras.
- **O detalhe pessoal é gravado na cache local da fila.** `getByIdRemote` chama
  `persistLocal`, que escreve o registro na coleção `chamados` do IndexedDB — a
  mesma que a fila usa. Essa coleção **não é namespaced por usuário** e nada é
  apagado no `signOut`, então num navegador compartilhado o chamado do solicitante
  fica no cache e aparece na lista operacional de quem logar em seguida (o
  `pullRemote` desse usuário volta `403` e o `load()` ainda renderiza o cache
  local). Não é uma falha de autorização — o backend continua recusando tudo —,
  mas é exposição de dados no cliente. Antes da #341 só quem tinha `ticket.view`
  escrevia nessa coleção, porque `pullRemote` é a outra única via de escrita.
  Próximo hardening: não persistir o registro no escopo pessoal, e/ou limpar a
  cache por usuário.

Implementação da apresentação: `utils/myTickets.ts` (`groupTicketsByUpdateDate`,
`filterTicketsByQuery`, `formatUpdatedLabel`, `dateGroupLabel`).

### GET /api/chamados/:id

Detalhe de um chamado. Exige autenticação e tem **duas vias**, avaliadas nesta
ordem:

1. **Isolamento de unidade.** O `workspace_id` do recurso precisa estar entre as
   memberships ativas do chamador (super admin não é cargo e tem bypass). Fora
   disso: `403 Acesso negado a este chamado`.
2. **Via operacional.** `ticket.view` no workspace do recurso, via
   `_require_action_in_handler` — o mecanismo RBAC 2.0 já existente, inalterado.
3. **Via pessoal.** Se, e somente se, a via operacional negar, o solicitante do
   **próprio** chamado lê o detalhe: `reportedByUserId == g.user_id`.

Regras da via pessoal:

- a identidade vem **sempre** de `g.user_id` (o `sub` do JWT validado por
  `@require_auth`) e é comparada com o `reportedByUserId` que o servidor gravou
  na criação. Nenhum dos dois lados vem de query string, body ou header — não há
  como assumir a identidade de outro usuário;
- só é alcançada **depois** do check de unidade, então não atravessa workspace;
- **não depende de status**: aberto, a caminho, em atendimento, resolvido, fechado
  e arquivado respondem igual, desde que a propriedade seja satisfeita;
- é **somente leitura**. `PATCH` continua exigindo `ticket.status` /
  `ticket.assign` / `ticket.edit`, `DELETE` exige `ticket.delete` e
  `/events` exige `ticket.view` — ser dono do chamado não habilita nenhum deles;
- chamado anônimo (`reportedByUserId` NULL, inclusive registros anteriores à
  migration 056) nunca satisfaz a regra: os dois lados precisam ser não-vazios.

Respostas, na convenção que já existia e que não foi alterada:

| Situação | Resposta |
|---|---|
| Não autenticado | `401` |
| Chamado inexistente | `404 Chamado não encontrado` |
| Existe, mas em outra unidade | `403 Acesso negado a este chamado` |
| Existe, na unidade, sem `ticket.view` e não é o dono | `403 Permissão insuficiente` |
| Existe, na unidade, `ticket.view` **ou** é o próprio solicitante | `200 { ticket }` |

> Ser solicitante de um chamado permite consultar o próprio detalhe, mas **não**
> concede acesso à fila operacional: `GET /api/chamados` continua exigindo
> `ticket.view`.

Isto **não é RBAC**: nenhuma Action foi criada, `ticket.view`, `role_permissions`,
`roles`, `memberships`, `membership_overrides` e RLS não foram alterados.

Cobertura: `api/tests/test_chamados_own_ticket_detail.py` (Casos A–H).

### PATCH /api/chamados/:id

Corpo com o objeto parcial do chamado: status, responsável, prioridade, arquivamento, fotos e `statusNote`.

### POST /api/public/chamados/:tracking_token/feedback

```json
{
  "rating": 4,
  "comment": "Atendimento rápido e eficiente"
}
```

- `rating` — inteiro de 1 a 5 (obrigatório)
- `comment` — texto de até 500 caracteres (opcional)

**Regras:** o chamado deve estar `resolvido` ou `fechado` e não pode ter avaliação prévia. Cada violação retorna `400` com a mensagem correspondente.

**Resposta:** `{ "ticket": { ...campos atualizados com feedbackRating, feedbackComment, feedbackAt } }`

### GET /api/chamados/reports

Relatório agregado no servidor com:

- total e distribuição por status, prioridade, categoria, área e sala
- por técnico: chamados abertos, resolvidos, tempo médio de resolução e avaliação média
- quantidade de avaliações e média

### POST /api/chamados/workspaces

Lista os campi disponíveis para o formulário público.

## Configuração de SLA

| Prioridade | Prazo de resposta | Prazo de resolução |
|------------|-------------------|--------------------|
| `urgente` | 30 minutos | 4 horas |
| `alta` | 2 horas | 8 horas |
| `normal` | 4 horas | 24 horas |
| `baixa` | 8 horas | 48 horas |

Os prazos são configuráveis na coleção `sla_configs`.

## Chaves locais

| Chave | Conteúdo |
|-------|----------|
| `labhub_chamados` | Cache local de chamados (não usado para escrita remota) |

## Componentes

| Componente | Propósito |
|------------|-----------|
| `Stars` | Avaliação por estrelas (1 a 5), interativa ou somente leitura |
| `TicketCard` | Card de chamado com status e ações rápidas |
| `TicketForm` | Formulário de abertura e edição (público ou TI) |
| `StatusBadge` | Indicador colorido de status |
| `PriorityBadge` | Indicador de prioridade |
| `AssignmentBadge` | Indicador de técnico responsável |
| `SLAStatus` | Indicador de cumprimento de SLA |
| `CommentItem` | Item do histórico de comentários |
| `AttachmentPreview` | Pré-visualização das fotos anexadas |
| `BatchActionBar` | Barra de ações em lote |
| `ReportExporter` | Exportação em CSV, XLSX e PDF |

## Hooks

| Hook | Propósito |
|------|-----------|
| `useTickets` | CRUD e estado dos chamados (fila operacional) |
| `useMyTickets` | Coleção pessoal de Meus Chamados (`?mine=true`), sem cache local e sem fallback |
| `useTicket` | Dados de um chamado específico |
| `useTicketForm` | Estado do formulário de chamado |
| `useSLAConfig` | Configuração de prazos por prioridade |
| `useNotifications` | Estado da inscrição e do envio de push |
| `useAdminUsers` | Estado da página de gestão de usuários |

## Serviços

| Serviço | Propósito |
|---------|-----------|
| `ticketService` | CRUD e comunicação com a API de chamados |
| `notificationService` | Gestão de inscrições de push e envios |
| `adminService` | Aprovação e gestão de usuários |
| `reportService` | Geração de relatórios e exportações |

## Relacionados

- [Visão geral](README.md)
- [Arquitetura](architecture.md)
- [Fluxos](workflows.md)
- [Referência da API](../../reference/api.md)
- [Referência do banco](../../reference/database.md)
