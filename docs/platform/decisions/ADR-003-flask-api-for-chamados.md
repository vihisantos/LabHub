# ADR-003 — API Flask para o Chamados

## Status

Aceita

## Contexto

A aplicação Chamados precisa:

1. Contornar o RLS para criar chamados a partir do formulário público (sem autenticação)
2. Gerar números de chamado sequenciais
3. Enviar notificações push
4. Integrar-se a vários serviços externos

O padrão somente-frontend (localStorage + sync) não atende porque:

- A tabela `chamados_tickets` tem `REVOKE ALL FROM anon, authenticated`
- Usuários do formulário público não são autenticados
- A geração do número do chamado exige sequenciamento no servidor

## Decisão

Usar uma API Flask (Python) publicada como Vercel Serverless Functions para todos os endpoints `/api/chamados*`. A API usa a chave `service_role` do Supabase para contornar o RLS.

## Alternativas consideradas

1. **Supabase Edge Functions** — funcionaria, mas a equipe tem mais experiência em Python
2. **Acesso direto ao Supabase com chave anônima** — não permite contornar o RLS em formulários públicos
3. **Rotas de API no Next.js** — o projeto usa Vite, não Next.js

## Consequências

### Positivas

- Controle total da lógica de negócio (validação, sequenciamento, notificações)
- `service_role` contorna o RLS nas operações públicas
- Ecossistema Python disponível para a integração com SharePoint
- Vercel Serverless escala automaticamente

### Negativas

- Um runtime adicional (Python) em um projeto predominantemente TypeScript
- Latência de cold start nas funções serverless
- Deploy do backend separado do frontend

## Relacionados

- `src/apps/reservalab/api/app.py` — aplicação Flask principal
- `api/app.py` — ponto de entrada na Vercel
- [Arquitetura de backend](../architecture/backend.md)
