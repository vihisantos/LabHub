"""Testes do guard fail-closed de destino do E2E demo (verify_demo_target).

Cobre: allowlist vazia, secrets ausentes, ref de produção rejeitado, par
frontend/seed divergente, sonda REST falha, base_url remoto inseguro e a
prova de destino no modo remote. NENHUMA rede real: sondas e fetchers são
fakes. Nenhuma escrita é simulada ou executada.
"""
from __future__ import annotations

import urllib.error

import pytest

import verify_demo_target as vdt

# Refs fictícios (formato real: 20 caracteres alfanuméricos minúsculos).
STAGING = "stagingref1234567890"
PROD = "prodref12345678901234"
ALLOWED = (STAGING,)


def local_cfg(**overrides):
    cfg = {
        "supabase_url": f"https://{STAGING}.supabase.co",
        "service_key": "fake-service-key",
        "vite_supabase_url": f"https://{STAGING}.supabase.co",
        "vite_anon_key": "fake-anon-key",
        "demo_user": "demo",
        "demo_pass": "fake-pass",
        "allowed_refs": ALLOWED,
    }
    cfg.update(overrides)
    return cfg


def ok_probe(base_url, service_key, timeout=0):
    return True, ""


# ── parse_project_ref ────────────────────────────────────────────────────────


class TestParseProjectRef:
    def test_aceita_host_supabase_valido(self):
        assert vdt.parse_project_ref(f"https://{STAGING}.supabase.co") == STAGING

    def test_aceita_barra_final(self):
        assert vdt.parse_project_ref(f"https://{STAGING}.supabase.co/") == STAGING

    @pytest.mark.parametrize(
        "url",
        [
            "",
            None,
            f"http://{STAGING}.supabase.co",  # não-https
            f"https://user:pass@{STAGING}.supabase.co",  # credenciais embutidas
            f"https://{STAGING}.supabase.co:8443",  # porta explícita
            f"https://{STAGING}.supabase.com",  # domínio errado
            f"https://evil.com/{STAGING}.supabase.co",  # ref disfarçado de path
            f"https://{STAGING}.supabase.co.evil.com",  # sufixo hostil
            "not a url",
        ],
    )
    def test_rejeita_urls_nao_confiaveis(self, url):
        assert vdt.parse_project_ref(url) is None


# ── parse_allowed_refs ───────────────────────────────────────────────────────


class TestParseAllowedRefs:
    def test_separa_por_espaco_e_virgula(self):
        assert vdt.parse_allowed_refs(f" {PROD}, {STAGING}\n") == (PROD, STAGING)

    def test_vazia(self):
        assert vdt.parse_allowed_refs("") == ()
        assert vdt.parse_allowed_refs("  ,  ") == ()


# ── validate_local_target (modo local, com seed) ─────────────────────────────


class TestValidateLocalTarget:
    def test_destino_demo_autorizado_passa(self):
        result = vdt.validate_local_target(local_cfg(), probe=ok_probe)
        assert result.ok is True
        assert result.refs == (STAGING,)

    def test_allowlist_vazia_falha_antes_de_qualquer_escrita(self):
        result = vdt.validate_local_target(local_cfg(allowed_refs=()), probe=ok_probe)
        assert result.ok is False
        assert "allowlist vazia" in result.reason

    @pytest.mark.parametrize(
        "field",
        ["supabase_url", "service_key", "vite_supabase_url", "vite_anon_key", "demo_user", "demo_pass"],
    )
    def test_secret_ausente_falha(self, field):
        result = vdt.validate_local_target(local_cfg(**{field: ""}), probe=ok_probe)
        assert result.ok is False
        assert "secret ausente" in result.reason

    def test_ref_de_producao_rejeitado(self):
        result = vdt.validate_local_target(
            local_cfg(
                supabase_url=f"https://{PROD}.supabase.co",
                service_key="chave-de-prod-nunca-usada",
            ),
            probe=ok_probe,
        )
        assert result.ok is False
        assert PROD in result.reason
        assert "allowlist" in result.reason

    def test_frontend_e_seed_em_projetos_diferentes_rejeitados(self):
        result = vdt.validate_local_target(
            local_cfg(
                supabase_url=f"https://{STAGING}.supabase.co",
                vite_supabase_url=f"https://{PROD}.supabase.co",
            ),
            probe=ok_probe,
        )
        assert result.ok is False
        assert "DIFERENTES" in result.reason

    def test_sonda_rest_http_401_aborta(self):
        def unauthorized(base_url, service_key, timeout=0):
            return False, "REST respondeu HTTP 401 (chave não pertence a este projeto ou tabela ausente)"

        result = vdt.validate_local_target(local_cfg(), probe=unauthorized)
        assert result.ok is False
        assert "401" in result.reason

    def test_url_do_banco_nao_supabase_aborta(self):
        result = vdt.validate_local_target(
            local_cfg(supabase_url="https://banco-interno.example.com"),
            probe=ok_probe,
        )
        assert result.ok is False
        assert "não é um endpoint Supabase" in result.reason


# ── probe_rest_readonly (não vaza segredo, não escreve) ──────────────────────


class TestProbeRestReadonly:
    def test_nao_escreve_e_usa_header_nao_url(self, monkeypatch):
        captured = {}

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def fake_urlopen(request, timeout=0):
            captured["url"] = request.full_url
            captured["headers"] = dict(request.headers)
            return FakeResponse()

        monkeypatch.setattr(vdt.urllib.request, "urlopen", fake_urlopen)
        ok, why = vdt.probe_rest_readonly("https://x.supabase.co", "service-key-mock")
        assert ok is True
        assert "limit=1" in captured["url"]  # somente leitura
        assert "service-key-mock" not in captured["url"]  # chave nunca na URL
        assert captured["headers"]["Apikey"] == "service-key-mock"

    def test_erro_http_nao_inclui_chave_nem_url_na_mensagem(self, monkeypatch):
        def fake_urlopen(request, timeout=0):
            raise urllib.error.HTTPError("https://x.supabase.co/rest/v1/...", 401, "Unauthorized", {}, None)

        monkeypatch.setattr(vdt.urllib.request, "urlopen", fake_urlopen)
        ok, why = vdt.probe_rest_readonly("https://x.supabase.co", "service-key-mock")
        assert ok is False
        assert "service-key-mock" not in why
        assert "401" in why


# ── validate_remote_app (modo remote: sem seed, sem escrita) ─────────────────


class TestValidateRemoteApp:
    @staticmethod
    def app_fetcher(bundle_ref=STAGING):
        """Fetcher falso: HTML de entrada com um bundle + JS expondo o ref."""

        def fetch(url, timeout=0):
            if url.endswith(".js"):
                return f'var cfg={{url:"https://{bundle_ref}.supabase.co"}}'
            return f'<html><script src="/assets/index-demo.js"></script></html>'

        return fetch

    def test_app_apontando_para_demo_autorizado_passa(self):
        result = vdt.validate_remote_app(
            {
                "base_url": "https://preview-demo.vercel.app",
                "demo_user": "demo",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=self.app_fetcher(),
        )
        assert result.ok is True
        assert result.refs == (STAGING,)

    def test_app_apontando_para_producao_rejeitado(self):
        result = vdt.validate_remote_app(
            {
                "base_url": "https://preview-demo.vercel.app",
                "demo_user": "demo",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=self.app_fetcher(bundle_ref=PROD),
        )
        assert result.ok is False
        assert PROD in result.reason
        assert "FORA da allowlist" in result.reason

    def test_app_sem_nenhum_ref_falha_closed(self):
        def fetch(url, timeout=0):
            return "<html><body>sem supabase</body></html>"

        result = vdt.validate_remote_app(
            {
                "base_url": "https://preview-demo.vercel.app",
                "demo_user": "demo",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=fetch,
        )
        assert result.ok is False
        assert "nenhum ref Supabase" in result.reason

    def test_credenciais_demo_ausentes_falham(self):
        result = vdt.validate_remote_app(
            {
                "base_url": "https://preview-demo.vercel.app",
                "demo_user": "",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=self.app_fetcher(),
        )
        assert result.ok is False
        assert "secret ausente" in result.reason

    def test_base_url_ausente_falha(self):
        result = vdt.validate_remote_app(
            {"base_url": "", "demo_user": "demo", "demo_pass": "x", "allowed_refs": ALLOWED},
            fetcher=self.app_fetcher(),
        )
        assert result.ok is False
        assert "base_url ausente" in result.reason

    @pytest.mark.parametrize(
        "base_url",
        [
            "http://preview-demo.vercel.app",  # não-https
            "http://127.0.0.1:4173",  # loopback
            "http://10.0.0.5",  # privada
            "http://169.254.169.254/latest/meta-data",  # metadata cloud
            "https://user:pass@preview-demo.vercel.app",  # credenciais
            "https://[::1]/",  # loopback IPv6
        ],
    )
    def test_base_url_insegura_rejeitada_antes_de_qualquer_fetch(self, base_url):
        called = []

        def fetch(url, timeout=0):
            called.append(url)
            return ""

        result = vdt.validate_remote_app(
            {
                "base_url": base_url,
                "demo_user": "demo",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=fetch,
        )
        assert result.ok is False
        assert called == []  # nada é buscado quando a URL é insegura

    def test_app_inacessivel_falha_closed(self):
        def fetch(url, timeout=0):
            raise urllib.error.URLError("connection refused")

        result = vdt.validate_remote_app(
            {
                "base_url": "https://preview-demo.vercel.app",
                "demo_user": "demo",
                "demo_pass": "fake-pass",
                "allowed_refs": ALLOWED,
            },
            fetcher=fetch,
        )
        assert result.ok is False
        assert "inacessível" in result.reason


# ── CLI (códigos de saída) ───────────────────────────────────────────────────


class TestMainExitCodes:
    def test_local_valido_retorna_zero(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_SUPABASE_URL", f"https://{STAGING}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_SUPABASE_SERVICE_KEY", "k")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_URL", f"https://{STAGING}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_ANON_KEY", "a")
        monkeypatch.setenv("E2E_DEMO_DEMO_USER", "demo")
        monkeypatch.setenv("E2E_DEMO_DEMO_PASS", "p")
        monkeypatch.setattr(vdt, "probe_rest_readonly", ok_probe)
        assert vdt.main(["--mode", "local", "--allowed-refs", STAGING]) == 0

    def test_local_com_producao_retorna_um(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_SUPABASE_URL", f"https://{PROD}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_SUPABASE_SERVICE_KEY", "k")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_URL", f"https://{PROD}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_ANON_KEY", "a")
        monkeypatch.setenv("E2E_DEMO_DEMO_USER", "demo")
        monkeypatch.setenv("E2E_DEMO_DEMO_PASS", "p")
        assert vdt.main(["--mode", "local", "--allowed-refs", STAGING]) == 1

    def test_allowlist_ausente_retorna_um(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_SUPABASE_URL", f"https://{STAGING}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_SUPABASE_SERVICE_KEY", "k")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_URL", f"https://{STAGING}.supabase.co")
        monkeypatch.setenv("E2E_DEMO_VITE_SUPABASE_ANON_KEY", "a")
        monkeypatch.setenv("E2E_DEMO_DEMO_USER", "demo")
        monkeypatch.setenv("E2E_DEMO_DEMO_PASS", "p")
        # Allowlist vazia (config incompleta) → falha segura, sem sondar.
        assert vdt.main(["--mode", "local", "--allowed-refs", ""]) == 1


# ── Guarda em profundidade dentro do seed ────────────────────────────────────


class TestSeedGuard:
    """`seed_chamados_demo._guard_demo_target` roda ANTES de qualquer acesso
    ao banco no main() e revalida o destino quando a allowlist está definida.
    """

    @pytest.fixture(autouse=True)
    def _import_seed(self):
        import seed_chamados_demo as seed

        self.seed = seed

    def test_destino_demo_autorizado_passa(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_ALLOWED_PROJECT_REFS", STAGING)
        self.seed._guard_demo_target(f"https://{STAGING}.supabase.co")  # não lança

    def test_destino_de_producao_aborta_antes_de_qualquer_escrita(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_ALLOWED_PROJECT_REFS", STAGING)
        with pytest.raises(SystemExit) as excinfo:
            self.seed._guard_demo_target(f"https://{PROD}.supabase.co")
        assert excinfo.value.code == 1

    def test_url_nao_supabase_aborta(self, monkeypatch):
        monkeypatch.setenv("E2E_DEMO_ALLOWED_PROJECT_REFS", STAGING)
        with pytest.raises(SystemExit):
            self.seed._guard_demo_target("https://banco-interno.example.com")

    def test_sem_allowlist_somente_avisa_uso_local(self, monkeypatch, capsys):
        monkeypatch.delenv("E2E_DEMO_ALLOWED_PROJECT_REFS", raising=False)
        self.seed._guard_demo_target(f"https://{PROD}.supabase.co")
        out = capsys.readouterr().out
        assert "INATIVO" in out
        # Uso local sem allowlist não pode vazar erro nem escrever nada aqui.
        assert "ERROR" not in out
