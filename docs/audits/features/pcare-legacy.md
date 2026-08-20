# PCare — Gestao de PCs

> Sub-app para inventario completo de computadores, com rastreamento de pecas, checklists de limpeza, manutencao agendada e relatorios.

**Rota:** `/pcare`  
**Cor:** `#06b6d4` (cyan)

---

## Funcionalidades

### Dashboard
- Visao geral do status de todos os PCs
- Contadores de pendentes, em andamento e concluidos
- Alertas de manutencao proxima
- Graficos de status por laboratorio

### Gestao de PCs
- **Cadastro**: Criar novos PCs com especificacoes (CPU, RAM, Storage, OS)
- **Edicao**: Atualizar dados de qualquer PC
- **Exclusao**: Remover PCs obsoletos
- **Detalhe**: Visualizar todas as informacoes de um PC
- **Filtros**: Por laboratorio, status de limpeza, status de restauracao
- **Operacoes em Lote**: Selecionar multiplos PCs para acoes coletivas

### Especificacoes Rastreadas
```typescript
interface PC {
  id: string
  labName: string          // Laboratorio
  pcNumber: string         // Numero do PC
  assetTag: string         // Tag de patrimonio
  roomLocation: string     // Localizacao na sala
  specs: {
    cpu: string
    ram: string
    storage: string
  }
  config: {
    osType: 'windows10' | 'windows11' | 'linux' | 'macos' | ''
    osVersion: string
    osEdition: 'enterprise' | 'education' | ''
    pcType: 'academico' | 'administrativo' | ''
    domain: string       // auto: animaedu.intranet | anima.intranet
  }
  cleaningStatus: 'pending' | 'in_progress' | 'done'
  restorationStatus: 'pending' | 'in_progress' | 'done'
  softwareInstalled: string[]
  partsReplaced: PCPart[]
  observations: string
  photos: string[]
  lastIntervention: string | null
}
```

### Estoque de Pecas
- Cadastro de pecas (SSD, HD, RAM, Fonte, etc.)
- Vinculo de pecas a PCs especificos
- Historico de substituicoes por peca
- Alertas de reposicao

### Checklists
- Templates de checklist customizaveis
- Execucao de checklists com registro de status
- Historico de checklists executados por PC
- Suporte a fotos durante execucao (roadmap)

### Manutencao
- Agenda de manutencoes preventivas
- Registro de manutencoes realizadas
- Calendario visual com manutencoes agendadas
- Status: pendente, em andamento, concluido

### QR Codes
- **Gerador**: Criar QR codes para impressao em folha A4
- **Scanner**: Leitura via camera para acesso rapido ao PC
- **Compartilhar**: QR com link direto para detalhe do PC

### Relatorios
- Exportacao em **CSV**, **XLSX** e **PDF**
- Filtros por periodo, laboratorio e tipo
- Dashboard com graficos (Recharts)
- Consolidado de estoque por laboratorio

### Configuracoes
- Troca de tema (dark/light)
- Configuracoes de laboratorio
- Modo kiosk/foco para tablets
- Backup manual (exportar/importar JSON)

---

## Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/pcare/` | Dashboard | Visao geral |
| `/pcare/pcs` | PCList | Lista de todos os PCs |
| `/pcare/pcs/new` | RedirectToStock | Redireciona para cadastro no Estoque |
| `/pcare/pcs/:id` | PCDetail | Detalhe de um PC |
| `/pcare/pcs/:id/edit` | PCForm | Edicao do PC |
| `/pcare/parts` | PartsList | Estoque de pecas |
| `/pcare/parts/consolidado` | StockConsolidado | Consolidado por lab |
| `/pcare/qr` | QRGenerator | Gerador de QR codes |
| `/pcare/scanner` | QRScanner | Scanner QR (rota externa) |
| `/pcare/checklists` | ChecklistTemplates | Templates de checklist |
| `/pcare/checklists/:id/execute` | ChecklistExecute | Execucao de checklist |
| `/pcare/reports` | Reports | Relatorios e exportacoes |
| `/pcare/maintenance` | Maintenance | Manutencao preventiva |
| `/pcare/settings` | Settings | Configuracoes |

---

## Componentes

| Componente | Descricao |
|------------|-----------|
| `PCCard` | Card de PC com status e acoes rapidas |
| `PCChecklistModal` | Modal para checklist de limpeza |
| `ActionTimeline` | Timeline de atividades do PC |
| `AddPartToPcModal` | Modal para vincular peca ao PC |
| `PCBatchBar` | Barra de acoes em lote |
| `FilterBar` | Filtros de busca e filtragem |
| `StatusBadge` | Badge de status colorido |
| `SyncStatusBadge` | Indicador de status de sincronizacao |
| `OnlineBanner` | Banner de conexao online/offline |
| `Skeletons` | Estados de carregamento |
| `EmptyState` | Estado vazio com CTA |
| `PullToRefresh` | Pull-to-refresh em listas |
| `Modal` | Modal generico |
| `BottomNav` | Navegacao inferior |

---

## Hooks

| Hook | Descricao |
|------|-----------|
| `usePCs` | CRUD e estado dos PCs |
| `useParts` | CRUD e estado das pecas |
| `useChecklists` | Templates e execucao de checklists |
| `useMaintenance` | Manutencao preventiva |
| `useActionLog` | Log de acoes realizadas |
| `useOnlineSync` | Sincronizacao online/offline |
| `useSyncToasts` | Notificacoes de sync |
| `useFocusMode` | Modo kiosk/foco |
| `useSwipeBack` | Navegacao por gesto de voltar |

---

## Servicos

| Servico | Descricao |
|---------|-----------|
| `pcService` | CRUD de PCs (sync) |
| `partService` | CRUD de pecas (sync) |
| `partUsageService` | Historico de uso de pecas |
| `checklistService` | Templates e execucoes de checklist |
| `maintenanceService` | Manutencao preventiva |
| `actionLogService` | Registro de acoes |

---

## Dados Locais (localStorage)

| Chave | Conteudo |
|-------|----------|
| `labhub_pcs` | Lista de PCs |
| `labhub_parts` | Lista de pecas |
| `labhub_part_usage` | Historico de uso de pecas |
| `labhub_checklist_templates` | Templates de checklist |
| `labhub_pc_checklists` | Checklists executados |
| `labhub_maintenance` | Manutencoes |
| `labhub_action_logs` | Log de acoes |
| `pcare_theme` | Tema do PCare (dark/light) |
