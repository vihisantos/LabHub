# Orçamento LabHub — BRL

> Orçamento detalhado do projeto LabHub 2.1.0, com todas as categorias de despesa separadas em dinheiro real (R$).

---

## Visão Geral

| Item | Valor (R$) |
|------|------------|
| **Total Geral** | **XXX,XXX.XX** |
| Total Desenvolvimento | XXX,XXX.XX |
| Total Infraestrutura | X,XXX.XX |
| Total Design/UI | X,XXX.XX |
| Total QA/Tests | X,XXX.XX |
| Total Marketing/Launch | X,XXX.XX |

---

## 1. Desenvolvimento

### Backend (Python/Flask)

| Item | Descrição | Quantidade | Unitário (R$) | Total (R$) |
|------|-----------|------------|---------------|------------|
| Desenvolvedor Python Full-time | 40h/mês, manutenção API, crons, sync | 12 meses | 80,00 | 38.400,00 |
| Desenvolvedor Python Part-time | 20h/mês, bugs, endpoints novos | 6 meses | 70,00 | 4.200,00 |
| Integração SharePoint/Excel | Parsing planilhas, cache por workspace | 1 projeto | 2.500,00 | 2.500,00 |
| Variáveis de ambiente & Deploy Vercel | CI/CD, secrets management | 12 meses | 150,00 | 1.800,00 |

**Subtotal Backend:** **46.900,00**

### Frontend (React/TypeScript)

| Item | Descrição | Quantidade | Unitário (R$) | Total (R$) |
|------|-----------|------------|---------------|------------|
| Desenvolvedor React Full-time | 40h/month, componentes, rotas, PWA | 12 meses | 85,00 | 40.800,00 |
| Desenvolvedor TypeScript | 32h/month, tipos, build, lint | 12 meses | 80,00 | 30.720,00 |
| UI/UX Designer | Figma, design system, componentes visual | 6 meses | 75,00 | 4.500,00 |
| Acessibilidade (WCAG 2.1) | Contraste, foco, tela cheia TV | 1 projeto | 2.000,00 | 2.000,00 |

**Subtotal Frontend:** **77.020,00**

### Mobile/Desktop

| Item | Descrição | Quantidade | Unitário (R$) | Total (R$) |
|------|-----------|------------|---------------|------------|
| PWA & Responsive | Otimização mobile, tablets, kiosk mode | 1 projeto | 3.000,00 | 3.000,00 |
| App Desktop (Tauri/Electron) | Versão nativa Windows/Linux/macOS | 1 projeto | 8.000,00 | 8.000,00 |

**Subtotal Mobile/Desktop:** **11.000,00**

---

## 2. Infraestrutura e Hospedagem

| Item | Descrição | Mensal (R$) | Anual (R$) | Observação |
|------|-----------|-------------|------------|------------|
| Supabase Projeto | Banco PostgreSQL, Auth, Realtime, Storage | 25,00 | 300,00 | Plano Pro |
| Upstash Redis | Push notifications, cache | 15,00 | 180,00 | Plano Tiny |
| Vercel Pro | Deploy Serverless, Functions, Cron Jobs | 20,00 | 240,00 | Plano Pro |
| Cloudinary | Upload/hosting de imagens (fotos PCs, TV) | 30,00 | 360,00 | Plano Maker |
| Domain (labhub.vercel.app) | Custom domain, SSL | 15,00 | 180,00 | Anual |
| GitHub Actions | CI/CD minutos privados | 7,00 | 84,00 | Plano Free minutos |

**Subtotal Infraestrutura (Anual):** **1.364,00**

---

## 3. Design e UI

| Item | Descrição | Unitário (R$) | Total (R$) |
|------|-----------|---------------|------------|
| Tema Dark/Light por app | 6 temas independentes (pcare, stock, tv, reservalab, admin, launcher) | 1.200,00 | 1.200,00 |
| Ícones Lucide Personalizados | Customizações e novas categorias | 800,00 | 800,00 |
| Componentes Radix UI | Tailwind v4, accessibility, responsive | 1.000,00 | 1.000,00 |
| Animações Framer Motion | Transições de rota, states, feedback | 1.500,00 | 1.500,00 |

**Subtotal Design/UI:** **4.500,00**

---

## 4. QA e Tests

| Item | Descrição | Unitário (R$) | Total (R$) |
|------|-----------|---------------|------------|
| Vitest + Testing Library | Testes unitários e E2E | 2.000,00 | 2.000,00 |
| Oxlint | Linting configurado, 0 warnings críticos | 1.000,00 | 1.000,00 |
| Playwright | Testes de browser, fluxos completos | 3.000,00 | 3.000,00 |
| Cobertura de código | Relatórios de cobertura, 80%+ | 1.200,00 | 1.200,00 |

**Subtotal QA/Tests:** **7.200,00**

---

## 5. Marketing e Launch

| Item | Descrição | Unitário (R$) | Total (R$) |
|------|-----------|---------------|------------|
| Landing Page / Roadmap | Site público, blog, roadmap interactivo | 2.500,00 | 2.500,00 |
| Social Media (3 meses) | Posts, divulgação nos grupos de TI universitário | 1.500,00 | 1.500,00 |
| Material de Divulgação | PDFs, apresentações, demos gravadas | 1.000,00 | 1.000,00 |
| SEO e App Stores | Otimização, PWA install prompts | 800,00 | 800,00 |

**Subtotal Marketing/Launch:** **5.800,00**

---

## 6. Contingência e Imprevistos

| Item | Percentual | Valor (R$) |
|------|------------|------------|
| Contingência 10% | Sobre total geral | XXX,XXX.XX |

---

## Resumo Financeiro

| Categoria | Valor (R$) |
|-----------|------------|
| Desenvolvimento | 134.920,00 |
| Infraestrutura (Anual) | 1.364,00 |
| Design e UI | 4.500,00 |
| QA e Tests | 7.200,00 |
| Marketing e Launch | 5.800,00 |
| **Subtotal** | **153.784,00** |
| Contingência 10% | 15.378,40 |
| **Total Geral** | **169.162,40** |

---

## Cronograma de Pagamento

| Período | Percentual | Valor (R$) |
|---------|------------|------------|
| Início do projeto (30%) | 30% | 50.748,72 |
| 3º mês (25%) | 25% | 42.296,10 |
| 6º mês (20%) | 20% | 33.836,88 |
| 9º mês (15%) | 15% | 25.377,36 |
| **Total** | **100%** | **152.258,26** |

---

## Notas

- Valores referentes a desenvolvimento contratual de 12 meses (jul/2026 a jul/2027)
- Infraestrutura cobrada anualmente (renewal automático)
- Caso haja necessidade de features extras, orçamento será reajustado em reunião de sprint planning
- Todos os valores em BRL (Real Brasileiro), inclusivo impostos quando aplicável
- Orçamento válido por 90 dias a partir da data de emissão