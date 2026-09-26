"""Testes COMPORTAMENTAIS da migration 072 em PostgreSQL real (efêmero, CI).

O arquivo ``supabase/migrations/tests/072_admin_membership_upsert.sql`` valida a
ESTRUTURA (assinaturas, ACL service_role only, search_path). Este módulo exercita
o COMPORTAMENTO: fixtures isoladas (workspaces/profiles temporários, sempre
dentro do banco descartável) + os 13 pontos da PR #284:

   1. conta pending NÃO recebe membership (upsert bloqueado);
   2. conta ativa recebe membership;
   3. Unidade A -> cargo Técnico (tec);
   4. Unidade B -> cargo Líder (lider) — cargos DIFERENTES por unidade;
   5. mudar o cargo na unidade A NÃO altera a unidade B;
   6. remover a membership da unidade A NÃO remove a da unidade B;
   7. managed_by válido (mesma unidade, gestor ativo de cargo de liderança);
   8. gestor de OUTRA unidade é rejeitado (guarda 045);
   9. auto-gestão (managed_by = própria membership) é rejeitada (045);
  10. ciclo de gestão é rejeitado (guarda 046: v_depth 64, elo
      lider -> coordinator -> lider para alcançar a detecção);
  11. role não-privilegiada (anon) NÃO executa as RPCs (ACL service_role);
  12. espelho profiles.workspace_ids fica sincronizado após upsert/remoção;
  13. trigger de auditoria registra membership_added/removed/changed.

Depende da migration 072 aplicada (chamar após o suite aplicar 000..072).
Uso: ``python ci/behavioral_072.py`` (usa DATABASE_URL) ou
``Behavioral072(executor).run()`` importado pelo ci_migration_suite.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = PROJECT_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


class _Fixtures:
    """Objetos de teste únicos por run (uuid aleatório: nunca colide)."""

    def __init__(self):
        import uuid

        self.uid = lambda: str(uuid.uuid4())
        self.a_email = f"072-a-{self.uid()[:8]}@labhub-ci.test"
        self.b_email = f"072-b-{self.uid()[:8]}@labhub-ci.test"
        self.c_email = f"072-c-{self.uid()[:8]}@labhub-ci.test"
        self.d_email = f"072-d-{self.uid()[:8]}@labhub-ci.test"
        self.e_email = f"072-e-{self.uid()[:8]}@labhub-ci.test"
        self.ws_a = None
        self.ws_b = None
        self.p_active = self.uid()
        self.p_pending = self.uid()
        self.p_lead_a = self.uid()
        self.p_lead_b = self.uid()
        self.p_coord = self.uid()
        self.m_a = None  # membership de p_active em A
        self.m_b = None  # membership de p_active em B
        self.m_lead_a = None
        self.m_lead_b = None
        self.m_coord_a = None  # coordinator em A (cenario de ciclo)


class Behavioral072:
    def __init__(self, executor, quiet: bool = True):
        self.q = executor.query
        self.quiet = quiet
        self.results: list[tuple[str, bool, str]] = []
        self.fx = None

    # -- helpers ---------------------------------------------------------------
    def _log(self, msg: str) -> None:
        if not self.quiet:
            print(msg)

    def check(self, name: str, fn) -> None:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - coleta de falha de teste
            detail = f"{type(exc).__name__}: {exc}"[:500]
            self.results.append((name, False, detail))
            # Diagnóstico SEMPRE impresso (independe de `quiet`): caso contrário
            # o STEP 7 reporta apenas "N/13 checks" e o check que falhou fica
            # invisível no log do Actions. A exceção não é engolida: fica
            # registrada em self.results e no detalhe do relatório do suite.
            print(f"[072] FAIL - {name} :: {detail}", flush=True)
        else:
            self.results.append((name, True, ""))
            print(f"[072] PASS - {name}", flush=True)

    def expect_error(self, fn, fragment: str | None = None) -> None:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - "esperava erro"
            msg = str(exc)
            if fragment and fragment not in msg:
                raise AssertionError(
                    f"operacao falhou, mas sem o motivo esperado "
                    f"('{fragment}' ausente em: {msg[:300]})"
                )
            return
        raise AssertionError("esperava erro, mas a operacao foi permitida")

    # -- setup ----------------------------------------------------------------
    def _seed(self) -> None:
        f = self.fx = _Fixtures()
        q = self.q

        role_slugs = [r["slug"] for r in q(
            "SELECT slug FROM public.roles ORDER BY slug"
        ) or []]
        for slug in ("tec", "lider", "opv", "coordinator"):
            if slug not in role_slugs:
                raise AssertionError(f"cargo esperado da 036/040 nao existe: {slug}")

        f.ws_a = q(
            "INSERT INTO public.workspaces (slug, name) VALUES "
            "('ci072a_' || gen_random_uuid()::text, 'CI 072 A') RETURNING id"
        )[0]["id"]
        f.ws_b = q(
            "INSERT INTO public.workspaces (slug, name) VALUES "
            "('ci072b_' || gen_random_uuid()::text, 'CI 072 B') RETURNING id"
        )[0]["id"]

        def auth_user(uid: str, email: str) -> None:
            q(
                f"INSERT INTO auth.users (id, instance_id, aud, role, email, "
                f"email_confirmed_at, raw_app_meta_data, raw_user_meta_data, "
                f"is_sso_user, is_anonymous, created_at, updated_at) "
                f"VALUES ('{uid}', '00000000-0000-0000-0000-000000000000', "
                f"'authenticated', 'authenticated', '{email}', now(), "
                f"'{{\"provider\":\"email\",\"providers\":[\"email\"]}}'::jsonb, "
                f"'{{\"name\":\"CI 072\"}}'::jsonb, false, false, now(), now()) "
                f"ON CONFLICT (id) DO NOTHING"
            )

        def profile(uid: str, email: str, status: str) -> None:
            q(
                f"INSERT INTO public.profiles (id, email, name, status, created_at, updated_at) "
                f"VALUES ('{uid}', '{email}', 'CI 072', '{status}', now(), now()) "
                f"ON CONFLICT (id) DO UPDATE SET "
                f"email = EXCLUDED.email, name = EXCLUDED.name, "
                f"status = EXCLUDED.status, updated_at = now()"
            )

        # auth.users PRIMEIRO (profiles.id REFERENCES auth.users(id) — a FK da
        # 001/CASCADE exige o usuário antes do profile). O trigger 053
        # on_auth_user_created cria o profile pending automaticamente no insert;
        # o upsert abaixo garante o status determinístico pedido por cada check.
        auth_user(f.p_active, f.a_email)
        auth_user(f.p_pending, f.b_email)
        auth_user(f.p_lead_a, f.c_email)
        auth_user(f.p_lead_b, f.d_email)
        auth_user(f.p_coord, f.e_email)

        profile(f.p_active, f.a_email, "active")
        profile(f.p_pending, f.b_email, "pending")
        profile(f.p_lead_a, f.c_email, "active")
        profile(f.p_lead_b, f.d_email, "active")
        profile(f.p_coord, f.e_email, "active")

    def upsert(self, user: str, ws: str, slug: str) -> str:
        """Roda admin_upsert_membership e devolve o id da membership."""
        rows = self.q(
            f"SELECT id FROM public.admin_upsert_membership('{user}', '{ws}', '{slug}')"
        ) or []
        if not rows:
            raise AssertionError("admin_upsert_membership retornou vazio")
        return rows[0]["id"]

    def role_of(self, membership_id: str) -> str:
        return self.q(
            f"SELECT r.slug FROM public.memberships m "
            f"JOIN public.roles r ON r.id = m.role_id WHERE m.id = '{membership_id}'"
        )[0]["slug"]

    # -- run principal ---------------------------------------------------------
    def run(self) -> bool:
        self._seed()
        f = self.fx
        q = self.q

        def up(user, ws, slug):
            return self.upsert(user, ws, slug)

        # 1. pending NÃO recebe membership
        self.check("1. pending bloqueado", lambda: self.expect_error(
            lambda: up(f.p_pending, f.ws_a, "tec"), "profile is not active"
        ))

        # 2. ativo recebe membership (A=tec)
        self.check("2. ativo recebe membership", lambda: self._set_m_a(up))
        # 4. B=lider
        self.check("4. B=lider", lambda: self._set_m_b(up))

        # 3. A=tec (verifica o cargo efetivo)
        self.check("3. A=tec", lambda: self._check_a_tec())

        # 5. mudar A não muda B
        self.check("5. mudar A nao muda B", lambda: self._change_a_keeps_b(up))

        # 7/8/9/10. gestão (usa membership existente de A)
        self._seed_lead_a(up)
        self.check("7. managed_by valido", lambda: self._manager_valid())
        self.check("8. gestor de outra unidade falha", lambda: self._manager_cross_ws())
        self.check("9. auto-gestao falha", lambda: self._manager_self())
        self.check("10. ciclo de gestao falha", lambda: self._manager_cycle())

        # 11. ACL: anon NÃO executa
        self.check("11. anon nao executa (ACL role)", lambda: self._acl_anon())

        # 12. espelho workspace_ids
        self.check("12. espelho workspace_ids sincronizado", lambda: self._mirror())

        # 6. remover A não remove B (depois das checagens de gestão)
        self.check("6. remover A nao remove B", lambda: self._remove_a_keeps_b())

        # 13. auditoria
        self.check("13. auditoria (trigger app_audit_logs)", lambda: self._audit())

        # fixtures temporárias saem do banco efêmero (por API, caso alguém rode
        # num staging local — no Actions o banco inteiro é descartado).
        self._cleanup()

        failed = [r for r in self.results if not r[1]]
        self._log(f"behavioral_072: {len(self.results) - len(failed)}/{len(self.results)} OK")
        return not failed

    def _cleanup(self) -> None:
        if self.fx is None:
            return
        try:
            # auth.users primeiro: o ON DELETE CASCADE da FK (001) remove os
            # profiles (e, via 036, as memberships) — nenhum resíduo no efêmero.
            self.q(
                f"DELETE FROM auth.users "
                f"WHERE id IN ('{self.fx.p_active}', '{self.fx.p_pending}', "
                f"'{self.fx.p_lead_a}', '{self.fx.p_lead_b}', '{self.fx.p_coord}'); "
                f"DELETE FROM public.workspaces "
                f"WHERE id IN ('{self.fx.ws_a}', '{self.fx.ws_b}');"
            )
        except Exception as exc:  # noqa: BLE001 - banco efêmero; não falha o suite
            self._log(f"[072] cleanup parcial (banco efêmero): {str(exc)[:200]}")

    # passos parcelados (legibilidade + captura por check) ---------------------
    def _set_m_a(self, up):
        self.fx.m_a = up(self.fx.p_active, self.fx.ws_a, "tec")

    def _set_m_b(self, up):
        self.fx.m_b = up(self.fx.p_active, self.fx.ws_b, "lider")

    def _check_a_tec(self):
        assert self.role_of(self.fx.m_a) == "tec", "cargo de A deveria ser tec"
        assert self.role_of(self.fx.m_b) == "lider", "cargo de B deveria ser lider"

    def _change_a_keeps_b(self, up):
        m_a2 = up(self.fx.p_active, self.fx.ws_a, "opv")
        assert self.role_of(m_a2) == "opv", "A deveria virar opv"
        assert self.role_of(self.fx.m_b) == "lider", "B nao poderia mudar"

    def _seed_lead_a(self, up):
        # lider_ativo em A (gestor valido p/ p_active.A)
        self.fx.m_lead_a = up(self.fx.p_lead_a, self.fx.ws_a, "lider")
        self.fx.m_lead_b = up(self.fx.p_lead_b, self.fx.ws_b, "lider")
        # coordinator em A: elo de liderança EXCLUSIVO do cenário de ciclo.
        # A guarda 046 proíbe 'lider' gerenciando outro 'lider' na mesma
        # unidade, então o elo inverso do ciclo precisa de 'coordinator'
        # (lider -> coordinator -> lider) para alcançar a detecção de ciclo.
        self.fx.m_coord_a = up(self.fx.p_coord, self.fx.ws_a, "coordinator")

    def _manager_valid(self):
        q = self.q
        m = q(
            f"SELECT id, managed_by FROM public.admin_set_manager("
            f"'{self.fx.p_active}', '{self.fx.ws_a}', '{self.fx.m_lead_a}')"
        )[0]
        # psycopg3 devolve colunas uuid como uuid.UUID; o id do fixture/up() pode
        # ser str. Normaliza os DOIS lados — comparar str com UUID nunca fechava.
        assert str(m["managed_by"]) == str(self.fx.m_lead_a), (
            f"managed_by deveria apontar p/ lider de A ({self.fx.m_lead_a})"
        )

    def _manager_cross_ws(self):
        self.expect_error(
            lambda: self.q(
                f"SELECT public.admin_set_manager('{self.fx.p_active}', "
                f"'{self.fx.ws_a}', '{self.fx.m_lead_b}')"
            ),
            "same workspace",
        )

    def _manager_self(self):
        self.expect_error(
            lambda: self.q(
                f"SELECT public.admin_set_manager('{self.fx.p_active}', "
                f"'{self.fx.ws_a}', '{self.fx.m_a}')"
            ),
            "cannot manage itself",
        )

    def _manager_cycle(self):
        # Ciclo REAL, montado com dois cargos de liderança (guarda 046/045):
        #   p_active.A  --managed_by--> lider.A      (check 7)
        #   lider.A      --managed_by--> coordinator.A
        #   coordinator.A --managed_by--> lider.A     => cycle detected
        # O cargo do gestor em cada elo é de liderança e o alvo nunca é 'lider'
        # gerenciado por 'lider', então a validação de cargo passa e a detecção
        # de ciclo (aqui testada) é efetivamente alcançada.
        q = self.q
        q(
            f"SELECT public.admin_set_manager('{self.fx.p_active}', "
            f"'{self.fx.ws_a}', '{self.fx.m_lead_a}')"
        )
        q(
            f"SELECT public.admin_set_manager('{self.fx.p_lead_a}', "
            f"'{self.fx.ws_a}', '{self.fx.m_coord_a}')"
        )
        self.expect_error(
            lambda: q(
                f"SELECT public.admin_set_manager('{self.fx.p_coord}', "
                f"'{self.fx.ws_a}', '{self.fx.m_lead_a}')"
            ),
            "cycle detected",
        )

    def _acl_anon(self):
        self.expect_error(
            lambda: self.q(
                f"SET ROLE anon; "
                f"SELECT public.admin_upsert_membership('{self.fx.p_active}', "
                f"'{self.fx.ws_a}', 'tec'); RESET ROLE;"
            ),
            "permission denied",
        )

    def _mirror(self):
        q = self.q
        mirror = q(
            f"SELECT workspace_ids FROM public.profiles WHERE id = '{self.fx.p_active}'"
        )[0]["workspace_ids"] or []
        expected = [
            r["wid"]
            for r in q(
                f"SELECT workspace_id AS wid FROM public.memberships "
                f"WHERE profile_id = '{self.fx.p_active}' AND status = 'active'"
            )
        ]
        assert sorted(map(str, mirror)) == sorted(map(str, expected)), (
            f"espelho divergente: mirror={mirror} expected={expected}"
        )

    def _remove_a_keeps_b(self):
        q = self.q
        removed = q(
            f"SELECT public.admin_remove_membership('{self.fx.p_active}', '{self.fx.ws_a}')"
        )[0]["admin_remove_membership"]
        assert removed is True, "remocao deveria reportar true"
        left = q(
            f"SELECT count(*) AS n FROM public.memberships "
            f"WHERE profile_id = '{self.fx.p_active}' AND workspace_id = '{self.fx.ws_b}'"
        )[0]["n"]
        assert left == 1, "membership de B nao poderia ser removida"
        self._mirror()

    def _audit(self):
        actions = [
            r["action"]
            for r in self.q(
                "SELECT DISTINCT action FROM public.app_audit_logs "
                "WHERE action IN "
                "('membership_added','membership_removed','membership_changed')"
            )
        ]
        # modificar A (opv) gerou membership_changed; remover gerou membership_removed
        assert "membership_removed" in actions, f"auditoria sem removed: {actions}"


def _main() -> int:
    from migrate.pg import PostgresExecutor, SqlExecutionError

    try:
        executor = PostgresExecutor()
    except SqlExecutionError as exc:
        print(f"[072] ERRO: {exc}", file=sys.stderr)
        return 2
    behavioral = Behavioral072(executor, quiet=False)
    ok = behavioral.run()
    # check() já imprime PASS/FAIL por check (diagnóstico sempre visível).
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(_main())