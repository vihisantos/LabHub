# ADR-006 — Registro Global de Ativos

## Status

Aceita

## Contexto

Os dados de ativos estavam espalhados entre o PC Care (computadores em `pcare.pcs`) e o Estoque (materiais em `stock.stock_items`). Não havia visão unificada dos bens físicos de TI de um campus, e relatórios exigiam juntar dados de várias fontes.

## Decisão

Criar o Registro Global de Ativos em `public.assets` — uma tabela única que rastreia todos os bens físicos de TI. Ele tem políticas próprias de RLS, usa acesso direto ao Supabase (sem a engine de sync) e coexiste com as coleções legadas.

## Alternativas consideradas

1. **Estender a tabela `pcare.pcs`** — específica demais para computadores; não rastreia outros tipos de ativo
2. **Estender `stock.stock_items`** — projetada para consumíveis, não para bens duráveis
3. **Federar as duas tabelas** — complexo e sem fonte única de verdade

## Consequências

### Positivas

- Visão unificada de todos os ativos do campus
- RLS limpo por workspace
- Extensível pelo campo JSONB `metadata`
- Independente dos schemas das aplicações legadas

### Negativas

- Duplicação de dados com PC Care e Estoque durante o período de migração
- Dois conceitos de ativo a explicar (legado e global)
- Necessidade de caminho de migração para os dados existentes

## Relacionados

- `supabase/migrations/024_global_asset_registry.sql`
- `src/core/assets/global-repository.ts`
- [Registro Global de Ativos](../architecture/asset-registry.md)
- [Conceitos: Ativos](../concepts/assets.md)
