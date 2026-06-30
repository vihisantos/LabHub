#!/usr/bin/env python
"""Teste final das alterações"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.invent import get_inventario_data
import json

print("=== Testando CIS Med (Consultórios) ===")
data = get_inventario_data('Consultórios CIS med')
print(f"Total: {data['total']}")
if data['itens']:
    item = data['itens'][0]
    print(f"Ambiente: {item.get('ambiente', 'N/A')}")
    print(f"Sistema Operacional: {item.get('sistema_operacional', 'N/A')}")
    print(f"Nome: {item.get('nome', 'N/A')}")

print("\n=== Testando Lab Informatica ===")
data2 = get_inventario_data('laboratorio de Informatica')
print(f"Total: {data2['total']}")
if data2['itens']:
    item2 = data2['itens'][0]
    print(f"Hostname (Col A): {item2.get('hostname', 'N/A')}")
    print(f"Local: {item2.get('local', 'N/A')}")
    print(f"Status: {item2.get('status', 'N/A')}")

print("\n=== Teste concluído ===")
