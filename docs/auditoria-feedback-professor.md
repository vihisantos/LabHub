# Auditoria: Fluxo de Feedback do Professor (Chamados)

## 1. Análise Frontend

### TrackPage (`src/apps/chamados-publico/pages/TrackPage.tsx`)
- **Status**: Ticket de跟踪 page com "Avaliar" button
- **Problema**: Button navega para `/feedback/:ticketId` (página separada)
- **Fluxo**: Professor clica "Avaliar" → redirecionado para FeedbackPage

### FeedbackPage (`src/apps/chamados-publico/pages/FeedbackPage.tsx`)
- **Status**: Página standalone com componente `Stars` + campo comment
- **Fluxo**: Professor seleciona estrelas 1-5 → digita comentário opcional → clica "Enviar"
- **Chamada API**: `submitFeedback(ticketId, rating, comment)` via `ticketService`

### ticketService (`src/apps/chamados/services/ticketService.ts:146`)
- **Função `submitFeedback()`**: Faz POST para `/api/chamados/${ticketId}/feedback`
- **Parâmetros**: `{ rating: number, comment?: string }`
- **Retorno**: `{ ticket: Ticket }`

### Push Notifications
- **Arquivo ausente**: `public/push-sw.js` NÃO EXISTE no repositório
- **Consequência**: Service worker não registrado → push notifications não funcionam
- **Resultado**: Professores NUNCA recebem notificação "Avalie o atendimento"

## 2. Análise Backend

### Endpoint Feedback (`api/app.py:1588-1645`)
```python
@app.route('/api/chamados/<ticket_id>/feedback', methods=['POST'])
```
- **Validações**:
  1. Ticket existe
  2. Status = 'resolvido' ou 'fechado'
  3. `feedbackRating` não está definido (já avaliado)
  4. Rating ∈ {1,2,3,4,5}
- **Updates gravados**: `feedbackRating`, `feedbackComment`, `feedbackAt`, `updatedAt`
- **Autenticação**: NENHUMA (endpoint público, sem auth check)

### Push Notification no Backend
- **Linha 862**: Push enviada quando ticket é resolvido
- **Função `_chamado_subs()`**: Busca subscriptions do professor
- **Dependência**: Requer `push-sw.js` para funcionar

## 3. Análise Banco de Dados

### Schema (`CHAMADOS_TABLE_SQL`, app.py:716-785)
```sql
feedbackRating INTEGER,
feedbackComment TEXT DEFAULT '',
feedbackAt TIMESTAMPTZ,
```
- **Constraint**: `chk_feedback_rating` (1-5, nullable)
- **Índices**: Nenhum específico para feedback

### Dados Reais
- **Zero tickets** com `feedbackRating` definido
- **Conclusão**: Feedback NUNCA foi utilizado por nenhum professor

## 4. Comparação: TrackPage vs FeedbackPage

| Aspecto | TrackPage | FeedbackPage |
|---------|-----------|--------------|
| **Acesso** | Link público `/track/:id` | Link público `/feedback/:ticketId` |
| **Avaliação** | Botão "Avaliar" | Formulário completo |
| **Fluxo** | Navega para página separada | Página dedicada |
| **UX** | Quebrado (muda de página) | Funcional (mas não usado) |

## 5. Verificação do Problema Relatado

### Sintomas
1. Professores não avaliam chamados resolvidos
2. Botão "Avaliar" existe mas não gera feedback

### Causas Raiz
1. **Push notifications quebradas**: `push-sw.js` não existe → professor NUNCA é notificado
2. **UX fragmentada**: TrackPage navega para página separada (perde contexto)
3. **Nenhum incentivo**: Sem notificação, professor esquece de avaliar
4. **Endpoint público sem auth**: Qualquer um pode avaliar qualquer ticket (risco de segurança)

## 6. Auditoria de Testes

### Testes Existente (`api/tests/test_chamados.py:704-758`)
- ✅ Sucesso (rating 1-5)
- ✅ Comentário vazio
- ✅ Rating inválido (400)
- ✅ Ticket não resolvido (400)
- ✅ Já avaliado (400)
- ❌ **Ausente**: Teste de autenticação/autorização
- ❌ **Ausente**: Teste de rating com decimais
- ❌ **Ausente**: Teste de limite de caracteres comentário

## 7. Diagnóstico Final

### CRÍTICO (BLOQUEIA FEEDBACK)
| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| C1 | `push-sw.js` ausente | Professor NUNCA notificado | Criar service worker |
| C2 | Nenhum push recebido | Zero feedback registrado | Corrigir push pipeline |

### NECESSÁRIO (MELHORA FLUXO)
| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| N1 | TrackPage navega para página separada | Perde contexto UX | Formulário inline no TrackPage |
| N2 | Endpoint público sem auth | Risco de abuso | Adicionar validação de ownership |
| N3 | Sem.testes auth | Cobertura incompleta | Adicionar testes de autorização |

### MELHORIA (OPCIONAL)
| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| M1 | Sem incentives | Baixa participação | Email follow-up após 24h |
| M2 | Rating pode ser decimal | Dados inconsistentes | Enforçar INTEGER no frontend |
| M3 | Comentário não validado no frontend | Dados sujos | Adicionar max chars |

---

## 8. Avaliação do Plano: Formulário Inline no TrackPage

### Objetivo
Substituir o botão "Avaliar" que navega para página separada por um formulário inline que aparece diretamente no card do ticket resolvido.

### Análise da TrackPage Atual (262 linhas)
- **Estado atual**: Botão `handleAvaliar()` navega para `/chamados-publico/feedback/${ticket.id}`
- **Componentes já existentes**: `Stars` (importado mas usado apenas para exibir avaliação existente)
- **Estado do card**: `expandedId` controla histórico; `commentByTicket` já gerencia comentários

### Proposta de Implementação

#### Mudanças no TrackPage.tsx
1. **Novo estado**: `feedbackRatingByTicket` (Record<string, number>)
2. **Novo estado**: `feedbackSubmitting` (Record<string, boolean>)
3. **Substituir botão "Avaliar"** por formulário inline:
   ```tsx
   {resolved && !ticket.feedbackRating && (
     <div className="space-y-2">
       <Stars 
         value={feedbackRatingByTicket[ticket.id] || 0}
         onChange={(v) => setFeedbackRatingByTicket(prev => ({...prev, [ticket.id]: v}))}
         size={20}
       />
       <div className="flex gap-2">
         <input ... placeholder="Comentário (opcional)" />
         <button onClick={() => handleFeedback(ticket)} disabled={!rating}>
           Enviar
         </button>
       </div>
     </div>
   )}
   ```

4. **Nova função `handleFeedback()`**:
   - Chama `ticketService.submitFeedback(ticket.id, rating, comment)`
   - Atualiza ticket local com resposta
   - Mostra sucesso/erro inline

#### Vantagens
- ✅ Professor avalia SEM sair da página
- ✅ UX coesa (mesmo contexto visual)
- ✅ Menos cliques (1 tela vs 2 páginas)
- ✅ Feedback imediato (sem navegação)

#### Riscos
- ⚠️ Aumenta complexidade do TrackPage (~50 linhas novas)
- ⚠️ Pode sobrecarregar card com muitos elementos
- ⚠️ Necessário testar mobile (espaço limitado)

#### Alternativa Mais Simples
Manter navegação mas corrigir push notifications (CRÍTICO C1). Se push funcionar, professor será notificado eTrackPage será suficiente.

### Recomendação
**Implementar C1 (push notifications) PRIMEIRO** — se push funcionar, professor será notificado eTrackPage será acessada via link. Se depois ainda houver baixa participação, então implementar formulário inline (N1).

---

**Data**: 2026-08-20  
**Auditor**: opencode  
**Status**: Auditoria completa — aguardando aprovação para implementação