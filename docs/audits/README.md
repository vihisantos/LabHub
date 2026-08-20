# Audits

> Historical analyses and legacy documentation preserved for reference.

## Purpose

This directory preserves historical documentation and analyses. These documents represent the state of the system at a specific point in time and should NOT be treated as current architecture documentation.

## Structure

```
audits/
├── architecture/     # Architecture analyses
│   ├── arquitetura-legacy.md    # Original architecture doc
│   └── database-2026-08.md      # Database schema analysis
├── features/         # Feature-specific documentation
│   ├── chamados-legacy.md       # Chamados original docs
│   ├── pcare-legacy.md          # PCare original docs
│   ├── stock-legacy.md          # Stock original docs
│   ├── reservalab-legacy.md     # ReservaLab original docs
│   ├── tv-legacy.md             # TV original docs
│   ├── api-legacy.md            # API original docs
│   ├── assets-registry.md       # Asset registry analysis
│   └── orcamento.md             # Project budget
└── security/         # Security analyses
```

## Guidelines

- **Do not update these docs** — They are snapshots in time
- **Reference, don't copy** — If information is still valid, it should be in the main docs
- **Add new audits** — When performing a new analysis, add it here with a date
- **Link from ADRs** — When a decision is based on an audit, link to it

## When to Create a New Audit

- Performing a security review
- Analyzing system performance
- Reviewing feature completeness
- Conducting a code quality assessment
