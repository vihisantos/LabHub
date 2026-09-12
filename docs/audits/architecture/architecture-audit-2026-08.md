# Auditoria de arquitetura — agosto de 2026

> Retrato da arquitetura do LabHub na versão 2.1.0.

## Resumo

O LabHub é um PWA modular com 5 aplicações, backend Flask e Supabase como banco remoto. A arquitetura segue o padrão offline-first, com `localStorage` como armazenamento principal.

## Principais constatações

### Pontos fortes

- Isolamento limpo entre aplicações (o Chamados é totalmente isolado)
- Controle de acesso em três camadas (workspace → usuário → aplicação)
- Offline-first com degradação suave
- Políticas de RLS abrangentes
- Esteira de CI/CD automatizada

### Pontos de melhoria

- Dados de ativos legados espalhados entre PC Care e Estoque (em consolidação pelo Registro Global de Ativos)
- Algumas aplicações ainda têm dependências cruzadas
- Ausência de monitoramento e alertas automatizados
- Cobertura de testes a ampliar
- Documentação organizada por tipo de arquivo, e não por plataforma e aplicação

## Situação das aplicações

| Aplicação | Isolamento | Padrão de sync | Realtime | Testes |
|-----------|-----------|----------------|----------|--------|
| Chamados | Isolamento completo | Mediado pela API | WebSocket | Sim |
| PC Care | Parcial | localStorage + sync | Apenas polling | Sim |
| Estoque | Parcial | localStorage + sync | Apenas polling | Sim |
| ReservaLab | Parcial | SharePoint + Supabase | Apenas polling | Sim |
| TV | Parcial | Supabase direto | Apenas polling | Parcial |

## Situação da camada de dados

| Coleção | Tabela remota | Schema | Padrão de acesso |
|---------|---------------|--------|------------------|
| workspaces | workspaces | public | Engine de sync |
| profiles | profiles | public | Auth + administração |
| assets | assets | public | Supabase direto |
| chamados_tickets | chamados_tickets | public | API Flask |
| pcs | pcs | pcare | Engine de sync |
| stock_items | stock_items | stock | Engine de sync |
| tv_* | tv_* | public | Supabase direto |
| tablet_reservations | tablet_reservations | public | Supabase direto |

## Recomendações

1. Concluir o isolamento das aplicações PC Care, Estoque, ReservaLab e TV
2. Adicionar monitoramento e alertas automatizados
3. Elevar a cobertura de testes para 80% ou mais
4. Implementar o registro de localizações para os ativos
5. Adicionar testes ponta a ponta (Playwright) para os fluxos críticos
