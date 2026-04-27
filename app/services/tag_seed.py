"""Seed the default tag library on first startup.

Idempotent: matches existing rows by `(category, name)` and only inserts
missing entries. Safe to run on every startup. The user-facing tag
management UI (deferred) will allow add/edit/archive on top of these
seeded defaults.
"""

from sqlalchemy.orm import Session

from app.models.tag import Tag


# Each entry: (sub_category, name). Order within a list controls sort_order
# within that sub_category — the picker renders tags in the same order they
# appear here, so the user's eye scans naturally rather than alphabetically.

BRING_IN_TAGS: list[tuple[str, list[str]]] = [
    ("Mind", ["Clear", "Scattered", "Overthinking", "Curious", "Locked in"]),
    ("Mood", ["Calm", "Anxious", "Confident", "Frustrated", "Under pressure"]),
    ("Body", ["Energized", "Fatigued", "Loose", "Tense", "Steady"]),
    ("Mindset", [
        "Playing free",
        "Proving something",
        "No expectations",
        "Score-aware",
        "Target-focused",
    ]),
]

PULL_OUT_TAGS: list[tuple[str, list[str]]] = [
    ("Score & outcome", [
        "Score-watching",
        "Bad shot lingering",
        "Trying to repeat a good shot",
        "Expecting a good round",
    ]),
    ("Tempo & mechanics", [
        "Rushing after good shots",
        "Slowing after bad shots",
        "Mid-round mechanics",
    ]),
    ("Fear & doubt", [
        "Tee-shot doubt",
        "Hazard / hole fears",
        "Frustration / anger",
    ]),
    ("External", [
        "Comparing to partners",
        "External distractions",
    ]),
]

INTENTION_TAGS: list[tuple[str, list[str]]] = [
    ("Process", [
        "Stay in routine",
        "One shot at a time",
        "Commit to club",
        "Smooth tempo",
    ]),
    ("Mindset", [
        "Patient",
        "Trust the swing",
        "Accept outcomes",
        "Stay aggressive",
        "Process over outcome",
    ]),
    ("Skill focus", [
        "Short game first",
        "Tee accuracy",
        "Putting confidence",
        "Wedge distances",
        "Iron commitment",
    ]),
    ("Tone", [
        "Have fun",
        "No expectations",
        "Compete with myself",
        "Learn / experimental",
    ]),
]


def _seed_category(db: Session, category: str, groups: list[tuple[str, list[str]]]) -> int:
    inserted = 0
    sort_order = 0
    for sub_category, names in groups:
        for name in names:
            sort_order += 1
            existing = (
                db.query(Tag)
                .filter(Tag.category == category, Tag.name == name)
                .first()
            )
            if existing:
                continue
            db.add(Tag(
                category=category,
                sub_category=sub_category,
                name=name,
                is_default=True,
                is_archived=False,
                sort_order=sort_order,
            ))
            inserted += 1
    return inserted


def seed_tags(db: Session) -> dict[str, int]:
    """Insert any missing default tags. Returns counts per category."""
    counts = {
        "bring_in": _seed_category(db, "bring_in", BRING_IN_TAGS),
        "pull_out": _seed_category(db, "pull_out", PULL_OUT_TAGS),
        "intention": _seed_category(db, "intention", INTENTION_TAGS),
    }
    if any(counts.values()):
        db.commit()
    return counts
