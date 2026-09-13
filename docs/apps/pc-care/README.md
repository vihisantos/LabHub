# PC Care

> Inventário, limpeza e manutenção de computadores.

**Rota:** `/pc-care` (alias `/pc-care/pcs` e `/pc-care/assets`)
**Cor:** `#8b5cf6` (violeta)
**Código:** `src/apps/pcare`

## Propósito

O PC Care gerencia o ciclo de vida completo dos computadores dos laboratórios: do inventário e das especificações ao controle de peças, checklists de limpeza e manutenção preventiva.

## O que resolve

- Inventário de máquinas deixa de viver em planilhas paralelas
- Checklists de limpeza e restauração passam a ter histórico por máquina
- Substituições de peças ficam registradas, com vínculo entre peça e computador
- Manutenções preventivas deixam de depender de memória da equipe

## Principais funcionalidades

- **Inventário de PCs** — especificações, configuração, fotos e localização por máquina
- **Controle de peças** — vínculo de peças a computadores e histórico de substituições
- **Checklists** — templates configuráveis e registro de execução
- **Manutenção preventiva** — agendamento, calendário e acompanhamento de conclusão
- **QR Codes** — geração para impressão e leitura pela câmera
- **Relatórios** — exportação em CSV, XLSX e PDF, com gráficos
- **Operações em lote** — ações sobre vários computadores ao mesmo tempo
- **Consolidado de estoque por laboratório**

## Especificações rastreadas

- **Hardware:** CPU, memória e armazenamento
- **Software:** tipo, versão e edição do sistema operacional; software instalado
- **Status:** limpeza e restauração
- **Localização:** laboratório, sala e patrimônio
- **Histórico:** intervenções e peças substituídas

## Fonte de dados

- **Primária:** `localStorage` com sincronização para o Supabase, no schema `pcare`
- **Coleções sincronizadas:** `pcs`, `parts`, `part_usage`, `maintenance`, `checklist_templates`, `pc_checklists`, `action_logs`

## Onde está a documentação

| Documento | Conteúdo |
|-----------|----------|
| [Referência](reference.md) | Rotas, tipos, componentes, hooks, serviços e chaves locais |
| [Camada de dados](../../platform/architecture/data-layer.md) | Como a sincronização funciona |
| [Referência do banco](../../reference/database.md) | Schema `pcare` |
| [Registro Global de Ativos](../../platform/architecture/asset-registry.md) | Visão unificada de ativos, compartilhada com o Estoque |

## Integrações e dependências

- **Núcleo:** autenticação, permissões, workspaces, sincronização
- **Cloudinary:** upload de fotos das máquinas e dos itens
- **Supabase:** schema `pcare`, via engine de sync
