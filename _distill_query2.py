import sqlite3, json, sys

DB = r"C:\Users\Admin\.local\share\mimocode\mimocode.db"
conn = sqlite3.connect(DB)
c = conn.cursor()

# Get LabHub project ID
c.execute("SELECT id FROM project WHERE path LIKE '%LabHub%'")
proj_rows = c.fetchall()
print("=== LABHUB PROJECT IDS ===")
for r in proj_rows:
    print(r[0])

proj_ids = [r[0] for r in proj_rows]

# Get LabHub sessions only (not checkpoint-writer ones)
print("\n=== LABHUB SESSIONS (last 30 days, non-checkpoint) ===")
for pid in proj_ids:
    c.execute("""
        SELECT id, title, datetime(time_created/1000, 'unixepoch', 'localtime') as created
        FROM session
        WHERE project_id = ?
          AND time_created > (strftime('%s','now') - 30*86400) * 1000
          AND title NOT LIKE 'checkpoint-writer%'
          AND title NOT LIKE 'Auto Dream%'
          AND title NOT LIKE 'Auto Distill%'
        ORDER BY time_created DESC
    """, (pid,))
    for r in c.fetchall():
        print(f"  {r[0]} | {r[2]} | {r[1]}")

# Get user messages with repeat keywords
print("\n=== USER MESSAGES WITH REPEAT KEYWORDS (all projects, last 30 days) ===")
for kw in ['again', 'every time', 'repeat', 'same as', 'usual', 'como antes', 'de novo', 'mais uma vez', 'igual', 'copiar', 'copie']:
    c.execute("""
        SELECT substr(json_extract(m.data, '$.content'), 1, 300), datetime(m.time_created/1000, 'unixepoch', 'localtime')
        FROM message m
        WHERE json_extract(m.data, '$.role') = 'user'
          AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
          AND json_extract(m.data, '$.content') LIKE ?
        LIMIT 5
    """, (f'%{kw}%',))
    rows = c.fetchall()
    if rows:
        print(f"\n  Keyword: '{kw}'")
        for r in rows:
            content = r[0] if r[0] else "(empty)"
            print(f"    [{r[1]}] {content[:200]}")

# Search for repeated edit targets (same file edited multiple times)
print("\n=== MOST EDITED FILES IN LABHUB (last 30 days) ===")
for pid in proj_ids:
    c.execute("""
        SELECT json_extract(p.data, '$.state.input') as inp, count(*) as n
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND json_extract(p.data, '$.tool') = 'edit'
          AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
          AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
        GROUP BY inp
        ORDER BY n DESC
        LIMIT 20
    """, (pid,))
    for r in c.fetchall():
        try:
            inp_data = json.loads(r[0]) if r[0] else {}
            fp = inp_data.get('file_path', 'unknown')
            print(f"  [{r[1]}x] {fp}")
        except:
            print(f"  [{r[1]}x] (parse error)")

# Search for repeated bash commands
print("\n=== REPEATED BASH COMMANDS IN LABHUB (last 30 days) ===")
for pid in proj_ids:
    c.execute("""
        SELECT json_extract(p.data, '$.state.input') as inp, count(*) as n
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE json_extract(m.data, '$.role') = 'assistant'
          AND json_extract(p.data, '$.type') = 'tool'
          AND json_extract(p.data, '$.tool') = 'bash'
          AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
          AND m.session_id IN (SELECT id FROM session WHERE project_id = ?)
        GROUP BY substr(inp, 1, 200)
        ORDER BY n DESC
        LIMIT 20
    """, (pid,))
    for r in c.fetchall():
        try:
            inp_data = json.loads(r[0]) if r[0] else {}
            cmd = inp_data.get('command', 'unknown')[:150]
            print(f"  [{r[1]}x] {cmd}")
        except:
            print(f"  [{r[1]}x] (parse error)")

# Search for repeated read targets
print("\n=== MOST READ FILES IN LABHUB (last 30 days) ===")
for pid in proj_ids:
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
    """, (pid,))
    for r in c.fetchall():
        try:
            inp_data = json.loads(r[0]) if r[0] else {}
            fp = inp_data.get('file_path', 'unknown')
            print(f"  [{r[1]}x] {fp}")
        except:
            print(f"  [{r[1]}x] (parse error)")

# Check for task patterns
print("\n=== TASK EVENTS IN LABHUB (last 30 days) ===")
for pid in proj_ids:
    c.execute("""
        SELECT t.title, te.type, datetime(te.time_created/1000, 'unixepoch', 'localtime'), count(*) as n
        FROM task t
        JOIN task_event te ON te.task_id = t.id
        WHERE t.session_id IN (SELECT id FROM session WHERE project_id = ?)
          AND te.time_created > (strftime('%s','now') - 30*86400) * 1000
        GROUP BY t.title, te.type
        ORDER BY n DESC
        LIMIT 20
    """, (pid,))
    for r in c.fetchall():
        print(f"  [{r[3]}x] {r[0]} ({r[1]}) @ {r[2]}")

conn.close()
