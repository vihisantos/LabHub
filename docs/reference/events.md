# Referência de eventos

> Eventos de realtime, notificações push e eventos de sistema.

## Eventos do Supabase Realtime

### chamados_tickets

| Evento | Conteúdo | Consumidores |
|--------|----------|--------------|
| `INSERT` | Chamado criado | TicketList, Dashboard |
| `UPDATE` | Chamado alterado | TicketDetail, TicketList |
| `DELETE` | Chamado excluído | TicketList |

### Nomes de canal

```text
chamados:public:{ticketId}        — atualizações de um chamado
chamados:workspace:{workspaceId}  — atualizações de todos os chamados do workspace
```

## Eventos de notificação push

### Chamados

| Evento | Título | Destino |
|--------|--------|---------|
| Chamado novo | "Novo chamado #{número}" | Inscrições com acesso ao Chamados e ao workspace |
| Atualização de status | "Chamado #{número} atualizado" | Solicitante |
| Resolvido | "Como foi seu atendimento? ⭐" | Solicitante |

### Aprovação de usuários

| Evento | Título | Destino |
|--------|--------|---------|
| Novo cadastro | "Novo cadastro pendente" | Cargo `admin` |
| Aprovado | "Cadastro aprovado!" | Usuário |
| Recusado | "Cadastro não aprovado" | Usuário |

### Eventos de sistema

| Evento | Título | Destino |
|--------|--------|---------|
| Reserva próxima | "Reserva em 30 min" | Responsável pela reserva |
| Empréstimo vencido | "Empréstimo vencido" | Responsável pelo empréstimo |
| Estoque baixo | "Estoque baixo" | Cargo `admin` |
| Manutenção agendada | "Manutenção agendada" | Cargo `admin` |

## Ações de notificação

Notificações push podem incluir botões de ação:

```json
{
  "actions": [
    { "action": "approve", "title": "Aprovar" },
    { "action": "reject", "title": "Recusar" }
  ],
  "url": "/admin/users?pending={userId}"
}
```

Tratamento das ações:

- `approve` → `POST /api/push/action` → `PATCH profiles (status: active)`
- `reject` → `POST /api/push/action` → exclusão do perfil
- Clique no corpo → abre a `url` no navegador

Os botões só aparecem no Chrome para Android e no desktop; no iOS/Safari a notificação abre a URL.

## Eventos de broadcast (entre abas)

| Canal | Evento | Propósito |
|-------|--------|-----------|
| `chamados:{workspaceId}` | `ticket_updated` | Sincronizar a lista de chamados entre abas |

## Eventos no aplicativo

Além do push, o painel do Chamados detecta chamados novos por polling de 10 segundos e publica no sino de notificações, com deduplicação por `actionUrl`, som de dois tons e notificação nativa quando a página está em segundo plano.

## Relacionados

- [Realtime](../platform/architecture/realtime.md)
- [Arquitetura de backend](../platform/architecture/backend.md)
- [Referência da API](api.md)
