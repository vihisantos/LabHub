# Melhorias - LabHub

> Ideias e prioridades para evolução do projeto.

---

## 🔥 Críticas (Alto Impacto)

### 1. Firebase Inativo

**Problema:** Firebase configurado em `src/lib/firebase.ts` e duplicado em `src/apps/pcare/services/firebase.ts`, mas sem arquivo `.env` com as credenciais. O `useOnlineSync.ts` é um stub vazio — qualquer refresh de página perde todos os dados (só localStorage).

**O que fazer:**
- Criar `.env` com as variáveis `VITE_FIREBASE_*`
- Unificar as duas configurações Firebase (manter só uma)
- Implementar sync real no `useOnlineSync.ts` (offline → localStorage, online → Firebase)
- Estratégia: localStorage como source of truth, Firebase como backup/sync

**Arquivos envolvidos:** `.env.example`, `src/lib/firebase.ts`, `src/apps/pcare/services/firebase.ts`, `src/apps/pcare/hooks/useOnlineSync.ts`

---

### 2. CI sem Testes nem Lint

**Problema:** `.github/workflows/ci.yml` executa apenas `npm run build`. Regressões passam despercebidas.

**O que fazer:**
```yaml
# Adicionar ao ci.yml, após o build:
- run: npm run test:run
- run: npm run lint
```

**Arquivos envolvidos:** `.github/workflows/ci.yml`

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

### 5. General Stock App Incompleto

**Problema:** O app `general-stock` tem apenas 1 página (StockList), sem navegação inferior, sem formulários completos, sem relatórios ou exportação.

**O que fazer:**
- Adicionar BottomNav ou navegação por tabs
- Criar páginas de relatórios, histórico, categorias
- Adicionar exportação CSV (reaproveitar `utils/export.ts` do PCare)
- Adicionar indicador de estoque baixo / alertas

**Arquivos envolvidos:** `src/apps/general-stock/`

---

### 6. Duplicação de Código Firebase

**Problema:** `src/lib/firebase.ts` e `src/apps/pcare/services/firebase.ts` são idênticos.

**O que fazer:**
- Remover `src/apps/pcare/services/firebase.ts`
- Atualizar imports em `src/apps/pcare/services/` para usar `src/lib/firebase.ts`

**Arquivos envolvidos:** `src/apps/pcare/services/firebase.ts` (remover), `src/apps/pcare/services/*.ts` (atualizar imports)

---

### 7. Testes de Página (Integração) Ausentes

**Problema:** `src/pages/__tests__/` está vazio. Os 18 testes existentes cobrem apenas serviços e componentes isolados.

**O que fazer:**
- Criar testes de integração para páginas principais: `PCList`, `PCDetail`, `Dashboard`, `StockList`
- Usar `render` do Testing Library com providers necessários (ThemeContext, react-router)
- Testar fluxos completos: navegação → dados → interação → resultado

**Arquivos envolvidos:** `src/pages/__tests__/`, `src/apps/*/pages/__tests__/`

---

### 8. `prompt()` / `confirm()` Nativos

**Problema:** Alguns lugares ainda usam diálogos nativos do browser, que são feios e inconsistentes no mobile.

**O que fazer:**
- Substituir por `ConfirmDialog` já existente em `src/apps/pcare/components/Modal.tsx`
- Ou criar um `PromptDialog` para entradas de texto

**Arquivos envolvidos:** Revisar `PCList.tsx`, `StockList.tsx`, `StockCard.tsx` e outros

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

### 13. Versão e Changelog

**Problema:** `package.json` version `"0.0.0"` sem histórico de releases.

**O que fazer:**
- Definir versão inicial (ex: `0.1.0`)
- Criar `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/)
- Configurar `standard-version` ou `semantic-release` para automatizar

---

### 14. Performance

**Problema:** Sem lazy loading de rotas, todos os bundles são carregados de uma vez.

**O que fazer:**
- Usar `React.lazy()` + `Suspense` para cada rota principal
- Code-split o General Stock app separado do PCare app
- Analisar bundle com `vite-plugin-visualizer`

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
| 🔥 | Firebase | Alto | Alto (sem isso, dados não persistem) |
| 🔥 | CI tests/lint | Baixo | Alto (pega regressão cedo) |
| 🔥 | Light theme | Médio | Alto (experiência do usuário) |
| ~~🔥~~ | ~~Ícones~~ | ~~Médio~~ | ✅ |
| 📋 | General Stock | Alto | Médio (app secundário) |
| 📋 | Firebase duplicado | Baixo | Baixo (manutenibilidade) |
| 📋 | Testes página | Médio | Alto (qualidade) |
| 📋 | prompt()/confirm() | Baixo | Médio (UX mobile) |
| ~~🎯~~ | ~~Animações~~ | ~~Médio~~ | ✅ |
| 🎯 | Offline | Alto | Médio |
| ~~🎯~~ | ~~a11y~~ | ~~Alto~~ | ✅ |
| ~~🎯~~ | ~~Safe area~~ | ~~Baixo~~ | ✅ |
| 🎯 | Versão | Baixo | Baixo |
| 🎯 | Performance | Médio | Médio |
| 🎯 | Error tracking | Médio | Médio |

---

> **Nota:** Este documento é um ponto de partida para discussão. Sugiro começar pelos itens 🔥 e ir validando com testes a cada mudança.
