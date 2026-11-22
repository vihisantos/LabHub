"""Política do ambiente de destino do migration runner (#285, CI/CD 2026).

Motivo
------
``SUPABASE_PROJECT_REF`` ia direto para a URL da Management API. Trocar o valor do
secret — ou um ``.env`` local apontando para o projeto errado — levava o runner a
aplicar DDL no banco errado, com sucesso e sem aviso. A Management API responde
200 para um projeto válido que não é o nosso: não existe sinal de erro.

Este módulo é a barreira *antes* do primeiro request. Não conhece rede nem lê
segredos: valida configuração pura e testável.

Três eixos, independentes:

``target``
    ``local`` — desenvolvimento, CI efêmero e testes. Sem restrições.
    ``staging`` — exige allowlist, credenciais **próprias** de staging e
    baseline/histórico verificável (nunca ``--from-scratch``).
    ``production`` — exige allowlist, credenciais **próprias** de produção e
    baseline/histórico verificável.

Allowlist
    Cada ambiente tem a sua (``SUPABASE_STAGING_ALLOWED_PROJECT_REFS`` e
    ``SUPABASE_ALLOWED_PROJECT_REFS``). São variáveis de repositório, não
    secrets: um project ref não é credencial. Sem ela o runner aborta antes de
    qualquer chamada de rede.

Credenciais isoladas
    ``SUPABASE_STAGING_ACCESS_TOKEN`` só pode ser usada com ``--target staging``;
    ``SUPABASE_ACCESS_TOKEN`` só com ``--target production``. O runner escolhe a
    variável pela política e nunca mistura os dois ambientes. Mensagens de erro
    dizem *qual regra* quebrou, nunca o valor do ref ou do token.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from .core import MigrationError

LOCAL = "local"
STAGING = "staging"
PRODUCTION = "production"
_TARGETS = (LOCAL, STAGING, PRODUCTION)

# Formato canônico de project ref da Supabase: 20 caracteres alfanuméricos
# minúsculos. Valida o formato antes de qualquer chamada de rede.
_PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")

ENV_TARGET = "MIGRATE_TARGET"
ENV_ALLOWED_REFS = "SUPABASE_ALLOWED_PROJECT_REFS"
ENV_ACCESS_TOKEN = "SUPABASE_ACCESS_TOKEN"
ENV_BASELINE = "BASELINE_VERSION"
ENV_STAGING_PROJECT_REF = "SUPABASE_STAGING_PROJECT_REF"
ENV_STAGING_ACCESS_TOKEN = "SUPABASE_STAGING_ACCESS_TOKEN"
ENV_STAGING_ALLOWED_REFS = "SUPABASE_STAGING_ALLOWED_PROJECT_REFS"

# Nomes canônicos por target. A separação é o que impede uma credencial de
# produção de ser usada no staging (e vice-versa).
_PRODUCTION_VARS = (
    "SUPABASE_PROJECT_REF",
    ENV_ACCESS_TOKEN,
    ENV_ALLOWED_REFS,
)
_STAGING_VARS = (
    ENV_STAGING_PROJECT_REF,
    ENV_STAGING_ACCESS_TOKEN,
    ENV_STAGING_ALLOWED_REFS,
)


class TargetEnvironmentError(MigrationError):
    """Ambiente desconhecido, allowlist ausente ou project ref inválido."""


@dataclass(frozen=True)
class TargetPolicy:
    """Resolução das regras de ambiente para uma execução."""

    target: str = LOCAL
    require_baseline: bool = False
    allowed_project_refs: tuple[str, ...] = ()
    enforce_allowlist: bool = False
    project_ref_env_var: str = ""
    access_token_env_var: str = ""
    allowed_refs_env_var: str = ""

    @property
    def is_staging(self) -> bool:
        return self.target == STAGING

    @property
    def is_production(self) -> bool:
        return self.target == PRODUCTION

    @property
    def is_shared(self) -> bool:
        """True quando o destino é um banco compartilhado (não efêmero)."""
        return self.is_staging or self.is_production

    def describe(self) -> str:
        refs = ",".join(self.allowed_project_refs) if self.allowed_project_refs else "(nao configurada)"
        return (
            f"target={self.target} require_baseline={self.require_baseline} "
            f"allowlist={refs} token_env={self.access_token_env_var or '(none)'}"
        )

    def credential_vars(self) -> tuple[str, str]:
        """Nomes das variáveis de ref/token que esta política autoriza."""
        return self.project_ref_env_var, self.access_token_env_var


def parse_allowed_refs(raw: str | None) -> tuple[str, ...]:
    """Parseia a allowlist separada por vírgula; espaços são ignorados."""
    if not raw:
        return ()
    return tuple(p for p in (part.strip() for part in raw.split(",")) if p)


def _vars_for(target: str) -> tuple[str, str, str]:
    if target == STAGING:
        return _STAGING_VARS
    if target == PRODUCTION:
        return _PRODUCTION_VARS
    return ("", "", "")


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
    if resolved_target not in _TARGETS:
        raise TargetEnvironmentError(
            f"ambiente de destino desconhecido: {resolved_target!r}. "
            f"use '{LOCAL}', '{STAGING}' ou '{PRODUCTION}'."
        )

    project_ref_env_var, access_token_env_var, allowed_refs_env_var = _vars_for(resolved_target)

    raw_refs = allowed_refs if allowed_refs is not None else (
        source.get(allowed_refs_env_var) if allowed_refs_env_var else None
    )
    refs = parse_allowed_refs(raw_refs)

    if require_baseline is not None:
        baseline_required = require_baseline
    elif source.get("MIGRATE_REQUIRE_BASELINE", "").strip() in ("1", "true", "yes"):
        baseline_required = True
    else:
        # Ambientes compartilhados (staging e produção) exigem baseline
        # explícito ou histórico registrado. O fallback implícito (maior versão
        # do repositório) é um no-op silencioso em um banco vazio: em staging
        # ele já reaplicou 108 migrations por engano em #483, e em produção
        # congelaria o schema sem sinal. Local/CI efêmero mantém o fallback.
        baseline_required = resolved_target in (STAGING, PRODUCTION)

    # Fail-closed de destino: um banco compartilhado sem allowlist não tem como
    # provar que o ref aponta para o projeto correto.
    if resolved_target in (STAGING, PRODUCTION) and not refs:
        raise TargetEnvironmentError(
            f"target={resolved_target} exige {allowed_refs_env_var} configurada "
            "(a configuração explícita do destino). Sem ela não há como provar "
            "que o project ref aponta para o projeto correto; a execução aborta "
            "antes de qualquer requisição."
        )

    return TargetPolicy(
        target=resolved_target,
        require_baseline=baseline_required,
        allowed_project_refs=refs,
        enforce_allowlist=resolved_target in (STAGING, PRODUCTION),
        project_ref_env_var=project_ref_env_var,
        access_token_env_var=access_token_env_var,
        allowed_refs_env_var=allowed_refs_env_var,
    )


def validate_project_ref(project_ref: str, policy: TargetPolicy) -> None:
    """Valida o project ref contra a política. Levanta em caso de falha.

    Chamado antes de construir o cliente HTTP: nenhum request em ambiente
    compartilhado com destino desconhecido.
    """
    ref = (project_ref or "").strip()
    if not ref:
        raise TargetEnvironmentError(
            f"{policy.project_ref_env_var or 'SUPABASE_PROJECT_REF'} não configurado; "
            "nenhuma requisição foi feita."
        )

    if not _PROJECT_REF_RE.match(ref):
        raise TargetEnvironmentError(
            "project ref em formato inválido (esperado 20 caracteres alfanuméricos "
            "minúsculos); nenhuma requisição foi feita."
        )

    if policy.enforce_allowlist and ref not in policy.allowed_project_refs:
        # Não ecoa o valor: a mensagem diz que houve divergência, não qual ref.
        raise TargetEnvironmentError(
            f"project ref não consta em {policy.allowed_refs_env_var} "
            f"({len(policy.allowed_project_refs)} entrada(s) configurada(s)); "
            "execução abortada antes de qualquer requisição."
        )


def warn_unenforced_allowlist(policy: TargetPolicy) -> str | None:
    """Aviso quando há allowlist configurada mas o alvo não é compartilhado."""
    if not policy.allowed_project_refs or policy.is_shared:
        return None
    return (
        f"{ENV_ALLOWED_REFS} está configurada mas o alvo é '{policy.target}'; "
        "a allowlist só é exigida em staging e produção."
    )


def missing_baseline_message(policy: TargetPolicy) -> str:
    """Mensagem de fail-closed do baseline. Não revela nenhum valor."""
    return (
        f"BASELINE_VERSION não configurado para execução de {policy.target}. Sem ele o "
        "runner cairia no baseline implícito (maior versão do repositório) e não "
        "aplicaria NADA, reportando sucesso — um schema que para de evoluir sem "
        "ninguém notar. Execução abortada por segurança. Configure o secret "
        f"{ENV_BASELINE} com a versão cuja aplicação já está garantida no banco. "
        f"Contexto: {policy.describe()}"
    )


__all__ = [
    "LOCAL",
    "STAGING",
    "PRODUCTION",
    "ENV_TARGET",
    "ENV_ALLOWED_REFS",
    "ENV_ACCESS_TOKEN",
    "ENV_BASELINE",
    "ENV_STAGING_PROJECT_REF",
    "ENV_STAGING_ACCESS_TOKEN",
    "ENV_STAGING_ALLOWED_REFS",
    "TargetEnvironmentError",
    "TargetPolicy",
    "missing_baseline_message",
    "parse_allowed_refs",
    "resolve_policy",
    "validate_project_ref",
    "warn_unenforced_allowlist",
]
