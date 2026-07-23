import sqlite3, json, sys

DB = r"C:\Users\Admin\.local\share\mimocode\mimocode.db"
conn = sqlite3.connect(DB)
c = conn.cursor()

# Check project schema
print("=== PROJECT TABLE SCHEMA ===")
c.execute("PRAGMA table_info(project)")
for r in c.fetchall():
    print(r)

# Check all projects
c.execute("SELECT * FROM project")
for r in c.fetchall():
    print(r)

# Check session schema
print("\n=== SESSION TABLE SCHEMA ===")
c.execute("PRAGMA table_info(session)")
for r in c.fetchall():
    print(r)

conn.close()
