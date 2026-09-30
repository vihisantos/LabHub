import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Guarda de paleta: nenhuma superfície da web pode voltar a ser cor fixa.
 *
 * O sintoma que motivou isso era o Sutil ("dim") com áreas brancas: os
 * gerenciadores do TV usavam `bg-white` e `slate-*` sem nenhum token, e como
 * o Sutil NÃO é a classe `dark`, todo `dark:` desses arquivos nunca disparava
 * ali — o componente renderizava a variante clara em cima da base lilás.
 *
 * A regra é por arquivo, não por contagem, para a falha dizer ONDE.
 */

/** src/tv-desktop é o app Electron do kiosk: superfície própria, fora do tema. */
const FORA_DO_TEMA = ['src/tv-desktop']

/**
 * Branco que é tinta, não papel. Trocar por `bg-card` deixaria o knob lilás
 * sobre trilho colorido — o controle sumiria.
 */
const BRANCO_DE_TINTA: { arquivo: string; motivo: string }[] = [
  { arquivo: 'src/lib/components/ui/switch.tsx', motivo: 'polegar do switch sobre trilho colorido' },
  { arquivo: 'src/platform/WorkspaceGate/components/WorkspaceAppsModal.tsx', motivo: 'knob do toggle' },
  { arquivo: 'src/apps/reservalab/components/TabletCalendar.tsx', motivo: 'dia selecionado do calendário' },
]

function arquivos(raiz: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(raiz)) {
    const p = join(raiz, nome)
    if (statSync(p).isDirectory()) out.push(...arquivos(p))
    else if (/\.(tsx|ts)$/.test(nome) && !nome.endsWith('.d.ts')) out.push(p)
  }
  return out
}

// De src/platform/Dashboard/__tests__: três níveis sobem até src/, quatro até a raiz.
const RAIZ = resolve(__dirname, '../../../..')

function web(): { arquivo: string; linha: number; texto: string }[] {
  const achados: { arquivo: string; linha: number; texto: string }[] = []
  for (const abs of arquivos(join(RAIZ, 'src'))) {
    const rel = relative(RAIZ, abs).replace(/\\/g, '/')
    if (FORA_DO_TEMA.some((f) => rel.startsWith(f))) continue
    if (rel.includes('/__tests__/')) continue
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((texto, i) => {
        // Comentário não é superfície: ele só FALA de cor. Sem esta exclusão a
        // guarda accuse a própria documentação dela.
        const t = texto.trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
        achados.push({ arquivo: rel, linha: i + 1, texto })
      })
  }
  return achados
}

const LINHAS = web()

/** Cor de superfície fixa: a que produz o branco no Sutil.
 *  O `(?![/0-9])` é o que separa `bg-white` (papel) de `bg-white/20` (tinta
 *  sobre fundo colorido) — sem ele a guarda acusa overlay de câmera. */
const SUPERFICIE = /\b(?:bg)-(?:white|(?:slate|gray)-(?:50|100|200|300|400))\b(?![/0-9])/

describe('Guarda de paleta — a web lê cor do tema', () => {
  it('nenhuma superfície da web usa branco ou cinza fixo', () => {
    const permitidos = new Set(BRANCO_DE_TINTA.map((b) => b.arquivo))
    const achados = LINHAS.filter((l) => SUPERFICIE.test(l.texto)).filter((l) => !permitidos.has(l.arquivo))

    expect(
      achados.map((a) => `  ${a.arquivo}:${a.linha}  ${a.texto.trim().slice(0, 90)}`),
      'superfície fixa encontrada — deve ser bg-card / bg-input / bg-segmented',
    ).toEqual([])
  })

  it('o branco de tinta continua branco, e é ele mesmo', () => {
    // A guarda acima é a que barra o branco de papel; esta garante que a
    // exceção não cresceu nem mudou de lugar.
    for (const { arquivo, motivo } of BRANCO_DE_TINTA) {
      const conteudo = readFileSync(join(RAIZ, arquivo), 'utf8')
      expect(conteudo, `${arquivo} (${motivo}) perdeu o branco`).toMatch(/\bbg-white\b(?![/0-9])/)
    }
  })

  it('nenhum prefixo dark: sobre um token — o token já varia com o tema', () => {
    // `dark:` no Sutil é classe morta: o Sutil usa a classe `dim`. Deixar
    // `dark:bg-card` seria pedir para a superfície não mudar no Sutil.
    const achados = LINHAS.filter((l) => /dark:(?:bg|text|border|placeholder)-(?:card|input|segmented|fg|fg-dim|fg-muted|line)\b/.test(l.texto))
    expect(achados.map((a) => `  ${a.arquivo}:${a.linha}`)).toEqual([])
  })

  it('o app Electron do kiosk fica fora da guarda, e continua intocado', () => {
    // Se alguém migrar o kiosk sem querer, a guarda não cobre — deixo explícito.
    expect(FORA_DO_TEMA).toEqual(['src/tv-desktop'])
    const desktop = arquivos(join(RAIZ, 'src/tv-desktop'))
    expect(desktop.length).toBeGreaterThan(0)
  })
})
