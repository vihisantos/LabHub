#!/usr/bin/env python3
"""
Testes automatizados para validação de URLs no local_validate.py.
Cobre casos: URL local válida, URL remota, URL malformada, hostname ausente.
"""

import os
import sys
import pytest

# Adicionar o diretório scripts ao path para importar local_validate
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from scripts.ci.local_validate import validate_no_remote_config, validate_local_environment


class TestURLValidation:
    """Testes para validação de URLs de ambiente."""
    
    def test_local_database_url_valid(self):
        """URL local válida deve ser aceita."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        
        # Limpar outras variáveis
        for key in ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", 
                    "SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]:
            env.pop(key, None)
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_local_environment()
            assert result is True, "DATABASE_URL local deve ser aceita"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_localhost_hostname_valid(self):
        """Hostname localhost deve ser aceito."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_URL"] = "http://localhost:54321"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is True, "SUPABASE_URL com localhost deve ser aceita"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_127_00_01_hostname_valid(self):
        """Hostname 127.0.0.1 deve ser aceito."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
        env["SUPABASE_URL"] = "http://127.0.0.1:54321"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is True, "SUPABASE_URL com 127.0.0.1 deve ser aceita"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_remote_database_url_rejected(self):
        """URL remota deve ser rejeitada."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://user:pass@db.example.com:54322/postgres"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_local_environment()
            assert result is False, "DATABASE_URL remota deve ser rejeitada"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_remote_supabase_url_rejected(self):
        """URL remoto no SUPABASE_URL deve ser rejeitado."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_URL"] = "https://project.supabase.co"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is False, "SUPABASE_URL remoto deve ser rejeitado"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_malformed_url_rejected(self):
        """URL malformada deve ser rejeitada."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "not-a-valid-url"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_local_environment()
            # A validação deve lidar com URLs malformadas
            # Se hostname for vazio após parse, é considerado inválido
            assert result is False, "DATABASE_URL malformada deve ser rejeitada"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_empty_database_url_rejected(self):
        """URL vazia deve ser rejeitada."""
        env = os.environ.copy()
        env["DATABASE_URL"] = ""
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_local_environment()
            assert result is False, "DATABASE_URL vazia deve ser rejeitada"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_empty_supabase_url_accepted(self):
        """URL vazia no SUPABASE_URL deve ser aceita (não está configurada)."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_URL"] = ""
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is True, "SUPABASE_URL vazia deve ser aceita"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_unexpected_scheme_rejected(self):
        """URL com esquema inesperado deve ser rejeitada."""
        env = os.environ.copy()
        env["SUPABASE_URL"] = "ftp://localhost:54321"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is False, "SUPABASE_URL com esquema inesperado deve ser rejeitado"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])