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
| POST | `/api/public/chamados/:tracking_token/feedback` | Registrar avaliação pelo token de acompanhamento (sem login) |
| POST | `/api/chamados/:id/feedback` | Registrar avaliação pelo solicitante autenticado (dono do chamado) |
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

## Projeção dos dados devolvidos

**Estar autorizado a ver um chamado não é estar autorizado a receber todos os
campos armazenados nele.** A leitura interna nunca usa `select=*`: a coluna não
é pedida ao banco e a resposta é filtrada de novo antes de sair, para a garantia
não depender de um serviço remoto honrar o `select`.

Duas colunas **nunca** atravessam a API interna:

| Coluna | Por quê |
|---|---|
| `tracking_token_hash` | SHA-256 da credencial de acompanhamento do professor. É segredo de autenticação, usado só por `@require_tracking_token`. |
| `reportedByUserId` | Identidade **interna** do solicitante. O backend a usa para o escopo pessoal de `mine=true` e para a via pessoal do detalhe. O frontend não a lê em runtime. |

`reportedByUserId` sai da **resposta** e continua inteiro no **filtro** do banco:
é por lá que o escopo pessoal é decidido, a partir de `g.user_id`. Nenhum
parâmetro do cliente entra nessa decisão.

Todo o resto tem consumidor comprovado na fila ou no detalhe, e é por isso que
fila e detalhe compartilham a mesma allowlist: a lista alimenta o cache local, de
onde o `TicketDetail` também lê — uma projeção mais estreita na lista abriria a
tela de detalhe incompleta.

A timeline (`/events`) tem projeção própria, espelhando a do endpoint público: só
o que o consumidor lê. `ticket_id` e `workspace_id` não saem — o segundo é dado
de escopo interno.

A projeção **pública** (`_project_public_ticket`) continua separada e mais
estreita, como antes. Nenhum caminho interno reaproveita a projeção pública, nem
o contrário.

Implementação: `CHAMADOS_TICKET_READ_COLS`, `CHAMADOS_EVENT_READ_SELECT` e
`_project_internal_ticket`, em `api/app.py`.

Cobertura: `api/tests/test_chamados_data_minimization.py`.

### GET /api/chamados

Parâmetros de consulta opcionais: `workspace_id`, `status`, `reportedBy`, `mine`,
`limit`, `offset`.

Dois escopos no mesmo endpoint e no mesmo formato de resposta:

| Consulta | Escopo | Autorização |
|---|---|---|
| `GET /api/chamados` | Lista **operacional** (a fila da unidade) | Action `ticket.view` por workspace (RBAC 2.0) |
| `GET /api/chamados?mine=true` | **Meus Chamados** — só os chamados que o chamador abriu | `reportedByUserId` = identidade autenticada. **Não exige `ticket.view`** |

#### Paginação opcional (`limit`/`offset`)

Sem `limit`/`offset` o contrato é **inalterado** (resposta `{ "tickets": [...] }`
e nenhum `Prefer` adicional) — todos os consumidores existentes (fila
operacional `useTickets`, Meus Chamados, relatórios) são preservados. Quando
enviados:

- São validados (`1 ≤ limit ≤ 200`, `offset ≥ 0`; inválidos → `400`) e
  repassados ao PostgREST (`limit=.N`, `offset=.M`).
- A chamada usa `Prefer: count=exact` e o payload passa a ser
  `{ tickets, pageSize, offset, hasMore }`; `total` só é incluído quando o
  `Content-Range` do PostgREST puder ser lido (se não vier, o cliente navega por
  `hasMore`).
- A ordenação (`order=createdAt.desc`), o isolamento por workspace e o escopo
  operacional/pessoal continuam exatamente os mesmos.

> **Limitação documentada (importante):** esta camada NÃO traz filtragem
> server-side. A Central do Coordenador baixa uma **janela** do histórico via
> `limit`/`offset` e aplica busca/SLA/status/prioridade **no frontend, sobre a
> janela carregada**. Filtros não cruzam páginas ainda não baixadas, e a
> paginação não é globalmente filtrada. Não mover busca/SLA/filtros para o
> servidor sem ampliar este endpoint.

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

#### Aviso de avaliação (`FeedbackReminder`)

No topo de Meus Chamados, o `FeedbackReminder` lembra o solicitante de avaliar
os chamados **concluídos e ainda não avaliados** da sua própria coleção
(`?mine=true`): nenhuma leitura extra é feita, a própria lista autorizada já
contém status e `feedbackRating`. A elegibilidade é sempre decidida pelo estado
que veio do servidor.

- **Registro em linha.** Ao tocar em "Avaliar", abre um formulário com `Stars` e
  comentário opcional; o envio chama `ticketService.submitFeedback`, que faz
  `POST /api/chamados/:id/feedback` (caminho autenticado acima).
- **Só some após confirmação.** O item é removido e a lista recarregada
  (`onRated` → `reload()`) somente depois do `200`. Em falha, a mensagem aparece
  (`role="alert"`) e o formulário continua aberto para nova tentativa. Um `409`
  é tratado como "já avaliado" (o item é removido sem erro).
- **Dispensável, com limite.** "Dispensar lembrete de avaliação" esconde o aviso
  sem marcar o chamado como avaliado. A reapresentação é limitada por
  `chamado_feedback_reminder_<userId|anon>_<ticketId>` (máx. 2 exibições); depois
  disso o aviso não volta sozinho. Avaliar com sucesso dispensa o lembrete de vez.
- **Sem token, sem problema.** O caminho autenticado não usa o token de
  acompanhamento guardado no `localStorage`; avaliar funciona mesmo quando o
  token original não existe naquele navegador.
- **O `localStorage` não decide nada.** Ele só evita repetir o aviso: nunca é
  prova de avaliação, posse ou autorização — isso é sempre do servidor.

Pendências e regras de cache no detalhe:

- **Linha do tempo vazia para o solicitante.** `TicketDetail` carrega o histórico
  por `GET /api/chamados/:id/events`, que exige `ticket.view`; para o solicitante a
  chamada volta `403` e o erro é absorvido. Ele vê o detalhe, mas não os eventos.
  Decidir quais eventos um solicitante pode ver é uma alteração de autorização
  própria — misturá-la aqui confundiria as duas regras.
- **O registro lido no escopo pessoal não entra na cache da fila.** A coleção
  `chamados` do IndexedDB é a cache da FILA OPERACIONAL, alimentada por
  `pullRemote` — que só responde a quem tem `ticket.view`. `getByIdRemote` faz
  leitura pura e **não** grava nela (#342). A regra é por via de acesso, não por
  conteúdo: nenhuma comparação de identidade, `reportedByUserId` ou `mine=true`
  participa da decisão de onde gravar.
- **Escrita fora da fila vai direto ao recurso.** `update` do contexto só
  alcança a API para registros que já estão na cache local
  (`local.update` devolve `undefined` para id ausente, e o PATCH fica dentro do
  `if (ticket)`). Como a leitura por id não popula mais a cache, um chamado
  aberto por deep link usaria `ticketService.patchRemote` — PATCH no recurso,
  sem passar pela coleção. A autorização continua sendo do servidor; isso é
  escolha de transporte, não de permissão.

Pendência que resta no detalhe, fora do escopo de propósito:

- **Linha do tempo vazia para o solicitante.** `TicketDetail` carrega o histórico
  por `GET /api/chamados/:id/events`, que exige `ticket.view`; para o solicitante a
  chamada volta `403` e o erro é absorvido. Ele vê o detalhe, mas não os eventos.
  Decidir quais eventos um solicitante pode ver é uma alteração de autorização
  própria — misturá-la aqui confundiria as duas regras.

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

### Avaliação do atendimento (issue #370)

Existem **dois caminhos de escrita** para a mesma avaliação, com o **mesmo núcleo**
no backend (`_write_chamado_feedback` + `_parse_feedback_rating` em `api/app.py`).
Só a autorização difere; a regra de elegibilidade e a gravação atômica são
compartilhadas, e não há tabela nem migration de feedback — continua nos campos
`feedbackRating` / `feedbackComment` / `feedbackAt` do próprio chamado.

**Elegibilidade (igual nos dois caminhos):**

- o chamado existe;
- o status é `resolvido` ou `fechado` (efetivamente concluído);
- ainda não tem `feedbackRating`.

Chamados em aberto, `a_caminho`, `em_atendimento`, `em_espera`, `indeferido`,
cancelados ou já avaliados não podem avaliar.

**Corpo (igual nos dois caminhos):**

```json
{
  "rating": 4,
  "comment": "Atendimento rápido e eficiente"
}
```

- `rating` — inteiro de 1 a 5 (obrigatório); qualquer outra coisa → `400`;
- `comment` — texto opcional, truncado em 500 caracteres.

**Concorrência (idempotência):** a gravação é um `PATCH` condicional
(`feedbackRating=is.null` **e** status em `resolvido,fechado`). Se dois pedidos
chegam juntos — inclusive um pelo caminho público e outro pelo autenticado — o
primeiro grava, o segundo encontra `0` linhas e recebe `409`. **Nunca há avaliação
dupla.**

#### POST /api/public/chamados/:tracking_token/feedback

Caminho **sem login**. O chamado é derivado **do token de acompanhamento**
(`_token_lookup` / `_find_ticket_by_token`), nunca de um id enviado pelo cliente:
o token prova ser o dono do link. Não há autenticação de usuário. Todo erro é
devolvido sem revelar dado privado do chamado.

#### POST /api/chamados/:id/feedback

Caminho **autenticado** (`@require_auth`), para o solicitante avaliar de dentro
de Meus Chamados sem depender do token guardado no navegador original (por
exemplo, PC → celular). Ordem de verificação:

1. **Isolamento de unidade.** O `workspace_id` do recurso precisa estar entre as
   memberships ativas do chamador (super admin tem bypass). Fora disso: `403`.
2. **Posse.** `reportedByUserId` (gravado pelo servidor na criação) precisa ser
   igual a `g.user_id` (o `sub` do JWT). Chamado anônimo (`reportedByUserId`
   NULL) nunca satisfaz. Avaliar o chamado de outro com o id em mãos → `403`.
3. Só então o **núcleo compartilhado** valida status e grava.

Nada de identidade, posse, workspace ou papel vem do cliente. O endpoint **não**
passa por RBAC: igual a `mine=true` e à via pessoal do detalhe, é acesso ao
**próprio** recurso, não uma Action `ticket.*`.

Respostas da avaliação (mesma convenção nos dois caminhos):

| Situação | Resposta |
|---|---|
| Sucesso | `200 { ticket }` (projeção interna no caminho autenticado; pública no público) |
| Não autenticado (só no caminho autenticado) | `401` |
| Chamado inexistente | `404 Chamado não encontrado` |
| Fora da unidade, ou não é o dono (caminho autenticado) | `403` |
| Status não é `resolvido`/`fechado` | `403` |
| Já avaliado (ou perdido na corrida) | `409` |
| `rating` fora de 1–5 | `400` |
| Falha ao gravar | `502` |

**Resposta:** `{ "ticket": { ...campos atualizados com feedbackRating, feedbackComment, feedbackAt } }`

Cobertura: `api/tests/test_chamados_feedback_authenticated.py`,
`api/tests/test_chamados_p2_atomicidade.py` e `api/tests/test_tracking_token.py`.

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
| `chamado_feedback_reminder_<userId\|anon>_<ticketId>` | Lembrete de avaliação: quantas vezes o aviso já foi exibido para aquele usuário naquele chamado. Escopado por identidade (e `anon` para o público) para não misturar contas; é sempre apresentação local, nunca prova de avaliação, posse ou autorização |

## Componentes

| Componente | Propósito |
|------------|-----------|
| `Stars` | Avaliação por estrelas (1 a 5), interativa ou somente leitura |
| `FeedbackReminder` | Aviso de avaliação em Meus Chamados: lista os chamados concluídos e ainda não avaliados, com formulário de nota em linha (`Stars` + comentário). Dispensável, com limite de reapresentação |
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
