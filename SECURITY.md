# Security Policy

## Reporting a Vulnerability

Encontrou uma vulnerabilidade no LabHub? Reporte **em privado** — nunca exponha
detalhes do exploit em uma issue pública antes de o problema ser corrigido.

**Como reportar:**

1. **Private vulnerability reporting** (recomendado) — aba *Security → Private
   vulnerability reporting* deste repositório.
2. **GitHub Issues** — abra uma issue em
   [vihisantos/LabHub/issues](https://github.com/vihisantos/LabHub/issues)
   marcando-a como *security* (template de segurança), **sem** incluir o exploit.
   A equipe responde e coordena o disclosure.

**O que incluir no reporte:**

- Versão ou commit afetado
- Descrição da vulnerabilidade (o quê e onde)
- Passos de reprodução (sem dados sensíveis)
- Impacto estimado

**Resposta esperada:**

- Confirmação de recebimento: até **48 horas**
- Primeira avaliação: até **5 dias úteis**
- Correção: conforme a severidade — a divulgação pública é coordenada com o
  reportante após o fix estar disponível

## Supported Versions

| Versão | Suporte |
|--------|---------|
| 2.1.x  | ✅ Correções de segurança ativas |
| 2.0.x  | ⚠️ Apenas vulnerabilidades críticas |
| < 2.0  | ❌ Sem suporte |

## Escopo

Inclui: código deste repositório, API Flask (`/api/*`), autenticação, dados
(Supabase/Redis) e o frontend (React/Vite). *Phishing* ou abuso de conta fora
do código não fazem parte do escopo.
