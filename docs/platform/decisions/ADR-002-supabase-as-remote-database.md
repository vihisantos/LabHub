# ADR-002 — Supabase como banco remoto

## Status

Aceita

## Contexto

O LabHub precisa de um banco PostgreSQL hospedado, com autenticação, assinaturas em tempo real e segurança em nível de linha. A equipe precisa de um serviço gerenciado que reduza o trabalho de infraestrutura.

## Decisão

Usar o Supabase (PostgreSQL gerenciado) como banco remoto, aproveitando:

- PostgreSQL com múltiplos schemas (`public`, `pcare`, `stock`)
- Row Level Security (RLS) para isolamento por workspace
- Assinaturas em tempo real para atualizações ao vivo
- Auth para gestão de usuários
- API PostgREST para acesso direto do cliente

## Alternativas consideradas

1. **PostgreSQL próprio com API Express** — mais controle, mas com custo de manutenção maior
2. **Firebase Firestore** — NoSQL, não se ajusta ao modelo relacional do domínio
3. **PlanetScale** — sem RLS, exigiria uma camada de API própria

## Consequências

### Positivas

- RLS embutido elimina lógica própria de autorização
- Assinaturas em tempo real sem gerenciar WebSocket
- Integração de autenticação com configuração mínima
- Infraestrutura gerenciada, sem necessidade de administrador de banco

### Negativas

- Dependência do ecossistema Supabase
- Políticas de RLS podem ser complexas de depurar
- O gerenciamento da chave de serviço amplia a superfície de segurança

## Relacionados

- `src/lib/supabase.ts` — configuração do cliente
- `supabase/migrations/` — migrations do schema
- [Camada de dados](../architecture/data-layer.md)
