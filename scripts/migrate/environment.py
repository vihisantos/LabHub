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
STAGING = "staging"
PRODUCTION = "production"

# Formato canônico de um project ref da Supabase: 20 caracteres alfanuméricos
# minúsculos. Validar o formato pega placeholder, URL colada por engano e
# string de configuração errada — antes de qualquer chamada de rede.
_PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")

ENV_TARGET = "MIGRATE_TARGET"
ENV_ALLOWED_REFS = "SUPABASE_ALLOWED_PROJECT_REFS"
ENV_BASELINE = "BASELINE_VERSION"

# Variáveis específicas do ambiente STAGING.
# SUPABASE_STAGING_PROJECT_REF é um secret (credencial de Management API).
# SUPABASE_STAGING_ALLOWED_PROJECT_REFS é uma variável de repositório
# (project ref não é credencial) com a allowlist de destinos autorizados
# para staging.
ENV_STAGING_PROJECT_REF = "SUPABASE_STAGING_PROJECT_REF"
ENV_STAGING_ALLOWED_REFS = "SUPABASE_STAGING_ALLOWED_PROJECT_REFS"


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
    # Nome da variável de ambiente que deve conter o SUPABASE_PROJECT_REF
    # para este target. Em produção: SUPABASE_PROJECT_REF. Em staging:
    # SUPABASE_STAGING_PROJECT_REF. Em local: "" (não usado).
    project_ref_env_var: str = ""
    # Nome da variável de repositório que deve conter a allowlist para
    # este target. Em produção: SUPABASE_ALLOWED_PROJECT_REFS. Em staging:
    # SUPABASE_STAGING_ALLOWED_PROJECT_REFS. Em local: "" (não usado).
    allowed_refs_env_var: str = ""

    @property
    def is_production(self) -> bool:
        return self.target == PRODUCTION

    @property
    def is_staging(self) -> bool:
        return self.target == STAGING

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

    Suporta três targets:
      - ``local``: desenvolvimento, CI efêmero, testes. Sem restrições.
      - ``staging``: aplicações no ambiente de staging. Exige
        ``SUPABASE_STAGING_PROJECT_REF`` (secret) e
        ``SUPABASE_STAGING_ALLOWED_PROJECT_REFS`` (variável de repositório,
        allowlist). BASELINE_VERSION é opcional (staging pode ser recriado).
      - ``production``: aplicações no ambiente de produção. Exige
        ``SUPABASE_PROJECT_REF`` (secret), ``BASELINE_VERSION`` (secret,
        obrigatório) e ``SUPABASE_ALLOWED_PROJECT_REFS`` (variável de
        repositório, allowlist).
    """
    source = os.environ if env is None else env

    resolved_target = (target or source.get(ENV_TARGET, "") or LOCAL).strip().lower()
    if resolved_target not in (LOCAL, STAGING, PRODUCTION):
        raise TargetEnvironmentError(
            f"ambiente de destino desconhecido: {resolved_target!r}. "
            f"use '{LOCAL}', '{STAGING}' ou '{PRODUCTION}'."
        )

    # Determina quais variáveis de ambiente usar com base no target.
    if resolved_target == STAGING:
        project_ref_env_var = ENV_STAGING_PROJECT_REF
        allowed_refs_env_var = ENV_STAGING_ALLOWED_REFS
    elif resolved_target == PRODUCTION:
        project_ref_env_var = "SUPABASE_PROJECT_REF"
        allowed_refs_env_var = ENV_ALLOWED_REFS
    else:
        project_ref_env_var = ""
        allowed_refs_env_var = ""

    # Se o chamador passou allowed_refs explicitamente, usa esse valor.
    # Caso contrário, lê da variável de ambiente apropriada ao target.
    if allowed_refs is not None:
        raw_refs = allowed_refs
    else:
        raw_refs = source.get(allowed_refs_env_var) if allowed_refs_env_var else None
    refs = parse_allowed_refs(raw_refs)

    # Determina se o baseline é obrigatório com base no target.
    if require_baseline is not None:
        baseline_required = require_baseline
    elif source.get("MIGRATE_REQUIRE_BASELINE", "").strip() in ("1", "true", "yes"):
        baseline_required = True
    else:
        # Apenas produção exige baseline por definição. Staging pode ser
        # recriado do zero (--from-scratch) e local usa fallback implícito.
        baseline_required = resolved_target == PRODUCTION

    # Fail-closed do destino. Tanto staging quanto produção exigem allowlist
    # configurada; local não.
    if resolved_target in (STAGING, PRODUCTION) and not refs:
        raise TargetEnvironmentError(
            f"target={resolved_target} exige {allowed_refs_env_var} configurada (a "
            "configuracao explicita do destino). Sem ela nao ha como provar que "
            "SUPABASE_PROJECT_REF aponta para o projeto correto, entao a "
            "execucao aborta. Configure a variavel de repositorio "
            f"{allowed_refs_env_var} (ou passe --allowed-project-refs)."
        )

    return TargetPolicy(
        target=resolved_target,
        require_baseline=baseline_required,
        allowed_project_refs=refs,
        project_ref_env_var=project_ref_env_var,
        allowed_refs_env_var=allowed_refs_env_var,
        # Enforcement da allowlist em staging e produção; em local é informativa.
        enforce_allowlist=resolved_target in (STAGING, PRODUCTION),
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
    """Mensagem de advertência quando a allowlist existe mas o alvo não é produção nem staging.

    Existe para o log dizer explicitamente que a checagem de destino
    está em modo parcial, em vez de dar a impressão de uma garantia completa.
    """
    if not policy.allowed_project_refs or policy.is_production or policy.is_staging:
        return None
    return (
        f"{ENV_ALLOWED_REFS} esta configurada mas o alvo e '{policy.target}'; "
        "a allowlist so e exigida em target=production ou target=staging."
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
    "STAGING",
    "PRODUCTION",
    "ENV_ALLOWED_REFS",
    "ENV_BASELINE",
    "ENV_TARGET",
    "ENV_STAGING_PROJECT_REF",
    "ENV_STAGING_ALLOWED_REFS",
    "TargetEnvironmentError",
    "TargetPolicy",
    "missing_baseline_message",
    "parse_allowed_refs",
    "resolve_policy",
    "validate_project_ref",
    "warn_unenforced_allowlist",
]
