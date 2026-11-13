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
from scripts.ci.local_validate import (
    validate_no_remote_config, 
    validate_local_environment,
    validate_all_keys
)


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
    
    def test_hostname_missing_rejected(self):
        """URL sem hostname deve ser rejeitada."""
        env = os.environ.copy()
        env["SUPABASE_URL"] = "http://"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is False, "SUPABASE_URL sem hostname deve ser rejeitado"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_url_whitespace_only_rejected(self):
        """URL com somente espaços deve ser rejeitada."""
        env = os.environ.copy()
        env["SUPABASE_URL"] = "   "
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_no_remote_config()
            assert result is False, "SUPABASE_URL com espaços em branco deve ser rejeitado"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)


class TestSensitiveKeysValidation:
    """Testes para validação de chaves sensíveis."""
    
    def test_empty_sensitive_keys_accepted(self):
        """Chaves vazias não devem causar falha."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_URL"] = ""
        env["SUPABASE_ANON_KEY"] = ""
        env["SUPABASE_SERVICE_KEY"] = ""
        env["SUPABASE_PROJECT_REF"] = ""
        env["SUPABASE_ACCESS_TOKEN"] = ""
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_all_keys()
            assert result is True, "Chaves vazias devem ser aceitas"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_missing_sensitive_keys_accepted(self):
        """Chaves ausentes não devem causar falha."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        # Remover todas as chaves sensíveis
        for key in ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY",
                    "SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]:
            env.pop(key, None)
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_all_keys()
            assert result is True, "Chaves ausentes devem ser aceitas"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_valued_sensitive_key_rejected(self):
        """Chave com valor não-vazio deve ser rejeitada."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_ACCESS_TOKEN"] = "production-token-here"
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_all_keys()
            assert result is False, "Chave com valor deve ser rejeitada"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)
    
    def test_whitespace_sensitive_key_rejected(self):
        """Chave com valor em branco não deve causar falha (é tratado como ausente)."""
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:54322/postgres"
        env["SUPABASE_ACCESS_TOKEN"] = "   "
        
        saved_env = os.environ.copy()
        try:
            os.environ.clear()
            os.environ.update(env)
            
            result = validate_all_keys()
            # Espaços em branco após strip deve ser tratado como ausente
            assert result is True, "Chave com valor em branco deve ser aceita"
        finally:
            os.environ.clear()
            os.environ.update(saved_env)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])