# Estoque

> Materiais e suprimentos dos laboratórios de informática.

**Rota:** `/stock` (alias `/general-stock`)
**Cor:** `#10b981` (esmeralda)
**Código:** `src/apps/stock`

## Propósito

O Estoque gerencia materiais e suprimentos físicos — cabos, adaptadores, periféricos, material de escritório e peças de equipamento. Controla níveis de inventário, movimentações, kits e contagens cíclicas.

## O que resolve

- Materiais deixam de ser controlados em planilha ou por memória da equipe
- Entradas, saídas, empréstimos, devoluções e transferências ficam registrados com responsável
- Kits de uso conjunto têm checklist de conferência
- Contagens físicas periódicas passam a apontar divergências de forma sistemática

## Principais funcionalidades

- **Seções de material** com subcategorias
- **Movimentações** — entrada, saída, empréstimo, devolução e transferência, com histórico por item
- **Kits** — agrupamento de itens com checklist de conferência e status (completo ou incompleto)
- **Inventário cíclico** — contagens periódicas com comparação contra o sistema e destaque de divergências
- **Entrada e saída rápida** — fluxo simplificado de movimentação
- **Manutenção preventiva** — agendamento para equipamentos
- **QR Codes** — geração para impressão, incluindo layout de etiquetas, e leitura pela câmera

## Seções de material

| Seção | Subcategorias |
|-------|---------------|
| Máquinas | Notebook, Desktop, Monitor, Impressora |
| Periféricos | Mouse, Teclado, Webcam, Caixa de Som, Headset |
| Material de Escritório | Papel, Caneta, Fita, Envelope |
| Adaptadores | USB-C, HDMI, VGA, Rede, Energia |
| Equipamentos | SSD, HD, RAM, Fonte |
| Cabos | HDMI, VGA, USB, Rede, Extensão, Energia |
| Outros | (livre) |

## Fonte de dados

- **Primária:** `localStorage` com sincronização para o Supabase, no schema `stock`
- **Coleções sincronizadas:** `stock_items`, `stock_movements`, `stock_kits`, `stock_maintenance`, `inventory_cycles`, `inventory_counts`

## Onde está a documentação

| Documento | Conteúdo |
|-----------|----------|
| [Referência](reference.md) | Rotas, tipos, componentes, hooks, serviços e chaves locais |
| [Camada de dados](../../platform/architecture/data-layer.md) | Como a sincronização funciona |
| [Referência do banco](../../reference/database.md) | Schema `stock` |
| [Registro Global de Ativos](../../platform/architecture/asset-registry.md) | Visão unificada de ativos, compartilhada com o PC Care |

## Integrações e dependências

- **Núcleo:** autenticação, permissões, workspaces, sincronização
- **Cloudinary:** upload de fotos dos itens
- **Supabase:** schema `stock`, via engine de sync

A navegação interna preserva o prefixo da rota atual (`/stock` ou `/general-stock`) por meio de `src/apps/stock/utils/stockPath.ts`.
