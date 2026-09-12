# ADR-001 — Offline-first com localStorage

## Status

Aceita

## Contexto

Laboratórios universitários nem sempre têm conexão estável. Técnicos precisam abrir chamados, consultar inventário e atualizar registros mesmo offline. A aplicação não pode bloquear por indisponibilidade de rede.

## Decisão

Usar o `localStorage` como armazenamento principal, com sincronização em segundo plano para o Supabase. Todas as operações de CRUD escrevem primeiro no `localStorage` (de forma síncrona e instantânea) e as mudanças sincronizam com o Supabase quando há conectividade.

## Alternativas consideradas

1. **IndexedDB como armazenamento principal** — API mais complexa, assíncrona e de depuração mais difícil. O `localStorage` é suficiente para o volume de dados do projeto.
2. **Apenas cache de Service Worker** — não trata conflitos de dados nem sincronização entre dispositivos.
3. **Somente online com fila de retentativas** — bloqueia o usuário em caso de falha de rede, com experiência ruim.

## Consequências

### Positivas

- Aplicação funciona 100% offline
- Retorno visual instantâneo, sem estados de carregamento nas escritas
- Implementação simples com `createLocalService()`
- A engine de sincronização existente resolve os conflitos de merge

### Negativas

- Volume limitado pela cota do `localStorage` (cerca de 5 MB)
- Sem sincronização em tempo real entre dispositivos (consistência eventual)
- Dados binários (fotos) precisam usar IndexedDB em separado

## Relacionados

- `src/lib/storage.ts` — camada de persistência local
- `src/lib/sync.ts` — engine de sincronização
- [Offline-first](../concepts/offline-first.md)
