#!/usr/bin/env python
"""Script de teste para validar alterações no invent.py"""
import sys
import os

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.invent import get_inventario_data, get_abas_disponiveis
import json

print("=== Testando carregamento de abas ===")
abas_result = get_abas_disponiveis()
print(f"Abas disponíveis: {abas_result.get('abas', [])}")

print("\n=== Testando aba: Consultórios CIS med ===")
data1 = get_inventario_data('Consultórios CIS med')
print(f"Total de itens: {data1.get('total', 0)}")
if data1.get('itens'):
    print("Primeiro item:")
    print(json.dumps(data1['itens'][0], indent=2, ensure_ascii=False))

print("\n=== Testando aba: laboratorio de Informatica ===")
data2 = get_inventario_data('laboratorio de Informatica')
print(f"Total de itens: {data2.get('total', 0)}")
if data2.get('itens'):
    print("Primeiro item:")
    print(json.dumps(data2['itens'][0], indent=2, ensure_ascii=False))

print("\n=== Teste concluído ===")
