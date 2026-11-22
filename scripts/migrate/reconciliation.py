"""Reconciliação controlada de lacunas históricas conhecidas.

Motivo
------
Em staging as migrations 113 e 114 existem como DDL/contrato, mas não foram
registradas em ``public.schema_migrations``. Como a maior versão registrada
(120) era usada como baseline inferido, o runner considerava 113/114
implicitamente aplicadas e reportava "nenhuma pendente".

Este módulo é a POLÍTICA versionada dessa recuperação. Nenhuma versão é
reconciliada por heurística de nome: ela precisa constar explicitamente em
:data:`RECONCILIATION_RULES`, revisada via PR, com:

* o ``filename`` exato esperado (divergência bloqueia);
* um ``contract`` — arquivo de migration SOMENTE LEITURA que prova, no próprio
  banco, que o contrato dos objetos confere com o esperado.

Nada aqui executa SQL. O runner verifica o contrato ANTES de qualquer escrita
e só então registra as versões pelo caminho oficial (transação + advisory lock
+ INSERT atômico em ``schema_migrations``).
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from .core import Migration, MigrationGap

STAGING_OUTBOX_CONTRACT = "114_notification_outbox_contract.sql"


@dataclass(frozen=True)
class ReconciliationRule:
    """Autorização explícita e rastreável para reconciliar UMA versão."""

    version: str
    filename: str
    reason: str
    contract: str  # migration read-only que comprova os objetos existentes


# Caso conhecido de staging (#498). Não é genérico de propósito: qualquer nova
# lacuna precisa de uma entrada nova, com contrato e justificativa revisados.
# A 113 é idempotente (CREATE TABLE/INDEX IF NOT EXISTS, OR REPLACE FUNCTION,
# GRANT/REVOKE repetíveis); a 114 é um DO de somente leitura que valida tabela,
# 15 colunas, 4 índices, RLS ENABLE/FORCE, grants e 8 RPCs.
RECONCILIATION_RULES: dict[str, ReconciliationRule] = {
    "113": ReconciliationRule(
        version="113",
        filename="113_notification_outbox.sql",
        reason=(
            "DDL idempotente da outbox de notificações; objetos já presentes em "
            "staging, sem registro no histórico"
        ),
        contract=STAGING_OUTBOX_CONTRACT,
    ),
    "114": ReconciliationRule(
        version="114",
        filename=STAGING_OUTBOX_CONTRACT,
        reason="contrato read-only que verifica integralmente os objetos da 113",
        contract=STAGING_OUTBOX_CONTRACT,
    ),
}

# Um "contrato" só é aceito se o arquivo não contiver comando de mutação em
# posição de statement top-level (sem indentação). As linhas dentro do DO $$ da
# 114 são indentadas; um arquivo trocado por DDL seria detectado aqui.
_MUTATING_TOP_LEVEL_RE = re.compile(
    r"^(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|COPY|MERGE|REFRESH|VACUUM|REINDEX)\b",
    re.IGNORECASE,
)


def is_read_only_contract(sql: str) -> bool:
    """Rejeita arquivos que, sob a aparência de contrato, mutam o banco."""
    for line in sql.splitlines():
        if not line.strip() or line.lstrip().startswith("--"):
            continue
        if line[:1].isspace():
            continue  # corpo do DO $$ — não é statement top-level
        if _MUTATING_TOP_LEVEL_RE.match(line.strip()):
            return False
    return True


@dataclass(frozen=True)
class ReconciliationPlan:
    """Resultado do planejamento: o que reconciliar, o que provar e o que bloqueia."""

    migrations: tuple[Migration, ...]
    contracts: tuple[Migration, ...]
    unreconciled: tuple[MigrationGap, ...]

    @property
    def versions(self) -> tuple[str, ...]:
        return tuple(m.version for m in self.migrations)

    @property
    def blocking(self) -> bool:
        return bool(self.unreconciled)


def plan_reconciliation(
    gaps: Sequence[MigrationGap],
    migrations: Sequence[Migration],
    *,
    allow_reconciliation: bool,
) -> ReconciliationPlan:
    """Separa lacunas reconciliáveis das que devem bloquear a execução.

    ``allow_reconciliation`` é ligado somente pela política de staging. Em
    produção/local qualquer lacuna é bloqueante: a correção conhecida do
    staging não pode, por construção, autorizar escrita em outro destino.
    """
    if not gaps:
        return ReconciliationPlan((), (), ())

    by_version = {m.version: m for m in migrations}
    by_filename = {m.filename: m for m in migrations}
    selected: dict[str, Migration] = {}
    contracts: dict[str, Migration] = {}
    unreconciled: list[MigrationGap] = []

    for gap in gaps:
        rule = RECONCILIATION_RULES.get(gap.version)
        if rule is None or not allow_reconciliation or gap.filename != rule.filename:
            unreconciled.append(gap)
            continue
        migration = by_version.get(gap.version)
        contract = by_filename.get(rule.contract)
        if migration is None or contract is None:
            unreconciled.append(gap)
            continue
        if not is_read_only_contract(contract.path.read_text(encoding="utf-8")):
            unreconciled.append(gap)
            continue
        selected[gap.version] = migration
        contracts[contract.version] = contract

    ordered = tuple(
        m for m in sorted(selected.values(), key=lambda item: item.number)
    )
    ordered_contracts = tuple(
        m for m in sorted(contracts.values(), key=lambda item: item.number)
    )
    return ReconciliationPlan(ordered, ordered_contracts, tuple(unreconciled))
