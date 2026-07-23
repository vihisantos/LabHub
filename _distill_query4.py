import sqlite3, json, sys

DB = r"C:\Users\Admin\.local\share\mimocode\mimocode.db"
conn = sqlite3.connect(DB)
c = conn.cursor()

LABHUB_PID = "d2f0ff72-21cf-4c5b-ab51-8f0466e0a8bf"

# LabHub sessions (last 30 days, non-system)
print("=== LABHUB SESSIONS (last 30 days, non-system) ===")
c.execute("""
    SELECT id, title, datetime(time_created/1000, 'unixepoch', 'localtime') as created
    FROM session
    WHERE project_id = ?
      AND time_created > (strftime('%s','now') - 30*86400) * 1000
      AND title NOT LIKE 'checkpoint-writer%'
      AND title NOT LIKE 'Auto Dream%'
      AND title NOT LIKE 'Auto Distill%'
    ORDER BY time_created DESC
""", (LABHUB_PID,))
for r in c.fetchall():
    print(f"  {r[0]} | {r[2]} | {r[1]}")

# User messages with repeat keywords
print("\n=== USER MESSAGES WITH REPEAT KEYWORDS (LabHub, last 30 days) ===")
for kw in ['again', 'every time', 'repeat', 'same as', 'usual', 'como antes', 'de novo', 'mais uma vez', 'igual', 'copiar', 'copie', 'mesmo', 'mantendo', 'manter']:
    c.execute("""
        SELECT substr(json_extract(m.data, '$.content'), 1, 300), datetime(m.time_created/1000, 'unixepoch', 'localtime')
        FROM message m
        WHERE json_extract(m.data, '$.role') = 'user'
          AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
          AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
          AND json_extract(m.data, '$.content') LIKE ?
        LIMIT 5
    """, (LABHUB_PID, f'%{kw}%'))
    rows = c.fetchall()
    if rows:
        print(f"\n  Keyword: '{kw}'")
        for r in rows:
            content = r[0] if r[0] else "(empty)"
            print(f"    [{r[1]}] {content[:250]}")

# Most edited files
print("\n=== MOST EDITED FILES IN LABHUB (last 30 days) ===")
c.execute("""
    SELECT json_extract(p.data, '$.state.input') as inp, count(*) as n
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND json_extract(p.data, '$.tool') = 'edit'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
      AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
    GROUP BY json_extract(p.data, '$.state.input.file_path')
    ORDER BY n DESC
    LIMIT 20
""", (LABHUB_PID,))
for r in c.fetchall():
    try:
        inp_data = json.loads(r[0]) if r[0] else {}
        fp = inp_data.get('file_path', 'unknown')
        print(f"  [{r[1]}x] {fp}")
    except:
        print(f"  [{r[1]}x] (parse error)")

# Repeated bash commands
print("\n=== REPEATED BASH COMMANDS IN LABHUB (last 30 days) ===")
c.execute("""
    SELECT json_extract(p.data, '$.state.input') as inp, count(*) as n
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND json_extract(p.data, '$.tool') = 'bash'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
      AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
    GROUP BY substr(inp, 1, 300)
    ORDER BY n DESC
    LIMIT 20
""", (LABHUB_PID,))
for r in c.fetchall():
    try:
        inp_data = json.loads(r[0]) if r[0] else {}
        cmd = inp_data.get('command', 'unknown')[:200]
        print(f"  [{r[1]}x] {cmd}")
    except:
        print(f"  [{r[1]}x] (parse error)")

# Repeated reads
print("\n=== MOST READ FILES IN LABHUB (last 30 days) ===")
c.execute("""
    SELECT json_extract(p.data, '$.state.input') as inp, count(*) as n
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND json_extract(p.data, '$.tool') = 'read'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
      AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
    GROUP BY inp
    ORDER BY n DESC
    LIMIT 20
""", (LABHUB_PID,))
for r in c.fetchall():
    try:
        inp_data = json.loads(r[0]) if r[0] else {}
        fp = inp_data.get('file_path', 'unknown')
        print(f"  [{r[1]}x] {fp}")
    except:
        print(f"  [{r[1]}x] (parse error)")

# Tool call sequence analysis - find common multi-step workflows
print("\n=== COMMON TOOL SEQUENCES (consecutive assistant tool calls, LabHub last 30 days) ===")
c.execute("""
    SELECT m.session_id, p.id as part_id, p.data as part_data, m.time_created
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
      AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
    ORDER BY m.time_created
""", (LABHUB_PID,))
rows = c.fetchall()
# Build sequences per session
from collections import Counter
seq_counter = Counter()
current_seq = []
current_sid = None
for r in rows:
    sid = r[0]
    try:
        pd = json.loads(r[1]) if isinstance(r[1], str) else r[1]
        tool = pd.get('tool', 'unknown') if isinstance(pd, dict) else 'unknown'
    except:
        tool = 'unknown'
    
    if sid != current_sid:
        if len(current_seq) >= 3:
            seq_key = " -> ".join(current_seq[:6])
            seq_counter[seq_key] += 1
        current_seq = []
        current_sid = sid
    current_seq.append(tool)

if len(current_seq) >= 3:
    seq_key = " -> ".join(current_seq[:6])
    seq_counter[seq_key] += 1

for seq, count in seq_counter.most_common(15):
    print(f"  [{count}x] {seq}")

# Task patterns
print("\n=== TASK TITLES IN LABHUB (last 30 days) ===")
c.execute("""
    SELECT t.title, count(*) as n
    FROM task t
    WHERE t.session_id IN (SELECT id FROM session WHERE project_id = ?)
    GROUP BY t.title
    ORDER BY n DESC
    LIMIT 20
""", (LABHUB_PID,))
for r in c.fetchall():
    print(f"  [{r[1]}x] {r[0]}")

conn.close()
