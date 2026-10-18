// Testes das invariantes de segurança do workflow manual de E2E
// (.github/workflows/e2e-manual.yml). Rodam na suíte vitest normal (check
// "Test" do CI) — sem rede, sem navegador, apenas análise do YAML em texto.
//
// Garante que o workflow:
//   - continua restrito a workflow_dispatch (nunca check obrigatório de PR/push);
//   - usa o environment dedicado e SOMENTE secrets com prefixo E2E_DEMO_
//     (nenhum secret de nível de repositório/produção é referenciado);
//   - tem allowlist de refs de projeto Supabase definida em código;
//   - executa o preflight fail-closed ANTES do seed;
//   - só faz seed (escrita) no modo local (base_url vazio);
//   - instala o navegador explicitamente;
//   - não usa continue-on-error nem ignora códigos de saída.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// O ambiente jsdom do vitest não garante import.meta.url file:// — resolvemos
// o caminho subindo diretórios a partir do cwd (root do projeto).
function findWorkflowPath() {
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.github', 'workflows', 'e2e-manual.yml')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`e2e-manual.yml não encontrado a partir de ${process.cwd()}`)
}

const workflowPath = findWorkflowPath()
const yaml = readFileSync(workflowPath, 'utf8')
const lines = yaml.split('\n')

/** Índice (0-based) da linha que define o step cujo nome contém `namePart`. */
function stepIndex(namePart) {
  const idx = lines.findIndex((line) => line.includes('- name:') && line.includes(namePart))
  expect(idx, `step "${namePart}" deve existir no workflow`).toBeGreaterThanOrEqual(0)
  return idx
}

/** Verdadeiro se o step em `idx` tem um `if:` que exige base_url vazio (modo local). */
function stepIsLocalOnly(idx) {
  for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i++) {
    if (lines[i].includes('- name:')) break
    if (lines[i].includes('if:') && lines[i].includes("inputs.base_url == ''")) return true
  }
  return false
}

describe('segurança do workflow E2E manual', () => {
  it('dispara APENAS por workflow_dispatch (nunca check obrigatório de PR/push)', () => {
    expect(yaml).toMatch(/^on:\s*$/m)
    expect(yaml).toMatch(/workflow_dispatch:/)
    expect(yaml).not.toMatch(/^\s*pull_request:\s*$/m)
    expect(yaml).not.toMatch(/^\s*push:\s*$/m)
    expect(yaml).not.toContain('pull_request_target')
  })

  it('usa o GitHub Environment dedicado e2e-demo', () => {
    expect(yaml).toMatch(/^(\s*)environment:\s*e2e-demo\s*$/m)
  })

  it('referencia SOMENTE secrets do environment demo (prefixo E2E_DEMO_)', () => {
    const secrets = [...yaml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
    expect(secrets.length, 'workflow deve referenciar secrets E2E_DEMO_*').toBeGreaterThan(0)
    for (const name of secrets) {
      expect(name.startsWith('E2E_DEMO_'), `secret inesperado: ${name}`).toBe(true)
    }
    // Nenhum secret de nível de repositório (produção) pode ser referenciado.
    for (const forbidden of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      expect(yaml).not.toContain(`secrets.${forbidden}`)
    }
  })

  it('define allowlist de refs autorizados em código (mudança exige PR)', () => {
    const match = yaml.match(/E2E_DEMO_ALLOWED_PROJECT_REFS:\s*'([a-z0-9-]+)'/)
    expect(match, 'allowlist deve estar fixada no arquivo').not.toBeNull()
    expect(match[1].length).toBeGreaterThanOrEqual(3)
  })

  it('preflight fail-closed roda ANTES do seed e do E2E', () => {
    const preflight = stepIndex('Preflight')
    const seed = stepIndex('Seed do ambiente demo')
    const e2e = stepIndex('Executar E2E real')
    expect(preflight).toBeLessThan(seed)
    expect(preflight).toBeLessThan(e2e)
    // O preflight invoca o validador com o modo e a allowlist.
    const preflightText = lines.slice(preflight, seed).join('\n')
    expect(preflightText).toContain('verify_demo_target.py')
    expect(preflightText).toContain('--allowed-refs')
  })

  it('seed (escrita) só acontece no modo local (base_url vazio)', () => {
    const seed = stepIndex('Seed do ambiente demo')
    expect(stepIsLocalOnly(seed), 'seed deve ter if: inputs.base_url == \'\'').toBe(true)
    // Flask e Vite também são exclusivos do modo local.
    expect(stepIsLocalOnly(stepIndex('Subir API Flask'))).toBe(true)
    expect(stepIsLocalOnly(stepIndex('Subir frontend Vite'))).toBe(true)
  })

  it('instala o navegador de forma explícita e determinística', () => {
    const chrome = stepIndex('Instalar Chrome')
    expect(lines[chrome + 1]).toContain('npx playwright install')
  })

  it('não usa continue-on-error (falhas nunca são escondidas)', () => {
    expect(yaml).not.toContain('continue-on-error')
  })

  it('declara permissões mínimas (contents: read)', () => {
    expect(yaml).toMatch(/^(\s*)permissions:\s*$/m)
    expect(yaml).toMatch(/^(\s*)contents:\s*read\s*$/m)
  })
})
