"""Política do ambiente de destino do migration runner (#285).

Motivo
------
Até aqui, ``SUPABASE_PROJECT_REF`` ia direto para a URL da Management API. Trocar
o valor do secret — ou um ``.env`` local apontando para o projeto errado — levava
o runner a aplicar DDL no banco errado, com sucesso e sem aviso. A Management API
responde 200 para um projeto válido que não é o nosso: não existe sinal de erro.

Este módulo é a barreira *antes* do primeiro request. Ele não conhece rede nem
segredos: valida configuração pura e testável.

Dois eixos, independentes:

``target``
    ``local`` (default) — execução de desenvolvimento, CI efêmero, testes. Não
    exige nada além do que já era exigido.
    ``production`` — habilita as travas: ``BASELINE_VERSION`` obrigatório e
    ``SUPABASE_PROJECT_REF`` obrigado a constar na allowlist.

``SUPABASE_ALLOWED_PROJECT_REFS``
    Allowlist separada, separada do valor efetivo. É ela que dá sentido à
    checagem: comparar o ref *com ele mesmo* não validaria nada.

A allowlist é obrigatória em produção
------------------------------------
Sem ela, o único guardio contra um secret trocado seria o formato do ref
(20 caracteres minúsculos) — que um projeto válido e errado também satisfaz.
Exigir a configuração explícita é a diferença entre detectar a configuração
errada no primeiro request e descobrir que o DDL foi para o banco errado depois.
O custo é a primeira execução de produção recusar até alguém declarar o destino;
aceitamos esse custo, porque o modo anterior só empurrava a falha para mais
tarde, já com escrita em andamento.

A allowlist **não** é uma secret nova: é uma variável de repositório
(``vars.SUPABASE_ALLOWED_PROJECT_REFS``), porque um project ref não é
credencial. Faltando ela, a mensagem de erro diz exatamente o que criar.

Este módulo não toca o executor genérico de propósito: o PostgreSQL efêmero do
CI passa por ``PostgresExecutor``/``DATABASE_URL`` e nunca é afetado por uma
restrição de produção.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from .core import MigrationError

LOCAL = "local"
PRODUCTION = "production"

# Formato canônico de um project ref da Supabase: 20 caracteres alfanuméricos
# minúsculos. Validar o formato pega placeholder, URL colada por engano e
# string de configuração errada — antes de qualquer chamada de rede.
_PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")

ENV_TARGET = "MIGRATE_TARGET"
ENV_ALLOWED_REFS = "SUPABASE_ALLOWED_PROJECT_REFS"
ENV_BASELINE = "BASELINE_VERSION"


class TargetEnvironmentError(MigrationError):
    """Ambiente de destino desconhecido ou ``SUPABASE_PROJECT_REF`` inválido.

    Mensagens nunca incluem o valor do ref nem qualquer token: o erro diz *que*
    regra quebrou, não o segredo.
    """


@dataclass(frozen=True)
class TargetPolicy:
    """Resolução das regras de ambiente para uma execução."""

    target: str = LOCAL
    require_baseline: bool = False
    allowed_project_refs: tuple[str, ...] = ()
    enforce_allowlist: bool = False

    @property
    def is_production(self) -> bool:
        return self.target == PRODUCTION

    def describe(self) -> str:
        refs = ",".join(self.allowed_project_refs) if self.allowed_project_refs else "(nao configurada)"
        return f"target={self.target} require_baseline={self.require_baseline} allowlist={refs}"


def parse_allowed_refs(raw: str | None) -> tuple[str, ...]:
    """Parseia a allowlist: lista separada por vírgula, espaços ignorados.

    Entrada vazia/none = allowlist não configurada (não é lista vazia por engano).
    """
    if not raw:
        return ()
    parts = [p.strip() for p in raw.split(",")]
    return tuple(p for p in parts if p)


def resolve_policy(
    env: dict[str, str] | None = None,
    *,
    target: str | None = None,
    allowed_refs: str | None = None,
    require_baseline: bool | None = None,
) -> TargetPolicy:
    """Deriva a :class:`TargetPolicy` do CLI e do ambiente.

    Precedência: argumento explícito > variável de ambiente > default.
    """
    source = os.environ if env is None else env

    resolved_target = (target or source.get(ENV_TARGET, "") or LOCAL).strip().lower()
    if resolved_target not in (LOCAL, PRODUCTION):
        raise TargetEnvironmentError(
            f"ambiente de destino desconhecido: {resolved_target!r}. "
            f"use '{LOCAL}' ou '{PRODUCTION}'."
        )

    raw_refs = allowed_refs if allowed_refs is not None else source.get(ENV_ALLOWED_REFS)
    refs = parse_allowed_refs(raw_refs)

    if require_baseline is not None:
        baseline_required = require_baseline
    elif source.get("MIGRATE_REQUIRE_BASELINE", "").strip() in ("1", "true", "yes"):
        baseline_required = True
    else:
        # Produção exige baseline por definição; local preserva o comportamento
        # histórico (fallback implícito) para não quebrar o uso de desenvolvimento.
        baseline_required = resolved_target == PRODUCTION

    # Fail-closed do destino (#285). Em produção a allowlist é OBRIGATÓRIA:
    # sem ela, o único guardio contra um secret trocado seria o formato do ref
    # (20 chars minúsculos), que um valor de outro projeto também satisfaz. O
    # modo anterior — "exigir allowlist só se estiver configurada" — deixava
    # `--target production` funcionando com destino não verificável, e a falha
    # só apareceria tarde, já com DDL em andamento.
    #
    # A allowlist NÃO é um secret novo: é uma variável de repositório
    # (`SUPABASE_ALLOWED_PROJECT_REFS`), pois um project ref não é credencial.
    # Se ela faltar, a execução aborta dizendo o que criar.
    if resolved_target == PRODUCTION and not refs:
        raise TargetEnvironmentError(
            f"target=production exige {ENV_ALLOWED_REFS} configurada (a "
            "configuracao explicita do destino). Sem ela nao ha como provar que "
            "SUPABASE_PROJECT_REF aponta para o projeto de producao, entao a "
            f"execucao aborta. Configure a variavel de repositorio {ENV_ALLOWED_REFS} "
            f"(ou passe --allowed-project-refs), e tambem o secret {ENV_BASELINE}."
        )

    return TargetPolicy(
        target=resolved_target,
        require_baseline=baseline_required,
        allowed_project_refs=refs,
        # Só há enforcement em produção; em local a allowlist é informativa.
        enforce_allowlist=resolved_target == PRODUCTION,
    )


def validate_project_ref(project_ref: str, policy: TargetPolicy) -> None:
    """Valida ``SUPABASE_PROJECT_REF`` contra a política. Levanta em caso de falha.

    Chamado por ``scripts/migrate.py`` ANTES de construir o cliente HTTP — a
    garantia de "nenhum request em produção com destino desconhecido" mora aqui.
    """
    ref = (project_ref or "").strip()
    if not ref:
        raise TargetEnvironmentError(
            "SUPABASE_PROJECT_REF nao configurado; nenhuma requisicao foi feita."
        )

    if not _PROJECT_REF_RE.match(ref):
        raise TargetEnvironmentError(
            "SUPABASE_PROJECT_REF em formato invalido (esperado 20 caracteres "
            "alfanumericos minusculos); nenhuma requisicao foi feita."
        )

    if policy.enforce_allowlist and ref not in policy.allowed_project_refs:
        # Não ecoa o ref: a mensagem precisa dizer que houve divergência, não
        # facilitar a leitura de um valor possivelmente disparado por engano.
        raise TargetEnvironmentError(
            "SUPABASE_PROJECT_REF nao consta em SUPABASE_ALLOWED_PROJECT_REFS "
            f"({len(policy.allowed_project_refs)} entrada(s) configurada(s)); "
            "execucao abortada antes de qualquer requisicao."
        )


def warn_unenforced_allowlist(policy: TargetPolicy) -> str | None:
    """Mensagem de advertência quando a allowlist existe mas o alvo não é produção.

    Existe para o log de produção dizer explicitamente que a checagem de destino
    está em modo parcial, em vez de dar a impressão de uma garantia completa.
    """
    if not policy.allowed_project_refs or policy.is_production:
        return None
    return (
        f"{ENV_ALLOWED_REFS} esta configurada mas o alvo e '{policy.target}'; "
        "a allowlist so e exigida em target=production."
    )


def missing_baseline_message(policy: TargetPolicy) -> str:
    """Mensagem de fail-closed do baseline. Não revela nenhum valor."""
    return (
        "BASELINE_VERSION nao configurado para execucao de producao. "
        "Sem ele o runner cairia no baseline implicito (maior versao do "
        "repositorio) e nao aplicaria NADA, reportando sucesso — um schema "
        "que para de evoluir sem ninguem notar. Execucao abortada por seguranca. "
        f"Configure o secret {ENV_BASELINE} com a versao cuja aplicacao ja "
        f"esta garantida no banco. Contexto: {policy.describe()}"
    )


__all__ = [
    "LOCAL",
    "PRODUCTION",
    "ENV_ALLOWED_REFS",
    "ENV_BASELINE",
    "ENV_TARGET",
    "TargetEnvironmentError",
    "TargetPolicy",
    "missing_baseline_message",
    "parse_allowed_refs",
    "resolve_policy",
    "validate_project_ref",
    "warn_unenforced_allowlist",
]
