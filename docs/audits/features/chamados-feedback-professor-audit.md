# Auditoria — Fluxo de avaliação do atendimento (Chamados)

> Auditoria de 2026-08-20. Documento datado: descreve o estado do sistema naquela data. Para o comportamento vigente, consulte [Chamados](../../apps/chamados/README.md) e [Referência do Chamados](../../apps/chamados/reference.md).

## 1. Frontend

### TrackPage (`src/apps/chamados-publico/pages/TrackPage.tsx`)

- Página pública de acompanhamento, com botão "Avaliar" para chamados resolvidos
- O botão navega para `/feedback/:ticketId`, abrindo uma página separada
- Fluxo: o professor clica em "Avaliar" e é redirecionado para a página de avaliação

### FeedbackPage (`src/apps/chamados-publico/pages/FeedbackPage.tsx`)

- Página dedicada, com o componente `Stars` e um campo de comentário
- Fluxo: o professor seleciona de 1 a 5 estrelas, escreve um comentário opcional e envia
- Chamada de API: `submitFeedback(ticketId, rating, comment)` via `ticketService`

### ticketService (`src/apps/chamados/services/ticketService.ts:146`)

- `submitFeedback()` faz `POST` para `/api/chamados/${ticketId}/feedback`
- Parâmetros: `{ rating: number, comment?: string }`
- Retorno: `{ ticket: Ticket }`

### Notificações push

- O arquivo `public/push-sw.js`, referenciado no fluxo de push do formulário público, **não existia no repositório** na data desta auditoria
- Consequência: sem service worker registrado, as notificações push não funcionam
- Resultado: o professor não recebia o aviso "Avalie o atendimento"

> Nota de contexto: o tratamento de push foi posteriormente concentrado em `src/sw.ts`. Consulte [Referência de configuração](../../reference/configuration.md) para o estado atual.

## 2. Backend

### Endpoint de feedback (`api/app.py:1588-1645`)

```python
@app.route('/api/chamados/<ticket_id>/feedback', methods=['POST'])
```

Validações aplicadas:

1. O chamado existe
2. O status é `resolvido` ou `fechado`
3. `feedbackRating` ainda não está definido
4. `rating` pertence a `{1, 2, 3, 4, 5}`

Campos gravados: `feedbackRating`, `feedbackComment`, `feedbackAt` e `updatedAt`.

**Autenticação:** nenhuma — o endpoint é público.

### Notificação de push no backend

- A push é disparada quando o chamado é resolvido
- A função `_chamado_subs()` busca as inscrições do solicitante
- O envio depende do service worker para exibir a notificação

## 3. Banco de dados

### Schema (`CHAMADOS_TABLE_SQL`, app.py:716-785)

```sql
feedbackRating INTEGER,
feedbackComment TEXT DEFAULT '',
feedbackAt TIMESTAMPTZ,
```

- Constraint `chk_feedback_rating`, com faixa de 1 a 5 e valor nulo permitido
- Nenhum índice específico para avaliação

### Dados reais

- Nenhum chamado com `feedbackRating` preenchido
- Conclusão: a avaliação nunca havia sido utilizada

## 4. Comparação entre TrackPage e FeedbackPage

| Aspecto | TrackPage | FeedbackPage |
|---------|-----------|--------------|
| Acesso | Link público `/track/:id` | Link público `/feedback/:ticketId` |
| Avaliação | Botão "Avaliar" | Formulário completo |
| Fluxo | Navega para página separada | Página dedicada |
| Experiência | Fragmentada, com perda de contexto | Funcional, mas não utilizada |

## 5. Causas raiz

1. **Notificações push inoperantes** — o service worker referenciado no fluxo não existia, então o professor nunca era avisado
2. **Experiência fragmentada** — o botão "Avaliar" abria outra página, perdendo o contexto do acompanhamento
3. **Ausência de incentivo** — sem notificação, o professor não retornava para avaliar
4. **Endpoint público sem autenticação** — qualquer pessoa com o identificador poderia avaliar o chamado

## 6. Cobertura de testes

Testes existentes em `api/tests/test_chamados.py:704-758`:

- Sucesso com nota de 1 a 5
- Comentário vazio
- Nota inválida retornando 400
- Chamado não resolvido retornando 400
- Chamado já avaliado retornando 400

Lacunas identificadas:

- Ausência de teste de autenticação e autorização
- Ausência de teste com nota decimal
- Ausência de teste de limite de caracteres do comentário

## 7. Diagnóstico

### Crítico

| # | Problema | Impacto | Correção indicada |
|---|----------|---------|-------------------|
| C1 | Service worker de push ausente | O professor não é notificado | Publicar o service worker e registrar o tratamento de `push` |
| C2 | Nenhuma notificação recebida | Nenhuma avaliação registrada | Corrigir o pipeline de push |

### Necessário

| # | Problema | Impacto | Correção indicada |
|---|----------|---------|-------------------|
| N1 | TrackPage navega para outra página | Perda de contexto | Formulário de avaliação em linha no TrackPage |
| N2 | Endpoint público sem autenticação | Risco de abuso | Validar a posse do chamado pelo token de acompanhamento |
| N3 | Ausência de testes de autorização | Cobertura incompleta | Adicionar testes de autorização |

### Melhoria

| # | Problema | Impacto | Correção indicada |
|---|----------|---------|-------------------|
| M1 | Ausência de incentivo | Baixa participação | E-mail de acompanhamento após 24 horas |
| M2 | Nota pode ser decimal | Dados inconsistentes | Exigir inteiro no frontend |
| M3 | Comentário não validado no frontend | Dados inconsistentes | Limitar o número de caracteres |

## 8. Alternativas avaliadas

### Formulário em linha no TrackPage

Substituir o botão que navega para outra página por um formulário exibido no próprio card do chamado resolvido.

**Funcionamento:** a TrackPage mantém o estado da nota e do envio por chamado; para chamados resolvidos e ainda não avaliados, exibe o componente `Stars` e um campo de comentário com botão de envio; `handleFeedback()` chama `ticketService.submitFeedback()` e atualiza o chamado local com o retorno.

**Vantagens:**

- O professor avalia sem sair da página
- Experiência coesa, no mesmo contexto visual
- Menos etapas até a conclusão

**Riscos:**

- Aumenta a complexidade da TrackPage em cerca de 50 linhas
- Pode sobrecarregar o card com elementos demais
- Exige verificação em telas pequenas, onde o espaço é limitado

### Manter a navegação e corrigir o push

Corrigir primeiro o pipeline de push (item C1). Com as notificações funcionando, o professor é avisado e a TrackPage passa a ser acessada pelo link.

**Recomendação:** tratar C1 primeiro. Se a participação continuar baixa depois disso, avaliar o formulário em linha (N1).
