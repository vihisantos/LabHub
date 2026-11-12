#!/usr/bin/env python3
"""
Validação local do ambiente - proteção contra URLs remotas.
Usa o runner oficial scripts/migrate.py.

REGRAS DE SEGURANCA:
- Este script REJEITA URLs remotas explícitamente
- Não possui fallback para produção
- Não usa supabase db push nem supabase db reset
- O runner scripts/migrate.py é o responsável pelas migrations
"""

import os
import sys
import subprocess
import urllib.parse


def validate_local_environment():
    """Garante que estamos em um ambiente local EXCLUSIVO.
    
    Levanta RuntimeError se DATABASE_URL apontar para qualquer host 
    que não seja localhost ou 127.0.0.1.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    
    if not db_url:
        print("ERROR: DATABASE_URL não está definida")
        return False
    
    try:
        parsed = urllib.parse.urlparse(db_url)
        hostname = parsed.hostname or ""
        
        if hostname not in ("localhost", "127.0.0.1"):
            raise RuntimeError(
                f"DATABASE_URL aponta para remoto: {hostname}. "
                "Este script é PROIBIDO de rodar contra bancos remotos. "
                "Ambiente local obrigatório."
            )
        
        # Verificar se a porta é a correta do Supabase local (54322)
        # A porta 5432 é a padrão do PostgreSQL, mas Supabase CLI usa 54322
        if parsed.port not in (54322, 5432):
            print(f"WARNING: Porta inusitada: {parsed.port}. Supabase local usa 54322")
        
        return True
        
    except Exception as e:
        print(f"ERROR: Falha na validação de ambiente: {e}")
        return False


def ensure_local_only_env():
    """Configura variáveis de ambiente para modo local exclusivo.
    
    Garante que não haja vazamento para produção.
    """
    # Limpar qualquer chave de serviço que poderia apontar para remoto
    os.environ["SUPABASE_URL"] = "http://localhost:54321"
    os.environ["SUPABASE_ANON_KEY"] = ""
    os.environ["SUPABASE_SERVICE_KEY"] = ""
    os.environ["SUPABASE_PROJECT_REF"] = ""
    os.environ["SUPABASE_ACCESS_TOKEN"] = ""


def run_migrations():
    """Executa migrations com o runner oficial LabHub."""
    print("=== Executando migrations via runner oficial ===")
    
    # Executar com o runner oficial, nÃO com supabase db push/reset
    result = subprocess.run(
        [
            sys.executable,
            "scripts/migrate.py",
            "--from-scratch"
        ],
        env=os.environ.copy(),
        capture_output=False,
        text=True
    )
    
    return result.returncode == 0


def verify_schema_migrations():
    """Verifica que schema_migrations foi populado corretamente."""
    print("=== Verificando schema_migrations ===")
    
    try:
        import psycopg
        from psycopg import sql
    except ImportError:
        print("ERROR: psycopg não está instalado")
        return False
    
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL não está definida")
        return False
    
    try:
        conn = psycopg.connect(db_url, autocommit=True)
        cur = conn.cursor()
        
        # Verificar que migrations foram aplicadas
        cur.execute("SELECT filename FROM public.schema_migrations ORDER BY filename DESC LIMIT 5")
        rows = cur.fetchall()
        
        if len(rows) == 0:
            print("ERROR: Nenhuma migration foi aplicada")
            conn.close()
            return False
        
        print(f"OK: {len(rows)} migrations recentes aplicadas")
        for row in rows[:3]:  # Mostrar as 3 mais recentes
            print(f"  - {row[0]}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"ERROR: Falha ao verificar schema_migrations: {e}")
        return False


def run_sql_tests():
    """Executa os testes SQL da migration 108."""
    print("=== Executando testes SQL ===")
    
    test_file = "supabase/tests/108_session_workspace_context.sql"
    if not os.path.exists(test_file):
        print(f"ERROR: Arquivo de testes não encontrado: {test_file}")
        return False
    
    result = subprocess.run(
        [
            "psql",
            "-h", "localhost",
            "-p", "54322",
            "-U", "postgres",
            "-d", "postgres",
            "-v", "ON_ERROR_STOP=1",
            "-f", test_file
        ],
        env=os.environ.copy(),
        capture_output=False,
        text=True
    )
    
    return result.returncode == 0


def run_python_tests():
    """Executa os testes Python de integração."""
    print("=== Executando testes Python ===")
    
    test_file = "scripts/tests/test_local_session_workspace.py"
    if not os.path.exists(test_file):
        print(f"ERROR: Arquivo de testes não encontrado: {test_file}")
        return False
    
    result = subprocess.run(
        [
            sys.executable,
            "-m", "pytest",
            test_file,
            "-v",
            "--tb=short"
        ],
        env=os.environ.copy(),
        capture_output=False,
        text=True
    )
    
    return result.returncode == 0


def main():
    """Pipeline de validação local."""
    print("=" * 60)
    print("VALIDACAO LOCAL DO AMBIENTE - LABHUB")
    print("=" * 60)
    
    # Passo 1: Validar ambiente
    print("\n[1/6] Validando ambiente local...")
    if not validate_local_environment():
        print("FALHA: Ambiente inválido")
        sys.exit(1)
    print("OK: Ambiente local validado")
    
    # Passo 2: Garantir modo local exclusivo
    print("\n[2/6] Configurando modo local exclusivo...")
    ensure_local_only_env()
    print("OK: Modo local configurado")
    
    # Passo 3: Executar migrations
    print("\n[3/6] Executando migrations...")
    if not run_migrations():
        print("FALHA: Erro nas migrations")
        sys.exit(1)
    print("OK: Migrations concluídas")
    
    # Passo 4: Verificar schema_migrations
    print("\n[4/6] Verificando registros de migration...")
    if not verify_schema_migrations():
        print("FALHA: Verificação de schema_migrations")
        sys.exit(1)
    
    # Passo 5: Executar testes SQL
    print("\n[5/6] Executando testes SQL...")
    if not run_sql_tests():
        print("FALHA: Testes SQL")
        sys.exit(1)
    print("OK: Testes SQL passaram")
    
    # Passo 6: Executar testes Python
    print("\n[6/6] Executando testes Python...")
    if not run_python_tests():
        print("FALHA: Testes Python")
        sys.exit(1)
    print("OK: Testes Python passaram")
    
    print("\n" + "=" * 60)
    print("VALIDACAO LOCAL CONCLUIDA COM SUCESSO")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())