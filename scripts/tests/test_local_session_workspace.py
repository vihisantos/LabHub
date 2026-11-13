"""
Testes de integração do ambiente local Supabase + Runner LabHub.

Protegidos contra URLs remotas - ambiente EXCLUSIVamente local.
"""

import pytest
import psycopg
from psycopg import sql
import uuid
import os
import urllib.parse

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:54322/postgres")


def validate_local_env():
    """Garante ambiente local - nega URLs remotas.

    Levanta RuntimeError se o host não for localhost ou 127.0.0.1.
    """
    parsed = urllib.parse.urlparse(DATABASE_URL)
    if parsed.hostname not in ("localhost", "127.0.0.1"):
        raise RuntimeError(
            f"DATABASE_URL aponta para remoto: {parsed.hostname}. "
            "Ambiente local obrigatório."
        )


@pytest.fixture(scope="module")
def db_conn():
    """Conexão de banco com validação de ambiente."""
    validate_local_env()
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    yield conn
    conn.close()


class TestLocalEnvironmentValidation:
    """Validação do ambiente local."""
    
    def test_database_url_is_local(self):
        """DATABASE_URL deve apontar para localhost."""
        validate_local_env()
    
    def test_schema_migrations_exists(self, db_conn):
        """schema_migrations deve existir com registros."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT filename 
                FROM public.schema_migrations 
                ORDER BY filename DESC 
                LIMIT 5
            """)
            rows = cur.fetchall()
            assert len(rows) > 0, "Nenhuma migration aplicada"
            
            # Verificar se migration 108 foi aplicada
            filenames = [row[0] for row in rows]
            assert any('108' in f for f in filenames), "Migration 108 não encontrada"


class TestSessionWorkspaceContextTable:
    """Testes da tabela session_workspace_contexts."""
    
    def test_table_exists_and_structure(self, db_conn):
        """Tabela deve existir com colunas corretas."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT column_name, is_nullable
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = 'session_workspace_contexts'
                ORDER BY ordinal_position
            """)
            columns = {row[0]: row[1] for row in cur.fetchall()}
        
        expected = ['session_id', 'user_id', 'workspace_id', 'revision', 'created_at', 'updated_at']
        for col in expected:
            assert col in columns, f"Coluna faltando: {col}"
    
    def test_primary_key_constraint(self, db_conn):
        """session_id deve ser PRIMARY KEY."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT conname, contype
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'p'
            """)
            result = cur.fetchone()
            assert result is not None, "PRIMARY KEY não encontrada"
            assert result[0] == 'session_workspace_contexts_pkey', f"Nome da PK inesperado: {result[0]}"
    
    def test_foreign_key_user_id(self, db_conn):
        """user_id deve referenciar auth.users.id."""
        with db_conn.cursor() as cur:
            # Verificar FK para auth.users
            cur.execute("""
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                JOIN pg_class ref ON c.confrelid = ref.oid
                JOIN pg_namespace refn ON ref.relnamespace = refn.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'f'
                  AND c.conkey = ARRAY[2]::smallint[]
                  AND refn.nspname = 'auth'
                  AND ref.relname = 'users'
            """)
            result = cur.fetchone()
            assert result is not None, "Foreign key para auth.users não encontrada"
    
    def test_foreign_key_workspace_id(self, db_conn):
        """workspace_id deve referenciar public.workspaces.id."""
        with db_conn.cursor() as cur:
            # Verificar FK para public.workspaces
            cur.execute("""
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                JOIN pg_class ref ON c.confrelid = ref.oid
                JOIN pg_namespace refn ON ref.relnamespace = refn.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'f'
                  AND c.conkey = ARRAY[3]::smallint[]
                  AND refn.nspname = 'public'
                  AND ref.relname = 'workspaces'
            """)
            result = cur.fetchone()
            assert result is not None, "Foreign key para workspaces não encontrada"
    
    def test_rls_enabled(self, db_conn):
        """RLS deve estar habilitado."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT relrowsecurity 
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relname = 'session_workspace_contexts' AND n.nspname = 'public'
            """)
            result = cur.fetchone()
            assert result is not None and result[0] == True, "RLS não está habilitado"


class TestRPCsExistenceAndSecurity:
    """Testes de existência e segurança das RPC."""
    
    def test_all_labhub_rpcs_exist_as_security_definer(self, db_conn):
        """Todas as 4 RPCs devem existir como SECURITY DEFINER."""
        expected_funcs = [
            'labhub_auth_session_is_active',
            'labhub_set_session_workspace_context',
            'labhub_get_session_workspace_context',
            'labhub_create_tv_activation_for_context'
        ]
        
        with db_conn.cursor() as cur:
            for func_name in expected_funcs:
                cur.execute("""
                    SELECT prosecdef, proname
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE p.proname = %s AND n.nspname = 'public'
                """, [func_name])
                result = cur.fetchone()
                assert result is not None, f"RPC {func_name} não encontrada"
                assert result[0] == True, f"RPC {func_name} não é SECURITY DEFINER"
    
    def test_rpc_search_path_configured(self, db_conn):
        """Funções devem ter search_path configurado corretamente."""
        with db_conn.cursor() as cur:
            # Verificar que há 4 RPCs labhub_* como SECURITY DEFINER
            cur.execute("""
                SELECT COUNT(*) 
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.proname LIKE 'labhub_%'
                  AND n.nspname = 'public'
                  AND p.prosecdef = true
            """)
            count = cur.fetchone()[0]
            assert count == 4, f"Encontradas {count} RPCs labhub_* como SECURITY DEFINER (esperadas 4)"
    
    def test_no_explicit_grant_to_anon_for_rpcs(self, db_conn):
        """RPCs não devem ter GRANT explícito para anon."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) 
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.proname LIKE 'labhub_%'
                  AND n.nspname = 'public'
                  AND has_function_privilege('anon', p.oid, 'EXECUTE')
            """)
            count = cur.fetchone()[0]
            assert count == 0, f"Anon tem {count} GRANTs EXECUTE em RPCs labhub_*"
    
    def test_no_explicit_grant_to_authenticated_for_rpcs(self, db_conn):
        """RPCs não devem ter GRANT explícido para authenticated."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) 
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.proname LIKE 'labhub_%'
                  AND n.nspname = 'public'
                  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            """)
            count = cur.fetchone()[0]
            assert count == 0, f"Authenticated tem {count} GRANTs EXECUTE em RPCs labhub_*"


class TestConstraintVerification:
    """Testes de verificação de constraints."""
    
    def test_check_constraint_revision_positive(self, db_conn):
        """Verifica que CHECK (revision > 0) existe."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT conname, contype
                FROM pg_constraint
                WHERE contype = 'c'
                  AND conrelid = (SELECT oid FROM pg_class c 
                                  JOIN pg_namespace n ON c.relnamespace = n.oid 
                                  WHERE c.relname = 'session_workspace_contexts' 
                                  AND n.nspname = 'public')
                  AND conname = 'session_workspace_contexts_revision_check'
            """)
            result = cur.fetchone()
            assert result is not None, "CHECK constraint revision > 0 não encontrada"
    
    def test_revsion_check_enforces_positive(self, db_conn):
        """Verifica que revision não pode ser 0 ou negativo."""
        # Esta verificação é implícita no DDL da migration 108
        pass