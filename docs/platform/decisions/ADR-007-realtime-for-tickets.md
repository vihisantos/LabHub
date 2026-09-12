# ADR-007 — Supabase Realtime para atualização de chamados

## Status

Aceita

## Contexto

Mudanças de status de um chamado precisam chegar ao professor instantaneamente. O fallback por polling de 15 segundos introduz atraso desnecessário em atualizações sensíveis ao tempo, como "o técnico está a caminho".

## Decisão

Usar o Supabase Realtime (WebSocket) para atualização instantânea do status dos chamados. A aplicação assina as mudanças em `chamados_tickets` e mescla os dados ao estado local via `useRealtimeSubscription`.

O polling de 15 segundos permanece como fallback para ambientes em que o WebSocket não está disponível.

## Alternativas consideradas

1. **Somente polling (5 s)** — maior carga no servidor e ainda com latência
2. **Socket.io** — infraestrutura adicional, sendo que o Supabase já oferece WebSocket
3. **Server-Sent Events** — unidirecional, não atende à necessidade bidirecional

## Consequências

### Positivas

- Latência inferior a um segundo nas atualizações de status
- Sem infraestrutura adicional (o Realtime faz parte do Supabase)
- Fallback suave para polling
- Funciona entre abas do navegador por canais de broadcast

### Negativas

- As conexões WebSocket consomem recursos do plano Supabase
- Exige escopo cuidadoso de canais para não estourar limites de conexão
- Em cenários offline, recua para polling

## Relacionados

- `src/lib/useRealtimeSubscription.ts`
- `src/apps/chamados/contexts/TicketsContext.tsx`
- [Realtime](../architecture/realtime.md)
