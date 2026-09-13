# Offline-first

> Como o LabHub funciona sem internet?

## O que é

Offline-first significa que a aplicação lê e escreve primeiro no `localStorage`, tratando-o como fonte de verdade. Quando há internet, as alterações sincronizam com o Supabase em segundo plano.

## Por que

Laboratórios universitários nem sempre têm conexão estável. Técnicos precisam abrir chamados, consultar inventário e registrar informações mesmo offline. A aplicação nunca pode bloquear por indisponibilidade de rede.

## Como funciona

### Caminho de escrita (offline)

```text
Ação do usuário (criar, atualizar, excluir)
    ↓
Escrita no localStorage (instantânea e síncrona)
    ↓
Coleção marcada como "dirty" em labhub_dirty_collections
    ↓
Interface atualiza imediatamente
```

### Caminho de sincronização (online)

```text
A engine de sync roda (periódica ou por gatilho)
    ↓
Para cada coleção marcada como dirty:
    1. puxa as alterações remotas do Supabase
    2. faz merge por timestamp (a versão mais recente vence)
    3. envia as alterações locais mais recentes
    4. limpa a marcação de dirty
    ↓
A interface é renderizada novamente com os dados mesclados
```

### Comportamentos importantes

- **A primeira sincronização é apenas de pull** — dados de mock/seed do `localStorage` nunca são enviados
- **Merge por timestamp** — o campo `updatedAt` define qual versão vence
- **Tombstones** — identificadores excluídos são guardados em `labhub_deleted_ids` e propagados ao remoto na sincronização seguinte
- **Fallback por polling** — sincronização a cada 15 segundos como apoio ao realtime

### O que funciona offline

| Recurso | Comportamento offline |
|---------|----------------------|
| Operações de CRUD | Funcionalidade completa |
| Busca e filtros | Funcionalidade completa |
| Abertura de chamado (pública) | Registrada localmente, entra na fila de sincronização |
| Notificações push | Exigem conexão |
| Atualizações em tempo real | Recuam para polling |
| Upload de fotos (Cloudinary) | Exige conexão |

### Estrutura do localStorage

Todo dado local usa o prefixo `labhub_`:

- `labhub_pcs` — dados do PC Care
- `labhub_stock_items` — dados do Estoque
- `labhub_dirty_collections` — coleções com sincronização pendente
- `labhub_deleted_ids` — tombstones para propagação
- `labhub_sync_log` — histórico de sincronizações

## Relacionados

- [Sincronização](synchronization.md) — detalhes da engine de sync
- [Camada de dados](../architecture/data-layer.md)
