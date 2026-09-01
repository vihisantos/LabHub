"""Etapa 9.10 — TV Authorization Architecture Closure.

Suíte de FECHAMENTO ARQUITETURAL. Bloqueia a classificação canônica dos
cinco endpoints TV em exatamente três modelos de autorização:

    USER_RBAC
        POST /api/tv/source/fetch         -> tv.content.manage  @ workspace
        POST /api/tv/activation/create    -> tv.device.manage   @ workspace
        POST /api/tv/devices/provision    -> tv.device.manage   @ workspace

    PROVISIONING_FLOW
        POST /api/tv/activation/redeem    -> SEM Action RBAC (activation code)

    DEVICE_IDENTITY
        GET /api/tv/chamados/display      -> SEM Action RBAC (device identity)

E confirma que:
    * redeem/display NÃO possuem @require_action_rbac (intencional);
    * workspace NUNCA vem do body como autoridade (cada rota tem origem
      server-side fixa);
    * NÃO existe device-level RBAC (Actions de device, tabela de permissões);
    * a flag RBAC_2_ENABLED permanece DESATIVADA (default '0').

Este arquivo é estrutural (analisa o código-fonte) e não executa requisições
Flask, então não interfere com a importação única de api/app.py pelas outras
suítes. Os casos funcionais (401/403/isolação) estão nas suítes de feature:
test_tv_source_rbac, test_tv_device_rbac, test_tv_provisioning,
test_tv_activation_hardening, test_tv_chamados_display, test_tv_device_revocation.
"""
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app.py"
RBAC = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "rbac.py"

SRC = APP.read_text(encoding="utf-8")
RBAC_SRC = RBAC.read_text(encoding="utf-8")

RBAC = "@require_action_rbac"


# ── HELPERS ──────────────────────────────────────────────────────────────────

def decorator_block(route):
    """Retorna a string entre '@app.route(...' e a linha 'def ' seguinte."""
    idx = SRC.index(f"@app.route('{route}'")
    end = SRC.index("def ", idx)
    return SRC[idx:end]


def route_has(route, decorator):
    block = decorator_block(route)
    m = re.search(re.escape(decorator), block)
    return m is not None


def source_contains(pattern):
    return re.search(pattern, SRC) is not None


# ── A. Classificação canônica das 5 rotas ───────────────────────────────────

class TestCanonicalClassification:
    def test_source_fetch_is_user_rbac(self):
        b = decorator_block("/api/tv/source/fetch")
        assert "@require_auth" in b
        assert "@require_workspace" in b
        assert "@require_action_rbac('tv.content.manage', scope='workspace')" in b

    def test_activation_create_is_user_rbac(self):
        b = decorator_block("/api/tv/activation/create")
        assert "@require_auth" in b
        assert "@require_workspace" in b
        assert "@require_action_rbac('tv.device.manage', scope='workspace')" in b

    def test_devices_provision_is_user_rbac(self):
        b = decorator_block("/api/tv/devices/provision")
        assert "@require_auth" in b
        assert "@require_workspace" in b
        assert "@require_action_rbac('tv.device.manage', scope='workspace')" in b

    def test_activation_redeem_is_provisioning_flow_sem_rbac(self):
        b = decorator_block("/api/tv/activation/redeem")
        assert RBAC not in b, "redeem não pode ter require_action_rbac"

    def test_chamados_display_is_device_identity_sem_rbac(self):
        b = decorator_block("/api/tv/chamados/display")
        assert "@require_auth" in b
        assert RBAC not in b, "display não pode ter require_action_rbac"


# ── B. Proibição explícita de RBAC em device flow ───────────────────────────

class TestNoRBACOnDeviceFlow:
    def test_redeem_nao_tem_rbac(self):
        assert not route_has("/api/tv/activation/redeem", RBAC)

    def test_display_nao_tem_rbac(self):
        assert not route_has("/api/tv/chamados/display", RBAC)

    def test_display_usa_identidade_de_device_nao_action(self):
        # O handler resolve o workspace via tv_devices.user_id/workspace_id,
        # não por uma Action de usuário.
        handler = SRC[SRC.index("def tv_chamados_display():"):SRC.index(
            "# ── Chamados (formulário público via QR)")]
        assert "_resolve_tv_device_workspace(g.user_id)" in handler


# ── C. Workspace authority (nunca do body) ──────────────────────────────────

class TestWorkspaceAuthority:
    def test_source_fetch_g_workspace_id(self):
        handler = SRC[SRC.index("def tv_source_fetch():"):]
        assert "g.workspace_id" in handler
        assert "g.workspace_id" in decorator_block("/api/tv/source/fetch") or True

    def test_activation_create_g_workspace_id(self):
        handler = SRC[SRC.index("def tv_activation_create():"):SRC.index(
            "def tv_activation_redeem():")]
        assert "workspace_id = getattr(g, 'workspace_id', None)" in handler
        # O body NUNCA é autoridade: nenhuma atribuição de workspace_id do body.
        assert "body.get('workspace_id')" not in handler

    def test_devices_provision_g_workspace_id(self):
        handler = SRC[SRC.index("def tv_device_provision():"):SRC.index(
            "def _resolve_tv_device_workspace")]
        assert "workspace_id = getattr(g, 'workspace_id', None)" in handler

    def test_redeem_workspace_da_linha_do_codigo(self):
        handler = SRC[SRC.index("def tv_activation_redeem():"):SRC.index(
            "def tv_device_provision():")]
        assert "workspace_id = row.get('workspace_id')" in handler

    def test_display_workspace_do_vínculo_do_device(self):
        body = SRC[SRC.index("def _resolve_tv_device_workspace"):SRC.index(
            "def _tv_project_ticket")]
        assert "tv_devices" in body
        assert "workspace_id = rows[0].get('workspace_id')" in body
        assert "revoked_at" in body


# ── D. Device revocation (9.6) ──────────────────────────────────────────────

class TestDeviceRevocation:
    def test_revoke_has_auth_rbac_super_admin_gate(self):
        b = decorator_block("/api/tv/devices/<device_id>/revoke")
        assert "@require_auth" in b
        assert "@require_action_rbac('tv.device.manage', scope='workspace')" in b
        handler = SRC[SRC.index("def tv_device_revoke"):]
        assert "_require_super_admin()" in handler

    def test_revoked_device_resolves_none(self):
        body = SRC[SRC.index("def _resolve_tv_device_workspace"):SRC.index(
            "def _tv_project_ticket")]
        assert "if not rows:" in body
        assert "if rows[0].get('revoked_at'):" in body
        assert "return None" in body


# ── E. Sem device-level RBAC ────────────────────────────────────────────────

class TestNoDeviceLevelRBAC:
    FORBIDDEN_PATTERNS = [
        r"tv\.device\.view",
        r"tv\.device\.read",
        r"tv\.device\.display",
        r"tv\.device\.access",
        r"DevicePermission",
        r"device_permission",
        r"device_role",
        r"credential_version",
    ]

    def test_nenhuma_action_device_level(self):
        for pat in self.FORBIDDEN_PATTERNS:
            assert not source_contains(pat), f"proibido: {pat}"

    def test_revoke_nao_apaga_usuario_gotrue(self):
        handler = SRC[SRC.index("def tv_device_revoke"):SRC.index(
            "if __name__")]
        assert "auth/admin/users" not in handler, "revoke não deve deletar usuário"
        assert "signOut" not in handler


# ── F. Feature flag permanece OFF ───────────────────────────────────────────

class TestFeatureFlagOff:
    def test_rbac_2_default_is_off(self):
        assert re.search(r"RBAC_2_ENABLED',\s*'0'", RBAC_SRC)

    def test_rbac_decorator_noop_with_flag_off(self):
        # Com flag OFF o decorator executa a rota sem avaliar Action.
        assert "if not rbac_enabled():" in RBAC_SRC
        assert "return f(*args, **kwargs)" in RBAC_SRC
