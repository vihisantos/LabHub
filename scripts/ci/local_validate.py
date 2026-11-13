#!/usr/bin/env python3
"""
Validação local do ambiente - proteção contra URLs remotas.
Usa o runner oficial scripts/migrate.py.

REGRAS DE SEGURANCA:
- Este script REJEITA URLs remotas explícitamente
- Este script REJEITA credenciais/remotas em variáveis sensíveis
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


def validate_no_remote_config():
    """Verifica que não há configurações remotas ativas.

    Rejeita se SUPABASE_URL apontar para um host remoto,
    mesmo que DATABASE_URL esteja local.
    É um erro fatal aceitar URLs remotas ou não-analisáveis.
    """
    supabase_url = os.environ.get("SUPABASE_URL", "")

    if supabase_url:
        # Verificar se está vazio após strip
        if not supabase_url.strip():
            print("ERROR: SUPABASE_URL está vazia ou em branco")
            print("URLs vazias são PROIBIDAS nesse ambiente.")
            return False

        try:
            parsed = urllib.parse.urlparse(supabase_url)

            # Verificar se tem esquema esperado (http ou https)
            if parsed.scheme not in ("http", "https"):
                print(f"ERROR: SUPABASE_URL tem esquema inesperado: {parsed.scheme}")
                print("Apenas http e https são suportados.")
                return False

            # Verificar se tem hostname
            hostname = parsed.hostname or ""
            if not hostname:
                print("ERROR: SUPABASE_URL não tem hostname válido")
                print("URLs sem hostname são PROIBIDAS nesse ambiente.")
                return False

            if hostname not in ("localhost", "127.0.0.1"):
                print(f"ERROR: SUPABASE_URL aponta para remoto: {hostname}")
                print("Este script só pode executar em ambiente local.")
                return False
        except Exception as e:
            # Qualquer falha no parsing deve ser rejeitada como erro fatal
            print(f"ERROR: Falha ao analisar SUPABASE_URL: {e}")
            print("URLs remotas são PROIBIDAS nesse ambiente.")
            return False

    return True


def validate_all_keys():
    """Verifica que não há chaves sensíveis em variáveis de ambiente.

    Fail-closed: rejeita se houver tokens ou referências de projeto.
    O ambiente local NÃO deve carregar credenciais de produção.
    """
    sensitive_keys = [
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_PROJECT_REF",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_KEY"
    ]

    for key in sensitive_keys:
        value = os.environ.get(key, "")
        # Diferenciar: ausente (OK) vs vazia (OK - não configurada) vs com valor (ERRO)
        if key in os.environ and value and value.strip():
            # A variável está definida com um valor não-vazio
            # Isso indica possível configuração remota
            # Não exponha o valor nos logs - apenas indique a chave
            print(f"ERROR: {key} está configurada com valor.")
            print("Variáveis sensíveis são PROIBIDAS em ambiente local.")
            print("Remova a configuração ou use .env.local apenas.")
            return False

    return True


def ensure_local_only_env():
    """Configura variáveis de ambiente para modo local exclusivo.

    Garante que não haja vazamento para produção.
    NÃO sobrescreve configurações remotas que já estão definidas.
    """
    # Apenas definir localhost se não houver configuração remota
    if "SUPABASE_URL" not in os.environ or not os.environ["SUPABASE_URL"]:
        os.environ["SUPABASE_URL"] = "http://localhost:54321"
    if "SUPABASE_ANON_KEY" not in os.environ or not os.environ["SUPABASE_ANON_KEY"]:
        os.environ["SUPABASE_ANON_KEY"] = ""
    if "SUPABASE_SERVICE_KEY" not in os.environ or not os.environ["SUPABASE_SERVICE_KEY"]:
        os.environ["SUPABASE_SERVICE_KEY"] = ""
    if "SUPABASE_PROJECT_REF" not in os.environ or not os.environ["SUPABASE_PROJECT_REF"]:
        os.environ["SUPABASE_PROJECT_REF"] = ""
    if "SUPABASE_ACCESS_TOKEN" not in os.environ or not os.environ["SUPABASE_ACCESS_TOKEN"]:
        os.environ["SUPABASE_ACCESS_TOKEN"] = ""


def run_migrations():
    """Executa migrations com o runner oficial LabHub."""
    print("=== Executando migrations via runner oficial ===")

    # Executar com o runner oficial, NÃO com supabase db push/reset
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

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL não está definida")
        return False

    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(db_url)
        hostname = parsed.hostname or ""
        if hostname not in ("localhost", "127.0.0.1"):
            print(f"ERROR: DATABASE_URL aponta para remoto: {hostname}")
            print("Testes SQL contra bancos remotos são PROIBIDOS")
            return False
    except Exception as e:
        print(f"ERROR: Falha ao validar DATABASE_URL: {e}")
        return False

    result = subprocess.run(
        [
            "psql",
            db_url,
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

    # Passo 1.5: Validar que não há config remota
    print("\n[1.5/6] Validando ausência de config remota...")
    if not validate_no_remote_config():
        print("FALHA: Configuracao remota detectada")
        sys.exit(1)
    print("OK: Sem configuracoes remotas")

    # Passo 1.6: Validar chaves sensíveis
    print("\n[1.6/6] Validando chaves sensíveis...")
    if not validate_all_keys():
        print("FALHA: Chaves sensíveis detectadas")
        sys.exit(1)
    print("OK: Chaves sensíveis verificadas")

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