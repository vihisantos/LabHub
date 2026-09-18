# `src/responsive/` — camada compartilhada de responsividade

Fase 0 do redesenho responsivo do LabHub. Esta camada é a **fundação**: nenhuma
tela existente foi migrada ainda (a migração acontece por módulo, fase a fase).

## Faixas (breakpoints)

| Faixa    | Largura        | Equivalente Tailwind v4 |
| -------- | -------------- | ----------------------- |
| `compact`| `< 640px`      | base (nada ligado)      |
| `tablet` | `640–1023px`   | `sm:` (640px) e `md:`   |
| `desktop`| `1024–1279px`  | `lg:` (1024px)          |
| `wide`   | `>= 1280px`    | `xl:` (1280px)+         |

Os limites espelham os defaults do Tailwind v4 (sem customização), então a
camada e o CSS ficam alinhados.

## Quando usar cada faixa

- **compact** — celular/PWA: coluna única, cards empilhados, bottom sheets,
  navegação flutuante inferior.
- **tablet** — telas intermediárias: mesma estrutura do compact, com mais
  espaço para grids e conteúdo.
- **desktop** — PC/notebook: múltiplas colunas, tabelas/listas mais densas,
  diálogos centralizados, painéis laterais.
- **wide** — monitores grandes: aproveitar a largura com containers mais
  largos e conteúdo mais denso.

## Quando NÃO usar breakpoint

- **Preferir `ResponsiveGrid` (auto-fit/minmax) a escrever `sm:`/`md:`/`lg:`
  de grid na mão.** O número de colunas deve se ajustar sozinho à largura.
- **Prefira adaptar por conteúdo, não por `isMobile` binário.** As faixas são
  `compact/tablet/desktop/wide`; um boolean não representa decisões de layout.
- **Não use breakpoint para mudar lógica.** A faixa é uma decisão de
  APRESENTAÇÃO. Se a mudança envolve dados, RBAC, serviços ou regras de
  negócio, elas continuam únicas e compartilhadas entre todas as plataformas.

## Mudança visual × mudança de lógica

- **Visual**: `Only` (from/upto), `PageContainer`, `ResponsiveGrid`,
  `SheetOrDialog`. Renderizam o mesmo conteúdo em enquadramentos diferentes.
- **Lógica**: nunca é condicionada a breakpoint dentro da UI layer. Uma
  mesma `CoordinatorHome` (por exemplo) deve exibir layout compacto no
  celular e layout largo no desktop **sem duplicar a tela**.

## RBAC, serviços, dados e regras de negócio

- São **compartilhados e únicos**. Não criar `XxxMobile` / `XxxDesktop`.
- A regra de acesso à área de Coordenação, por exemplo, continua concedida
  exclusivamente por membership ativa confirmada pelo servidor — faixa de
  viewport não altera concessão alguma.

## Primitives

### `useBreakpoint()`

```ts
const { bp, isCompact, isTablet, isDesktop, isWide } = useBreakpoint()
```

- SSR-safe e seguro sem `window.matchMedia` (jsdom puro) → assume `compact`.
- 3 listeners `min-width` (640/1024/1280); deriva a faixa. Nada de dezenas de
  listeners ou hooks paralelos.

### `PageContainer`

```tsx
<PageContainer>{children}</PageContainer>
```

Container centralizado; adapta largura e gutters por faixa. É o **único** lugar
autorizado a escrever larguras de breakpoint na mão. Substituirá os `max-w-*`
manuais dos módulos nas fases seguintes.

### `ResponsiveGrid`

```tsx
<ResponsiveGrid minWidth={240} gap={16}>{cards}</ResponsiveGrid>
```

`repeat(auto-fit, minmax(...))` — sem floresta de `sm:`/`md:`/`lg:`.

### `SheetOrDialog`

```tsx
<SheetOrDialog
  open={open}
  onClose={onClose}
  title="Título"
  description="Descrição (só no desktop)"
>
  {conteúdo único}
</SheetOrDialog>
```

compact/tablet → `BottomSheet`; desktop/wide → `Dialog` (Radix). O conteúdo é
**o mesmo** nas duas variantes.

### `Only`

```tsx
<Only from="desktop">...</Only>   {/* só a partir de desktop */}
<Only upto="tablet">...</Only>   {/* só até tablet */}
```

Cosmético: aparência/densidade. Nunca lógica.