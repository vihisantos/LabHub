# Melhorias - LabHub

> Ideias e prioridades para evolução do projeto.

---

## 🔥 Críticas (Alto Impacto)

~~### 1. Firebase Inativo → Supabase~~ ✅

~~**Problema:** Firebase configurado em `src/lib/firebase.ts` e duplicado em `src/apps/pcare/services/firebase.ts`, mas sem arquivo `.env` com as credenciais. O `useOnlineSync.ts` é um stub vazio — qualquer refresh de página perde todos os dados (só localStorage).~~

~~**O que foi feito:**~~
~~- Firebase removido completamente; sync migrado para Supabase (PostgreSQL)~~
~~- `src/lib/supabase.ts` criado com clients por schema (`pcare` + `stock`)~~
~~- `src/lib/sync.ts` reescrito: `syncAll()` usa Supabase em vez de Firestore~~
~~- Pull-only no primeiro sync (dados mock não sobem)~~
~~- `useOnlineSync.ts` reescrito com sync real~~
~~- Todos os timestamps migrados para ISO 8601 strings~~
~~- Migration SQL executada no Supabase (schemas + tabelas)~~

~~**Arquivos envolvidos:** `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/lib/firebase.ts` (removido), `.env`, `.env.example`~~

---

~~### 2. CI sem Testes nem Lint~~ ✅

~~**Problema:** `.github/workflows/ci.yml` executa apenas `npm run build`. Regressões passam despercebidas.~~

~~**O que fazer:**~~
~~```yaml~~
~~# Adicionar ao ci.yml, após o build:~~
~~- run: npm run test:run~~
~~- run: npm run lint~~
~~```~~

~~**Arquivos envolvidos:** `.github/workflows/ci.yml`~~

---

### 3. Light Theme Quebrado

**Problema:** O plano de redesign apontou que o toggle dark/light não funciona corretamente em alguns componentes. Possivelmente classes `dark:` hardcoded em vez de usar as variáveis CSS definidas em `:root` / `.dark`.

**O que fazer:**
- Revisar todos os componentes em busca de classes `dark:` (Tailwind)
- Garantir que usam as variáveis CSS custom properties de `src/index.css`
- Verificar o `ThemeContext.tsx` — o toggle está alternando a classe `.dark` no `<html>`?

**Arquivos envolvidos:** `src/index.css`, `src/lib/ThemeContext.tsx`, todos os componentes com classes `dark:`

---

~~### 4. Migração de Ícones (Lucide)~~ ✅

~~**Problema:** Plano de redesign determinou substituir emojis/icons antigos por Lucide icons. A migração está em andamento (working directory sujo), mas pode não estar completa.~~

~~**O que fazer:**~~
~~- Verificar se todos os componentes usam `icons.ui.*` do `src/lib/icons.ts`~~
~~- Garantir que `src/lib/icons.ts` tem todos os ícones necessários (sem `any`)~~
~~- Remover imports/uso de ícones antigos~~

~~**Arquivos envolvidos:** `src/lib/icons.ts`, todos os componentes que usam ícones~~

---

## 📋 Média Prioridade

~~### 5. General Stock App (Reestruturação)~~ ✅

~~**Problema:** O app `general-stock` antigo tinha apenas 1 página, sem navegação inferior, sem relatórios ou exportação.~~

~~**O que foi feito:**~~
~~- General-stock legado removido (não era usado)~~
~~- StockApp (novo) refatorado com StockBottomNav~~
~~- Exportação CSV de itens e movimentações~~
~~- Alerta de itens em conserto~~
~~- Theme toggle no header~~

~~**Arquivos envolvidos:** `src/apps/stock/`, `src/apps/general-stock/` (removido)~~

---

~~### 6. Duplicação de Código Firebase~~ ✅

~~**Problema:** `src/lib/firebase.ts` e `src/apps/pcare/services/firebase.ts` são idênticos.~~

~~**O que fazer:**~~
~~- Remover `src/apps/pcare/services/firebase.ts` (já era código morto, sem imports)~~

~~**Arquivos envolvidos:** `src/apps/pcare/services/firebase.ts` (removido)~~

---

### 7. Testes de Página (Integração) Ausentes

**Problema:** `src/pages/__tests__/` está vazio. Os 18 testes existentes cobrem apenas serviços e componentes isolados.

**O que fazer:**
- Criar testes de integração para páginas principais: `PCList`, `PCDetail`, `Dashboard`, `StockList`
- Usar `render` do Testing Library com providers necessários (ThemeContext, react-router)
- Testar fluxos completos: navegação → dados → interação → resultado

**Arquivos envolvidos:** `src/pages/__tests__/`, `src/apps/*/pages/__tests__/`

---

~~### 8. `prompt()` / `confirm()` Nativos~~ ✅

~~**Problema:** Alguns lugares ainda usam diálogos nativos do browser, que são feios e inconsistentes no mobile.~~

~~**O que foi feito:**~~
~~- Substituídos todos os `window.confirm()` por `ConfirmDialog`~~
~~- Arquivos modificados: `Maintenance.tsx`, `Settings.tsx`, `ChecklistTemplates.tsx`, `ChecklistExecute.tsx`, `PartsList.tsx`, `PCDetail.tsx`~~

~~**Arquivos envolvidos:** `src/apps/pcare/pages/*.tsx`~~

---

## 🎯 Baixa Prioridade / Nice-to-have

~~### 9. Animações de Transição entre Rotas~~ ✅

~~**Problema:** Apenas animação `fade-in-up` básica via CSS. Navegação entre páginas é abrupta.~~

~~**O que fazer:**~~
~~- Adicionar Framer Motion ou usar CSS View Transitions API (suportada em Chrome 2024+)~~
~~- Criar um `AnimatedOutlet` ou wrapper de rota~~

---

### 10. Modo Off-line Mais Robusto

**Problema:** Service worker existe (Workbox auto-update), mas não há estratégia de cache para assets dinâmicos ou dados.

**O que fazer:**
- Configurar Workbox para runtime caching de chamadas Firebase/Firestore
- Estratégia: NetworkFirst com fallback para cache
- Servir página offline customizada quando sem rede

---

~~### 11. Acessibilidade (a11y)~~ ✅

~~**Problema:** Faltam `aria-label` em botões de ação, foco gerenciado em modais, roles semânticos em navegação.~~

~~**O que fazer:**~~
~~- Adicionar `aria-label` em todos os botões com ícone~~
~~- Gerenciar foco ao abrir/fechar modais (`focus-trap`)~~
~~- Usar `<nav>` e `<main>` semânticos~~
~~- Garantir contraste de cores suficiente no tema light e dark~~

---

~~### 12. Safe Area para iPhone~~ ✅

~~**Problema:** `env(safe-area-inset-bottom)` resolvido no BottomNav, mas pode faltar em outros elementos fixos.~~

~~**O que fazer:**~~
~~- Revisar todos os elementos com posicionamento fixo (headers, banners, modais full-screen)~~
~~- Aplicar `env(safe-area-inset-*)` consistente~~

---

~~### 13. Versão e Changelog~~ ✅

~~**Problema:** `package.json` version `"0.0.0"` sem histórico de releases.~~

~~**O que foi feito:**~~
~~- Versão atualizada para `0.1.0`~~
~~- `CHANGELOG.md` criado seguindo Keep a Changelog~~
~~- `standard-version` instalado e scripts `release` adicionados no `package.json`~~

---

~~### 14. Performance~~ ✅

~~**Problema:** Sem lazy loading de rotas, todos os bundles são carregados de uma vez.~~

~~**O que foi feito:**~~
~~- `React.lazy()` + `Suspense` para Launcher, PCareApp e StockApp~~
~~- Code-split: cada app em chunk separado (Launcher 4.6 kB, Stock 41 kB, PCare 954 kB)~~
~~- `rollup-plugin-visualizer` instalado + script `analyze`~~

---

### 15. Error Tracking

**Problema:** Apenas `ErrorBoundary` genérico, sem logging remoto.

**O que fazer:**
- Integrar Sentry ou ferramenta similar
- Logar erros no Firebase Crashlytics (se usar Firebase)
- Adicionar `ErrorBoundary` específico por módulo

---

## Como Priorizar

| Prioridade | Item | Esforço | Impacto |
|------------|------|---------|---------|
| ~~🔥~~ | ~~Firebase~~ | ✅ | |
| ~~🔥~~ | ~~CI tests/lint~~ | ~~Baixo~~ | ✅ |
| 🔥 | Light theme | Médio | Alto (experiência do usuário) |
| ~~🔥~~ | ~~Ícones~~ | ~~Médio~~ | ✅ |
| ~~📋~~ | ~~General Stock~~ | ~~Alto~~ | ✅ |
| ~~📋~~ | ~~Firebase duplicado~~ | ~~Baixo~~ | ✅ |
| 📋 | Testes página | Médio | Alto (qualidade) |
| ~~📋~~ | ~~prompt()/confirm()~~ | ~~Baixo~~ | ✅ |
| ~~🎯~~ | ~~Animações~~ | ~~Médio~~ | ✅ |
| 🎯 | Offline | Alto | Médio |
| ~~🎯~~ | ~~a11y~~ | ~~Alto~~ | ✅ |
| ~~🎯~~ | ~~Safe area~~ | ~~Baixo~~ | ✅ |
| ~~🎯~~ | ~~Versão~~ | ~~Baixo~~ | ✅ |
| ~~🎯~~ | ~~Performance~~ | ~~Médio~~ | ✅ |
| 🎯 | Error tracking | Médio | Médio |

---

> **Nota:** Este documento é um ponto de partida para discussão. Sugiro começar pelos itens 🔥 e ir validando com testes a cada mudança.
