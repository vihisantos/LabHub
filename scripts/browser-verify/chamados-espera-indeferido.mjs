/**
 * Captura e VALIDAÇÃO de screenshots do fluxo Em espera / Indeferimento (#369).
 *
 * Evidência visual das ações novas da issue #367 no módulo Chamados:
 *   - botões "Em espera" / "Indeferir" no detalhe operacional
 *   - modal de motivo obrigatório (Em espera / Indeferir)
 *   - estado em_espera (card violeta + "Retomar atendimento")
 *   - estado indeferido (card vermelho "CHAMADO INDEFERIDO")
 *   - acompanhamento público por código (em espera e indeferido)
 *   - página de resultado do indeferimento ao professor
 *
 * O script FALHA (exit code != 0) quando:
 *   - a autenticação não conclui;
 *   - uma rota interna não é de fato navegada;
 *   - o conteúdo esperado de um cenário não aparece no timeout;
 *   - uma captura não pode ser produzida.
 * O resumo de sucesso só é impresso quando TODOS os cenários obrigatórios passam.
 *
 * Depende do seed com os tickets #15 (em_espera) e #16 (indeferido):
 *   python scripts/seed_chamados_demo.py
 *
 * Uso:
 *   BASE_URL=http://localhost:5173 node scripts/browser-verify/chamados-espera-indeferido.mjs
 *
 * Credenciais (nunca versionadas): `.playwright-creds` (usuario;senha) ou
 * DEMO_USER / DEMO_PASS no ambiente.
 */
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ── Configuração ─────────────────────────────────────────────────────────────

export const DEFAULT_BASE = process.env.BASE_URL || 'http://localhost:5173'
export const DEFAULT_OUT = 'docs/chamados-demo/screenshots'

const MOBILE_W = 390
const MOBILE_H = 844

// IDs determinísticos do seed (uuid5 do workspace demo-chamados).
export const TICKET = {
  acoes: '3af0601a-a2b9-50ad-a256-f7ef8c8649b3', // #1  em_atendimento
  emEspera: '903d5efc-c535-54e6-936e-271e6b7fd10b', // #15 em_espera
  indeferido: '003ee222-031f-57e2-a42f-d330603b30eb', // #16 indeferido
}
export const TOKEN = {
  emEspera: 'DEMO-ESPERA-2026',
  indeferido: 'DEMO-INDEFERIDO-2026',
}

// Rótulos que o backend resolve a partir do reasonCode (issue #367).
export const ESPERA_REASON = 'Aguardando equipamento/peça'
export const INDEFERIDO_REASON = 'Solicitação não caracteriza incidente/requisição de TI'

/**
 * Lê as credenciais de demonstração. Nunca hardcoded.
 * Ordem: variáveis de ambiente DEMO_USER/DEMO_PASS > arquivo `.playwright-creds`.
 */
export function loadCredentials({ readFile = readFileSync, env = process.env } = {}) {
  let user = env.DEMO_USER || ''
  let pass = env.DEMO_PASS || ''
  try {
    const [u, p] = readFile('.playwright-creds', 'utf8').trim().split(';')
    user = user || (u || '').trim()
    pass = pass || (p || '').trim()
  } catch {
    /* arquivo ausente — segue com as variáveis de ambiente */
  }
  return { user, pass }
}

// ── Diagnóstico seguro ───────────────────────────────────────────────────────

/**
 * Remove segredos de um texto de diagnóstico: valores conhecidos (inclui a senha
 * de demonstração), tokens em query string e JWTs. Nada sensível vai para o log.
 */
export function redact(text, secrets = []) {
  if (text == null) return ''
  let out = String(text)
  for (const secret of secrets) {
    if (secret && String(secret).length >= 3) out = out.split(String(secret)).join('[redacted]')
  }
  // tokens/segredos em query string (?token=..., &access_token=...)
  out = out.replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s"'`]+/gi, '$1[redacted]')
  // JWTs (header.payload.signature)
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, '[jwt]')
  return out
}

/** Trecho curto e legível do conteúdo visível, sem segredos. */
export function snippet(text, secrets = [], limit = 240) {
  const clean = redact(text, secrets).replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean
}

/**
 * Captura de tela atômica: grava em `.tmp.png`, valida que o arquivo não está
 * vazio e só então renomeia para o destino final. Em caso de falha ou arquivo
 * vazio, remove o temporário e preserva qualquer captura anterior no destino.
 * `secrets` é mantido por compatibilidade de assinatura (não é gravado no
 * nome do arquivo).
 */
export async function secureScreenshot(page, target, { secrets = [], screenshotOptions = {} } = {}) {
  const tmp = `${target}.tmp.png`
  let tmpExists = false
  try {
    await page.screenshot({ path: tmp, ...screenshotOptions })
    tmpExists = true
    const size = statSync(tmp).size
    // Um screenshot legítimo tem vários KB; menos de 1 KB é tratado como vazio.
    if (size < 1024) {
      throw new Error(`captura ${target.split('/').pop()} inválida/vazia (${size} bytes)`)
    }
    renameSync(tmp, target)
    return statSync(target).size
  } catch (err) {
    if (tmpExists) {
      try { unlinkSync(tmp) } catch {}
    }
    throw err
  }
}

/** Erro de validação de um cenário, com diagnóstico acionável e sem segredos. */
export class ScenarioError extends Error {
  constructor({ scenario, route, expected, url, body, secrets = [] }) {
    const lines = [
      `[cenário ${scenario}] conteúdo esperado não encontrado: ${JSON.stringify(expected)}`,
      `  rota: ${redact(route, secrets)}`,
      `  url atual: ${redact(url, secrets) || '(desconhecida)'}`,
      `  conteúdo visível: ${snippet(body, secrets) || '(vazio)'}`,
    ]
    super(lines.join('\n'))
    this.name = 'ScenarioError'
    this.scenario = scenario
    this.route = route
    this.expected = expected
  }
}

async function safeBody(page) {
  try {
    return (await page.evaluate(() => document.body?.innerText || '')) || ''
  } catch {
    return ''
  }
}

// ── Verificações de conteúdo ─────────────────────────────────────────────────

/**
 * Aguarda (polling) que o padrão apareça no texto visível. Retorna `true`/`false`
 * — nunca lança. Quem chama decide se a ausência é falha obrigatória.
 * Implementação idêntica ao script original (sem safeBody wrapper).
 */
export async function waitForText(page, pattern, { timeout = 30000 } = {}) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const text = await page.evaluate(() => document.body?.innerText || '')
    if (re.test(text)) return true
    await page.waitForTimeout(400)
  }
  return false
}

/**
 * Verificação OBRIGATÓRIA: lança `ScenarioError` (com cenário, rota, padrão, URL
 * e trecho do conteúdo) se o texto não aparecer. Timeout nunca é reduzido por
 * aqui — o chamador escolhe o teto.
 */
export async function expectText(page, { scenario, route, pattern, label, timeout = 30000, secrets = [] } = {}) {
  if (await waitForText(page, pattern, { timeout })) return
  const body = await page.evaluate(() => document.body?.innerText || '')
  throw new ScenarioError({
    scenario,
    route,
    expected: label || (pattern instanceof RegExp ? pattern.source : pattern),
    url: page.url ? page.url() : '',
    body,
    secrets,
  })
}

/** Executa uma verificação obrigatória por padrão, na ordem, parando na 1ª falha. */
export async function expectAll(page, checks, secrets = []) {
  for (const check of checks) {
    await expectText(page, { ...check, secrets })
  }
}

/**
 * Roda a lista de cenários em sequência. Uma falha em um cenário **interrompe
 * aquele cenário** (as etapas seguintes não rodam) e é registrada; o processo
 * continua para reportar todos os problemas. Nenhuma exceção é engolida — todas
 * viram `status: 'failed'` no resultado.
 */
export async function runScenarioList(scenarios, runtime, log = console) {
  const results = []
  const secrets = runtime?.config?.secrets ?? []
  for (const scenario of scenarios) {
    log.log(`[cenário ${scenario.id}] ${scenario.name}`)
    try {
      await scenario.run(runtime)
      results.push({ id: scenario.id, name: scenario.name, status: 'passed' })
      log.log(`  ✓ cenário ${scenario.id} OK`)
    } catch (err) {
      results.push({ id: scenario.id, name: scenario.name, status: 'failed', error: err })
      logScenarioError(log, err, secrets, scenario.id, scenario.name)
    }
  }
  return results
}

function indent(text, prefix = '    ') {
  return String(text || '')
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

/**
 * Sanitiza uma exceção antes de qualquer registro em log: aplica `redact()`
 * na mensagem e no stack para nunca vazar tokens, credenciais ou URLs com
 * parâmetros sensíveis (ex.: ?token=...) nos diagnósticos.
 */
function sanitizeError(err, secrets = []) {
  const message = err ? String(err.message || err || '') : ''
  const stack = err && err.stack ? String(err.stack) : ''
  return {
    message: redact(message, secrets),
    stack: redact(stack, secrets),
  }
}

/**
 * Registra uma falha de cenário com a mensagem e o stack sanitizados.
 * Preserva o identificador e o nome do cenário no diagnóstico.
 */
function logScenarioError(log, err, secrets, scenarioId, scenarioName) {
  const { message, stack } = sanitizeError(err, secrets)
  const nome = scenarioName ? ` - ${scenarioName}` : ''
  log.error(`  ✗ cenário ${scenarioId}${nome} FALHOU\n${indent(message, '    ')}`)
  if (stack) {
    log.error(`    ${indent(stack, '      ')}`)
  }
}

// ── Funções utilitárias do script original (mantidas idênticas) ──────────────

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
}

async function dismissTour(page) {
  const skipBtn = page.locator('button:has-text("Pular")')
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click()
    await page.waitForTimeout(1000)
  }
}

async function closeOverlays(page) {
  const cancel = page.locator('button:has-text("Cancelar")').first()
  if (await cancel.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cancel.click().catch(() => {})
    await page.waitForTimeout(500)
  }
}

export async function navigateToRoute(page, route) {
  await page.evaluate((r) => {
    window.history.pushState({}, '', r)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
  await page.waitForTimeout(2000)
  const current = page.url ? page.url() : ''
  if (!current.includes(route)) {
    throw new Error(`Navegação para ${route} não corresponde à URL atual: ${current}`)
  }
}

async function clickButton(page, name, { timeout = 15000 } = {}) {
  const btn = page.locator('button').filter({ hasText: name }).first()
  await btn.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
  await btn.click({ timeout })
}

// ── Criação do runtime ──────────────────────────────────────────────────────

export function createRuntime({ browser, config, log = console }) {
  const { baseUrl, outDir, secrets, creds } = config
  let internal = null
  const tempContexts = []

  async function ensureInternal() {
    if (internal) return internal
    const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
    const page = await ctx.newPage()
    tempContexts.push(ctx)

    log.log('  [internal] Login...')
    await goto(page, `${baseUrl}/login`)
    await page.locator('input').nth(0).fill(creds.user)
    await page.locator('input').nth(1).fill(creds.pass)
    await page.locator('button[type="submit"]').click()

    // Aguarda um estado observável pós-login (gate de workspace OU shell do app).
    const loggedIn = await waitForText(page, 'Escolha seu workspace|Início|Dashboard|Meus Chamados', {
      timeout: 30000,
    })
    if (!loggedIn) {
      throw new ScenarioError({
        scenario: 'auth',
        route: '/login',
        expected: 'aplicativo autenticado (gate de workspace ou shell do app)',
        url: page.url(),
        body: await safeBody(page),
        secrets,
      })
    }

    // Super admin passa pelo WorkspaceGate a cada sessão → seleciona com
    // "Manter preferência" para que navegações seguintes auto-entrem.
    if (await page.locator('text=Escolha seu workspace').isVisible({ timeout: 3000 }).catch(() => false)) {
      log.log('  [internal] WorkspaceGate → selecionando demo-chamados (com preferência)...')
      const persist = page.locator('button:has-text("Manter preferência")')
      if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
      const card = page.locator('button, [role="button"]', { hasText: /Campus Demo|campus demo|demo-chamados/ }).first()
      await card.click({ timeout: 15000 })
      if (!(await waitForText(page, 'Início|Dashboard|Meus Chamados|Chamados', { timeout: 20000 }))) {
        throw new ScenarioError({
          scenario: 'gate',
          route: '/',
          expected: 'shell do app após selecionar o workspace',
          url: page.url(),
          body: await safeBody(page),
          secrets,
        })
      }
    }

    // Garante preferência persistida mesmo sem o gate. O id do usuário é
    // derivado da própria sessão (auth token do Supabase) — não é hardcoded.
    await page.evaluate(() => {
      let uid = ''
      try {
        const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        const obj = JSON.parse(localStorage.getItem(sbKey) || '{}')
        uid = obj?.user?.id || ''
        if (!uid) {
          const tok = obj?.access_token || obj?.current_session?.access_token || ''
          if (tok) {
            const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
            uid = payload.sub || ''
          }
        }
      } catch {}
      if (uid && !localStorage.getItem(`labhub_workspace_preference_${uid}`)) {
        try {
          const ws = JSON.parse(localStorage.getItem('labhub_workspaces_cache') || '[]')
          const found = ws.find((w) => w.slug === 'demo-chamados') || ws[0]
          if (found) localStorage.setItem(`labhub_workspace_preference_${uid}`, found.id)
        } catch {}
      }
    })

    await dismissTour(page)
    internal = { ctx, page }
    return internal
  }

  async function openInternal(route) {
    const { page } = await ensureInternal()
    await closeOverlays(page)
    await navigateToRoute(page, route)
    await page.waitForTimeout(2500)
    await dismissTour(page)
    return { page }
  }

  async function openPublic(route, { scenario, pattern }) {
    const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
    tempContexts.push(ctx)
    const page = await ctx.newPage()
    const token = new URLSearchParams(route.split('?')[1] || '').get('token') || ''
    let lastBody = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      await goto(page, `${baseUrl}${route}`)
      if (await waitForText(page, pattern, { timeout: 15000 })) return { ctx, page }
      // Fallback: o deep link ?token= é consumido por um `replaceState` no
      // initializer do TrackPage; em carga fria (chunk lazy + StrictMode) o token
      // pode não ser lido e a página fica vazia. Reproduz o fluxo real do
      // professor: digitar o código de acompanhamento e buscar.
      if (token) {
        const input = page.locator('input[placeholder="Código de acompanhamento"]')
        if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
          await input.fill(token)
          await page.locator('button:has-text("Buscar")').click()
          if (await waitForText(page, pattern, { timeout: 15000 })) return { ctx, page }
        }
      }
      lastBody = await safeBody(page)
      log.log(`  [${redact(route, secrets)}] tentativa ${attempt} sem o conteúdo esperado`)
      await page.waitForTimeout(1500)
    }
    throw new ScenarioError({ scenario, route, expected: pattern, url: page.url(), body: lastBody, secrets })
  }

  async function clickButton(page, name, { timeout = 15000 } = {}) {
    const btn = page.locator('button').filter({ hasText: name }).first()
    await btn.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
    await btn.click({ timeout })
  }

  /**
   * Captura de tela atômica (usa secureScreenshot): grava em .tmp.png, valida
   * o arquivo e só então renomeia para o destino final, preservando a captura
   * anterior em caso de falha. Mantém fullPage: true do script original.
   */
  async function shot(page, name) {
    const path = `${outDir}/${name}.png`
    await secureScreenshot(page, path, { secrets: config.secrets, screenshotOptions: { fullPage: true } })
    const size = statSync(path).size
    const dims = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }))
    log.log(`  [OK] ${name}.png (${(size / 1024).toFixed(1)}KB, ${dims.w}x${dims.h})`)
  }

  async function cleanup() {
    for (const ctx of tempContexts) {
      try {
        await ctx.close()
      } catch {}
    }
    tempContexts.length = 0
    internal = null
  }

  return {
    browser,
    config,
    log,
    ensureInternal,
    openInternal,
    openPublic,
    navigateToRoute,
    clickButton,
    shot,
    cleanup,
    expect: (page, opts) => expectText(page, { ...opts, secrets }),
    expectAll: (page, checks) => expectAll(page, checks, secrets),
  }
}

// ── Execução direta dos cenários (estrutura idêntica ao script original) ─────

async function runAllScenarios(rt, log = console) {
  const results = { passed: 0, failed: 0, failedIds: [] }

  // 12
  log.log('[12] Ações "Em espera" e "Indeferir" no detalhe operacional')
  try {
    const route = `/chamados/tickets/${TICKET.acoes}`
    const { page } = await rt.openInternal(route)
    await rt.expect(page, { scenario: 12, route, pattern: 'Em espera', label: 'botão "Em espera"' })
    await rt.expect(page, { scenario: 12, route, pattern: /Indeferir/, label: 'botão "Indeferir"' })
    await rt.shot(page, '12-em-espera-acoes')
    results.passed++
    log.log('  ✓ cenário 12 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(12)
    logScenarioError(log, err, rt.config.secrets, 12)
  }

  // 13
  log.log('[13] Modal "Colocar em espera" (motivo obrigatório)')
  try {
    const route = `/chamados/tickets/${TICKET.acoes}`
    const { page } = await rt.openInternal(route)
    await rt.expect(page, { scenario: 13, route, pattern: 'Em espera', label: 'botão "Em espera"' })
    await rt.clickButton(page, /^Em espera$/)
    await rt.expectAll(page, [
      { scenario: 13, route, pattern: 'Colocar em espera', label: 'título do modal' },
      { scenario: 13, route, pattern: 'Motivo', label: 'rótulo "Motivo" obrigatório' },
      { scenario: 13, route, pattern: ESPERA_REASON, label: `opção de motivo "${ESPERA_REASON}"` },
    ])
    await rt.shot(page, '13-modal-colocar-em-espera')
    results.passed++
    log.log('  ✓ cenário 13 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(13)
    logScenarioError(log, err, rt.config.secrets, 13)
  }

  // 14
  log.log('[14] Modal "Indeferir chamado" (motivo obrigatório)')
  try {
    const route = `/chamados/tickets/${TICKET.acoes}`
    const { page } = await rt.openInternal(route)
    await rt.expect(page, { scenario: 14, route, pattern: /Indeferir/, label: 'botão "Indeferir"' })
    await rt.clickButton(page, /^Indeferir$/)
    await rt.expectAll(page, [
      { scenario: 14, route, pattern: 'Indeferir chamado', label: 'título do modal' },
      { scenario: 14, route, pattern: 'Motivo', label: 'rótulo "Motivo" obrigatório' },
      { scenario: 14, route, pattern: INDEFERIDO_REASON, label: `opção de motivo "${INDEFERIDO_REASON}"` },
    ])
    await rt.shot(page, '14-modal-indeferir')
    results.passed++
    log.log('  ✓ cenário 14 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(14)
    logScenarioError(log, err, rt.config.secrets, 14)
  }

  // 15
  log.log('[15] Chamado em espera com opção de retomada')
  try {
    const route = `/chamados/tickets/${TICKET.emEspera}`
    const { page } = await rt.openInternal(route)
    await rt.expectAll(page, [
      { scenario: 15, route, pattern: /Em espera/, label: 'estado "Em espera"' },
      { scenario: 15, route, pattern: ESPERA_REASON, label: `motivo "${ESPERA_REASON}"` },
      { scenario: 15, route, pattern: 'Retomar atendimento', label: 'botão "Retomar atendimento"' },
    ])
    await rt.shot(page, '15-chamado-em-espera')
    results.passed++
    log.log('  ✓ cenário 15 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(15)
    logScenarioError(log, err, rt.config.secrets, 15)
  }

  // 16
  log.log('[16] Chamado indeferido')
  try {
    const route = `/chamados/tickets/${TICKET.indeferido}`
    const { page } = await rt.openInternal(route)
    await rt.expectAll(page, [
      { scenario: 16, route, pattern: 'CHAMADO INDEFERIDO', label: 'rótulo "CHAMADO INDEFERIDO"' },
      { scenario: 16, route, pattern: INDEFERIDO_REASON, label: `motivo "${INDEFERIDO_REASON}"` },
    ])
    await rt.shot(page, '16-chamado-indeferido')
    results.passed++
    log.log('  ✓ cenário 16 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(16)
    logScenarioError(log, err, rt.config.secrets, 16)
  }

  // 17
  log.log('[17] Acompanhamento público — em espera')
  try {
    const route = `/chamados-publico/track?token=${encodeURIComponent(TOKEN.emEspera)}`
    const { ctx, page } = await rt.openPublic(route, { scenario: 17, pattern: ESPERA_REASON })
    await rt.expectAll(page, [
      { scenario: 17, route, pattern: /Em espera/, label: 'estado "Em espera"' },
      { scenario: 17, route, pattern: ESPERA_REASON, label: `motivo "${ESPERA_REASON}"` },
    ])
    await rt.shot(page, '17-acompanhar-em-espera')
    await ctx.close()
    results.passed++
    log.log('  ✓ cenário 17 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(17)
    logScenarioError(log, err, rt.config.secrets, 17)
  }

  // 18
  log.log('[18] Acompanhamento público — indeferido')
  try {
    const route = `/chamados-publico/track?token=${encodeURIComponent(TOKEN.indeferido)}`
    const { ctx, page } = await rt.openPublic(route, { scenario: 18, pattern: 'CHAMADO INDEFERIDO' })
    await rt.expectAll(page, [
      { scenario: 18, route, pattern: 'CHAMADO INDEFERIDO', label: 'rótulo "CHAMADO INDEFERIDO"' },
      { scenario: 18, route, pattern: INDEFERIDO_REASON, label: `motivo "${INDEFERIDO_REASON}"` },
    ])
    await rt.shot(page, '18-acompanhar-indeferido')
    await ctx.close()
    results.passed++
    log.log('  ✓ cenário 18 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(18)
    logScenarioError(log, err, rt.config.secrets, 18)
  }

  // 19
  log.log('[19] Resultado público do indeferimento')
  try {
    const route = `/chamados-publico/success/${TICKET.indeferido}?token=${encodeURIComponent(TOKEN.indeferido)}`
    const { ctx, page } = await rt.openPublic(route, { scenario: 19, pattern: 'CHAMADO INDEFERIDO' })
    await rt.expectAll(page, [
      { scenario: 19, route, pattern: 'CHAMADO INDEFERIDO', label: 'rótulo "CHAMADO INDEFERIDO"' },
      { scenario: 19, route, pattern: INDEFERIDO_REASON, label: `motivo "${INDEFERIDO_REASON}"` },
    ])
    await rt.shot(page, '19-resultado-indeferido')
    await ctx.close()
    results.passed++
    log.log('  ✓ cenário 19 OK')
  } catch (err) {
    results.failed++
    results.failedIds.push(19)
    logScenarioError(log, err, rt.config.secrets, 19)
  }

  return results
}

// ── Entrada principal ────────────────────────────────────────────────────────

async function defaultBrowserFactory() {
  const { chromium } = await import('@playwright/test')
  return chromium.launch({ channel: 'chrome', headless: true })
}

/**
 * Executa a automação e devolve o código de saída (0 = tudo passou, 1 = falha).
 * O navegador é sempre fechado, com sucesso ou falha; uma falha ao fechar não
 * esconde o erro original.
 */
export async function main(options = {}) {
  const log = options.logger || console
  const creds = options.creds || loadCredentials()
  const config = {
    baseUrl: options.baseUrl || DEFAULT_BASE,
    outDir: options.outDir || DEFAULT_OUT,
    creds,
    secrets: [],
  }
  config.secrets = [creds.pass, TOKEN.emEspera, TOKEN.indeferido, ...(options.secrets || [])].filter(Boolean)

  if (!creds.user || !creds.pass) {
    log.error(
      'Credenciais ausentes: crie .playwright-creds (usuario;senha) ou defina DEMO_USER/DEMO_PASS no ambiente.',
    )
    return 1
  }

  mkdirSync(config.outDir, { recursive: true })

  const browserFactory = options.browserFactory || defaultBrowserFactory

  log.log('=== Chamados — Em espera / Indeferimento (screenshots) ===')
  log.log(`BASE: ${config.baseUrl} | Viewport: ${MOBILE_W}x${MOBILE_H}\n`)

  let browser = null
  let runtime = null
  let results = null
  let fatal = null
  try {
    browser = await browserFactory()
    runtime = createRuntime({ browser, config, log })
    if (Array.isArray(options.scenarios)) {
      const r = await runScenarioList(options.scenarios, runtime, log)
      results = {
        passed: r.filter((x) => x.status === 'passed').length,
        failed: r.filter((x) => x.status === 'failed').length,
        failedIds: r.filter((x) => x.status === 'failed').map((x) => x.id),
      }
    } else {
      results = await runAllScenarios(runtime, log)
    }
  } catch (err) {
    fatal = err
  } finally {
    if (runtime) {
      try {
        await runtime.cleanup()
      } catch (err) {
        log.error(`Falha ao fechar contextos: ${redact(err?.message || String(err), config.secrets)}`)
      }
    }
    if (browser) {
      try {
        await browser.close()
      } catch (err) {
        log.error(`Falha ao fechar o navegador: ${redact(err?.message || String(err), config.secrets)}`)
        if (!fatal) fatal = err
      }
    }
  }

  if (fatal) {
    log.error(`\nERRO FATAL: ${redact(fatal?.message || String(fatal), config.secrets)}`)
    if (fatal.stack) log.error(redact(fatal.stack, config.secrets))
    return 1
  }

  if (results.failed > 0) {
    log.error(`\nFALHA: ${results.failed} de ${results.passed + results.failed} cenários falharam → ${results.failedIds.join(', ')}`)
    return 1
  }

  log.log(`\n=== Done! Todos os ${results.passed} cenários passaram. ===`)
  return 0
}

const isDirectRun = (() => {
  if (process.env.VITEST) return false
  try {
    const entry = process.argv[1]
    return Boolean(entry) && import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
})()

if (isDirectRun) {
  const code = await main()
  process.exit(code)
}
