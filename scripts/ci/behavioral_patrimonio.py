"""Testes COMPORTAMENTAIS do Patrimônio (091–095) em PostgreSQL real (efêmero, CI).

Complementa os testes estáticos de `api/tests/test_091..095_*.py` e os checks
SQL de `supabase/migrations/tests/091..095_*.sql`: aqui o banco de verdade
aplica as migrations da cadeia (`--from-scratch`) e este módulo exercita a
MATRIZ DE ACESSO AJUSTADA da PR-1 com sessões autenticadas simuladas
(`SET ROLE authenticated` + `request.jwt.claims` — o mesmo contrato que o
PostgREST usa com `auth.uid()`):

   A. técnico de TI autorizado executa as operações permitidas
      (local, responsável, ativo + histórico automático, movimentação atômica,
      empréstimo/devolução, edição de campos frios);
   B. coordenador multiunidade CONSULTA ativos e histórico da unidade;
   C. coordenador NÃO escreve (ativo, movimento, local, responsável, ativo);
   D. coordenador NÃO vê unidades fora do escopo;
   E/F. vis e sem-membership: zero linhas E escrita bloqueada — a ausência do
      ícone no launcher não é a única barreira;
   G. bypasses diretos falham: campo quente via UPDATE (pg_trigger_depth),
      workspace_id mutável, `criacao` forjado, movimento cross-workspace,
      empréstimo duplo, devolução sem empréstimo, ativo baixado (terminal),
      UPDATE/DELETE de histórico, anon;
   H. superadmin preserva o comportamento global (bypass de leitura/escrita
      nas policies, sem poder reescrever histórico).

Depende da cadeia 000..095 aplicada (rode após o suite from-scratch).
Uso: ``python ci/behavioral_patrimonio.py`` (usa DATABASE_URL) ou
``BehavioralPatrimonio(executor).run()`` importado pelo ci_migration_suite.
"""
from __future__ import annotations

import json
import uuid


class _Fixtures:
    def __init__(self):
        self.uid = lambda: str(uuid.uuid4())
        self.ws_a = None
        self.ws_b = None
        self.p_tec = self.uid()
        self.p_coord = self.uid()
        self.p_vis = self.uid()
        self.p_none = self.uid()
        self.p_super = self.uid()
        self.loc_a = None
        self.resp_a = None
        self.asset_a = None
        self.asset_b = None


class BehavioralPatrimonio:
    def __init__(self, executor, quiet: bool = True):
        self.q = executor.query
        self.quiet = quiet
        self.results: list[tuple[str, bool, str]] = []
        self.fx = None

    # -- infraestrutura (mesma interface do behavioral_072) --------------------
    def _log(self, msg: str) -> None:
        if not self.quiet:
            print(msg)

    def check(self, name: str, fn) -> None:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 - coleta de falha de teste
            detail = f"{type(exc).__name__}: {exc}"[:500]
            self.results.append((name, False, detail))
            print(f"[patrimonio] FAIL - {name} :: {detail}", flush=True)
        else:
            self.results.append((name, True, ""))
            print(f"[patrimonio] PASS - {name}", flush=True)

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

    def _as(self, profile_id: str, sql: str):
        """Executa `sql` como uma sessão autenticada do perfil informado.

        Uma ÚNICA chamada ao executor: a conexão é nova por chamada
        (autocommit), então role + claims vivem e morrem dentro do script.
        """
        claims = json.dumps({"sub": profile_id}).replace("'", "''")
        return self.q(
            f"SELECT set_config('request.jwt.claims', '{claims}', false); "
            f"SET ROLE authenticated; "
            f"{sql} "
            f"RESET ROLE; "
            f"SELECT set_config('request.jwt.claims', '', false);"
        )

    # -- fixtures ---------------------------------------------------------------
    def _seed(self) -> None:
        f = self.fx = _Fixtures()
        q = self.q

        role_slugs = [r["slug"] for r in q("SELECT slug FROM public.roles ORDER BY slug") or []]
        for slug in ("tec", "vis", "coordinator"):
            if slug not in role_slugs:
                raise AssertionError(f"cargo esperado do RBAC 2.0 nao existe: {slug}")

        f.ws_a = q(
            "INSERT INTO public.workspaces (slug, name) VALUES "
            "('ci091a_' || gen_random_uuid()::text, 'CI 091 A') RETURNING id"
        )[0]["id"]
        f.ws_b = q(
            "INSERT INTO public.workspaces (slug, name) VALUES "
            "('ci091b_' || gen_random_uuid()::text, 'CI 091 B') RETURNING id"
        )[0]["id"]

        def auth_user(uid: str, email: str) -> None:
            q(
                f"INSERT INTO auth.users (id, instance_id, aud, role, email, "
                f"email_confirmed_at, raw_app_meta_data, raw_user_meta_data, "
                f"is_sso_user, is_anonymous, created_at, updated_at) "
                f"VALUES ('{uid}', '00000000-0000-0000-0000-000000000000', "
                f"'authenticated', 'authenticated', '{email}', now(), "
                f"'{{\"provider\":\"email\",\"providers\":[\"email\"]}}'::jsonb, "
                f"'{{\"name\":\"CI 091\"}}'::jsonb, false, false, now(), now()) "
                f"ON CONFLICT (id) DO NOTHING"
            )

        def profile(uid: str, email: str, super_admin: bool = False) -> None:
            q(
                f"INSERT INTO public.profiles (id, email, name, status, is_super_admin, created_at, updated_at) "
                f"VALUES ('{uid}', '{email}', 'CI 091', 'active', {str(super_admin).lower()}, now(), now()) "
                f"ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now()"
            )

        for pid, suffix in (
            (f.p_tec, "tec"), (f.p_coord, "coord"), (f.p_vis, "vis"),
            (f.p_none, "none"), (f.p_super, "super"),
        ):
            auth_user(pid, f"091-{suffix}-{pid[:8]}@labhub-ci.test")
        profile(f.p_tec, f"091-tec-{f.p_tec[:8]}@labhub-ci.test")
        profile(f.p_coord, f"091-coord-{f.p_coord[:8]}@labhub-ci.test")
        profile(f.p_vis, f"091-vis-{f.p_vis[:8]}@labhub-ci.test")
        profile(f.p_none, f"091-none-{f.p_none[:8]}@labhub-ci.test")
        profile(f.p_super, f"091-super-{f.p_super[:8]}@labhub-ci.test", super_admin=True)

        # memberships pela RPC oficial (052/072): tec/vis/coordinator em A
        q(f"SELECT public.admin_upsert_membership('{f.p_tec}', '{f.ws_a}', 'tec')")
        q(f"SELECT public.admin_upsert_membership('{f.p_coord}', '{f.ws_a}', 'coordinator')")
        q(f"SELECT public.admin_upsert_membership('{f.p_vis}', '{f.ws_a}', 'vis')")

    # -- cenários ----------------------------------------------------------------
    def _tec_operacoes(self):
        f = self.fx

        # local + responsável institucional (sem conta)
        f.loc_a = self._as(f.p_tec, (
            "INSERT INTO public.patrimonio_locations (workspace_id, predio, andar, nome, complemento) "
            f"VALUES ('{f.ws_a}', 'Bloco Industrial', 'Terreo', 'Lab de Redes', 'rack B-12') RETURNING id"
        ))[0]["id"]
        f.resp_a = self._as(f.p_tec, (
            "INSERT INTO public.patrimonio_responsibles (workspace_id, nome, matricula, email) "
            f"VALUES ('{f.ws_a}', 'Maria Institucional', 'MAT-001', 'maria.inst@test.invalid') RETURNING id"
        ))[0]["id"]

        # ativo: INSERT gera histórico `criacao` automaticamente
        f.asset_a = self._as(f.p_tec, (
            "INSERT INTO public.assets (workspace_id, asset_tag, serial_number, equipment_type, "
            "name, location_id, responsible_id, status, condition, metadata) "
            f"VALUES ('{f.ws_a}', 'PAT-0001', 'SN-XYZ', 'Notebook', 'Notebook CI', "
            f"'{f.loc_a}', '{f.resp_a}', 'disponivel', 'novo', "
            "'{}'::jsonb) RETURNING id"
        ))[0]["id"]
        criacao = self.q(
            f"SELECT type, to_location_id, to_responsible_id, to_status FROM public.asset_movements "
            f"WHERE asset_id = '{f.asset_a}' AND type = 'criacao'"
        )
        assert len(criacao) == 1, "INSERT em assets deve gerar movimento criacao automaticamente"
        assert criacao[0]["to_status"] == "disponivel"
        assert criacao[0]["to_responsible_nome"] == "Maria Institucional", "snapshot do responsável ausente"

        # movimentação atômica: transferência com status
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_location_id, to_status) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'transferencia', '{f.loc_a}', 'em_transito')"
        ))
        asset = self.q(f"SELECT location_id, status FROM public.assets WHERE id = '{f.asset_a}'")[0]
        assert asset["status"] == "em_transito" and str(asset["location_id"]) == f.loc_a

        # campos frios editáveis por asset.edit
        self._as(f.p_tec, f"UPDATE public.assets SET name = 'Notebook CI (renomeado)' WHERE id = '{f.asset_a}'")

        # empréstimo + devolução (ciclo completo, sem estados contraditórios)
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_responsible_id, expected_return_at) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'emprestimo', '{f.resp_a}', now() + interval '7 days')"
        ))
        assert self.q(f"SELECT status FROM public.assets WHERE id = '{f.asset_a}'")[0]["status"] == "emprestado"
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'devolucao')"
        ))
        asset = self.q(f"SELECT status, responsible_id FROM public.assets WHERE id = '{f.asset_a}'")[0]
        assert asset["status"] == "disponivel" and asset["responsible_id"] is None, (
            "devolução deve limpar o responsável"
        )

    def _coord_le(self):
        f = self.fx
        rows = self._as(f.p_coord, f"SELECT id FROM public.assets WHERE workspace_id = '{f.ws_a}'")
        assert len(rows) == 1, "coordenador deve consultar a própria unidade"
        self._as(f.p_coord, f"SELECT id FROM public.asset_movements WHERE workspace_id = '{f.ws_a}'")
        self._as(f.p_coord, f"SELECT id FROM public.patrimonio_locations WHERE workspace_id = '{f.ws_a}'")
        self._as(f.p_coord, f"SELECT id FROM public.patrimonio_responsibles WHERE workspace_id = '{f.ws_a}'")

    def _coord_nao_escreve(self):
        f = self.fx

        def rls(table: str) -> str:
            # mensagem genérica do Postgres quando a WITH CHECK/USING da policy nega
            return f'row-level security policy for table "{table}"'

        self.expect_error(
            lambda: self._as(f.p_coord, (
                "INSERT INTO public.assets (workspace_id, equipment_type, name) "
                f"VALUES ('{f.ws_a}', 'Monitor', 'x')")),
            rls("assets"),
        )
        self.expect_error(
            lambda: self._as(f.p_coord, (
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_status) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'manutencao', 'manutencao')")),
            rls("asset_movements"),
        )
        self.expect_error(
            lambda: self._as(f.p_coord, (
                "INSERT INTO public.patrimonio_locations (workspace_id, nome) "
                f"VALUES ('{f.ws_a}', 'x')")),
            rls("patrimonio_locations"),
        )
        self.expect_error(
            lambda: self._as(f.p_coord, (
                "INSERT INTO public.patrimonio_responsibles (workspace_id, nome) "
                f"VALUES ('{f.ws_a}', 'x')")),
            rls("patrimonio_responsibles"),
        )
        # UPDATE sem a Action não é erro: a linha fica INVISÍVEL (0 linhas alteradas)
        expected_name = self.q(f"SELECT name FROM public.assets WHERE id = '{f.asset_a}'")[0]["name"]
        self._as(f.p_coord, f"UPDATE public.assets SET name = 'hack' WHERE id = '{f.asset_a}'")
        after = self.q(f"SELECT name FROM public.assets WHERE id = '{f.asset_a}'")[0]["name"]
        assert after == expected_name, "coordenador não pode alterar o ativo"

    def _coord_escopo(self):
        f = self.fx
        rows = self._as(f.p_coord, f"SELECT id FROM public.assets WHERE workspace_id = '{f.ws_b}'")
        assert rows == [], "coordenador não pode consultar unidade fora do escopo"

    def _sem_acesso_zero_dados(self):
        f = self.fx
        for pid in (f.p_vis, f.p_none):
            rows = self._as(pid, f"SELECT id FROM public.assets WHERE workspace_id = '{f.ws_a}'")
            assert rows == [], "sem patrimonio.view, leitura de dado patrimonial deve ser vazia"
            self.expect_error(
                lambda pid=pid: self._as(pid, (
                    "INSERT INTO public.assets (workspace_id, equipment_type, name) "
                    f"VALUES ('{f.ws_a}', 'Monitor', 'x')")),
                'row-level security policy for table "assets"',
            )

    def _bypasses_bloqueados(self):
        f = self.fx

        # campo quente via UPDATE direto (guarda pg_trigger_depth)
        self.expect_error(
            lambda: self._as(f.p_tec, f"UPDATE public.assets SET status = 'baixado' WHERE id = '{f.asset_a}'"),
            "asset_movements",
        )
        # workspace do ativo é imutável
        self.expect_error(
            lambda: self.q(f"UPDATE public.assets SET workspace_id = '{f.ws_b}' WHERE id = '{f.asset_a}'"),
            "imutavel",
        )
        # criacao forjada
        self.expect_error(
            lambda: self._as(f.p_tec, (
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'criacao')")),
            "gerado automaticamente",
        )
        # movimento cross-workspace (local de B para ativo de A)
        loc_b = self.q(
            "INSERT INTO public.patrimonio_locations (workspace_id, nome) "
            f"VALUES ('{f.ws_b}', 'Lab B') RETURNING id"
        )[0]["id"]
        self.expect_error(
            lambda: self._as(f.p_tec, (
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_location_id, to_status) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'transferencia', '{loc_b}', 'em_transito')")),
            "outra unidade",
        )
        # empréstimo duplo / devolução sem empréstimo
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_responsible_id, expected_return_at) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'emprestimo', '{f.resp_a}', now() + interval '7 days')"
        ))
        self.expect_error(
            lambda: self._as(f.p_tec, (
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_responsible_id, expected_return_at) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'emprestimo', '{f.resp_a}', now() + interval '7 days')")),
            "ja esta emprestado",
        )
        self.expect_error(
            lambda: self.q(
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'devolucao')"
            ),
            "sem emprestimo ativo",
        )
        # devolução legítima fecha o ciclo (estado limpo para os próximos checks)
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'devolucao')"
        ))
        # ativo baixado é terminal
        self._as(f.p_tec, (
            f"INSERT INTO public.asset_movements (workspace_id, asset_id, type) "
            f"VALUES ('{f.ws_a}', '{f.asset_a}', 'baixa')"
        ))
        self.expect_error(
            lambda: self._as(f.p_tec, (
                f"INSERT INTO public.asset_movements (workspace_id, asset_id, type, to_status) "
                f"VALUES ('{f.ws_a}', '{f.asset_a}', 'inventario', 'nao_localizado')")),
            "terminal",
        )
        # histórico append-only: nem tec nem postgres-owner-role do app reescreve
        self.expect_error(
            lambda: self._as(f.p_tec, (
                f"UPDATE public.asset_movements SET note = 'rewrite' WHERE asset_id = '{f.asset_a}'")),
            "permission denied",
        )
        # anon sem nada
        self.expect_error(
            lambda: self.q("SET ROLE anon; SELECT id FROM public.assets LIMIT 1; RESET ROLE"),
            "permission denied",
        )
        # local em uso não pode ser apagado (RESTRICT fecha bypass via FK)
        self.expect_error(
            lambda: self.q(f"DELETE FROM public.patrimonio_locations WHERE id = '{f.loc_a}'"),
            "violates foreign key",
        )

    def _superadmin_global(self):
        f = self.fx
        # leitura sem membership (bypass global existente nas policies)
        rows = self._as(f.p_super, f"SELECT id FROM public.assets WHERE workspace_id = '{f.ws_b}'")
        assert isinstance(rows, list), "super admin lê qualquer unidade"
        # escreve sem Actions (bypass nas policies)...
        self._as(f.p_super, (
            "INSERT INTO public.assets (workspace_id, equipment_type, name, status) "
            f"VALUES ('{f.ws_b}', 'Monitor', 'Super 1', 'disponivel')"
        ))
        # ...mas NÃO reescreve histórico (append-only sem grant, nem para super)
        self.expect_error(
            lambda: self._as(f.p_super, "UPDATE public.asset_movements SET note = 'x' WHERE true"),
            "permission denied",
        )
        self.expect_error(
            lambda: self._as(f.p_super, "DELETE FROM public.asset_movements WHERE true"),
            "permission denied",
        )

    # -- run principal -----------------------------------------------------------
    def run(self) -> bool:
        self._seed()
        f = self.fx
        q = self.q

        # ativo na unidade B (para o check de escopo do coordenador)
        f.asset_b = q(
            "INSERT INTO public.assets (workspace_id, equipment_type, name, status) "
            f"VALUES ('{f.ws_b}', 'Projetor', 'Projetor B', 'disponivel') RETURNING id"
        )[0]["id"]

        self.check("A. tec executa operações (local, responsável, ativo+movement, edição, ciclo)", self._tec_operacoes)
        self.check("B. coordinator consulta ativos/histórico/locais/responsáveis da unidade", self._coord_le)
        self.check("C. coordinator não escreve (ativo, movimento, local, responsável)", self._coord_nao_escreve)
        self.check("D. coordinator não vê unidade fora do escopo", self._coord_escopo)
        self.check("E/F. vis e sem-membership: zero dados e escrita bloqueada", self._sem_acesso_zero_dados)
        self.check("G. bypasses diretos bloqueados (guarda, workspace, criacao, cross-ws, ciclo, append-only, anon)", self._bypasses_bloqueados)
        self.check("H. superadmin preserva mecanismo global (lê/escreve, não reescreve histórico)", self._superadmin_global)

        passed = len([r for r in self.results if r[1]])
        total = len(self.results)
        self._log(f"[patrimonio] resumo: {passed}/{total} checks")
        return passed == total


def main() -> int:
    from migrate.pg import PostgresExecutor

    behavioral = BehavioralPatrimonio(PostgresExecutor(), quiet=False)
    ok = behavioral.run()
    for name, passed, detail in behavioral.results:
        if not passed:
            print(f"FAIL {name} :: {detail}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
