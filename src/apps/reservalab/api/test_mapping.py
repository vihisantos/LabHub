#!/usr/bin/env python
"""Teste do mapeamento - coluna A = nome do notebook"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.invent import get_inventario_data
import json

print("=== Testando mapeamento da coluna A (1A) ===\n")

data = get_inventario_data('laboratorio de Informatica')
print(f"Total de itens: {data['total']}\n")

print("Verificando se coluna A (nome_notebook) está sendo mapeada:")
for i, item in enumerate(data['itens'][:5]):
    print(f"{i+1}. nome: {item['nome']}, hostname: {item['hostname']}, patrimonio: {item['patrimonio']}")

print("\n=== Teste concluído ===")
print("Nota: Se coluna A estiver vazia na planilha, os campos nome/hostname podem estar vazios.")
print("Quando a coluna A for preenchida com os nomes dos notebooks, o mapeamento funcionará corretamente.")
