# Chamados — Fluxos

> Passo a passo dos fluxos de uso do Chamados.

## Ciclo de vida do chamado

```mermaid
stateDiagram-v2
    [*] --> aberto
    aberto --> a_caminho : técnico despachado
    a_caminho --> em_atendimento : técnico no local
    em_atendimento --> em_espera : pausa (motivo obrigatório)
    em_espera --> em_atendimento : retomada
    aberto --> indeferido : indeferimento (motivo obrigatório)
    a_caminho --> indeferido : indeferimento (motivo obrigatório)
    em_atendimento --> indeferido : indeferimento (motivo obrigatório)
    em_atendimento --> resolvido : problema resolvido
    resolvido --> fechado : encerramento (arquiva o chamado)
    fechado --> [*]
```

Um chamado também pode ser arquivado a qualquer momento, o que o retira da visão
ativa sem alterar o status.

Dois estados **não** fazem parte da linha "resolvido → fechado":

- **`em_espera`** — pausa do atendimento: sai da fila ativa, permanece no
  histórico e é **retomável** (volta para `em_atendimento`).
- **`indeferido`** — estado **final** próprio: sai da fila ativa, **não** é
  arquivado, **não** conta como resolvido e **não** é retomável.

Os dois exigem um **motivo predefinido**, validado no servidor.

## Fluxo 1 — Abertura de chamado (professor)

```mermaid
sequenceDiagram
    participant P as Professor
    participant F as TicketForm
    participant API as API Flask
    participant DB as Supabase
    participant TI as Equipe de TI

    P->>F: Abre /chamados-publico (via QR Code)
    F->>F: Seleciona campus, sala e categoria
    F->>F: Preenche descrição e prioridade
    F->>F: Anexa foto (opcional)
    F->>API: POST /api/chamados
    API->>API: Valida os campos
    API->>API: Gera o ticketNumber
    API->>DB: INSERT em chamados_tickets
    API->>TI: Notificação push
    API-->>F: 200 { ticket }
    F->>P: Redireciona para a página de sucesso
    P->>P: Vê o número do chamado e o status
```

## Fluxo 2 — Atendimento do chamado (técnico)

```mermaid
sequenceDiagram
    participant TI as Técnico
    participant LIST as TicketList
    participant DETAIL as TicketDetail
    participant API as API Flask
    participant DB as Supabase
    participant P as Professor

    TI->>LIST: Abre a lista de chamados
    LIST->>LIST: Filtra por status e prioridade
    TI->>DETAIL: Abre o chamado
    DETAIL->>DETAIL: Adiciona comentário
    DETAIL->>API: PATCH /api/chamados/:id
    API->>DB: UPDATE + evento
    DETAIL->>DETAIL: Muda o status para em_atendimento
    DETAIL->>API: PATCH de status
    API->>DB: UPDATE
    API->>P: Push "Chamado atualizado"
    DETAIL->>DETAIL: Muda o status para resolvido
    DETAIL->>API: PATCH de status
    API->>P: Push "Como foi seu atendimento? ⭐"
    DB-->>P: Atualização em tempo real
```

![Detalhe do chamado com timeline de eventos e avanço de status](../../chamados-demo/screenshots/07-atendimento.png)

O detalhe do chamado concentra a timeline de eventos, as fotos anexadas, o controle de SLA e o botão de avanço de status.

## Fluxo 3 — Avaliação do atendimento (professor)

```mermaid
sequenceDiagram
    participant P as Professor
    participant FB as FeedbackPage
    participant API as API Flask
    participant DB as Supabase

    P->>FB: Clica no link da notificação
    FB->>FB: Carrega o chamado pelo identificador
    FB->>FB: Exibe o seletor de estrelas
    P->>FB: Seleciona 4 estrelas e escreve um comentário
    FB->>API: POST /api/public/chamados/:tracking_token/feedback
    API->>API: Valida (1 a 5 estrelas, no máximo 500 caracteres)
    API->>DB: UPDATE de feedbackRating e feedbackComment
    API-->>FB: 200 { ticket }
    FB->>P: "Obrigado pela avaliação!"
```

Regras da avaliação:

- Disponível apenas com status `resolvido` ou `fechado` e sem avaliação prévia
- Um chamado recebe no máximo uma avaliação, sem edição posterior; a gravação é
  atômica, então dois envios simultâneos não geram avaliação dupla
- A notificação de chamado resolvido traz link direto para o formulário

### Caminho público (link de acompanhamento)

- Sem login: o identificador da URL é o **token de acompanhamento**, que prova
  ser o dono do link. O chamado é resolvido a partir do token, nunca de um id
  enviado pelo cliente
- `POST /api/public/chamados/:tracking_token/feedback`

### Caminho autenticado (Meus Chamados)

Para quem está logado, avaliar não depende do token guardado no navegador
original (útil no cenário PC → celular):

```mermaid
sequenceDiagram
    participant S as Solicitante (logado)
    participant MT as Meus Chamados
    participant API as API Flask
    participant DB as Supabase

    S->>MT: Vê o aviso "avalie os chamados concluídos"
    S->>MT: Clica em "Avaliar" e escolhe as estrelas
    MT->>API: POST /api/chamados/:id/feedback
    API->>API: Confere unidade, posse (reportedByUserId == g.user_id) e status
    API->>DB: PATCH condicional (feedbackRating = null e status concluído)
    API-->>MT: 200 { ticket }
    MT->>MT: Remove o item e recarrega a lista
```

- O aviso é dispensável e tem limite de reapresentação; a chave local é escopada
  por usuário e chamado, então trocar de conta não mistura lembretes
- Só remove o item após o `200`; em falha mantém o formulário aberto para
  tentar de novo, e trata `409` como "já avaliado"
- `POST /api/chamados/:id/feedback`

## Fluxo 4 — Aprovação de usuário (admin)

```mermaid
sequenceDiagram
    participant U as Novo usuário
    participant API as API Flask
    participant DB as Supabase
    participant SW as Service Worker
    participant A as Admin

    U->>API: signUp (cria o perfil com status pending)
    API->>DB: INSERT em profiles (pending)
    API->>SW: Push para role admin, com ações
    SW->>A: "Novo cadastro: Aprovar / Recusar"
    A->>API: POST /api/push/action {approve, role, app_access}
    API->>DB: PATCH em profiles (status: active)
    API->>SW: Push de confirmação para o usuário
```

**Limitação do Web Push:** os botões de ação aparecem apenas no Chrome para Android e no desktop. No iOS/Safari a notificação apenas abre a URL definida, e o admin chega ao modal de aprovação pelo deep link `/admin/users?pending=<id>`.

## Fluxo 5 — Operações em lote (técnico)

1. Selecionar vários chamados pelas caixas de seleção
2. A barra de ações em lote apresenta as opções:
   - Arquivar selecionados
   - Atribuir a um técnico
   - Alterar prioridade
   - Alterar status
3. Confirmar no diálogo
4. Todos os chamados selecionados são atualizados
5. A lista é recarregada

## Fluxo 6 — Em espera e Indeferimento (técnico e solicitante)

Fluxo operacional novo (issue #367): pausar o atendimento sem resolvê-lo e
recusar formalmente uma solicitação, sempre com motivo predefinido. Detalhe
visual em [`docs/chamados-demo/screenshots/`](../../chamados-demo/screenshots/README.md) (capturas 12–19).

```mermaid
sequenceDiagram
    participant TI as Técnico
    participant DETAIL as TicketDetail
    participant API as API Flask
    participant DB as Supabase
    participant P as Solicitante

    TI->>DETAIL: Abre o chamado (estado ativo)
    alt Colocar em espera
        TI->>DETAIL: Clica em "Em espera"
        DETAIL->>DETAIL: Modal de motivo (obrigatório)
        TI->>DETAIL: Escolhe o motivo e confirma
        DETAIL->>API: PATCH /api/chamados/:id { status: em_espera, reasonCode }
        API->>API: Valida a transição e resolve o reasonLabel
        API->>DB: UPDATE + evento (reasonCode/reasonLabel)
    else Indeferir
        TI->>DETAIL: Clica em "Indeferir"
        DETAIL->>DETAIL: Modal de motivo (obrigatório)
        TI->>DETAIL: Escolhe o motivo e confirma
        DETAIL->>API: PATCH /api/chamados/:id { status: indeferido, reasonCode }
        API->>API: Valida a transição e resolve o reasonLabel
        API->>DB: UPDATE + evento (reasonCode/reasonLabel)
    end
    API-->>P: Atualização em tempo real + push com o resultado
    P->>API: GET /api/public/chamados/:tracking_token
    API-->>P: Estado + motivo + observação (CHAMADO INDEFERIDO, se for o caso)
    opt Retomada (só para em_espera)
        TI->>DETAIL: Clica em "Retomar atendimento"
        DETAIL->>API: POST /api/chamados/:id/resume
        API->>DB: PATCH atômico (status=em_espera → em_atendimento)
        API-->>TI: 200 (novo responsável) ou 409 (outro técnico retomou)
    end
```

### Em espera

![Detalhe com os botões Em espera e Indeferir](../../chamados-demo/screenshots/12-em-espera-acoes.png)

Regras:

- **Motivo obrigatório** de um catálogo predefinido (retorno do solicitante,
  equipamento/peça, terceiro/fornecedor, autorização, agendamento ou outro).
  O cliente envia só o `reasonCode`; o rótulo é resolvido no servidor.
- **Somente a partir de um estado ativo** da fila (`aberto`, `a_caminho` ou
  `em_atendimento`) — um chamado resolvido/fechado não pode ser pausado.
- **Única saída**: a retomada (`→ em_atendimento`). A retomada é atômica e pode
  ser feita por **qualquer técnico** do workspace (não fica travada pela
  disponibilidade do responsável anterior); em corrida, um vence e o outro
  recebe `409` sem efeitos.

![Modal de motivo do Em espera](../../chamados-demo/screenshots/13-modal-colocar-em-espera.png)

![Chamado em espera, com opção de retomar](../../chamados-demo/screenshots/15-chamado-em-espera.png)

### Indeferimento

![Detalhe com o botão Indeferir](../../chamados-demo/screenshots/14-modal-indeferir.png)

Regras:

- **Motivo obrigatório** de um catálogo predefinido (fora do escopo,
  duplicado, não é requisição de TI, recurso não pertence à instituição,
  outro setor, informações insuficientes ou outro).
- **Somente a partir de um estado ativo** da fila.
- **Estado final**: nenhuma transição de saída (não é retomado, reaberto nem
  assumido). Diferente de **resolvido**, o solicitante o vê como
  **CHAMADO INDEFERIDO** com o motivo — nunca como atendimento concluído.

![Chamado indeferido (card vermelho)](../../chamados-demo/screenshots/16-chamado-indeferido.png)

### Acompanhamento pelo solicitante

O link público de acompanhamento (token) mostra o estado e o motivo, sem login:

![Acompanhamento público de um chamado em espera](../../chamados-demo/screenshots/17-acompanhar-em-espera.png)

![Acompanhamento público de um chamado indeferido](../../chamados-demo/screenshots/18-acompanhar-indeferido.png)

![Resultado do indeferimento para o solicitante](../../chamados-demo/screenshots/19-resultado-indeferido.png)

## Relacionados

- [Visão geral](README.md)
- [Arquitetura](architecture.md)
- [Referência](reference.md)
