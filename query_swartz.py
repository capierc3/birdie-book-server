import psycopg2
import psycopg2.extras

conn = psycopg2.connect("postgresql://birdie:birdie@localhost:5432/birdie_book")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 80)
print("1. GOLF CLUBS matching 'swartz'")
print("=" * 80)
cur.execute("SELECT * FROM golf_clubs WHERE name ILIKE '%swartz%'")
for row in cur.fetchall():
    for k, v in row.items():
        print(f"  {k}: {v}")
    print()

print("=" * 80)
print("2. ROUNDS from 2025-09-30")
print("=" * 80)
cur.execute("""
    SELECT r.*, c.name as course_name
    FROM rounds r JOIN courses c ON r.course_id = c.id
    WHERE r.date = '2025-09-30'
""")
rounds = cur.fetchall()
for row in rounds:
    for k, v in row.items():
        print(f"  {k}: {v}")
    print()

print("=" * 80)
print("3. ROUND HOLES for hole_number=1 from that round + SHOTS")
print("=" * 80)
if rounds:
    round_id = rounds[0]['id']
    cur.execute("""
        SELECT * FROM round_holes WHERE round_id = %s AND hole_number = 1
    """, (round_id,))
    round_holes = cur.fetchall()
    for row in round_holes:
        for k, v in row.items():
            print(f"  {k}: {v}")
        print()
        # Get shots for this round_hole
        cur.execute("SELECT * FROM shots WHERE round_hole_id = %s ORDER BY shot_number", (row['id'],))
        shots = cur.fetchall()
        print(f"  --- SHOTS ({len(shots)} total) ---")
        for shot in shots:
            print()
            for k, v in shot.items():
                print(f"    {k}: {v}")
else:
    print("  No rounds found for that date.")

print("=" * 80)
print("4. COURSE TEES & COURSE HOLES for Swartz Creek, hole 1")
print("=" * 80)
cur.execute("SELECT id FROM golf_clubs WHERE name ILIKE '%swartz%'")
club_row = cur.fetchone()
if club_row:
    club_id = club_row['id']
    # Get courses
    cur.execute("SELECT * FROM courses WHERE golf_club_id = %s", (club_id,))
    courses = cur.fetchall()
    for c in courses:
        print(f"  Course: {c['name']} (id={c['id']})")
        # Get course_tees
        cur.execute("SELECT * FROM course_tees WHERE course_id = %s", (c['id'],))
        tees = cur.fetchall()
        for t in tees:
            print(f"\n  --- COURSE TEE: {t.get('name', t.get('color', 'unknown'))} (id={t['id']}) ---")
            for k, v in t.items():
                print(f"    {k}: {v}")
            # Get course_holes for this tee, hole 1
            cur.execute("""
                SELECT * FROM course_holes
                WHERE course_tee_id = %s AND hole_number = 1
            """, (t['id'],))
            holes = cur.fetchall()
            for h in holes:
                print(f"\n    --- COURSE HOLE #1 (id={h['id']}) ---")
                for k, v in h.items():
                    val_str = str(v)
                    if len(val_str) > 200:
                        val_str = val_str[:200] + "..."
                    print(f"      {k}: {val_str}")

print()
print("=" * 80)
print("5. OSM HOLES for club")
print("=" * 80)
if club_row:
    cur.execute("SELECT * FROM osm_holes WHERE golf_club_id = %s", (club_id,))
    osm_holes = cur.fetchall()
    print(f"  Total OSM holes: {len(osm_holes)}")
    # Just show hole 1 or first few
    for h in osm_holes[:3]:
        print()
        for k, v in h.items():
            val_str = str(v)
            if len(val_str) > 300:
                val_str = val_str[:300] + "..."
            print(f"  {k}: {val_str}")

print()
print("=" * 80)
print("6. COURSE HAZARDS for club (limit 5)")
print("=" * 80)
if club_row:
    cur.execute("""
        SELECT * FROM course_hazards
        WHERE golf_club_id = %s LIMIT 5
    """, (club_id,))
    hazards = cur.fetchall()
    print(f"  Total returned: {len(hazards)}")
    for h in hazards:
        print()
        for k, v in h.items():
            val_str = str(v)
            if len(val_str) > 300:
                val_str = val_str[:300] + "..."
            print(f"  {k}: {val_str}")

cur.close()
conn.close()
