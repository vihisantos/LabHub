import sqlite3, json, sys

DB = r"C:\Users\Admin\.local\share\mimocode\mimocode.db"
conn = sqlite3.connect(DB)
c = conn.cursor()

# 1. List tables
print("=== TABLES ===")
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
for r in c.fetchall():
    print(r[0])

# 2. Recent sessions (last 30 days)
print("\n=== RECENT SESSIONS (last 30 days) ===")
c.execute("""
    SELECT id, title, datetime(time_created/1000, 'unixepoch', 'localtime') as created
    FROM session
    WHERE time_created > (strftime('%s','now') - 30*86400) * 1000
    ORDER BY time_created DESC
""")
for r in c.fetchall():
    print(f"  {r[0]} | {r[2]} | {r[1]}")

# 3. Total session count
c.execute("SELECT COUNT(*) FROM session")
print(f"\nTotal sessions: {c.fetchone()[0]}")

# 4. Most common tool usage in last 30 days
print("\n=== MOST COMMON TOOL USAGE (last 30 days) ===")
c.execute("""
    SELECT json_extract(p.data, '$.tool') as tool,
           substr(json_extract(p.data, '$.state.input'), 1, 200) as input_preview,
           count(*) as n
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
    GROUP BY tool, input_preview
    ORDER BY n DESC
    LIMIT 30
""")
for r in c.fetchall():
    print(f"  [{r[2]}x] {r[0]}: {r[1][:150]}")

# 5. Repeated keywords in user messages
print("\n=== REPEATED KEYWORDS IN USER MESSAGES ===")
c.execute("""
    SELECT substr(json_extract(m.data, '$.content'), 1, 300) as msg, count(*) as n
    FROM message m
    WHERE json_extract(m.data, '$.role') = 'user'
      AND m.time_created > (strftime('%s','now') - 30*86400) * 1000
    GROUP BY msg
    HAVING n > 1
    ORDER BY n DESC
    LIMIT 20
""")
for r in c.fetchall():
    print(f"  [{r[1]}x] {r[0][:200]}")

# 6. Search user messages for "again", "every time", "repeat", "same as", "usual"
print("\n=== USER MESSAGES WITH REPEAT-INDICATING KEYWORDS ===")
for kw in ['again', 'every time', 'repeat', 'same as', 'usual', 'como antes', 'de novo', 'mais uma vez', 'como da vez', 'igual']:
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
            print(f"    [{r[1]}] {r[0][:200]}")

conn.close()
