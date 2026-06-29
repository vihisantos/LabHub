# Melhorias - LabHub

> Ideias e prioridades para evolução do projeto.
> **Versão atual:** 0.1.1 · **Stack:** React 19, Vite, Tailwind v4, Supabase, PWA

---

## 🔥 Alto Impacto

### 1. Autenticação (Supabase Auth)

**Problema:** Não há login. Qualquer pessoa que acessa o app tem acesso total aos dados. Em um laboratório com múltiplos técnicos, não há rastreabilidade de quem fez o quê.

**O que fazer:**
- Habilitar Supabase Auth com email + senha (e/ou Google OAuth)
- Criar contexto de usuário (`useUser`) que persiste sessão no localStorage
- Associar `createdBy` / `updatedBy` em PCs, movimentações e action_logs
- Rotas públicas vs protegidas (Launcher pode ficar público, apps exigem login)

**Arquivos envolvidos:** `src/lib/supabase.ts`, novo `src/lib/auth.ts` ou `AuthContext.tsx`, `src/App.tsx`

---

### 2. Indicador de Sync em Tempo Real

**Problema:** `OnlineBanner` mostra se há alterações pendentes, mas não dá feedback visual quando o sync está rodando ou falhou. Usuário não sabe se os dados dele foram salvos no servidor.

**O que fazer:**
- Adicionar badge de status no header: "Salvo localmente" / "Sincronizando..." / "Sincronizado" / "Offline"
- Mostrar erros de sync com toast/notificação
- Botão "Sincronizar agora" manual (além do automático no OnlineBanner)
- Log de sync visível na página de configurações

**Arquivos envolvidos:** `src/lib/sync.ts`, `src/apps/pcare/components/OnlineBanner.tsx`, `src/apps/pcare/pages/Settings.tsx`

---

### 3. Upload de Fotos (Supabase Storage)

**Problema:** PCs podem ter fotos associadas (patrimônio, avarias), mas atualmente as fotos são armazenadas como data URIs no localStorage — ocupam muito espaço e não persistem entre dispositivos.

**O que fazer:**
- Configurar bucket `pcare-photos` e `stock-photos` no Supabase Storage
- Criar hook `useUpload` que faz upload e retorna URL pública
- Substituir data URIs nas entidades por URLs do Supabase
- Cache local das imagens (IndexedDB ou Cache API) para funcionar offline

**Arquivos envolvidos:** `src/lib/supabase.ts`, novo `src/lib/upload.ts`, `src/apps/pcare/components/PCCard.tsx`, `src/apps/pcare/pages/PCForm.tsx`

---

### 4. Dashboard com Gráficos

**Problema:** Dashboard atual mostra apenas stat cards e progresso textual. Não dá pra ver tendências ou comparar laboratórios visualmente.

**O que fazer:**
- Adicionar gráfico de barras: PCs por laboratório x status
- Gráfico de pizza: distribuição de status geral
- Timeline de manutenções realizadas nos últimos 30 dias
- Biblioteca: Recharts (leve, já compatível com React 19)

**Arquivos envolvidos:** `src/apps/pcare/pages/Dashboard.tsx`, novo `src/apps/pcare/components/Charts/`

---

## 📋 Média Prioridade

### 5. Operações em Lote

**Problema:** Para atualizar status de 10 PCs do mesmo laboratório, o usuário precisa entrar em cada um individualmente.

**O que fazer:**
- Modo de seleção múltipla no PCList (já existe botão "Selecionar", mas sem ação de lote)
- Barra de ações ao selecionar: "Avançar status", "Atribuir laboratório", "Exportar selecionados"
- Estender para StockList (selecionar múltiplos itens e mover de sala, descartar em lote)

**Arquivos envolvidos:** `src/apps/pcare/pages/PCList.tsx`, `src/apps/pcare/components/PCCard.tsx`, `src/apps/stock/pages/StockSection.tsx`

---

### 6. Notificações Push (Manutenções)

**Problema:** Técnicos esquecem de verificar manutenções agendadas. Não há alerta quando um PC está com manutenção atrasada.

**O que fazer:**
- Usar Push API + Service Worker para notificações quando o app estiver fechado
- Notificar quando uma manutenção agendada está próxima (1h antes, 1 dia antes)
- Notificar quando sync falha (dados locais podem ser perdidos)
- Precisa de permissão do usuário (botão "Ativar notificações" nas Configurações)

**Arquivos envolvidos:** `src/apps/pcare/pages/Settings.tsx`, `src/sw.ts` ou novo `src/lib/notifications.ts`

---

### 7. Importar Dados (CSV/Excel)

**Problema:** Para começar a usar o app, o usuário precisa cadastrar PC por PC manualmente. Não há forma de importar uma planilha existente do laboratório.

**O que fazer:**
- Criar página "Importar" no PCare e no Stock
- Aceitar CSV (e XLSX via `xlsx` lib, já está no projeto para export)
- Mapear colunas automaticamente (cabeçalho → campo)
- Preview dos dados antes de importar
- Relatório de importação: quantos foram criados, quantos tiveram erro

**Arquivos envolvidos:** Novas páginas `src/apps/pcare/pages/Import.tsx`, `src/apps/stock/pages/Import.tsx`

---

### 8. Tema Customizável (Cor de Destaque)

**Problema:** A cor de destaque (cyan/blue gradients) é fixa. Usuários não podem personalizar.

**O que fazer:**
- Adicionar seletor de cor primária nas Configurações (ex: Cyan, Violet, Emerald, Rose)
- Usar variável CSS `--color-accent` em vez de classes `cyan-*` hardcoded
- Persistir escolha no localStorage
- Aplicar também ao tema claro

**Arquivos envolvidos:** `src/index.css`, `src/lib/ThemeContext.tsx`, `src/apps/pcare/pages/Settings.tsx`

---

### 9. Relatórios com Filtros Avançados

**Problema:** Relatórios atuais exportam tudo ou nada. Não dá para filtrar por período, laboratório ou status antes de exportar.

**O que fazer:**
- Adicionar filtros na página de relatórios: período (data inicial/final), laboratório, tipo de manutenção
- Pré-visualização dos dados filtrados antes da exportação
- Template de relatório formatado (cabeçalho com logo, data, etc.) para PDF

**Arquivos envolvidos:** `src/apps/pcare/pages/Reports.tsx`

---

### 10. Deploy Automático (Vercel)

**Problema:** O deploy no Vercel (https://lab-hub-pi.vercel.app) é manual. Não há integração com o repositório.

**O que fazer:**
- Conectar repositório do GitHub no Vercel (deploy automático ao push na main)
- Configurar variáveis de ambiente (Supabase URL + anon key) no dashboard do Vercel
- Adicionar badge de status do deploy no README

**Arquivos envolvidos:** README.md, Vercel dashboard

---

## 🎯 Baixa Prioridade / Nice-to-have

### 11. Atalhos de Teclado

**Problema:** Usuários em desktop (laboratórios com PCs fixos) navegam devagar porque tudo depende de clique/toque.

**O que fazer:**
- `Ctrl+N` → Novo PC
- `Ctrl+F` → Foco na busca
- `Escape` → Fechar modal / limpar seleção
- `?` → Mostrar lista de atalhos
- Documentar atalhos na página de Configurações

**Arquivos envolvidos:** Novo `src/lib/hotkeys.ts`, `src/apps/pcare/pages/Settings.tsx`

---

### 12. Detecção de Tema do Sistema

**Problema:** O tema padrão é escuro, mas não respeita a preferência `prefers-color-scheme` do sistema operacional.

**O que fazer:**
- No primeiro acesso, detectar `prefers-color-scheme: dark` e usar como padrão
- Adicionar opção "Seguir sistema" ao lado de "Claro" / "Escuro" no toggle
- Usar `matchMedia` para escutar mudanças em tempo real

**Arquivos envolvidos:** `src/lib/ThemeContext.tsx`

---

### 13. Histórico de Atividades Global

**Problema:** O action log existe por PC, mas não há um feed global de tudo que aconteceu no laboratório.

**O que fazer:**
- Criar página "Atividades" no PCare com timeline global (todos os PCs)
- Filtros por tipo de ação, laboratório, data
- Agrupar ações por dia

**Arquivos envolvidos:** Nova página `src/apps/pcare/pages/Activity.tsx`

---

### 14. Página Offline Customizada

**Problema:** Quando o usuário está offline e tenta carregar o app, o Workbox mostra um erro genérico do navegador.

**O que fazer:**
- Criar página `offline.html` com identidade visual do LabHub
- Configurar Workbox para servir `offline.html` quando sem rede
- Incluir instruções: "Você está offline. Os dados salvos localmente serão sincronizados quando houver conexão."

**Arquivos envolvidos:** `public/offline.html`, `vite.config.ts` (config PWA)

---

### 15. Testes E2E (Playwright)

**Problema:** Testes unitários e de componente cobrem lógica e renderização, mas não fluxos completos (navegar → criar PC → ver na lista → editar).

**O que fazer:**
- Instalar Playwright
- Criar teste: "criar um PC, verificar que aparece na lista, abrir detalhes"
- Criar teste: "criar item de stock, movimentar, verificar histórico"
- Rodar no CI (opcional, pode ser manual)

**Arquivos envolvidos:** `e2e/`, `.github/workflows/ci.yml`

---

### 16. Gerador de Etiquetas QR

**Problema:** Para identificar fisicamente os PCs no laboratório, o usuário precisa imprimir etiquetas. Hoje só gera QR individual por PC.

**O que fazer:**
- Criar página "Imprimir Etiquetas" que gera folha A4 com múltiplos QR codes
- Selecionar PCs por laboratório ou individualmente
- Layout: 8 ou 12 etiquetas por folha, com nome do lab + PC + asset tag
- Usar html2canvas (já no projeto) para renderizar e imprimir

**Arquivos envolvidos:** Nova página `src/apps/pcare/pages/LabelPrinter.tsx`

---

### 17. Wizard de Cadastro em Massa

**Problema:** Adicionar 30 PCs do mesmo laboratório com specs idênticas exige clicar "Novo PC" 30 vezes e preencher os mesmos campos.

**O que fazer:**
- Modo "Cadastro rápido": formulário com campos fixos (lab, sala, CPU, RAM, etc.) + campo "Quantidade"
- Gerar N PCs com numeração sequencial (PC-001, PC-002, ...)
- Prefixo configurável e número inicial

**Arquivos envolvidos:** `src/apps/pcare/pages/PCForm.tsx` ou nova página

---

### 18. Mapa do Laboratório

**Problema:** Não há visualização espacial. O técnico não sabe onde cada PC está fisicamente na sala.

**O que fazer:**
- Criar editor visual de mapa da sala (grid de posições)
- Arrastar PCs para posições no grid
- Visualizar mapa com status por cor (verde = ok, amarelo = em andamento, vermelho = problema)
- Salvar mapa como JSON no localStorage + sync

**Arquivos envolvidos:** Novos componentes `src/apps/pcare/components/LabMap.tsx`, `src/apps/pcare/pages/LabMapView.tsx`

---

### 19. Multilab — Troca Rápida entre Laboratórios

**Problema:** Um técnico pode atender múltiplos laboratórios. Hoje ele vê todos os PCs misturados e precisa usar o filtro.

**O que fazer:**
- Adicionar seletor de laboratório ativo no header (pill button)
- Ao selecionar um laboratório, todas as listas e dashboard filtram automaticamente
- Persistir seleção no localStorage
- Opção "Todos" para ver dados consolidados

**Arquivos envolvidos:** `src/apps/pcare/components/BottomNav.tsx` ou novo `LabSelector.tsx`, hooks `usePCs.ts`, `useMaintenance.ts`

---

### 20. Checklist com Foto

**Problema:** Durante a execução de um checklist, o técnico pode querer registrar foto de um item específico (ex: "gabinete aberto antes da limpeza").

**O que fazer:**
- Adicionar botão "Foto" em cada item do checklist
- Capturar foto via câmera (não data URI, usar Supabase Storage)
- Anexar foto ao item do checklist
- Exibir foto no histórico do checklist

**Arquivos envolvidos:** `src/apps/pcare/components/PCChecklistModal.tsx`, `src/apps/pcare/pages/ChecklistExecute.tsx`, `src/lib/upload.ts`

---

### 21. Histórico por Peça (Rastreabilidade)

**Problema:** Quando uma peça é trocada, não dá para ver o histórico completo: em quais PCs ela foi usada, quando, por quem.

**O que fazer:**
- Criar página "Histórico da Peça" no PartsList
- Listar todas as movimentações da peça (entrada de estoque, uso em PC, descarte)
- Gráfico de uso ao longo do tempo
- Integrar com part_usage (já existe a tabela)

**Arquivos envolvidos:** `src/apps/pcare/pages/PartsList.tsx` ou nova `src/apps/pcare/pages/PartHistory.tsx`

---

### 22. Serviço em Segundo Plano (Sync periódico)

**Problema:** O sync só roda quando o usuário abre o app e está online. Se o app ficar aberto, não re-sincroniza automaticamente.

**O que fazer:**
- Usar `setInterval` no Service Worker (ou `navigator.onLine` + polling) para sync a cada 30s
- Usar BroadcastChannel API para notificar o app sobre mudanças
- Mostrar toast "Novos dados sincronizados" quando detectar mudanças remotas

**Arquivos envolvidos:** `src/apps/pcare/hooks/useOnlineSync.ts`, `src/sw.ts`, `src/lib/sync.ts`

---

### 23. Atalho "Avançar Status" no Card

**Problema:** Para avançar o status de um PC (pending → in_progress → done), o usuário precisa abrir o PC e clicar "Avançar" em cada seção.

**O que fazer:**
- Adicionar botão "Avançar" no PCCard da lista (com confirmação rápida)
- Avançar cleaningStatus se não estiver done, senão avança restorationStatus
- Usar ConfirmDialog (já implementado) para confirmar

**Arquivos envolvidos:** `src/apps/pcare/components/PCCard.tsx`

---

### 24. Comparar PCs Lado a Lado

**Problema:** Quando o usuário quer ver diferenças entre dois PCs (ex: specs, software instalado), precisa abrir um, voltar, abrir outro.

**O que fazer:**
- Modo "Comparar" no PCList: selecionar 2 PCs e clicar "Comparar"
- Tela dividida com specs, status, software lado a lado
- Destacar diferenças visualmente (verde = igual, vermelho = diferente)

**Arquivos envolvidos:** Nova página `src/apps/pcare/pages/PCCompare.tsx`

---

### 25. Backup Manual (Exportar/Importar JSON)

**Problema:** Os dados estão no localStorage e no Supabase. Se o usuário quiser migrar para outra instância ou fazer um backup pontual, não há ferramenta.

**O que fazer:**
- Página "Backup" nas Configurações
- Botão "Exportar tudo" → download de um `.json` com todas as coleções
- Botão "Importar" → upload do `.json`, substitui dados locais
- Aviso: "Isso substituirá todos os dados atuais"

**Arquivos envolvidos:** `src/apps/pcare/pages/Settings.tsx`, `src/lib/backup.ts`

---

### 26. Suporte Multilíngue (i18n)

**Problema:** O app é todo em português. Se houver técnicos estrangeiros ou se o app for usado em outro país, não há alternativa.

**O que fazer:**
- Adicionar react-i18next ou implementar i18n caseiro com JSON
- Extrair todos os strings para arquivos `pt.json` / `en.json`
- Seletor de idioma nas Configurações
- Detectar `navigator.language` no primeiro acesso

**Arquivos envolvidos:** Novo `src/lib/i18n.ts`, `public/locales/`, todos os componentes

---

### 27. Gestão de Garantia e Licenças

**Problema:** PCs têm garantia (data de expiração) e licenças de software (Windows, Office) que expiram. Não há alerta de vencimento.

**O que fazer:**
- Adicionar campos `warrantyExpiry` e `licenseInfo` no tipo PC
- Exibir selo de garantia ativa/expirada no PCDetail
- Lista de garantias a expirar nos próximos 30 dias no Dashboard
- Alertar quando licença está perto de vencer

**Arquivos envolvidos:** `src/apps/pcare/types/pc.ts`, `src/apps/pcare/pages/PCDetail.tsx`, `src/apps/pcare/pages/Dashboard.tsx`

---

### 28. Rastreamento por Etiqueta de Patrimônio

**Problema:** A busca atual pesquisa por nome, laboratório e sala. Não busca por número de patrimônio (asset tag) de forma dedicada.

**O que fazer:**
- Campo de busca específico "Buscar por patrimônio" no PCList
- Leitura de código de barras do tipo CODE128 ou EAN (comum em etiquetas de patrimônio)
- Suporte a scan contínuo (já existe no AssetScanner para QR, estender para barcode)
- Destacar resultado quando encontrar match exato por asset tag

**Arquivos envolvidos:** `src/apps/pcare/pages/PCList.tsx`, `src/apps/pcare/pages/AssetScanner.tsx`

---

### 29. Modo Foco / Kiosk

**Problema:** Durante uma sessão de limpeza, o técnico precisa de uma interface mínima sem distrações — só o checklist e botões grandes.

**O que fazer:**
- Botão "Modo Foco" no header que esconde BottomNav, filtros, busca
- Cards ocupam largura total, fonte maior
- Ao selecionar um PC, abre direto no checklist (pula detalhes)
- Ideal para tablets montados em carrinhos de limpeza

**Arquivos envolvidos:** `src/apps/pcare/pages/PCList.tsx`, `src/apps/pcare/components/BottomNav.tsx`, novo hook `useFocusMode.ts`

---

### 30. Vincular Periféricos aos PCs

**Problema:** Um PC pode ter mouse, teclado, monitor e outros periféricos vinculados. Hoje isso não é registrado.

**O que fazer:**
- Criar tipo `peripheral` com `name`, `type`, `serialNumber`, `assetTag`
- Vincular periféricos a PCs via campo `assignedToPcId`
- Exibir periféricos vinculados no PCDetail
- Listar periféricos não vinculados (disponíveis) no estoque

**Arquivos envolvidos:** Novo `src/apps/pcare/types/peripheral.ts`, novo service `src/apps/pcare/services/peripheralService.ts`, `src/apps/pcare/pages/PCDetail.tsx`

---

### 31. Histórico de Conexão (Sync Status)

**Problema:** O usuário não sabe se o sync está funcionando, se houve falhas, ou quando foi a última sincronização bem-sucedida.

**O que fazer:**
- Página "Status do Sync" nas Configurações
- Mostrar: última sincronização, coleções pendentes, erros recentes
- Botão "Testar conexão" que faz ping no Supabase
- Gráfico de disponibilidade nas últimas 24h

**Arquivos envolvidos:** `src/apps/pcare/pages/Settings.tsx`, `src/lib/sync.ts`

---

### 32. Tour / Onboarding Integrado

**Problema:** Novo usuário abre o app e não sabe por onde começar. As empty states ajudam, mas não guiam o fluxo completo.

**O que fazer:**
- Detectar primeiro acesso (`localStorage` sem dados)
- Mostrar overlay com 3-5 passos destacando: "Aqui você cria PCs", "Aqui gerencia o estoque", etc.
- Usar Shepherd.js ou implementar tour caseiro com poppers
- Botão "Reiniciar tour" nas Configurações

**Arquivos envolvidos:** Novo `src/lib/tour.tsx`, `src/App.tsx`, `src/apps/pcare/pages/Settings.tsx`

---

### 33. Resolução de Conflitos de Sync

**Problema:** Dois técnicos editam o mesmo PC offline em dispositivos diferentes. Quando ambos sincronizam, o último que salvou ganha — sem aviso.

**O que fazer:**
- Detectar conflito: mesmo `id`, mesmo campo, timestamps diferentes
- Mostrar modal "Conflito detectado" com diferenças lado a lado (versão local vs remota)
- Opções: "Manter local", "Manter remoto", "Manter ambos (mesclar)"
- Registrar resolução no action_log

**Arquivos envolvidos:** `src/lib/sync.ts`, novo `src/apps/pcare/components/ConflictResolver.tsx`

---

### 34. Atalho "Compartilhar PC" via QR

**Problema:** Para mostrar os detalhes de um PC para outro técnico, precisa entregar o celular ou descrever verbalmente.

**O que fazer:**
- Botão "Compartilhar" no PCDetail
- Gera QR code com URL do PC (ex: `https://labhub.app/pcare/pcs/pc-123`)
- Outro dispositivo escaneia e abre direto na página do PC
- Usar a API Web Share (`navigator.share`) para enviar link

**Arquivos envolvidos:** `src/apps/pcare/pages/PCDetail.tsx`, `src/lib/qr.ts`

---

### 35. Lista de Verificação de Laboratório (Diária)

**Problema:** No início do turno, o técnico precisa verificar rapidamente se todos os PCs estão ligados e respondendo. Não há checklist diário.

**O que fazer:**
- Criar "Ronda Diária": checklist simples com todos os PCs do laboratório
- Status: "Ligado", "Desligado", "Com problema"
- Tempo estimado: ~2min para completar
- Histórico de rondas realizadas (data, técnico, resultados)

**Arquivos envolvidos:** Nova página `src/apps/pcare/pages/DailyRound.tsx`, novo service `src/apps/pcare/services/roundService.ts`

---

### 36. Sugestão Inteligente de Reposição de Peças

**Problema:** Uma peça com `quantity < minQuantity` aparece como "estoque baixo", mas não sugere quantas comprar baseado no consumo.

**O que fazer:**
- Calcular média de uso por mês (baseado em part_usage)
- Sugerir quantidade de compra: `minQuantity * 2 - quantity`
- Exibir no card: "Consumo médio: 3/mês. Sugerido comprar: 5 unidades"
- Botão "Registrar compra" que adiciona N unidades ao estoque

**Arquivos envolvidos:** `src/apps/pcare/pages/PartsList.tsx`, `src/apps/pcare/services/partService.ts`

---

### 37. Atalho "Desfazer" (Undo)

**Problema:** Um clique errado (excluir PC, avançar status, remover peça) não tem volta.

**O que fazer:**
- Criar `undoStack` no `sync.ts`: cada ação de mutação empilha o estado anterior
- `Ctrl+Z` / botão "Desfazer" no header
- Toast "PC excluído. [Desfazer]" após cada ação destrutiva
- Stack limitada a 50 ações

**Arquivos envolvidos:** `src/lib/sync.ts`, `src/lib/undo.ts`, `src/apps/pcare/components/Toast.tsx`

---

### 38. Feed de Atividades Global

**Problema:** O action log existe por PC, mas não há uma timeline consolidada de tudo que aconteceu no laboratório.

**O que fazer:**
- Criar página "Atividades" com timeline global (todos os PCs, todas as ações)
- Filtros: tipo de ação, laboratório, período, técnico (quando tiver auth)
- Agrupar por dia ("Hoje", "Ontem", "Semana passada")
- Paginação ou scroll infinito

**Arquivos envolvidos:** Nova página `src/apps/pcare/pages/Activity.tsx`

---

### 39. Inventário Cíclico (Stock)

**Problema:** Itens de estoque podem ser perdidos ou danificados. Sem uma contagem física periódica, o estoque fica desatualizado.

**O que fazer:**
- Criar "Ciclo de Inventário": selecionar um grupo de itens para contar a cada semana
- Modo "Contagem": interface limpa mostrando item → técnico digita quantidade real
- Divergência: destacar itens com diferença entre estoque atual e contagem física
- Histórico de contagens com data e responsável

**Arquivos envolvidos:** Nova página `src/apps/stock/pages/InventoryCycle.tsx`, novo service `src/apps/stock/services/inventoryService.ts`

---

### 40. Pré-visualização de QR na Lista de PCs

**Problema:** Na lista de PCs, não há indicação visual de que um PC tem QR code gerado. O técnico precisa abrir o PC para ver.

**O que fazer:**
- Mostrar ícone de QR no canto do card se o PC tem QR gerado
- Ao clicar no ícone, abre o QR em modal (não precisa navegar)
- Na hora de imprimir etiquetas, saber quais PCs já têm etiqueta

**Arquivos envolvidos:** `src/apps/pcare/components/PCCard.tsx`, `src/apps/pcare/pages/PCDetail.tsx`

---

### 41. Modo Noturno Automático

**Problema:** O técnico que trabalha à noite no laboratório precisa lembrar de ativar o tema escuro manualmente.

**O que fazer:**
- Opção "Automático" no toggle de tema: usa tema claro de dia, escuro à noite
- Detectar horário do sistema (`new Date().getHours()`)
- Transição suave entre temas (CSS `transition` em `--bg-*`)
- Permitir horário personalizado: "Escuro a partir das 18:00"

**Arquivos envolvidos:** `src/lib/ThemeContext.tsx`

---

### 42. Grade de Horários de Manutenção

**Problema:** Manutenções agendadas aparecem como lista linear. Difícil visualizar a semana ou mês.

**O que fazer:**
- Criar visualização em calendário (mensal/semanal)
- Cores por tipo: limpeza (azul), restauração (laranja), ambos (roxo)
- Arrastar para reagendar
- Clique no dia → lista de manutenções daquele dia

**Arquivos envolvidos:** `src/apps/pcare/pages/Maintenance.tsx`, novo componente `src/apps/pcare/components/MaintenanceCalendar.tsx`

---

### 43. Consolidado de Estoque por Laboratório

**Problema:** O Stock não tem visão por laboratório. Todos os itens aparecem juntos, independente de onde estão alocados.

**O que fazer:**
- Adicionar campo `labName` nos itens de stock
- Filtro "Laboratório" no StockSection
- Dashboard do Stock: "Itens por laboratório" com contagem
- Movimentação entre laboratórios registrada como `mudanca_sala`

**Arquivos envolvidos:** `src/apps/stock/types/stock.ts`, `src/apps/stock/pages/StockSection.tsx`, `src/apps/stock/components/SectionTabs.tsx`

---

### 44. Assistente de Migração de Dados

**Problema:** Se o usuário já usava o app antes da migração Firebase→Supabase, pode ter dados órfãos no localStorage com formato antigo.

**O que fazer:**
- Detectar versão anterior do schema (`localStorage.getItem('labhub_schema_version')`)
- Script de migração que transforma dados antigos para novo formato
- Rodar automaticamente na inicialização se detectar versão antiga
- Log do que foi migrado

**Arquivos envolvidos:** `src/lib/migrate.ts`, `src/App.tsx`

---

### 45. Plugins / Extensões Simples

**Problema:** Funcionalidades específicas de cada laboratório (ex: integração com sistema acadêmico) não podem ser adicionadas sem modificar o core.

**O que fazer:**
- Definir interface `LabHubPlugin` com hooks: `onPCCreated`, `onSyncComplete`, etc.
- Plugin carrega via arquivo JS na pasta `plugins/`
- Exemplo: plugin que envia dados para API externa ao criar PC
- Documentar API de plugins

**Arquivos envolvidos:** Novo `src/lib/plugin-system.ts`, `src/plugins/`

---

### 46. Exportar Dashboard como Imagem

**Problema:** O técnico quer compartilhar o status do laboratório com o supervisor, mas não pode mandar print porque o dashboard tem dados sensíveis de vários PCs.

**O que fazer:**
- Botão "Exportar Dashboard" no canto superior
- Renderizar dashboard em canvas (html2canvas já está no projeto)
- Download como PNG ou PDF
- Opção de anonimizar: ocultar números de PC, mostrar só laboratórios

**Arquivos envolvidos:** `src/apps/pcare/pages/Dashboard.tsx`

---

### 47. Notificações Intra-app (Central)

**Problema:** Alertas importantes (sync falhou, estoque baixo, manutenção atrasada) são mostrados uma vez e desaparecem.

**O que fazer:**
- Criar central de notificações no header (ícone de sino com badge)
- Tipos: sync_error, low_stock, maintenance_due, update_available
- Notificações persistem no localStorage até o usuário dismiss
- Máximo 50 notificações, as mais antigas são removidas

**Arquivos envolvidos:** Novo `src/lib/notifications.ts`, `src/apps/pcare/components/NotificationCenter.tsx`, `src/apps/pcare/components/BottomNav.tsx`

---

### 48. Rascunho Automático em Formulários

**Problema:** Usuário preenche metade do formulário de PC, recebe uma chamada e fecha o app. Perde tudo o que digitou.

**O que fazer:**
- Salvar rascunho no localStorage a cada 5s enquanto o formulário estiver aberto
- Ao abrir um novo PC, detectar rascunho e perguntar: "Você tem um rascunho não salvo. Deseja restaurar?"
- Limpar rascunho após submit bem-sucedido
- Funcionar para PCForm, StockForm, MaintenanceForm

**Arquivos envolvidos:** `src/apps/pcare/pages/PCForm.tsx`, `src/apps/stock/pages/StockForm.tsx`, novo hook `useDraft.ts`

---

### 49. Métricas de Performance (Web Vitals)

**Problema:** O app pode estar lento em dispositivos mais antigos, mas não há monitoramento.

**O que fazer:**
- Coletar Web Vitals (LCP, FID, CLS, TTFB) usando `web-vitals` library
- Enviar para Supabase (tabela `analytics.page_metrics`)
- Dashboard interno: "Performance" nas Configurações com gráficos das métricas
- Alerta se LCP > 2.5s ou CLS > 0.1

**Arquivos envolvidos:** `src/main.tsx`, novas tabelas no Supabase, `src/apps/pcare/pages/Settings.tsx`

---

### 50. Modo Offline com Cache de Dados (IndexedDB)

**Problema:** localStorage tem limite de ~5MB. Com fotos e muitos PCs, o app pode estourar o limite.

**O que fazer:**
- Migrar armazenamento de dados para IndexedDB (via idb library ou Dexie.js)
- localStorage continua para preferências (tema, rascunhos)
- Vantagens: limite muito maior (~50MB+), queries indexadas, suporte a transações
- Sync engine adaptado para ler/escrever no IndexedDB

**Arquivos envolvidos:** `src/lib/storage.ts`, `src/lib/sync.ts`

---

### 51. Status dos PCs por LED Virtual

**Problema:** Numa lista com 30 PCs, o técnico quer ver rapidamente quais estão com problema sem ler texto.

**O que fazer:**
- Adicionar "LED" colorido no card: verde = ok, amarelo = em andamento, vermelho = atrasado
- Piscar se atrasado (> 7 dias sem intervenção)
- Ícone de alerta se tem peça pendente de substituição
- Acessível: tooltip explica o significado da cor

**Arquivos envolvidos:** `src/apps/pcare/components/PCCard.tsx`, `src/apps/stock/components/StockCard.tsx`

---

### 52. Histórico de Intervenções Timeline Gráfica

**Problema:** O timeline de ações do PC é textual e sem escala temporal. Difícil ver padrões (ex: "esse PC precisa de limpeza a cada 2 semanas").

**O que fazer:**
- Renderizar timeline horizontal com bolhas por data
- Cores por tipo de ação (limpeza, restauração, troca de peça)
- Cluster automático: se muitas ações no mesmo dia, agrupar
- Clicar na bolha → detalhes da ação

**Arquivos envolvidos:** `src/apps/pcare/components/ActionTimeline.tsx`

---

### 53. Impressão de Relatórios (Print Styles)

**Problema:** Ao imprimir um relatório ou detalhe de PC, as cores escuros e layouts de app não funcionam bem no papel.

**O que fazer:**
- CSS `@media print` com fundo branco, texto preto, sem botões/nav
- `print()` esconde header, bottom nav, elementos interativos
- Versão compacta do PCDetail para impressão
- Botão "Imprimir" no relatório e no PCDetail

**Arquivos envolvidos:** `src/index.css`, `src/apps/pcare/pages/PCDetail.tsx`, `src/apps/pcare/pages/Reports.tsx`

---

### 54. Laboratórios Favoritos

**Problema:** Um técnico pode atender 5 laboratórios, mas trabalha principalmente em 2. Fica filtrando toda hora.

**O que fazer:**
- Permitir marcar laboratórios como favoritos (estrela)
- Aba "Favoritos" no seletor de laboratório
- Dashboard filtrável: "Mostrar só favoritos"
- Ordenar: favoritos aparecem primeiro nos selects

**Arquivos envolvidos:** `src/apps/pcare/hooks/usePCs.ts`, `src/apps/pcare/components/BottomNav.tsx`

---

### 55. Widget de Resumo Rápido (Quick Stats)

**Problema:** O Dashboard tem muitas informações. O técnico na correria quer ver apenas: "quantos PCs faltam?" e "tem algo urgente?"

**O que fazer:**
- Widget colapsável no topo do PCList: "Faltam 3 PCs para limpar · 1 manutenção atrasada"
- Badge no BottomNav com número de pendências
- Resumo visível sem scroll (acima da busca)

**Arquivos envolvidos:** `src/apps/pcare/pages/PCList.tsx`, `src/apps/pcare/components/BottomNav.tsx`

---

## Resumo

| Prioridade | Feature | Esforço | Impacto |
|---|---|---|---|
| 🔥 | Auth (Supabase) | Médio | Alto |
| 🔥 | Indicador de sync | Baixo | Alto |
| 🔥 | Upload de fotos | Médio | Alto |
| 🔥 | Dashboard com gráficos | Médio | Alto |
| 📋 | Operações em lote | Médio | Médio |
| 📋 | Notificações push | Alto | Médio |
| 📋 | Importar dados | Médio | Médio |
| 📋 | Tema customizável | Médio | Médio |
| 📋 | Relatórios avançados | Médio | Médio |
| 📋 | Deploy automático | Baixo | Alto |
| 📋 | Etiquetas QR | Baixo | Médio |
| 📋 | Cadastro em massa | Baixo | Alto |
| 📋 | Seletor de laboratório | Baixo | Alto |
| 📋 | Etiquetas QR | Baixo | Médio |
| 📋 | Checklist com foto | Médio | Médio |
| 📋 | Multilíngue (i18n) | Alto | Médio |
| 📋 | Garantia e licenças | Médio | Médio |
| 📋 | Rastreamento por patrimônio | Médio | Médio |
| 📋 | Gestão de periféricos | Médio | Médio |
| 📋 | Inventário cíclico (stock) | Alto | Alto |
| 📋 | Consolidado por laboratório | Médio | Médio |
| 📋 | Grade de manutenção (calendário) | Médio | Médio |
| 🎯 | Atalhos teclado | Baixo | Baixo |
| 🎯 | Tema do sistema | Baixo | Baixo |
| 🎯 | Atividades global | Médio | Baixo |
| 🎯 | Página offline | Baixo | Baixo |
| 🎯 | Testes E2E | Alto | Médio |
| 🎯 | Mapa do laboratório | Alto | Médio |
| 🎯 | Sync periódico (polling) | Médio | Médio |
| 🎯 | Avançar status no card | Baixo | Médio |
| 🎯 | Comparar PCs | Médio | Baixo |
| 🎯 | Backup manual | Baixo | Médio |
| 🎯 | Tour / Onboarding | Médio | Médio |
| 🎯 | Resolução de conflitos | Médio | Médio |
| 🎯 | Compartilhar PC via QR | Baixo | Baixo |
| 🎯 | Ronda diária | Médio | Médio |
| 🎯 | Sugestão de reposição | Baixo | Médio |
| 🎯 | Desfazer (undo) | Alto | Alto |
| 🎯 | Feed de atividades global | Médio | Médio |
| 🎯 | Modo foco / kiosk | Médio | Médio |
| 🎯 | Comprar PCs lado a lado | Médio | Baixo |
| 🎯 | Modo noturno automático | Baixo | Baixo |
| 🎯 | Histórico de conexão | Baixo | Baixo |
| 🎯 | Pré-visualização QR na lista | Baixo | Baixo |
| 🎯 | Exportar dashboard como imagem | Médio | Baixo |
| 🎯 | Central de notificações | Alto | Médio |
| 🎯 | Rascunho automático | Baixo | Alto |
| 🎯 | Plugins / extensões | Alto | Médio |
| 🎯 | Assistente de migração | Médio | Médio |
| 🎯 | Web Vitals | Médio | Baixo |
| 🎯 | IndexedDB (storage) | Alto | Alto |
| 🎯 | LED virtual de status | Baixo | Médio |
| 🎯 | Timeline gráfica | Médio | Médio |
| 🎯 | Print styles | Baixo | Médio |
| 🎯 | Laboratórios favoritos | Baixo | Baixo |
| 🎯 | Quick Stats widget | Baixo | Médio |
