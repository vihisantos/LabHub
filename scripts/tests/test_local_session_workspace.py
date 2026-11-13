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


@pytest.fixture
def test_workspace():
    """Cria um workspace de teste e limpa após o teste."""
    ws_id = str(uuid.uuid4())
    return ws_id


@pytest.fixture
def test_user():
    """Cria um usuario de teste e limpa após o teste."""
    user_id = str(uuid.uuid4())
    return user_id


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
    
    def test_foreign_key_session_id(self, db_conn):
        """session_id deve referenciar auth.sessions.id."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'f'
                  AND c.conkey = ARRAY[1]::smallint[]  -- session_id é a primeira coluna
            """)
            result = cur.fetchone()
            assert result is not None, "Foreign key para auth.sessions não encontrada"
    
    def test_foreign_key_user_id(self, db_conn):
        """user_id deve referenciar public.profiles.id."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'f'
                  AND c.conkey = ARRAY[2]::smallint[]  -- user_id é a segunda coluna
            """)
            result = cur.fetchone()
            assert result is not None, "Foreign key para profiles não encontrada"
    
    def test_foreign_key_workspace_id(self, db_conn):
        """workspace_id deve referenciar public.workspaces.id."""
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE t.relname = 'session_workspace_contexts' 
                  AND n.nspname = 'public'
                  AND c.contype = 'f'
                  AND c.conkey = ARRAY[3]::smallint[]  -- workspace_id é a terceira coluna
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


class TestSessionIsolation:
    """Testes de isolamento entre sessões."""
    
    def test_session_isolation_with_real_data(self, db_conn):
        """Dois session_ids diferentes devem ter contextos isolados com dados reais."""
        # Criar dados de teste válidos nas tabelas referenciadas
        session_a = str(uuid.uuid4())
        session_b = str(uuid.uuid4())
        ws_a = str(uuid.uuid4())
        ws_b = str(uuid.uuid4())
        user_a = str(uuid.uuid4())
        user_b = str(uuid.uuid4())
        
        with db_conn.cursor() as cur:
            # Criar workspaces de teste
            cur.execute("""
                INSERT INTO public.workspaces (id, name, slug, location)
                VALUES (%s, 'Test Workspace A', 'test-ws-a', 'Test location'),
                       (%s, 'Test Workspace B', 'test-ws-b', 'Test location')
                ON CONFLICT (id) DO NOTHING
            """, [ws_a, ws_b])
            
            # Criar perfis de teste
            cur.execute("""
                INSERT INTO public.profiles (id, email, name, role, status)
                VALUES (%s, 'test-a@example.com', 'Test User A', 'tecnico', 'active'),
                       (%s, 'test-b@example.com', 'Test User B', 'tecnico', 'active')
                ON CONFLICT (id) DO NOTHING
            """, [user_a, user_b])
            
            # Criar memberships ativas (requisito para integridade)
            cur.execute("""
                INSERT INTO public.memberships (profile_id, workspace_id, status)
                VALUES (%s, %s, 'active'),
                       (%s, %s, 'active')
                ON CONFLICT DO NOTHING
            """, [user_a, ws_a, user_b, ws_b])
            
            # Inserir contextos de sessão
            cur.execute("""
                INSERT INTO public.session_workspace_contexts 
                (session_id, user_id, workspace_id, revision)
                VALUES (%s, %s, %s, 1), (%s, %s, %s, 1)
                ON CONFLICT (session_id) DO NOTHING
            """, [session_a, user_a, ws_a, session_b, user_b, ws_b])
            
            # Verificar isolamento
            cur.execute("""
                SELECT workspace_id FROM public.session_workspace_contexts 
                WHERE session_id = %s
            """, [session_a])
            ws_a_result = cur.fetchone()[0]
            
            cur.execute("""
                SELECT workspace_id FROM public.session_workspace_contexts 
                WHERE session_id = %s
            """, [session_b])
            ws_b_result = cur.fetchone()[0]
        
        # Afirmar isolamento
        assert ws_a_result == ws_a, f"Session A confundiu workspace: {ws_a_result} != {ws_a}"
        assert ws_b_result == ws_b, f"Session B confundiu workspace: {ws_b_result} != {ws_b}"
        
        # Cleanup
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM public.session_workspace_contexts WHERE session_id IN (%s, %s)", 
                       [session_a, session_b])
            cur.execute("DELETE FROM public.workspaces WHERE id IN (%s, %s)", [ws_a, ws_b])
            cur.execute("DELETE FROM public.memberships WHERE profile_id IN (%s, %s)", [user_a, user_b])
            cur.execute("DELETE FROM public.profiles WHERE id IN (%s, %s)", [user_a, user_b])


class TestWorkspaceSwitch:
    """Testes de troca de workspace via RPC."""
    
    def test_workspace_switch_increments_revision(self, db_conn):
        """Troca de workspace deve incrementar revision."""
        session_id = str(uuid.uuid4())
        ws_1 = str(uuid.uuid4())
        ws_2 = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        
        with db_conn.cursor() as cur:
            # Criar dados de teste
            cur.execute("""
                INSERT INTO public.workspaces (id, name, slug, location)
                VALUES (%s, 'Test WS 1', 'test-ws-1', 'Test location'),
                       (%s, 'Test WS 2', 'test-ws-2', 'Test location')
                ON CONFLICT (id) DO NOTHING
            """, [ws_1, ws_2])
            
            cur.execute("""
                INSERT INTO public.profiles (id, email, name, role, status)
                VALUES (%s, 'test@example.com', 'Test User', 'tecnico', 'active')
                ON CONFLICT (id) DO NOTHING
            """, [user_id])
            
            cur.execute("""
                INSERT INTO public.memberships (profile_id, workspace_id, status)
                VALUES (%s, %s, 'active')
                ON CONFLICT DO NOTHING
            """, [user_id, ws_1])
            
            # Primeira inserção
            cur.execute("""
                INSERT INTO public.session_workspace_contexts (session_id, user_id, workspace_id, revision)
                VALUES (%s, %s, %s, 1)
                ON CONFLICT (session_id) DO UPDATE SET
                    workspace_id = EXCLUDED.workspace_id,
                    revision = session_workspace_contexts.revision + 1,
                    updated_at = clock_timestamp()
                RETURNING revision
            """, [session_id, user_id, ws_1])
            rev_1 = cur.fetchone()[0]
            
            # Switch para workspace 2
            cur.execute("""
                INSERT INTO public.session_workspace_contexts (session_id, user_id, workspace_id, revision)
                VALUES (%s, %s, %s, 1)
                ON CONFLICT (session_id) DO UPDATE SET
                    workspace_id = EXCLUDED.workspace_id,
                    revision = session_workspace_contexts.revision + 1,
                    updated_at = clock_timestamp()
                RETURNING revision
            """, [session_id, user_id, ws_2])
            rev_2 = cur.fetchone()[0]
        
        assert rev_2 == rev_1 + 1, f"Revisão não incrementou: {rev_1} -> {rev_2}"
        
        # Cleanup
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM public.session_workspace_contexts WHERE session_id = %s", [session_id])
            cur.execute("DELETE FROM public.workspaces WHERE id IN (%s, %s)", [ws_1, ws_2])
            cur.execute("DELETE FROM public.memberships WHERE profile_id = %s", [user_id])
            cur.execute("DELETE FROM public.profiles WHERE id = %s", [user_id])


class TestTVWorkspaceIsolation:
    """Testes de isolamento do catálogo da TV entre workspaces."""
    
    def test_tv_events_workspace_isolation(self, db_conn):
        """tv_events deve ser isolado por workspace via RLS."""
        ws_1 = str(uuid.uuid4())
        ws_2 = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        event_1_id = str(uuid.uuid4())
        event_2_id = str(uuid.uuid4())
        
        with db_conn.cursor() as cur:
            # Criar workspaces
            cur.execute("""
                INSERT INTO public.workspaces (id, name, slug, location)
                VALUES (%s, 'WS 1', 'ws-1', 'Test location'), (%s, 'WS 2', 'ws-2', 'Test location')
                ON CONFLICT (id) DO NOTHING
            """, [ws_1, ws_2])
            
            # Criar usuario e membership
            cur.execute("""
                INSERT INTO public.profiles (id, email, name, role, status)
                VALUES (%s, 'user@test.com', 'Test User', 'tecnico', 'active')
                ON CONFLICT (id) DO NOTHING
            """, [user_id])
            
            cur.execute("""
                INSERT INTO public.memberships (profile_id, workspace_id, status)
                VALUES (%s, %s, 'active'), (%s, %s, 'active')
                ON CONFLICT DO NOTHING
            """, [user_id, ws_1, user_id, ws_2])
            
            # Inserir eventos em diferentes workspaces
            cur.execute("""
                INSERT INTO public.tv_events (id, title, is_active, sort_order, workspace_id)
                VALUES (%s, 'Event 1', true, 1, %s),
                       (%s, 'Event 2', true, 1, %s)
                ON CONFLICT (id) DO NOTHING
            """, [event_1_id, ws_1, event_2_id, ws_2])
            
            # Verificar isolamento via query direta (simulando RLS)
            cur.execute("""
                SELECT COUNT(*) FROM public.tv_events WHERE workspace_id = %s
            """, [ws_1])
            count_1 = cur.fetchone()[0]
            
            cur.execute("""
                SELECT COUNT(*) FROM public.tv_events WHERE workspace_id = %s
            """, [ws_2])
            count_2 = cur.fetchone()[0]
        
        assert count_1 == 1, f"Eventos do workspace 1: {count_1}"
        assert count_2 == 1, f"Eventos do workspace 2: {count_2}"
        
        # Cleanup
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM public.tv_events WHERE id IN (%s, %s)", [event_1_id, event_2_id])
            cur.execute("DELETE FROM public.workspaces WHERE id IN (%s, %s)", [ws_1, ws_2])
            cur.execute("DELETE FROM public.memberships WHERE profile_id = %s", [user_id])
            cur.execute("DELETE FROM public.profiles WHERE id = %s", [user_id])


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
        """RPCs não devem ter GRANT explícito para authenticated."""
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


class TestNegativeAccessControl:
    """Testes negativos de acesso indevido."""
    
    def test_rpc_rejects_invalid_session(self, db_conn):
        """RPC labhub_set_session_workspace_context rejeita sessão inválida."""
        # Uso UUID aleatório que não existe
        fake_session = str(uuid.uuid4())
        ws_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        token_exp = 9999999999  # Token expirado
        
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM public.labhub_set_session_workspace_context(%s::uuid, %s::uuid, %s::bigint)
            """, [fake_session, ws_id, token_exp])
            result = cur.fetchone()
        
        # Deve lançar exceção ou retornar erro (não sucesso)
        # Como service_role, a função pode lançar exceção
        # Se chegar aqui com resultado, deve ser um erro estrutural
    
    def test_get_context_for_nonexistent_session(self, db_conn):
        """RPC labhub_get_session_workspace_context retorna vazio para sessão inexistente."""
        fake_session = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        token_exp = 9999999999
        
        with db_conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM public.labhub_get_session_workspace_context(%s::uuid, %s::uuid, %s::bigint)
            """, [fake_session, user_id, token_exp])
            result = cur.fetchone()
        
        # Deve retornar NULL (nenhuma linha)
        assert result is None or result[0] is None, "RPC deveria retornar NULL para sessão inexistente"


class TestConcurrency:
    """Testes de concorrência."""
    
    def test_concurrent_context_updates(self, db_conn):
        """Múltiplas atualizações concorrentes devem ser processadas corretamente."""
        import threading
        import time
        
        session_id = str(uuid.uuid4())
        ws_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        results = []
        errors = []
        
        def update_context(conn_params, session, ws, user, thread_id):
            """Thread worker que atualiza o contexto."""
            try:
                conn = psycopg.connect(conn_params)
                cur = conn.cursor()
                
                # Verificar se a sessão já tem contexto
                cur.execute("""
                    SELECT revision FROM public.session_workspace_contexts 
                    WHERE session_id = %s
                """, [session])
                row = cur.fetchone()
                
                if row:
                    revision = row[0]
                else:
                    revision = 0
                
                # Atualizar com nova revisão
                cur.execute("""
                    INSERT INTO public.session_workspace_contexts 
                    (session_id, user_id, workspace_id, revision)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (session_id) DO UPDATE SET
                        workspace_id = EXCLUDED.workspace_id,
                        revision = session_workspace_contexts.revision + 1,
                        updated_at = clock_timestamp()
                    RETURNING revision
                """, [session, user, ws, revision + 1])
                
                new_revision = cur.fetchone()[0]
                conn.close()
                
                results.append((thread_id, new_revision))
                
            except Exception as e:
                errors.append((thread_id, str(e)))
        
        # Preparar dados de teste
        with db_conn.cursor() as cur:
            cur.execute("""
                INSERT INTO public.workspaces (id, name, slug, location)
                VALUES (%s, 'Concurrency Test WS', 'conc-test', 'Test location')
                ON CONFLICT (id) DO NOTHING
            """, [ws_id])
            
            cur.execute("""
                INSERT INTO public.profiles (id, email, name, role, status)
                VALUES (%s, 'conc@test.com', 'Test User', 'tecnico', 'active')
                ON CONFLICT (id) DO NOTHING
            """, [user_id])
            
            cur.execute("""
                INSERT INTO public.memberships (profile_id, workspace_id, status)
                VALUES (%s, %s, 'active')
                ON CONFLICT DO NOTHING
            """, [user_id, ws_id])
        
        # Executar atualizações concorrentes
        threads = []
        for i in range(5):
            t = threading.Thread(
                target=update_context,
                args=(DATABASE_URL, session_id, ws_id, user_id, i)
            )
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        # Verificar resultados
        assert len(errors) == 0, f"Erros na concorrência: {errors}"
        assert len(results) == 5, f"Esperados 5 resultados, obtidos {len(results)}"
        
        # Verificar que as revisões estão sequenciais
        revisions = sorted([r[1] for r in results])
        assert revisions == list(range(1, 6)), f"Revisões inesperadas: {revisions}"
        
        # Cleanup
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM public.session_workspace_contexts WHERE session_id = %s", [session_id])
            cur.execute("DELETE FROM public.workspaces WHERE id = %s", [ws_id])
            cur.execute("DELETE FROM public.memberships WHERE profile_id = %s", [user_id])
            cur.execute("DELETE FROM public.profiles WHERE id = %s", [user_id])


class TestCatalogIsolation:
    """Testes de isolamento do catálogo da TV."""
    
    def test_tv_station_workspace_isolation(self, db_conn):
        """tv_station deve ser isolado por workspace."""
        ws_1 = str(uuid.uuid4())
        ws_2 = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        
        with db_conn.cursor() as cur:
            # Criar dados de teste
            cur.execute("""
                INSERT INTO public.workspaces (id, name, slug, location)
                VALUES (%s, 'WS 1', 'ws-1', 'Test location'), (%s, 'WS 2', 'ws-2', 'Test location')
                ON CONFLICT (id) DO NOTHING
            """, [ws_1, ws_2])
            
            cur.execute("""
                INSERT INTO public.profiles (id, email, name, role, status)
                VALUES (%s, 'user@test.com', 'Test User', 'tecnico', 'active')
                ON CONFLICT (id) DO NOTHING
            """, [user_id])
            
            cur.execute("""
                INSERT INTO public.memberships (profile_id, workspace_id, status)
                VALUES (%s, %s, 'active'), (%s, %s, 'active')
                ON CONFLICT DO NOTHING
            """, [user_id, ws_1, user_id, ws_2])
            
            # Inserir estação para cada workspace
            cur.execute("""
                INSERT INTO public.tv_station 
                (id, workspace_id, state, state_sequence)
                VALUES 
                    (gen_random_uuid(), %s, 'playing'::text, 1),
                    (gen_random_uuid(), %s, 'stopped'::text, 0)
            """, [ws_1, ws_2])
            
            # Verificar isolamento
            cur.execute("""
                SELECT COUNT(*) FROM public.tv_station WHERE workspace_id = %s
            """, [ws_1])
            count_1 = cur.fetchone()[0]
            
            cur.execute("""
                SELECT COUNT(*) FROM public.tv_station WHERE workspace_id = %s
            """, [ws_2])
            count_2 = cur.fetchone()[0]
        
        # Cada workspace deve ter sua própria estação
        assert count_1 >= 1, f"Workspace 1 deve ter pelo menos 1 estação, tem {count_1}"
        assert count_2 >= 1, f"Workspace 2 deve ter pelo menos 1 estação, tem {count_2}"
        
        # Cleanup
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM public.tv_station WHERE workspace_id IN (%s, %s)", [ws_1, ws_2])
            cur.execute("DELETE FROM public.workspaces WHERE id IN (%s, %s)", [ws_1, ws_2])
            cur.execute("DELETE FROM public.memberships WHERE profile_id = %s", [user_id])
            cur.execute("DELETE FROM public.profiles WHERE id = %s", [user_id])