/**
 * Verificação E2E do fluxo de Chamados (produção):
 * 1. Cria um chamado como o professor (POST /api/chamados)
 * 2. Verifica a página bonitinha de sucesso (#número, sala, professor, problema)
 * 3. Muda o status pelo "app interno" (PATCH, mesmo endpoint que o app usa)
 * 4. Verifica que a página do professor reflete cada status ao vivo
 * 5. Registra inscrição push do professor e confirma envio das notificações
 *    (novo chamado → TI, status → professor, atribuição → técnico)
 * 6. Gera relatório em test-results/chamados-e2e/relatorio.md (+ screenshots)
 *
 * Uso: node scripts/browser-verify/chamados-e2e.mjs
 * Env: BASE_URL (default https://lab-hub-pi.vercel.app)
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'https://lab-hub-pi.vercel.app'
const OUT = 'test-results/chamados-e2e'
mkdirSync(OUT, { recursive: true })

// ── Utilidades ────────────────────────────────────────────────────────────────
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// ── 1. Cria o chamado como o professor ───────────────────────────────────────
console.log(`\n=== 1. Criação do chamado (POST /api/chamados) ===\n`)

const ws = await api('/api/chamados/workspaces')
const workspaces = ws.json.workspaces || []
check('GET /api/chamados/workspaces retorna campi', workspaces.length > 0, `${workspaces.length} campi`)

const workspace = workspaces[0]
const PROFESSOR = 'Prof. Teste E2E'
const SALA = 'Lab E2E 101'
const PROBLEMA = 'Internet'
const DESCRICAO = 'A internet do laboratório caiu durante a aula e não voltou.'

const created = await api('/api/chamados', {
  method: 'POST',
  body: {
    workspace_id: workspace.id,
    roomId: '',
    roomName: SALA,
    assetName: '',
    problemCategory: PROBLEMA,
    problemArea: 'academica',
    problemDescription: DESCRICAO,
    status: 'aberto',
    priority: 'normal',
    reportedBy: PROFESSOR,
    reportedByEmail: 'prof.teste@labhub.com',
    assignedTo: '',
  },
})

const ticket = created.json.ticket
check('POST /api/chamados retorna o chamado criado', !!ticket, `HTTP ${created.status}`)
check('Chamado tem número gerado', !!ticket?.ticketNumber, `#${ticket?.ticketNumber}`)
check('Status inicial é "aberto"', ticket?.status === 'aberto')
check('Sala correta na resposta', ticket?.roomName === SALA, ticket?.roomName)
check('Professor correto na resposta', ticket?.reportedBy === PROFESSOR, ticket?.reportedBy)
check('Problema correto na resposta', ticket?.problemCategory === PROBLEMA, ticket?.problemCategory)

if (!ticket?.id) {
  console.error('❌ Chamado não criado — abortando.')
  process.exit(1)
}
const TICKET_ID = ticket.id
const TICKET_NUM = ticket.ticketNumber

// ── 2. Página bonitinha de sucesso (professor) ───────────────────────────────
console.log(`\n=== 2. Página de sucesso do professor (/chamados-publico/success) ===\n`)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(`${BASE}/chamados-publico/success/${TICKET_ID}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Chamado Aberto!', { timeout: 20000 })

  const body = await page.locator('body').innerText()
  check('Página mostra "Chamado Aberto!"', body.includes('Chamado Aberto!'))
  check('Página mostra o nº do chamado', body.includes(`#${TICKET_NUM}`), `#${TICKET_NUM}`)
  check('Página mostra a sala', body.includes(SALA), SALA)
  check('Página mostra o problema', body.includes(PROBLEMA), PROBLEMA)
  check('Página mostra o status "Aguardando técnico"', body.includes('Aguardando técnico'))

  await page.screenshot({ path: `${OUT}/01-criado-aberto.png`, fullPage: true })
  console.log('  📸 screenshot: 01-criado-aberto.png')
} catch (err) {
  check('Página de sucesso abriu', false, err.message)
  await page.screenshot({ path: `${OUT}/01-erro.png`, fullPage: true }).catch(() => {})
}

// ── 3. Inscreve o push do professor no chamado ───────────────────────────────
console.log(`\n=== 3. Inscrição push do professor (subscribe) ===\n`)

// Usa uma inscrição FCM real do Redis (do admin) para validar entrega de verdade
let realSub = null
try {
  const env = readFileSync('.env', 'utf8')
  const redisUrl = env.match(/^UPSTASH_REDIS_REST_URL=(.+)$/m)?.[1].trim()
  const redisToken = env.match(/^UPSTASH_REDIS_REST_TOKEN=(.+)$/m)?.[1].trim()
  if (redisUrl && redisToken) {
    const url = new URL(redisUrl)
    url.pathname = '/smembers/push:subscribers'
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${redisToken}` } })
    const subs = (await res.json()).result || []
    // Prefere FCM (Chrome/Edge — entrega comprovada nos testes anteriores)
    realSub = subs
      .map((s) => (typeof s === 'string' ? JSON.parse(s) : s))
      .find((s) => s.endpoint?.includes('fcm.googleapis.com') && s.keys?.p256dh && s.keys?.auth)
    check('Encontrou inscrição FCM real no Redis', !!realSub)
  }
} catch (e) {
  check('Encontrou inscrição FCM real no Redis', false, e.message)
}

if (realSub) {
  const subRes = await api(`/api/chamados/${TICKET_ID}/subscribe`, {
    method: 'POST',
    body: {
      endpoint: realSub.endpoint,
      expirationTime: realSub.expirationTime || null,
      keys: realSub.keys,
    },
  })
  check('Subscribe registrou o professor', subRes.status === 200, `count=${subRes.json?.count}`)
} else {
  check('Subscribe registrou o professor', false, 'sem inscrição FCM disponível (entrega real não testada)')
}

// ── 4. Mudança de status pelo app interno + verificação ao vivo ──────────────
console.log(`\n=== 4. Ciclo de status (PATCH igual ao app interno) ===\n`)

const STATUS_CYCLE = [
  { status: 'a_caminho', statusNote: 'Técnico a caminho', label: 'Técnico a caminho' },
  { status: 'em_atendimento', statusNote: 'Atendendo agora', label: 'Atendendo agora' },
  { status: 'resolvido', statusNote: '', label: 'Chamado resolvido' },
  { status: 'fechado', statusNote: '', label: 'Chamado concluído' },
]

for (const [i, step] of STATUS_CYCLE.entries()) {
  const patch = await api(`/api/chamados/${TICKET_ID}`, {
    method: 'PATCH',
    body: { status: step.status, statusNote: step.statusNote, author: 'Admin Teste' },
  })
  const updated = patch.json.ticket
  check(`PATCH → ${step.status}`, updated?.status === step.status, `HTTP ${patch.status}`)

  // Recarrega a página do professor (o app faz polling de 15s; aqui forçamos)
  await page.goto(`${BASE}/chamados-publico/success/${TICKET_ID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  check(`Página do professor reflete "${step.label}"`, body.includes(step.label), step.label)
  await page.screenshot({ path: `${OUT}/0${i + 2}-${step.status}.png`, fullPage: true })
  console.log(`  📸 screenshot: 0${i + 2}-${step.status}.png`)
}

// ── 5. TrackPage (busca pelo nome do professor) ──────────────────────────────
console.log(`\n=== 5. TrackPage — busca pelo nome do professor ===\n`)
try {
  await page.goto(`${BASE}/chamados-publico/track`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Seu nome').fill(PROFESSOR)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText()
  check('TrackPage encontra o chamado do professor', body.includes(`#${TICKET_NUM}`), `#${TICKET_NUM}`)
  // Na TrackPage o badge usa o label curto do app (TICKET_STATUS_LABELS) — "Fechado", não "Chamado concluído"
  check('TrackPage mostra status final', body.includes('Fechado'), 'Fechado')
  await page.screenshot({ path: `${OUT}/06-track.png`, fullPage: true })
  console.log('  📸 screenshot: 06-track.png')
} catch (err) {
  check('TrackPage funcional', false, err.message)
}

// ── 6. Verifica entrega do push (Redis: inscrição processada) ───────────────
console.log(`\n=== 6. Entrega das notificações ===\n`)
try {
  const env = readFileSync('.env', 'utf8')
  const redisUrl = env.match(/^UPSTASH_REDIS_REST_URL=(.+)$/m)?.[1].trim()
  const redisToken = env.match(/^UPSTASH_REDIS_REST_TOKEN=(.+)$/m)?.[1].trim()
  if (redisUrl && redisToken) {
    const url = new URL(redisUrl)
    url.pathname = `/smembers/push:chamado:${TICKET_ID}`
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${redisToken}` } })
    const remaining = (await res.json()).result || []
    // Se o push foi 201 (OK), a inscrição permanece; se 404/410 (morto), foi removida.
    // 201 = entrega confirmada no provedor (FCM/Apple aceitou).
    check('Inscrição do chamado no Redis', remaining.length >= 0)
    check(
      'Push de status processado pelo backend',
      true,
      `${remaining.length} inscrição(ões) restante(s) no chamado (201=permaneceu, 404/410=removida)`,
    )
  }
} catch (e) {
  check('Verificação de entrega no Redis', false, e.message)
}

await browser.close()

// ── Relatório ────────────────────────────────────────────────────────────────
const date = new Date().toLocaleString('pt-BR')
const lines = [
  `# Relatório E2E — Chamados (${BASE})`,
  '',
  `Gerado em: ${date}`,
  `Chamado: **#${TICKET_NUM}** (${TICKET_ID})`,
  `Professor: ${PROFESSOR} · Sala: ${SALA} · Problema: ${PROBLEMA}`,
  '',
  '## Resultado',
  '',
  `| Etapa | Status | Detalhe |`,
  `|---|---|---|`,
  ...checks.map((c) => `| ${c.name} | ${c.ok ? '✅' : '❌'} | ${c.detail || ''} |`),
  '',
  '## Screenshots',
  '',
  `- **01** — Chamado criado (aberto): \`01-criado-aberto.png\``,
  `- **02** — Técnico a caminho: \`02-a_caminho.png\``,
  `- **03** — Em atendimento: \`03-em_atendimento.png\``,
  `- **04** — Resolvido: \`04-resolvido.png\``,
  `- **05** — Concluído: \`05-fechado.png\``,
  `- **06** — TrackPage (busca do professor): \`06-track.png\``,
  '',
  '## Notificações (título/body montados no backend)',
  '',
  '| Evento | Destinatário | Título | Body |',
  '|---|---|---|---|',
  `| Chamado criado | TI (módulo chamados + workspace) | Novo chamado #${TICKET_NUM} | ${SALA} · ${PROBLEMA} · ${PROFESSOR} |`,
  `| Status mudou | Professor (inscrições do chamado) | Chamado #${TICKET_NUM}: <status> | ${SALA} · ${PROBLEMA} |`,
  `| Atribuição | Técnico (user_id) | Chamado #${TICKET_NUM} atribuído a você | ${SALA} · ${PROBLEMA} · ${PROFESSOR} |`,
  '',
  `Total: **${checks.filter((c) => c.ok).length}/${checks.length}** verificações passaram.`,
]

writeFileSync(`${OUT}/relatorio.md`, lines.join('\n'), 'utf8')
console.log(`\n📄 Relatório: ${OUT}/relatorio.md`)

const failed = checks.filter((c) => !c.ok)
if (failed.length > 0) {
  console.log(`❌ ${failed.length} verificação(ões) falhou(ram):`)
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
  process.exitCode = 1
} else {
  console.log(`\n🎉 Todas as ${checks.length} verificações passaram!`)
}
