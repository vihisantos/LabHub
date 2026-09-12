# Validação — Pipeline de notificação push e avaliação (Chamados)

**Data:** 2026-08-20
**Escopo:** validação ponta a ponta do pipeline de notificação e de avaliação do atendimento
**Resultados registrados na data:** 128/128 testes passando · TypeScript sem erros · lint sem erros

> Documento datado. Para o comportamento vigente, consulte [Chamados](../../apps/chamados/README.md), [Referência da API](../../reference/api.md) e [Referência de configuração](../../reference/configuration.md).
>
> Nota de contexto: na data desta validação o fluxo de push do formulário público referenciava um service worker próprio (`public/push-sw.js`), que não existia no repositório. O tratamento de `push` e `notificationclick` foi posteriormente concentrado em `src/sw.ts`.

---

## 1. Inscrição (subscription)

Fluxo analisado:

```text
TicketSuccess.tsx   → navigator.serviceWorker.register(...)
TicketSuccess.tsx   → registration.pushManager.subscribe({ vapidKey })
TicketSuccess.tsx   → POST /api/chamados/:id/subscribe
app.py              → chamados_subscribe() → armazenamento no Redis
```

Validado por inspeção de código e por testes:

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Inscrição criada | OK | `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` |
| Endpoint gravado no backend | OK | `chamados_subscribe()` armazena em Redis, na chave `push:chamado:{ticket_id}` |
| Chaves VAPID disponíveis no frontend | OK | `VITE_VAPID_PUBLIC_KEY` presente na configuração |
| Deduplicação por endpoint | OK | Teste `test_subscribe_dedupe_por_endpoint` |
| Inscrição vinculada ao chamado correto | OK | Chave `push:chamado:{ticket_id}` |

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Service worker registrado no navegador real | Exige teste manual |
| Inscrição efetivamente criada no navegador | Exige teste manual |
| Chaves VAPID configuradas em produção | Exige verificação no painel da Vercel |

## 2. Disparo do push

Fluxo analisado:

```text
Técnico altera o status para "resolvido"
  ↓
chamados_manage()            [app.py:1145]
  ↓
PATCH no Supabase
  ↓
chamados_manage() detecta a mudança   [app.py:1268-1273]
  ↓
_notify_ticket_status(ticket)         [app.py:853]
  ↓
push_notify(sub, title, body, url)    [app.py:877]
  ↓
webpush() envia a notificação
```

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Código que dispara `_notify_ticket_status` | OK | `app.py:1273` — acionado quando status ou `statusNote` muda |
| Payload para `resolvido` | OK | `app.py:862-865` — título, corpo e URL corretos |
| URL de avaliação | OK | `app.py:865` — `/chamados-publico/feedback/{id}` |
| Envio efetivo | OK | Teste `test_create_envia_push_para_subscribers` |
| Falha de push não impede a criação do chamado | OK | Teste `test_create_push_falha_nao_impede_criacao` |
| URL de feedback não usada em outros status | OK | Teste `test_patch_status_em_atendimento_nao_usa_url_feedback` |

Payload confirmado para o status `resolvido`:

```python
# app.py:862-865
title = 'Como foi seu atendimento? ⭐'
body = f"O chamado #{ticket.get('ticketNumber')} foi resolvido. Avalie o atendimento da equipe de TI."
url = f"/chamados-publico/feedback/{ticket.get('id')}"
```

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Push efetivamente entregue ao navegador | Exige teste manual com inscrição real |
| `VAPID_PRIVATE_KEY` configurada em produção | Exige verificação no painel da Vercel |

## 3. Service worker no navegador

Fluxo analisado:

```text
Push recebido pelo service worker
  ↓
evento 'push'
  ↓
event.data.json() → { title, body, url }
  ↓
self.registration.showNotification(title, { body, icon, data: { url } })
  ↓
Notificação exibida
```

| Verificação | Resultado |
|-------------|-----------|
| Tratamento do evento `push` | OK |
| Payload interpretado com fallback | OK |
| Título com valor padrão | OK |
| Corpo com valor padrão | OK |
| URL preservada nos dados da notificação | OK |
| Ícone e vibração configurados | OK |

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Notificação exibida no navegador | Exige teste manual |
| Service worker ativo e registrado | Exige teste manual |

## 4. Clique na notificação

Fluxo analisado:

```text
Usuário clica na notificação
  ↓
evento 'notificationclick'
  ↓
event.notification.close()
  ↓
url = event.notification.data.url
  ↓
clients.matchAll() → foca a janela existente ou abre uma nova
  ↓
client.navigate(url)
```

| Verificação | Resultado |
|-------------|-----------|
| URL recuperada dos dados da notificação | OK |
| Foco na janela existente | OK |
| Abertura de nova janela quando não há nenhuma | OK |
| Deep link preservado até a navegação | OK |

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Navegador chega a `/chamados-publico/feedback/:id` | Exige teste manual |

## 5. Avaliação do atendimento

Fluxo analisado:

```text
Professor clica na notificação
  ↓
Navegador abre /chamados-publico/feedback/:ticketId
  ↓
FeedbackPage carrega o chamado           [FeedbackPage.tsx:36]
  ↓
Professor seleciona estrelas e comentário
  ↓
handleSubmit()                           [FeedbackPage.tsx:53]
  ↓
ticketService.submitFeedback()           [ticketService.ts:146]
  ↓
POST /api/chamados/:id/feedback
  ↓
chamados_feedback()                      [app.py:1589]
  ↓
PATCH no Supabase: feedbackRating, feedbackComment, feedbackAt
```

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Rota `/feedback/:ticketId` configurada | OK | `chamados-publico/index.tsx:25` |
| FeedbackPage carrega o chamado | OK | `FeedbackPage.tsx:36` — `getByIdRemote(ticketId)` |
| Validação de status resolvido/fechado | OK | `app.py:1608` e teste `test_feedback_chamado_aberto_retorna_400` |
| Validação de avaliação única | OK | `app.py:1610` e teste `test_feedback_chamado_ja_avaliado_retorna_400` |
| Validação da nota entre 1 e 5 | OK | `app.py:1622` e 7 testes de nota |
| Persistência no banco | OK | `app.py:1633-1638` |
| Resposta de sucesso | OK | `app.py:1641` |
| Suíte completa | OK | 17 de 17 testes aprovados |

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Envio real pelo professor | Exige teste ponta a ponta |

## 6. Persistência

Fluxo analisado:

```text
Avaliação gravada no banco
  ↓
TrackPage consulta os chamados            [TrackPage.tsx:29]
  ↓
ticket.feedbackRating existe
  ↓
TrackPage renderiza <Stars disabled />    [TrackPage.tsx:159]
  ↓
Exibe "Avaliado"                          [TrackPage.tsx:160]
```

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| `feedbackRating` no schema | OK | `CHAMADOS_TABLE_SQL` — `feedbackRating INTEGER` |
| `feedbackComment` no schema | OK | `feedbackComment TEXT DEFAULT ''` |
| `feedbackAt` no schema | OK | `feedbackAt TIMESTAMPTZ` |
| Constraint de faixa da nota | OK | `chk_feedback_rating`, de 1 a 5, com valor nulo permitido |
| TrackPage exibe "Avaliado" | OK | `TrackPage.tsx:157-161` |
| Avaliação duplicada bloqueada | OK | `app.py:1610` e teste correspondente |

Não validado na ocasião:

| Verificação | Motivo |
|-------------|--------|
| Dados persistidos em produção | Exige consulta ao banco |

## 7. Testes automatizados

```text
pytest api/tests/test_chamados.py -v

128 passed
```

| Categoria | Testes | Resultado |
|-----------|--------|-----------|
| Avaliação (nota, comentário e validações) | 17 | Aprovados |
| Inscrição (endpoint, deduplicação e Redis) | 6 | Aprovados |
| Push (envio, falha e atribuição) | 9 | Aprovados |
| Demais (criação, gestão, eventos etc.) | 96 | Aprovados |

Frontend:

```text
tsc --noEmit  → 0 erros
npm run lint  → 0 erros (apenas avisos pré-existentes)
```

## 8. Conclusão

**Classificação na data:** funcionando parcialmente.

Todo o código estava consistente e os 128 testes passavam, mas a validação se limitou a inspeção estática e testes automatizados. A validação em produção — navegador real, push real e avaliação real — não foi executada naquele ambiente.

Teste manual indicado para completar a validação:

1. Abrir `/chamados-publico/success/:ticketId` em um navegador
2. Clicar em "Ativar notificações" e autorizar
3. Confirmar em DevTools → Application → Service Workers que o service worker está ativo
4. Confirmar em DevTools → Application → Push Messaging que a inscrição foi criada
5. Pedir a um técnico que resolva o chamado
6. Verificar se a notificação aparece
7. Clicar na notificação e confirmar que abre `/chamados-publico/feedback/:id`
8. Selecionar estrelas, escrever um comentário e enviar
9. Recarregar a página e confirmar que exibe "Avaliado"
10. Consultar o banco e confirmar que `feedbackRating` está preenchido

## 9. Acompanhamento

| Etapa | O que faltava validar | Como validar |
|-------|-----------------------|--------------|
| Inscrição real | Service worker registrado e inscrição criada | Abrir a página de sucesso, ativar notificações e conferir em DevTools |
| Push real | Notificação recebida e exibida | Resolver um chamado com uma inscrição ativa |
| Clique real | Navegação para a página de avaliação | Clicar na notificação |
| Avaliação real | Formulário funcionando | Enviar uma avaliação e conferir no banco |
| Persistência real | Dados no Supabase | Consultar `chamados_tickets` com `feedbackRating IS NOT NULL` |
| VAPID em produção | Chaves configuradas | Conferir as variáveis de ambiente na Vercel |
