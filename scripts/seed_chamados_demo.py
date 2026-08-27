#!/usr/bin/env python3
"""Populate a DEMO workspace with realistic Chamados data for screenshots.

Creates an isolated workspace "Campus Demo LabHub" (slug: demo-chamados) with:
  - 14 tickets across all statuses and priorities
  - Timeline events on key tickets
  - Teacher feedback (5 evaluations)
  - Base64 placeholder photos on 2 tickets

All records are tagged with a single workspace_id so cleanup is safe and surgical.

Requirements:
    pip install requests
    SUPABASE_URL and SUPABASE_SERVICE_KEY in .env or environment.

Usage:
    python scripts/seed_chamados_demo.py
    python scripts/seed_chamados_demo.py --dry-run   # show plan without writing
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

# ── Constants ────────────────────────────────────────────────────────────────

DEMO_SLUG = "demo-chamados"
DEMO_NAME = "Campus Demo LabHub"
DEMO_LOCATION = "Campus Demonstration — LabHub"

# Deterministic UUID (v5: namespace DNS + slug) — reproducible across runs.
DEMO_WORKSPACE_ID = str(uuid.uuid5(uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), DEMO_SLUG))

# ── Environment ──────────────────────────────────────────────────────────────


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _get_config() -> tuple[str, str]:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    _load_env(env_path)
    base = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not base or not service_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    return base, service_key


def _headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ── Placeholder photos (tiny colored SVGs encoded as base64 data URLs) ──────

_SVG_COMPUTER = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
    '<rect width="400" height="300" fill="#1e293b"/>'
    '<rect x="80" y="40" width="240" height="160" rx="8" fill="#334155" stroke="#64748b" stroke-width="2"/>'
    '<rect x="90" y="50" width="220" height="140" rx="4" fill="#0f172a"/>'
    '<text x="200" y="130" text-anchor="middle" fill="#ef4444" font-size="18" font-family="monospace">SEM SINAL</text>'
    '<rect x="160" y="200" width="80" height="10" rx="2" fill="#475569"/>'
    '<rect x="140" y="210" width="120" height="6" rx="2" fill="#64748b"/>'
    '<text x="200" y="270" text-anchor="middle" fill="#94a3b8" font-size="12">Computador - Lab 01</text>'
    '</svg>'
)
PHOTO_COMPUTER = "data:image/svg+xml;base64," + base64.b64encode(_SVG_COMPUTER.encode("utf-8")).decode()

_SVG_PROJECTOR = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
    '<rect width="400" height="300" fill="#1e293b"/>'
    '<rect x="120" y="30" width="160" height="120" rx="6" fill="#334155" stroke="#64748b" stroke-width="2"/>'
    '<rect x="130" y="40" width="140" height="100" rx="3" fill="#0f172a"/>'
    '<text x="200" y="100" text-anchor="middle" fill="#f59e0b" font-size="16" font-family="monospace">PROJETOR OFF</text>'
    '<circle cx="200" cy="180" r="20" fill="#475569" stroke="#64748b" stroke-width="2"/>'
    '<line x1="180" y1="200" x2="160" y2="250" stroke="#64748b" stroke-width="2"/>'
    '<line x1="220" y1="200" x2="240" y2="250" stroke="#64748b" stroke-width="2"/>'
    '<text x="200" y="280" text-anchor="middle" fill="#94a3b8" font-size="12">Projetor - Sala 102</text>'
    '</svg>'
)
PHOTO_PROJECTOR = "data:image/svg+xml;base64," + base64.b64encode(_SVG_PROJECTOR.encode("utf-8")).decode()

# ── Time helpers ─────────────────────────────────────────────────────────────

NOW = datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _minutes_ago(m: int) -> str:
    return _iso(NOW - timedelta(minutes=m))


def _hours_ago(h: float) -> str:
    return _iso(NOW - timedelta(hours=h))


def _days_ago(d: float) -> str:
    return _iso(NOW - timedelta(days=d))


# ── Ticket definitions ───────────────────────────────────────────────────────


def _make_tickets() -> list[dict]:
    """Return 14 ticket dicts with realistic data."""
    ws = DEMO_WORKSPACE_ID
    t: list[dict] = []

    # ── TICKET 1: STAR — em_atendimento, alta, photos + rich timeline ───────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-001")),
        "ticketNumber": 1,
        "roomId": "room-lab01",
        "roomName": "Laboratório 01",
        "assetId": "asset-pc-001",
        "assetSource": "stock",
        "assetName": "Computador Desktop",
        "assetPatrimony": "PAT-001",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": (
            "O computador não liga após queda de luz ontem à noite. "
            "Led de energia não acende. Fonte parece ok (teste com outro cabo). "
            "Monitor não recebe sinal."
        ),
        "status": "em_atendimento",
        "priority": "alta",
        "reportedBy": "Ana Martins",
        "reportedByEmail": "ana.martins@demo.labhub",
        "assignedTo": "Rafael Oliveira",
        "assignedToUserId": "",
        "photos": PHOTO_COMPUTER,
        "createdAt": _hours_ago(36),
        "updatedAt": _hours_ago(1),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "Técnico verificando a fonte de alimentação",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 2: a_caminho, urgente, with photo ────────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-002")),
        "ticketNumber": 2,
        "roomId": "room-sala102",
        "roomName": "Sala de Aula 102",
        "assetId": "asset-proj-001",
        "assetSource": "stock",
        "assetName": "Projetor Epson X41",
        "assetPatrimony": "PAT-003",
        "problemCategory": "Projetor",
        "problemArea": "academica",
        "problemDescription": (
            "Projetor não acende lâmpada. Led de status pisca vermelho. "
            "Já tentou reiniciar várias vezes."
        ),
        "status": "a_caminho",
        "priority": "urgente",
        "reportedBy": "Carlos Mendes",
        "reportedByEmail": "carlos.mendes@demo.labhub",
        "assignedTo": "Mariana Costa",
        "assignedToUserId": "",
        "photos": PHOTO_PROJECTOR,
        "createdAt": _hours_ago(1.5),
        "updatedAt": _minutes_ago(10),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "Técnico a caminho da sala",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 3: aberto, normal (recent, no assignee) ──────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-003")),
        "ticketNumber": 3,
        "roomId": "room-lab02",
        "roomName": "Laboratório 02",
        "assetId": "asset-pc-002",
        "assetSource": "stock",
        "assetName": "Computador Desktop",
        "assetPatrimony": "PAT-002",
        "problemCategory": "Internet",
        "problemArea": "academica",
        "problemDescription": "Internet caiu para toda a sala. Outros equipamentos também sem acesso.",
        "status": "aberto",
        "priority": "normal",
        "reportedBy": "Fernanda Souza",
        "reportedByEmail": "fernanda.souza@demo.labhub",
        "assignedTo": "",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _minutes_ago(25),
        "updatedAt": _minutes_ago(25),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 4: aberto, alta ──────────────────────────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-004")),
        "ticketNumber": 4,
        "roomId": "room-sala101",
        "roomName": "Sala de Aula 101",
        "assetId": "asset-proj-002",
        "assetSource": "stock",
        "assetName": "Projetor BenQ MX550",
        "assetPatrimony": "PAT-004",
        "problemCategory": "Projetor",
        "problemArea": "academica",
        "problemDescription": "Imagem do projetor tremulando. Cabo HDMI trocado, problema persiste.",
        "status": "aberto",
        "priority": "alta",
        "reportedBy": "Pedro Santos",
        "reportedByEmail": "pedro.santos@demo.labhub",
        "assignedTo": "",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _hours_ago(2),
        "updatedAt": _hours_ago(2),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 5: em_atendimento, normal ────────────────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-005")),
        "ticketNumber": 5,
        "roomId": "room-lab03",
        "roomName": "Laboratório 03",
        "assetId": "asset-monitor-001",
        "assetSource": "stock",
        "assetName": 'Monitor Dell 24"',
        "assetPatrimony": "PAT-005",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": "Monitor piscando intermitentemente. Brilho instável.",
        "status": "em_atendimento",
        "priority": "normal",
        "reportedBy": "Juliana Lima",
        "reportedByEmail": "juliana.lima@demo.labhub",
        "assignedTo": "Lucas Almeida",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(1.2),
        "updatedAt": _hours_ago(3),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "Verificando cabo de vídeo e configurações",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 6: resolvido, alta, with feedback ★5 ────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-006")),
        "ticketNumber": 6,
        "roomId": "room-sala201",
        "roomName": "Sala de Aula 201",
        "assetId": "asset-audio-001",
        "assetSource": "stock",
        "assetName": "Caixa de Som JBL",
        "assetPatrimony": "PAT-006",
        "problemCategory": "Áudio",
        "problemArea": "academica",
        "problemDescription": (
            "Áudio da sala não funciona. Caixa de som não liga. "
            "Testado em outra tomada — mesmo problema."
        ),
        "status": "resolvido",
        "priority": "alta",
        "reportedBy": "Ana Martins",
        "reportedByEmail": "ana.martins@demo.labhub",
        "assignedTo": "Rafael Oliveira",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(3),
        "updatedAt": _days_ago(2.8),
        "resolvedAt": _days_ago(2.8),
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": 5,
        "feedbackComment": "Excelente atendimento! Resolveram rápido.",
        "feedbackAt": _days_ago(2.5),
    })

    # ── TICKET 7: resolvido, normal, with feedback ★4 ──────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-007")),
        "ticketNumber": 7,
        "roomId": "room-lab01",
        "roomName": "Laboratório 01",
        "assetId": "asset-switch-001",
        "assetSource": "stock",
        "assetName": "Switch de Rede TP-Link",
        "assetPatrimony": "PAT-007",
        "problemCategory": "Internet",
        "problemArea": "administrativa",
        "problemDescription": "Switch com portas 3 e 4 sem sinal. PCs nessas portas sem rede.",
        "status": "resolvido",
        "priority": "normal",
        "reportedBy": "Carlos Mendes",
        "reportedByEmail": "carlos.mendes@demo.labhub",
        "assignedTo": "Mariana Costa",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(5),
        "updatedAt": _days_ago(4.5),
        "resolvedAt": _days_ago(4.5),
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": 4,
        "feedbackComment": "Bom atendimento, demorou um pouco mas resolveu.",
        "feedbackAt": _days_ago(4),
    })

    # ── TICKET 8: resolvido, baixa, with feedback ★5 ──────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-008")),
        "ticketNumber": 8,
        "roomId": "room-sala101",
        "roomName": "Sala de Aula 101",
        "assetId": "asset-kb-001",
        "assetSource": "stock",
        "assetName": "Teclado USB Logitech",
        "assetPatrimony": "PAT-008",
        "problemCategory": "Outros",
        "problemArea": "academica",
        "problemDescription": "Teclado com tecla 'Enter' emperrada. Funciona mal.",
        "status": "resolvido",
        "priority": "baixa",
        "reportedBy": "Fernanda Souza",
        "reportedByEmail": "fernanda.souza@demo.labhub",
        "assignedTo": "Lucas Almeida",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(7),
        "updatedAt": _days_ago(6),
        "resolvedAt": _days_ago(6),
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": 5,
        "feedbackComment": "Técnico super atencioso! Trocou o teclado na hora.",
        "feedbackAt": _days_ago(5.5),
    })

    # ── TICKET 9: fechado, normal, with feedback ★4 ────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-009")),
        "ticketNumber": 9,
        "roomId": "room-lab02",
        "roomName": "Laboratório 02",
        "assetId": "asset-pc-lab02",
        "assetSource": "stock",
        "assetName": "Computador Desktop",
        "assetPatrimony": "PAT-009",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": "Computador extremamente lento. Demora 10 minutos para iniciar.",
        "status": "fechado",
        "priority": "normal",
        "reportedBy": "Pedro Santos",
        "reportedByEmail": "pedro.santos@demo.labhub",
        "assignedTo": "Rafael Oliveira",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(10),
        "updatedAt": _days_ago(8),
        "resolvedAt": _days_ago(8.5),
        "archived": True,
        "closedAt": _days_ago(8),
        "closedBy": "Rafael Oliveira",
        "statusNote": "",
        "feedbackRating": 4,
        "feedbackComment": "Resolveu, mas demorou 2 dias.",
        "feedbackAt": _days_ago(7.5),
    })

    # ── TICKET 10: fechado, alta ───────────────────────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-010")),
        "ticketNumber": 10,
        "roomId": "room-sala102",
        "roomName": "Sala de Aula 102",
        "assetId": "asset-proj-sala102",
        "assetSource": "stock",
        "assetName": "Projetor Epson X41",
        "assetPatrimony": "PAT-010",
        "problemCategory": "Projetor",
        "problemArea": "academica",
        "problemDescription": "Projetor com imagem amarelada. Lâmpada precisa de troca.",
        "status": "fechado",
        "priority": "alta",
        "reportedBy": "Juliana Lima",
        "reportedByEmail": "juliana.lima@demo.labhub",
        "assignedTo": "Mariana Costa",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(15),
        "updatedAt": _days_ago(13),
        "resolvedAt": _days_ago(13.5),
        "archived": True,
        "closedAt": _days_ago(13),
        "closedBy": "Mariana Costa",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 11: a_caminho, urgente (ATRASADO no SLA — created 24h ago) ──
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-011")),
        "ticketNumber": 11,
        "roomId": "room-lab03",
        "roomName": "Laboratório 03",
        "assetId": "asset-pc-lab03",
        "assetSource": "stock",
        "assetName": "Computador Desktop",
        "assetPatrimony": "PAT-011",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": "Computador reiniciando sozinho. Tela azul (BSOD) intermitente.",
        "status": "a_caminho",
        "priority": "urgente",
        "reportedBy": "Ana Martins",
        "reportedByEmail": "ana.martins@demo.labhub",
        "assignedTo": "Lucas Almeida",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _hours_ago(24),
        "updatedAt": _hours_ago(2),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 12: aberto, normal (PRÓXIMO do SLA — 20h old, 24h SLA) ──────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-012")),
        "ticketNumber": 12,
        "roomId": "room-sala201",
        "roomName": "Sala de Aula 201",
        "assetId": "asset-proj-sala201",
        "assetSource": "stock",
        "assetName": "Projetor BenQ MX550",
        "assetPatrimony": "PAT-012",
        "problemCategory": "Projetor",
        "problemArea": "academica",
        "problemDescription": "Projetor não conecta ao Wi-Fi. AirPlay não funciona.",
        "status": "aberto",
        "priority": "normal",
        "reportedBy": "Carlos Mendes",
        "reportedByEmail": "carlos.mendes@demo.labhub",
        "assignedTo": "",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _hours_ago(20),
        "updatedAt": _hours_ago(20),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    # ── TICKET 13: resolvido, urgente, with feedback ★5 ────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-013")),
        "ticketNumber": 13,
        "roomId": "room-lab01",
        "roomName": "Laboratório 01",
        "assetId": "asset-switch-lab01",
        "assetSource": "stock",
        "assetName": "Switch de Rede TP-Link",
        "assetPatrimony": "PAT-013",
        "problemCategory": "Internet",
        "problemArea": "administrativa",
        "problemDescription": "Toda a rede do lab caiu. Switch com LEDs apagados.",
        "status": "resolvido",
        "priority": "urgente",
        "reportedBy": "Pedro Santos",
        "reportedByEmail": "pedro.santos@demo.labhub",
        "assignedTo": "Rafael Oliveira",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(2),
        "updatedAt": _days_ago(1.8),
        "resolvedAt": _days_ago(1.8),
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": 5,
        "feedbackComment": "Rapidíssimo! Voltou a funcionar em menos de 1 hora.",
        "feedbackAt": _days_ago(1.5),
    })

    # ── TICKET 14: em_atendimento, baixa ────────────────────────────────────
    t.append({
        "id": str(uuid.uuid5(uuid.UUID(ws), "demo-ticket-014")),
        "ticketNumber": 14,
        "roomId": "room-sala101",
        "roomName": "Sala de Aula 101",
        "assetId": "asset-monitor-sala101",
        "assetSource": "stock",
        "assetName": 'Monitor Dell 24"',
        "assetPatrimony": "PAT-014",
        "problemCategory": "Computador",
        "problemArea": "academica",
        "problemDescription": "Monitor com pixel morto no canto inferior direito. Pequeno inconveniente.",
        "status": "em_atendimento",
        "priority": "baixa",
        "reportedBy": "Juliana Lima",
        "reportedByEmail": "juliana.lima@demo.labhub",
        "assignedTo": "Mariana Costa",
        "assignedToUserId": "",
        "photos": "",
        "createdAt": _days_ago(4),
        "updatedAt": _hours_ago(6),
        "resolvedAt": None,
        "archived": False,
        "closedAt": None,
        "closedBy": "",
        "statusNote": "",
        "feedbackRating": None,
        "feedbackComment": "",
        "feedbackAt": None,
    })

    return t


# ── Event definitions ────────────────────────────────────────────────────────


def _make_events(tickets: list[dict]) -> list[dict]:
    """Generate timeline events for key tickets."""
    ws = DEMO_WORKSPACE_ID
    events: list[dict] = []

    def _ev(ticket_id: str, ev_type: str, content: str, author: str, created_at: str) -> dict:
        return {
            "id": str(uuid.uuid5(uuid.UUID(ticket_id), f"ev-{content[:20]}")),
            "ticket_id": ticket_id,
            "workspace_id": ws,
            "type": ev_type,
            "content": content,
            "author": author,
            "photo_urls": "",
            "createdAt": created_at,
        }

    # Ticket 1 (star) — rich timeline
    tid1 = tickets[0]["id"]
    events.extend([
        _ev(tid1, "status", "Chamado aberto por Ana Martins", "Sistema", _hours_ago(36)),
        _ev(tid1, "atribuicao", "Atribuído a Rafael Oliveira", "Rafael Oliveira", _hours_ago(35)),
        _ev(tid1, "status", "Técnico a caminho", "Rafael Oliveira", _hours_ago(34)),
        _ev(tid1, "comentario", "Verificado o cabo de alimentação. Fonte externa com tensão instável.", "Rafael Oliveira", _hours_ago(33)),
        _ev(tid1, "status", "Atendimento iniciado", "Rafael Oliveira", _hours_ago(33)),
        _ev(tid1, "comentario", "Testada fonte reserva — computador ligou normalmente. Verificando se a fonte original precisa de troca.", "Rafael Oliveira", _hours_ago(2)),
        _ev(tid1, "comentario", "Fonte original com capacitor estufado. Aguardando peça.", "Rafael Oliveira", _hours_ago(1)),
    ])

    # Ticket 2 (urgente, a_caminho)
    tid2 = tickets[1]["id"]
    events.extend([
        _ev(tid2, "status", "Chamado aberto por Carlos Mendes", "Sistema", _hours_ago(1.5)),
        _ev(tid2, "atribuicao", "Atribuído a Mariana Costa", "Mariana Costa", _hours_ago(1.2)),
        _ev(tid2, "status", "Técnico a caminho", "Mariana Costa", _minutes_ago(10)),
    ])

    # Ticket 5 (em_atendimento)
    tid5 = tickets[4]["id"]
    events.extend([
        _ev(tid5, "status", "Chamado aberto por Juliana Lima", "Sistema", _days_ago(1.2)),
        _ev(tid5, "atribuicao", "Atribuído a Lucas Almeida", "Lucas Almeida", _days_ago(1.1)),
        _ev(tid5, "status", "Atendimento iniciado", "Lucas Almeida", _hours_ago(3)),
        _ev(tid5, "comentario", "Verificando configuração de brilho e cabo de vídeo.", "Lucas Almeida", _hours_ago(2)),
    ])

    # Ticket 6 (resolvido com feedback)
    tid6 = tickets[5]["id"]
    events.extend([
        _ev(tid6, "status", "Chamado aberto por Ana Martins", "Sistema", _days_ago(3)),
        _ev(tid6, "atribuicao", "Atribuído a Rafael Oliveira", "Rafael Oliveira", _days_ago(3)),
        _ev(tid6, "comentario", "Caixa de som com fusível queimado. Trocado e testado.", "Rafael Oliveira", _days_ago(2.9)),
        _ev(tid6, "status", "Chamado resolvido", "Rafael Oliveira", _days_ago(2.8)),
    ])

    # Ticket 11 (atrasado)
    tid11 = tickets[10]["id"]
    events.extend([
        _ev(tid11, "status", "Chamado aberto por Ana Martins", "Sistema", _hours_ago(24)),
        _ev(tid11, "atribuicao", "Atribuído a Lucas Almeida", "Lucas Almeida", _hours_ago(22)),
        _ev(tid11, "comentario", "Problema identificado como memória RAM com defeito. Aguardando substituta.", "Lucas Almeida", _hours_ago(4)),
    ])

    return events


# ── API helpers ──────────────────────────────────────────────────────────────


def _check_workspace_exists(base: str, svc: str) -> dict | None:
    url = f"{base}/rest/v1/workspaces?slug=eq.{DEMO_SLUG}&select=id,name,slug"
    resp = requests.get(url, headers=_headers(svc), timeout=15)
    if resp.ok and resp.json():
        return resp.json()[0]
    return None


def _create_workspace(base: str, svc: str) -> dict:
    url = f"{base}/rest/v1/workspaces"
    payload = {
        "id": DEMO_WORKSPACE_ID,
        "name": DEMO_NAME,
        "slug": DEMO_SLUG,
        "location": DEMO_LOCATION,
        "spreadsheet_url": "",
        "color": "",
        "disabled_apps": [],
    }
    resp = requests.post(url, json=payload, headers=_headers(svc), timeout=15)
    if resp.status_code not in (200, 201):
        print(f"  ERROR creating workspace: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)
    return resp.json()[0]


def _upsert_ticket(base: str, svc: str, ticket: dict) -> dict:
    url = f"{base}/rest/v1/chamados_tickets"
    h = _headers(svc)
    h["Prefer"] = "return=representation,resolution=merge-duplicates"
    resp = requests.post(url, json=ticket, headers=h, timeout=15)
    if resp.status_code not in (200, 201):
        print(f"  ERROR upserting ticket #{ticket.get('ticketNumber')}: {resp.status_code} {resp.text[:200]}")
        return {}
    rows = resp.json()
    return rows[0] if rows else ticket


def _insert_events(base: str, svc: str, events: list[dict]) -> int:
    url = f"{base}/rest/v1/ticket_events"
    h = _headers(svc)
    h["Prefer"] = "return=minimal"
    count = 0
    for ev in events:
        resp = requests.post(url, json=ev, headers=h, timeout=15)
        if resp.status_code in (200, 201):
            count += 1
        elif resp.status_code == 409:
            pass  # duplicate, skip
        else:
            print(f"  WARN event: {resp.status_code} {resp.text[:100]}")
    return count


def _update_feedback(base: str, svc: str, ticket_id: str, rating: int, comment: str) -> bool:
    url = f"{base}/rest/v1/chamados_tickets?id=eq.{ticket_id}"
    h = _headers(svc)
    h["Prefer"] = "return=minimal"
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "feedbackRating": rating,
        "feedbackComment": comment,
        "feedbackAt": now,
    }
    resp = requests.patch(url, json=payload, headers=h, timeout=15)
    return resp.ok


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", help="Show plan without writing")
    args = parser.parse_args()

    base, svc = _get_config()

    print(f"Workspace ID (deterministic): {DEMO_WORKSPACE_ID}")

    # Check existing
    existing = _check_workspace_exists(base, svc)
    if existing:
        print(f"\nWorkspace '{DEMO_SLUG}' already exists (id={existing['id']}).")
        print("Updating tickets and events for this workspace...")
        workspace_id = existing["id"]
    else:
        print(f"\nCreating workspace '{DEMO_NAME}' (slug={DEMO_SLUG})...")
        if args.dry_run:
            print("  [DRY RUN] Would create workspace")
            workspace_id = DEMO_WORKSPACE_ID
        else:
            ws = _create_workspace(base, svc)
            workspace_id = ws["id"]
            print(f"  Created: {workspace_id}")

    # Generate data
    tickets = _make_tickets()
    events = _make_events(tickets)
    feedbacks = [(t["id"], t["feedbackRating"], t.get("feedbackComment", ""))
                 for t in tickets if t.get("feedbackRating")]

    print(f"\nPlan:")
    print(f"  Tickets:  {len(tickets)}")
    print(f"  Events:   {len(events)}")
    print(f"  Feedback: {len(feedbacks)}")
    print(f"  Photos:   2 (base64 placeholders)")

    if args.dry_run:
        print("\n[DRY RUN] No data written.")
        for t in tickets:
            print(f"  #{t['ticketNumber']:2d} | {t['status']:15s} | {t['priority']:8s} | {t['roomName']}")
        return

    # Upsert tickets
    print("\nUpserting tickets...")
    for t in tickets:
        t["workspace_id"] = workspace_id
        result = _upsert_ticket(base, svc, t)
        if result:
            print(f"  #{t['ticketNumber']:2d} OK ({t['status']})")
        else:
            print(f"  #{t['ticketNumber']:2d} FAILED")

    # Insert events
    print("\nInserting events...")
    for ev in events:
        ev["workspace_id"] = workspace_id
    ev_count = _insert_events(base, svc, events)
    print(f"  {ev_count}/{len(events)} events inserted")

    # Update feedback
    print("\nUpdating feedback...")
    fb_count = 0
    for tid, rating, comment in feedbacks:
        ok = _update_feedback(base, svc, tid, rating, comment)
        if ok:
            fb_count += 1
            print(f"  Ticket {tid[:8]}... -> {rating} stars")
        else:
            print(f"  Ticket {tid[:8]}... FAILED")
    print(f"  {fb_count}/{len(feedbacks)} feedbacks updated")

    # Summary
    print("\n" + "=" * 60)
    print("SEED COMPLETE")
    print("=" * 60)
    print(f"\nWorkspace: {DEMO_NAME}")
    print(f"  id:     {workspace_id}")
    print(f"  slug:   {DEMO_SLUG}")
    print(f"\nTickets created: {len(tickets)}")
    print(f"Events created:  {ev_count}")
    print(f"Feedbacks:       {fb_count}")
    print(f"\nPhotos: 2 base64 placeholders (inline in ticket photos field)")
    print(f"\nMain ticket (STAR):  #1 (Laboratório 01 — Computador Desktop — em_atendimento)")
    print(f"Feedback ticket:     #6 (Sala 201 - resolvido - 5 stars)")
    print(f"\nRoutes for screenshots:")
    print(f"  Dashboard:     /chamados")
    print(f"  Ticket list:   /chamados/tickets")
    print(f"  Ticket detail: /chamados/tickets/{tickets[0]['id']}")
    print(f"  SLA:           /chamados/sla")
    print(f"  Reports:       /chamados/reports")
    print(f"  QR Code:       /chamados/qr")
    print(f"  Public form:   /chamados-publico/new")
    print(f"  Track:         /chamados-publico/track")
    print(f"  Feedback:      /chamados-publico/feedback/{tickets[5]['id']}")
    print(f"\nTo cleanup: python scripts/cleanup_chamados_demo.py")


if __name__ == "__main__":
    main()
