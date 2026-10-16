import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ScenarioError,
  expectAll,
  expectText,
  main,
  navigateToRoute,
  redact,
  secureScreenshot,
  runScenarioList,
  snippet,
  waitForText,
} from './chamados-espera-indeferido.mjs'

// ────────── utilitários de teste ──────────

const OUT_DIR = join(tmpdir(), 'labhub-e2e-tests')
mkdirSync(OUT_DIR, { recursive: true })
afterAll(() => {
  try {
    rmSync(OUT_DIR, { recursive: true, force: true })
  } catch {
    /* limpeza best-effort */
  }
})

// Garante timers reais antes de cada teste (o setup global ativa fake timers no beforeEach).
beforeEach(() => {
  vi.useRealTimers()
})

/** Página falsa: `evaluate` devolve o texto atual; `waitForTimeout` não dorme. */
function makePage(text = '', url = 'http://localhost:5173/') {
  let current = text
  return {
    setText(next) {
      current = next
    },
    async evaluate() {
      return current
    },
    async waitForTimeout() {},
    url() {
      return url
    },
    locator() {
      return {
        async isVisible() { return false },
        async click() {},
        async fill() {},
        filter() { return this },
        first() { return this },
        async scrollIntoViewIfNeeded() {},
      }
    },
    async screenshot() {},
  }
}

function makeContext(page) {
  return {
    async close() {},
    newPage() { return page },
  }
}

function makeBrowser(page) {
  return {
    async close() {},
    newContext() { return makeContext(page) },
  }
}

function silentLogger() {
  return { log() {}, error() {} }
}

function captureLogger() {
  const out = { log: [], error: [] }
  return {
    out,
    log: (...args) => out.log.push(args.join(' ')),
    error: (...args) => out.error.push(args.join(' ')),
    getLog: () => out.log.join('\n'),
    getError: () => out.error.join('\n'),
  }
}

const creds = { user: 'demo', pass: 'super-secreta-senha' }
const baseOptions = (extra = {}) => ({
  creds,
  outDir: OUT_DIR,
  logger: silentLogger(),
  ...extra,
})

// ────────── 1. waitForText ──────────

describe('waitForText', () => {
  it('retorna false quando o texto não aparece no timeout', async () => {
    const page = makePage('conteúdo sem o padrão')
    await expect(waitForText(page, 'CHAMADO INDEFERIDO', { timeout: 60 })).resolves.toBe(false)
  })

  it('retorna true quando o texto aparece', async () => {
    const page = makePage('linha 1\nCHAMADO INDEFERIDO\nlinha 3')
    await expect(waitForText(page, 'CHAMADO INDEFERIDO', { timeout: 500 })).resolves.toBe(true)
  })

  it('aceita RegExp', async () => {
    const page = makePage('Aguardando equipamento/peça')
    await expect(waitForText(page, /Aguardando equipamento\/peça/, { timeout: 500 })).resolves.toBe(true)
  })
})

// ────────── 2. verificação obrigatória ──────────

describe('verificação obrigatória', () => {
  it('expectText lança ScenarioError informando cenário e rota', async () => {
    const page = makePage('tela errada')
    await expect(
      expectText(page, { scenario: 16, route: '/chamados/tickets/abc', pattern: 'CHAMADO INDEFERIDO', timeout: 60 }),
    ).rejects.toMatchObject({ name: 'ScenarioError', scenario: 16 })
  })

  it('expectAll para na primeira verificação que falha', async () => {
    const page = makePage('só tem Em espera')
    const checks = [
      { scenario: 12, route: '/x', pattern: 'Em espera', timeout: 100 },
      { scenario: 12, route: '/x', pattern: 'Indeferir', timeout: 100 },
    ]
    await expect(expectAll(page, checks)).rejects.toBeInstanceOf(ScenarioError)
  })

  it('uma verificação malsucedida interrompe o cenário (etapas seguintes não rodam)', async () => {
    let secondStepRan = false
    const runtime = {
      expect: async () => {
        throw new ScenarioError({ scenario: 2, route: '/x', expected: 'algo', body: 'nada' })
      },
    }
    const scenarios = [
      {
        id: 2,
        name: 'cenário que falha no meio',
        async run(rt) {
          await rt.expect()
          secondStepRan = true
        },
      },
    ]
    const results = await runScenarioList(scenarios, runtime, silentLogger())
    expect(results[0].status).toBe('failed')
    expect(secondStepRan).toBe(false)
  })
})

// ────────── 3. captura ──────────

describe('captura', () => {
  it('captura que falha é registrada como cenário malsucedido', async () => {
    const runtime = {
      shot: async () => {
        throw new Error('captura 12.png inválida/vazia (12 bytes)')
      },
    }
    const scenarios = [{ id: 12, name: 'captura', async run(rt) { await rt.shot() } }]
    const results = await runScenarioList(scenarios, runtime, silentLogger())
    expect(results[0].status).toBe('failed')
    expect(String(results[0].error?.message)).toMatch(/captura/i)
  })

  it('falha de captura faz main terminar com código 1', async () => {
    const logger = captureLogger()
    const page = makePage()
    page.goto = async () => {}
    page.screenshot = async () => { throw new Error('captura 12.png inválida/vazia (12 bytes)') }
    const browser = makeBrowser(page)
    const code = await main(
      baseOptions({
        logger,
        browserFactory: async () => browser,
        scenarios: [{ id: 12, name: 'captura', async run(rt) { await rt.shot(page, '12') } }],
      }),
    )
    expect(code).toBe(1)
    expect(logger.getLog()).not.toContain('Done')
  })
})

// ────────── 4. exceções inesperadas ──────────

describe('exceções inesperadas', () => {
  it('exceção inesperada em um cenário → código 1', async () => {
    const page = makePage()
    const browser = makeBrowser(page)
    const code = await main(
      baseOptions({
        browserFactory: async () => browser,
        scenarios: [
          {
            id: 99,
            name: 'boom',
            async run() {
              throw new TypeError('erro inesperado fora de qualquer asserção')
            },
          },
        ],
      }),
    )
    expect(code).toBe(1)
  })

  it('falha ao iniciar o navegador → código 1 e diagnóstico fatal', async () => {
    const logger = captureLogger()
    const code = await main(
      baseOptions({
        logger,
        browserFactory: async () => {
          throw new Error('não foi possível lançar o Chromium')
        },
        scenarios: [],
      }),
    )
    expect(code).toBe(1)
    expect(logger.getError()).toMatch(/ERRO FATAL/)
  })
})

// ────────── 5. resumo final ──────────

describe('resumo final', () => {
  it('mostra Done e retorna 0 só quando todos os cenários passam', async () => {
    const logger = captureLogger()
    const page = makePage()
    const browser = makeBrowser(page)
    let closed = false
    const code = await main(
      baseOptions({
        logger,
        browserFactory: async () => {
          const b = makeBrowser(page)
          b.close = async () => { closed = true }
          return b
        },
        scenarios: [
          { id: 12, name: 'ok 12', async run() {} },
          { id: 13, name: 'ok 13', async run() {} },
        ],
      }),
    )
    expect(code).toBe(0)
    expect(logger.getLog()).toContain('Done')
    expect(closed).toBe(true)
  })

  it('não mostra Done quando um cenário obrigatório falha', async () => {
    const logger = captureLogger()
    const page = makePage()
    page.goto = async () => {}
    const browser = makeBrowser(page)
    const code = await main(
      baseOptions({
        logger,
        browserFactory: async () => browser,
        scenarios: [
          { id: 12, name: 'ok 12', async run() {} },
          { id: 13, name: 'falha 13', async run() { throw new Error('falhou') } },
        ],
      }),
    )
    expect(code).toBe(1)
    expect(logger.getLog()).not.toContain('Done')
    expect(logger.getError()).toMatch(/13/)
  })

  it('credenciais ausentes → código 1 sem lançar o navegador', async () => {
    const launch = vi.fn()
    const code = await main(
      baseOptions({
        creds: { user: '', pass: '' },
        browserFactory: launch,
        scenarios: [],
      }),
    )
    expect(code).toBe(1)
    expect(launch).not.toHaveBeenCalled()
  })
})

// ────────── 6. encerramento do navegador ──────────

describe('encerramento do navegador', () => {
  it('fecha o navegador quando um cenário falha', async () => {
    let closed = false
    const page = makePage()
    page.goto = async () => {}
    const browser = makeBrowser(page)
    browser.close = async () => { closed = true }
    const code = await main(
      baseOptions({
        browserFactory: async () => browser,
        scenarios: [{ id: 12, name: 'falha', async run() { throw new Error('falhou') } }],
      }),
    )
    expect(code).toBe(1)
    expect(closed).toBe(true)
  })

  it('falha ao fechar o navegador não esconde o erro do cenário', async () => {
    const logger = captureLogger()
    const page = makePage()
    page.goto = async () => {}
    const browser = makeBrowser(page)
    browser.close = async () => {
      throw new Error('falha ao fechar o navegador')
    }
    const code = await main(
      baseOptions({
        logger,
        browserFactory: async () => browser,
        scenarios: [{ id: 12, name: 'falha', async run() { throw new Error('erro principal do cenário') } }],
      }),
    )
    expect(code).toBe(1)
    const errors = logger.getError()
    expect(errors).toContain('erro principal do cenário')
    expect(errors).toContain('Falha ao fechar o navegador')
  })
})

// ────────── 7. segurança do diagnóstico ──────────

describe('segurança do diagnóstico', () => {
  it('redige segredos conhecidos, tokens de query e JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abc123signature'
    const text = `senha=${creds.pass} url=/track?token=DEMO-ESPERA-2026 jwt=${jwt}`
    const out = redact(text, [creds.pass])
    expect(out).not.toContain(creds.pass)
    expect(out).not.toContain('DEMO-ESPERA-2026')
    expect(out).not.toContain(jwt)
    expect(out).toContain('[redacted]')
  })

  it('a mensagem de ScenarioError não expõe a senha nem o token', async () => {
    const page = makePage(`conteúdo vazado: ${creds.pass} e DEMO-INDEFERIDO-2026`, 'http://x/track?token=DEMO-INDEFERIDO-2026')
    const err = await expectText(page, {
      scenario: 18,
      route: '/chamados-publico/track?token=DEMO-INDEFERIDO-2026',
      pattern: 'CHAMADO INDEFERIDO',
      timeout: 60,
      secrets: [creds.pass, 'DEMO-INDEFERIDO-2026'],
    }).catch((e) => e)
    expect(err).toBeInstanceOf(ScenarioError)
    expect(err.message).not.toContain(creds.pass)
    expect(err.message).not.toContain('DEMO-INDEFERIDO-2026')
  })

  it('snippet é curto e sem segredos', () => {
    const out = snippet(`${'x'.repeat(500)} segredo=${creds.pass}`, [creds.pass], 40)
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out).not.toContain(creds.pass)
  })
})

beforeEach(() => {
})

describe('navegação robusta', () => {
  it('propaga falha de navigateToRoute', async () => {
    const page = {
      async evaluate() { throw new Error('Navigation failed for token') },
      async waitForTimeout() {},
      url() { return 'http://localhost:5173/' },
    }
    await expect(navigateToRoute(page, '/chamados/tickets/x')).rejects.toThrow(/Navigation failed/)
  })

  it('lança se a rota final diverge', async () => {
    const page = {
      async evaluate() {},
      async waitForTimeout() {},
      url() { return 'http://localhost:5173/chamados/tickets/outro' },
    }
    await expect(navigateToRoute(page, '/chamados/tickets/abc')).rejects.toThrow(/Naveg/)
  })

  it('aceita rota final coincidente', async () => {
    const page = {
      async evaluate() {},
      async waitForTimeout() {},
      url() { return 'http://localhost:5173/chamados/tickets/abc?x=1#top' },
    }
    await expect(navigateToRoute(page, '/chamados/tickets/abc?x=1#top')).resolves.toBeUndefined()
  })
})

describe('sanitização centralizada', () => {
  it('redact remove token, query e jwt', () => {
    const msg = 'API error https://x/y?token=DO-NOT-LEAK#anchor jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature123'
    const out = redact(msg, ['prod-secret'])
    expect(out).not.toContain('DO-NOT-LEAK')
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(out).toContain('[redacted]')
    expect(out).toContain('[jwt]')
  })
})
describe('captura atômica', () => {
  it('preserva captura anterior quando screenshot falha', async () => {
    const os = await import('node:os')
    const fs = await import('node:fs')
    const dir = os.tmpdir() + '/labhub-shot-fail-' + Math.random().toString(16).slice(2)
    fs.mkdirSync(dir, { recursive: true })
    const target = dir + '/12.png'
    fs.writeFileSync(target, Buffer.alloc(4096, 0x2a))
    const page = {
      async screenshot() { throw new Error('screenshot crashed') },
      async evaluate() { return { w: 1, h: 1 } },
    }
    await expect(secureScreenshot(page, target, { secrets: [] })).rejects.toThrow(/crashed/i)
    expect(fs.existsSync(target + '.tmp.png')).toBe(false)
    expect(fs.statSync(target).size).toBe(4096)
  })
})
describe('captura atômica extra', () => {
  it('rejeita captura inválida e remove tmp', async () => {
    const os = await import('node:os')
    const fs = await import('node:fs')
    const dir = os.tmpdir() + '/labhub-extra-' + Math.random().toString(16).slice(2)
    fs.mkdirSync(dir, { recursive: true })
    const target = dir + '/13.png'
    fs.writeFileSync(target, Buffer.alloc(4096, 0x2b))
    const page = {
      async screenshot({ path }) { fs.writeFileSync(path, Buffer.alloc(512, 0x2c)) },
      async evaluate() { return { w: 1, h: 1 } },
    }
    await expect(secureScreenshot(page, target, { secrets: [] })).rejects.toThrow(/vazia/i)
    expect(fs.existsSync(target + '.tmp.png')).toBe(false)
    expect(fs.statSync(target).size).toBe(4096)
  })
})
