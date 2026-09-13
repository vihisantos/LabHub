# Chamados — Fluxos

> Passo a passo dos fluxos de uso do Chamados.

## Ciclo de vida do chamado

```mermaid
stateDiagram-v2
    [*] --> aberto
    aberto --> a_caminho : técnico despachado
    a_caminho --> em_atendimento : técnico no local
    em_atendimento --> resolvido : problema resolvido
    resolvido --> fechado : encerramento (arquiva o chamado)
    fechado --> [*]
```

Um chamado também pode ser arquivado a qualquer momento, o que o retira da visão ativa sem alterar o status.

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

- Acesso público: o identificador do chamado é o token de acesso
- Disponível apenas com status `resolvido` ou `fechado`
- Um chamado recebe no máximo uma avaliação, sem edição posterior
- A notificação de chamado resolvido traz link direto para o formulário

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

## Relacionados

- [Visão geral](README.md)
- [Arquitetura](architecture.md)
- [Referência](reference.md)
