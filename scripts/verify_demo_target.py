#!/usr/bin/env python3
"""Valida o DESTINO REAL das operações do E2E demo ANTES de qualquer escrita.

Filosofia fail-closed: se não for possível PROVAR que o destino pertence ao
ambiente de demonstração autorizado, o processo termina com código != 0 e a
execução é abortada. Não existe fallback para secrets de produção, para o
nome de variáveis ou para confirmação textual.

Como o destino é provado (nunca apenas "confiado"):
  * A URL é interpretada de verdade (`urlparse`) e o host precisa ter o formato
    `<ref>.supabase.co` — o ref extraído do host é comparado com a allowlist
    AUTORIZADA (definida em código no workflow; alterar exige PR revisada).
  * Modo local: uma sonda REST somente-leitura (`limit=1`) prova que a chave
    de serviço responde NESTE projeto (par URL+chave válido). Nada é escrito.
  * Modo remoto (`--base-url`): o bundle público do app é inspecionado e TODOS
    os refs Supabase expostos precisam pertencer à allowlist. Se nenhum ref
    for encontrado, aborta (não é possível provar o destino).

Modos:
  local  — valida secrets do environment demo (URL de seed, service key, URL e
           anon key do frontend, credenciais demo) e sonda a REST API.
  remote — valida `--base-url` (https público, sem credenciais embutidas) e os
           refs Supabase que o app expõe. NÃO executa escrita alguma.

Nada sensível é impresso: chaves/tokens nunca aparecem em logs ou mensagens
(sondas reportam apenas códigos HTTP e tipos de erro).
"""

from __future__ import annotations

import argparse
import ipaddress
import os
import re
import socket
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse, urljoin

# Hosts por projeto: `<ref>.supabase.co`. Um único label antes do domínio.
_SUPABASE_HOST_RE = re.compile(r"^([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\.supabase\.co$")

# Limite de leitura do bundle do app (defesa contra respostas gigantes).
_MAX_BODY_BYTES = 2 * 1024 * 1024
_MAX_SCRIPTS = 20
_FETCH_TIMEOUT = 15.0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Mitigação de SSRF: redirects NUNCA são seguidos automaticamente.

    `urlopen` segue redirects por padrão — uma resposta 3xx poderia levar a
    sonda ou a busca de bundles para endpoints internos/metadata. Com este
    handler, qualquer 3xx vira `HTTPError` (fail-closed) e o destino do
    redirect é descartado sem ser acessado.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # urllib.request levanta HTTPError(código 3xx)


_OPENER = urllib.request.build_opener(_NoRedirect)


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    reason: str = ""
    refs: tuple[str, ...] = ()


# ── Helpers puros (cobertos por testes unitários) ────────────────────────────


def parse_project_ref(url: str) -> str | None:
    """Ref do projeto a partir de `https://<ref>.supabase.co`, ou None.

    Rejeita (fail-closed): esquema não-https, credenciais embutidas
    (`user:pass@host`), host que não seja exatamente `<ref>.supabase.co`,
    caminhos/ports estranhos e strings vazias.
    """
    if not url or not isinstance(url, str):
        return None
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return None
    if parsed.port is not None:
        return None
    host = (parsed.hostname or "").lower()
    match = _SUPABASE_HOST_RE.fullmatch(host)
    if not match:
        return None
    return match.group(1)


def parse_allowed_refs(raw: str) -> tuple[str, ...]:
    """Allowlist a partir de texto livre (espaços e/ou vírgulas), única e ordenada."""
    if not raw:
        return ()
    refs = {token.strip().lower() for token in raw.replace(",", " ").split() if token.strip()}
    return tuple(sorted(refs))


def _missing(names_and_values: dict[str, str]) -> str:
    """Primeiro nome de secret ausente/vazio, ou string vazia se tudo presente."""
    for name, value in names_and_values.items():
        if not value:
            return name
    return ""


# ── Modo LOCAL: escrita autorizada somente no projeto demo da allowlist ──────


def probe_rest_readonly(base_url: str, service_key: str, timeout: float = _FETCH_TIMEOUT) -> tuple[bool, str]:
    """Sonda somente-leitura (`?select=id&limit=1`): prova que a chave de
    serviço pertence a ESTE projeto. Nunca escreve e nunca inclui a chave na
    URL — apenas nos headers. Motivos de erro não expõem segredos.
    """
    target = base_url.rstrip("/") + "/rest/v1/chamados_tickets?select=id&limit=1"
    request = urllib.request.Request(
        target,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            if response.status == 200:
                return True, ""
            return False, f"HTTP {response.status} inesperado na sonda REST"
    except urllib.error.HTTPError as exc:
        return False, f"REST respondeu HTTP {exc.code} (redirects não são seguidos; chave não pertence a este projeto ou tabela ausente)"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return False, f"falha de rede na sonda REST ({type(exc).__name__})"


def validate_local_target(cfg: dict, probe: Callable[..., tuple[bool, str]] | None = None) -> CheckResult:
    """Modo local: seed + Flask + frontend no MESMO projeto demo autorizado."""
    probe = probe or probe_rest_readonly
    allowed = cfg.get("allowed_refs") or ()
    if not allowed:
        return CheckResult(
            False,
            "allowlist vazia: nenhuma configuração de staging autorizada "
            "(defina E2E_DEMO_ALLOWED_PROJECT_REFS no workflow) — abortando antes de qualquer escrita",
        )

    missing = _missing(
        {
            "E2E_DEMO_SUPABASE_URL": cfg.get("supabase_url", ""),
            "E2E_DEMO_SUPABASE_SERVICE_KEY": cfg.get("service_key", ""),
            "E2E_DEMO_VITE_SUPABASE_URL": cfg.get("vite_supabase_url", ""),
            "E2E_DEMO_VITE_SUPABASE_ANON_KEY": cfg.get("vite_anon_key", ""),
            "E2E_DEMO_DEMO_USER": cfg.get("demo_user", ""),
            "E2E_DEMO_DEMO_PASS": cfg.get("demo_pass", ""),
        }
    )
    if missing:
        return CheckResult(False, f"secret ausente no environment e2e-demo: {missing} — abortando")

    ref = parse_project_ref(cfg["supabase_url"])
    if ref is None:
        return CheckResult(
            False,
            "E2E_DEMO_SUPABASE_URL não é um endpoint Supabase https reconhecível "
            "(esperado https://<ref>.supabase.co) — abortando",
        )
    if ref not in allowed:
        return CheckResult(
            False,
            f"destino do seed (ref {ref}) NÃO está na allowlist do ambiente demo "
            f"{list(allowed)} — abortando sem escrever",
        )

    vite_ref = parse_project_ref(cfg["vite_supabase_url"])
    if vite_ref is None:
        return CheckResult(False, "E2E_DEMO_VITE_SUPABASE_URL não é um endpoint Supabase https reconhecível — abortando")
    if vite_ref != ref:
        return CheckResult(
            False,
            f"frontend ({vite_ref}) e seed ({ref}) apontam para projetos DIFERENTES — abortando",
        )

    ok, why = probe(cfg["supabase_url"], cfg["service_key"])
    if not ok:
        return CheckResult(False, f"sonda REST falhou: {why} — abortando")

    return CheckResult(True, refs=(ref,))


# ── Modo REMOTO: sem seed, sem escrita; app precisa provar que é demo ─────────


def _is_public_https_url(value: str) -> tuple[bool, str]:
    """https público, sem credenciais embutidas, resolvendo só para IPs públicos."""
    if not value:
        return False, "base_url ausente no modo remote"
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return False, "base_url inválida"
    if parsed.scheme != "https":
        return False, "base_url precisa ser https (modo remote)"
    if parsed.username or parsed.password:
        return False, "base_url com credenciais embutidas (user:pass@) — abortando"
    host = parsed.hostname or ""
    if not host:
        return False, "base_url sem host"
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False, f"não foi possível resolver o host '{host}' — abortando"
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False, f"host '{host}' resolveu para endereço inválido — abortando"
        if not ip.is_global:
            return False, (
                f"host '{host}' resolve para endereço não público ({type(ip).__name__}) — "
                "o modo remote só aceita apps públicos (ex.: preview da Vercel)"
            )
    return True, ""


def _fetch_text(url: str, timeout: float = _FETCH_TIMEOUT) -> str:
    request = urllib.request.Request(url, headers={"Accept": "text/html,application/javascript,*/*"})
    with _OPENER.open(request, timeout=timeout) as response:
        if response.status != 200:
            raise urllib.error.HTTPError(url, response.status, "unexpected status", response.headers, None)
        return response.read(_MAX_BODY_BYTES).decode("utf-8", errors="replace")


_SCRIPT_SRC_RE = re.compile(r"""<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']""", re.I)
_SUPABASE_URL_RE = re.compile(r"https://([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\.supabase\.co", re.I)


def extract_supabase_refs(text: str) -> set[str]:
    """Refs `<ref>.supabase.co` que aparecem no texto (HTML ou JS)."""
    return {match.group(1).lower() for match in _SUPABASE_URL_RE.finditer(text or "")}


def collect_remote_refs(base_url: str, fetcher: Callable[..., str] = _fetch_text) -> tuple[str, ...]:
    """Refs Supabase expostos pelo app: HTML de entrada + bundles de script.

    SSRF: apenas scripts da MESMA ORIGEM do app (https + mesmo host:porta) são
    buscados — `src` absolutos/protocol-relative de terceiros são descartados
    sem acesso. Levanta exceção em falha de rede/HTTP — quem chama decide o
    abort.
    """
    html = fetcher(base_url)
    refs = extract_supabase_refs(html)

    base_netloc = (urlparse(base_url).netloc or "").lower()
    scripts: list[str] = []
    for src in _SCRIPT_SRC_RE.findall(html):
        candidate = urljoin(base_url, src)
        parsed = urlparse(candidate)
        if parsed.scheme == "https" and (parsed.netloc or "").lower() == base_netloc:
            scripts.append(candidate)
    for script_url in scripts[:_MAX_SCRIPTS]:
        try:
            refs |= extract_supabase_refs(fetcher(script_url))
        except (urllib.error.URLError, TimeoutError, OSError):
            # Bundle individual inacessível não aborta sozinho: o veredito é
            # fail-closed se NENHUM ref for encontrado no total.
            continue
    return tuple(sorted(refs))


def validate_remote_app(cfg: dict, fetcher: Callable[..., str] = _fetch_text) -> CheckResult:
    """Modo remoto: prova (leitura) que o app aponta para o Supabase demo.

    `base_url` é tratado como endereço do aplicativo web — NUNCA como
    autorização para alterar o destino do banco. Nenhuma escrita acontece
    neste modo.
    """
    allowed = cfg.get("allowed_refs") or ()
    if not allowed:
        return CheckResult(
            False,
            "allowlist vazia: nenhuma configuração de staging autorizada "
            "(defina E2E_DEMO_ALLOWED_PROJECT_REFS no workflow) — abortando",
        )
    missing = _missing(
        {
            "E2E_DEMO_DEMO_USER": cfg.get("demo_user", ""),
            "E2E_DEMO_DEMO_PASS": cfg.get("demo_pass", ""),
        }
    )
    if missing:
        return CheckResult(False, f"secret ausente no environment e2e-demo: {missing} — abortando")

    base_url = cfg.get("base_url", "")
    ok, why = _is_public_https_url(base_url)
    if not ok:
        return CheckResult(False, f"{why} — abortando")

    try:
        refs = collect_remote_refs(base_url, fetcher)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        return CheckResult(False, f"app remoto inacessível ({type(exc).__name__}) — abortando")

    if not refs:
        return CheckResult(
            False,
            "nenhum ref Supabase encontrado no app remoto — impossível PROVAR que o "
            "destino é o ambiente demo autorizado (fail-closed) — abortando",
        )
    unexpected = sorted(set(refs) - set(allowed))
    if unexpected:
        return CheckResult(
            False,
            f"app remoto expõe refs FORA da allowlist do ambiente demo: {unexpected} "
            f"(autorizados: {list(allowed)}) — abortando",
        )
    return CheckResult(True, refs=refs)


# ── CLI ──────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida o destino real do E2E demo (fail-closed).")
    parser.add_argument("--mode", choices=("local", "remote"), required=True)
    parser.add_argument("--base-url", default="", help="URL do app remoto (modo remote apenas)")
    parser.add_argument("--allowed-refs", required=True, help="refs Supabase autorizados (separados por espaço/vírgula)")
    args = parser.parse_args(argv)

    allowed = parse_allowed_refs(args.allowed_refs)

    if args.mode == "local":
        result = validate_local_target(
            {
                "supabase_url": os.environ.get("E2E_DEMO_SUPABASE_URL", ""),
                "service_key": os.environ.get("E2E_DEMO_SUPABASE_SERVICE_KEY", ""),
                "vite_supabase_url": os.environ.get("E2E_DEMO_VITE_SUPABASE_URL", ""),
                "vite_anon_key": os.environ.get("E2E_DEMO_VITE_SUPABASE_ANON_KEY", ""),
                "demo_user": os.environ.get("E2E_DEMO_DEMO_USER", ""),
                "demo_pass": os.environ.get("E2E_DEMO_DEMO_PASS", ""),
                "allowed_refs": allowed,
            }
        )
    else:
        result = validate_remote_app(
            {
                "base_url": args.base_url,
                "demo_user": os.environ.get("E2E_DEMO_DEMO_USER", ""),
                "demo_pass": os.environ.get("E2E_DEMO_DEMO_PASS", ""),
                "allowed_refs": allowed,
            }
        )

    if result.refs:
        print(f"refs Supabase detectados: {', '.join(result.refs)}")

    if result.ok:
        print(f"[verify_demo_target] modo {args.mode}: destino autorizado ✓")
        return 0

    print(f"[verify_demo_target] modo {args.mode}: ABORTADO — {result.reason}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
