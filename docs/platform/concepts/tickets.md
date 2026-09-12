# Chamados

> O que é um chamado e como o fluxo de atendimento funciona?

## O que é

Um **chamado** é uma solicitação de suporte ou ordem de serviço criada pela aplicação Chamados. Ele representa um problema relatado por um professor ou servidor que precisa da atenção da equipe de TI.

## Por que existe

Laboratórios universitários precisam de um caminho estruturado para tratar solicitações, do relato à resolução e à avaliação. O chamado traz responsabilidade, controle de SLA e histórico completo.

## Ciclo de vida

```text
Criado (aberto)
    ↓  Técnico despachado
A caminho (a_caminho)
    ↓  Técnico chega
Em atendimento (em_atendimento)
    ↓  Problema resolvido
Resolvido (resolvido)
    ↓  Admin confirma
Fechado (fechado)
```

Um chamado também pode ser **arquivado** (retirado da visão ativa) sem alterar seu status.

## Propriedades principais

| Propriedade | Descrição |
|-------------|-----------|
| `ticketNumber` | Número sequencial por workspace (por exemplo, #42) |
| `priority` | `baixa`, `normal`, `alta`, `urgente` — define os prazos de SLA |
| `workspace_id` | Campus ao qual o chamado pertence |
| `roomName` | Local do problema |
| `problemCategory` | Categoria (hardware, software, rede etc.) |
| `problemArea` | Área do problema: `administrativa` ou `academica` |
| `reportedBy` | Nome de quem relatou |
| `assignedTo` | Técnico responsável pelo atendimento |
| `feedbackRating` | Avaliação de 1 a 5 estrelas após a resolução |

## Pontos de acesso

1. **Formulário público** (`/chamados-publico`) — professores abrem chamados por QR Code ou link, sem login
2. **Painel de TI** (`/chamados`) — técnicos gerenciam, atribuem e resolvem chamados
3. **Acompanhamento público** (`/chamados-publico/track`) — professores consultam o status pelo nome
4. **Avaliação** (`/chamados-publico/feedback/:id`) — professores avaliam o atendimento após a resolução

## Eventos do chamado

Toda alteração gera um evento no histórico do chamado:

- Mudanças de status
- Comentários (com fotos opcionais)
- Atribuições
- Mudanças de prioridade

Os eventos são imutáveis e formam o histórico de auditoria do atendimento.

## SLA

Cada prioridade tem prazos-alvo de resposta e de resolução, configuráveis em `sla_configs`. O painel mostra chamados atrasados e próximos do prazo.

## Fluxo de dados

```text
Professor envia o formulário (público)
    ↓
API Flask valida e gera o ticketNumber
    ↓
Supabase (chamados_tickets)
    ↓
Notificação push para a equipe de TI
    ↓
Técnico assume o chamado
    ↓
Mudanças de status chegam ao professor em tempo real
    ↓
Professor avalia o atendimento (1 a 5 estrelas)
```

## Relacionados

- [Aplicação Chamados](../../apps/chamados/README.md)
- [Sincronização](synchronization.md)
- [Realtime](../architecture/realtime.md)
- [Referência da API](../../reference/api.md)
