# Practice Plan Decision Tree

> How every data point affects drill selection, and what happens when data is missing.
> Use this to trace engine logic and verify behavior as data fills in over time.

---

## Data Availability Tiers

| Tier | Description | Typical User State |
|------|-------------|-------------------|
| **T0** | No data at all | Brand new user, no rounds or range sessions imported |
| **T1** | Basic rounds only | A few Garmin rounds imported (scoring, fairway hit/miss, putts) |
| **T2** | Rounds + SG | Enough rounds for strokes gained computation (5+ rounds with tee assignments) |
| **T3** | Rounds + Range | Has both on-course data AND launch monitor sessions |
| **T4** | Full data | Rounds + Range + Trackman (full fidelity) + course GPS + pre/post notes |

---

## Master Decision Tree

### 1. CLUB SELECTION — Which clubs to practice?

```
Has focus tags with club tags?
├─ YES → Force those clubs into plan (weight 25x)
│        Demote non-tagged clubs (weight × 0.3)
│        Still include 1-2 data-driven clubs as secondary
│
└─ NO → Has SG data? (T2+)
         ├─ YES → Rank clubs by worst SG per shot within each category
         │        Top 3 worst clubs per category → primary candidates
         │        Has recent data (last 5 rounds)?
         │        ├─ YES → Compare recent vs overall
         │        │        Declining clubs get weight boost
         │        │        Improving clubs noted but deprioritized
         │        └─ NO → Use overall only
         │
         └─ NO → Has any round data? (T1)
                  ├─ YES → Use fairway %: worst FW clubs → practice accuracy
                  │        Use GIR %: worst GIR holes → identify approach clubs
                  │        Use 3-putt rate: high → recommend putting
                  │
                  └─ NO → Has range data only? (T1-range)
                           ├─ YES → Use ClubStats dispersion (std_dev)
                           │        High std_dev clubs → need consistency work
                           │
                           └─ NO (T0) → Generic plan based on session type
                                        Range → warm-up + mid-iron + driver + wedge
                                        Net → tempo drill + position work
                                        Putting green → lag + short putts
```

### 2. FOCUS AREA — What to work on with each club?

```
Has focus tags with skill tags?
├─ YES → Override focus area to tagged skill
│        "distance" → distance_control
│        "accuracy" / "spread" → accuracy
│        "tempo" → tempo
│        etc.
│
└─ NO → Has miss direction data? (fairway_side populated, 10+ shots)
         ├─ YES → Dominant miss (L or R > 55%)?
         │        ├─ YES → Focus = accuracy (alignment/path correction)
         │        │        Rationale includes "misses {left/right} {X}% of the time"
         │        │
         │        └─ NO → High dispersion (std_dev > 20yd)?
         │                 ├─ YES → Focus = accuracy (consistency)
         │                 └─ NO → Focus = distance_control (club is accurate, optimize distance)
         │
         └─ NO → Has range dispersion data? (ClubStats.range_std_dev)
                  ├─ YES → High range std_dev?
                  │        ├─ YES → Focus = accuracy
                  │        └─ NO → Focus = distance_control
                  │
                  └─ NO → Has SG category data?
                           ├─ YES → Default focus for SG category:
                           │        off_the_tee → accuracy
                           │        approach → distance_control
                           │        short_game → chipping
                           │        putting → lag_putting (if 3-putt rate high) else short_putt
                           │
                           └─ NO (T0) → Generic defaults:
                                        Driver → accuracy
                                        Irons → distance_control
                                        Wedges → distance_control
                                        Short game → chipping
                                        Putting → lag_putting
```

### 3. DRILL SELECTION — Which specific drill?

```
Has miss direction data?
├─ YES → Dominant directional miss?
│        ├─ LEFT/RIGHT dominant → Alignment drills:
│        │   Range: Gate Drill, Train Track Alignment, Alignment Stick Setup
│        │   Net: Gate Drill (swing path version), Alignment Stick Setup
│        │
│        │   Has Trackman root cause? (face_angle, club_path, face_to_path)
│        │   ├─ YES → face_to_path > 3° → "Open face" → face control drill
│        │   │        club_path > 3° out-to-in → "Over the top" → path drill (Gate)
│        │   │        Rationale includes: "Trackman shows avg face angle {X}°, path {Y}°"
│        │   └─ NO → Generic alignment drill
│        │
│        └─ Wide dispersion, no dominant side →
│            Range: Stock Shot Repetition, Shrinking Target, Fairway Corridor
│            Net: Stock Shot Repetition (feel-based)
│
├─ NO but has range lateral data? (side_carry_yards)
│   └─ Avg |side_carry| > 10yd → Same as directional miss above
│
└─ NO miss data at all →
    Focus = distance_control?
    ├─ Has proximity bucket data?
    │   ├─ YES → Weak bucket identified?
    │   │   ├─ YES → Ladder Drill targeting that distance
    │   │   │        Target metric: "approaches from {bucket}, currently {gir}% GIR"
    │   │   └─ NO → Generic distance drill (Three-Quarter Swing, Trajectory Variation)
    │   └─ NO → Generic distance drill
    │
    Focus = accuracy?
    ├─ Stock Shot Repetition (safe default)
    │
    Focus = tempo?
    ├─ Net available? → Feet-Together, Pause-at-Top, Counting Tempo
    ├─ Range → same drills
    │
    Focus = start_line?
    ├─ Train Track Alignment, Intermediate Target
    │
    Focus = chipping?
    ├─ Landing Zone Ladder, Up-and-Down Challenge
    │
    Focus = bunker?
    ├─ Line in the Sand, One-Foot Balance
    │
    Focus = lag_putting?
    ├─ Circle Drill, Ladder Drill (Putting)
    │
    Focus = short_putt?
    ├─ Gate Drill (Putting), Compass Drill
```

### 4. SWING DATA OVERRIDES (Trackman-only, T4)

```
Has Trackman shot data for this club?
├─ YES →
│   Smash factor < threshold? (Driver < 1.44, Irons < 1.35)
│   ├─ YES → OVERRIDE: Focus = contact quality
│   │        Drill: Impact Position Hold, Feet-Together (contact focus)
│   │        Rationale: "Smash factor {X} below optimal — contact issue"
│   │
│   Spin rate std_dev > 500rpm?
│   ├─ YES → ADD NOTE: "Inconsistent spin — face control issue"
│   │        Boost alignment/face drills
│   │
│   Attack angle too steep for club type?
│   │  (Driver should be 0 to +5°, irons should be -2 to -6°)
│   ├─ YES → ADD NOTE: "Attack angle {X}° — adjust for optimal launch"
│   │        Drill: Tee Height Experiment (driver) or Ball Position work
│   │
│   Impact offset trending toe or heel? (|avg| > 0.3in)
│   ├─ YES → ADD NOTE: "Strike pattern trending {toe/heel}"
│   │        Drill: alignment setup drill
│   │
│   Face-to-path > 3° or < -3°?
│   ├─ YES → Root cause for curve/miss
│   │        Positive = open face to path = fade/slice tendency
│   │        Negative = closed face to path = draw/hook tendency
│   │        Inform miss direction drill selection
│   │
│   └─ All good → No override, use standard flow
│
└─ NO → Skip swing data checks entirely
```

### 5. PLAYER CONTEXT OVERRIDES (when text notes exist)

```
Has recent post-round notes? (last 5 rounds)
├─ YES →
│   Scan `what_struggled` for keywords:
│   ├─ Club names found (e.g., "driver", "7 iron") → Boost that club's weight
│   ├─ Skill keywords ("accuracy", "distance", "putting") → Influence focus area
│   ├─ "swing change" / "new swing" / "working on" → Apply swing_change behavior
│   │
│   Scan `next_focus` for keywords:
│   ├─ Same keyword extraction → Use as secondary tag source
│   │   (lower weight than explicit tags but higher than pure data-driven)
│   │
│   Scan `session_goals` from recent rounds:
│   ├─ If consistent theme across rounds → Strong signal for practice focus
│   │
│   Low energy/focus ratings correlated with bad rounds?
│   ├─ YES → Add note: "Performance drops when energy/focus is low — consider shorter, focused sessions"
│   │
│   └─ No actionable keywords → Skip context, use data only
│
└─ NO → Skip player context entirely
```

### 6. COURSE-SPECIFIC OVERRIDES (round-prep mode only)

```
Has linked RoundPlan?
├─ YES →
│   Load planned clubs per hole → Weight those clubs 60% of allocation
│
│   Has proximity bucket data?
│   ├─ YES → Cross-reference hole yardages with weak proximity bands
│   │        "Holes 3, 7, 12, 16 are in your weakest band (150-170yd)"
│   │        Boost approach drills for that distance
│   │
│   Has course hole hazard data?
│   ├─ YES → Holes with water/bunker in play?
│   │        ├─ Bunkers in play → Boost bunker drills if short_game session available
│   │        ├─ Water carries → Boost confidence/pressure drills for those distances
│   │
│   Has historical scoring on this course? (multiple rounds)
│   ├─ YES → Identify worst-scoring holes
│   │        Cross-ref with tee shot club choices → worst club on worst holes
│   │        "Hole 7 costs 0.8 strokes/round — you miss left with Driver here"
│   │
│   Has hole-level strategy notes?
│   ├─ YES → Scan for club names and shot requirements
│   │        "Lay up with 5 iron" → ensure 5 iron gets practice time
│   │
│   └─ Minimal course data → Use planned clubs only, skip course-specific insights
│
└─ NO (general mode) → Skip course-specific logic entirely
```

### 7. SESSION TYPE CONSTRAINTS (always applied)

```
Session type?
├─ trackman_range / outdoor_range / simulator →
│   Can do: off_the_tee, approach, short_game (full swing)
│   Drills: ALL range-compatible drills
│   Unit: balls
│
├─ home_net →
│   Can do: off_the_tee, approach (full swing only)
│   CANNOT do: distance control (no ball flight), trajectory, proximity
│   BEST FOR: tempo, swing positions, contact quality, swing changes, path drills
│   Drills: Feet-Together, Pause-at-Top, Gate Drill, Impact Hold, Slow Motion Reps
│   Unit: minutes or balls
│   NOTE: If player selected distance-related tags + home net → WARN or switch focus
│         "Home net can't measure distance. Focusing on contact and tempo instead."
│
├─ short_game_area →
│   Can do: short_game only (chipping, bunker, pitch shots)
│   Drills: Landing Zone, Up-and-Down, Line in Sand, One-Club Challenge
│   Unit: balls or minutes
│
├─ putting_green →
│   Can do: putting only
│   Drills: Circle, Compass, Ladder, Gate, 100 Putts
│   Unit: minutes
│   Decision: 3-putt rate > 10%? → Prioritize lag over short putts
│
└─ All types → Reserve 10% for warm-up (comfort club, rhythm focus)
```

### 8. SITUATIONAL TAG EFFECTS

```
Has "swing_change" tag?
├─ YES → Reduce to max 2 clubs (deep reps)
│        Multiply ball count per activity by 1.5x
│        Prefer: Slow Motion Reps, Exaggeration Drill, Video Checkpoint
│        Add to rationale: "Swing change: deep reps with fewer clubs"
│
Has "new_club" tag?
├─ YES → Boost new club weight 4x
│        Focus = distance_control (building baseline)
│        Drill: Block practice (repetitive same-target shots)
│        Target: "Establish baseline carry — current data: {N} shots"
│
Has "scoring_zones" tag?
├─ YES → Force approach + short_game categories
│        Demote off_the_tee weight 0.3x
│        Boost wedge distance drills (Clock System, Distance Ladder)
│
Has "trouble_shots" tag?
├─ YES → Boost bunker, chipping, trajectory drills
│        Add recovery-type scenarios to drills
│
Has "surprise_me"?
├─ YES → Randomly pick 1 club tag + 1 skill tag
│        Apply as normal tags
│        Add to rationale: "Random focus today: {club} + {skill}"
```

---

## Missing Data Fallback Summary

| Data Missing | What Changes | Fallback Behavior |
|---|---|---|
| No rounds at all (T0) | No SG, no scoring, no miss direction | Generic balanced plan: warm-up + irons + driver + wedges |
| No SG data | Can't rank weaknesses by strokes gained | Use fairway %, GIR %, 3-putt rate, penalties as proxy |
| No fairway_side data | Can't determine miss direction | Skip miss analysis, use ClubStats std_dev as dispersion proxy |
| No range data | Can't compare range vs course | Skip gap analysis, use on-course stats only |
| No Trackman data | Can't diagnose swing root cause | Skip swing data overrides, use outcome-based drill selection |
| No post-round notes | Can't extract player intent/struggles | Use data-only, no context reinforcement |
| No pre-round ratings | Can't correlate energy/focus with performance | Skip mental/physical context |
| No course GPS (fairway paths, green boundaries) | Can't compute fairway_side, on_green, proximity | Skip spatial metrics, use scoring only |
| No hazard data | Can't assess hazard exposure for course prep | Skip hazard-specific drills |
| No round plans | Can't do round-prep mode | General improvement only |
| Sparse data (< 5 rounds) | SG unreliable, trends meaningless | Add "limited data" disclaimer, increase variety in plan |
| Only 1 session type available | Can't split across putting/short game/range | Fill entire session with available category drills |

---

## Data → Drill Mapping Quick Reference

| Data Signal | Detected When | Drill Response |
|---|---|---|
| Dominant left miss | fairway_side L > 55% | Gate Drill, Alignment Stick, Train Track |
| Dominant right miss | fairway_side R > 55% | Same alignment drills |
| Wide dispersion, no side bias | std_dev high, L/R balanced | Stock Shot Repetition, Shrinking Target |
| Low smash factor | Trackman smash < 1.44 (driver) | Impact Position Hold, Feet-Together |
| High spin variability | Trackman spin_rate std > 500 | Gate Drill (face control) |
| Steep attack angle (driver) | attack_angle < -2° on driver | Tee Height Experiment, Overspeed Training |
| Weak proximity band | GIR < 50% in distance bucket | Ladder Drill at that distance |
| High 3-putt rate | 3-putt rate > 10% | Circle Drill, Ladder (putting) |
| Low scramble % | scramble < 40% | Up-and-Down Challenge |
| Range-course gap > 10yd | ClubStats range_avg - course_avg | Distance control + rationale about gap |
| Player noted struggle | "what_struggled" mentions club/skill | Boost that club/skill weight |
| Player set next_focus | "next_focus" mentions area | Use as secondary tag (lower weight) |
| Swing change context | Tag or notes mention "swing change" | Slow Motion Reps, Exaggeration, Video Check |
| Course has water carries | Hazard analysis for round-prep | Confidence drills at those distances |
| Hole is historically worst | Scoring history on that hole | Practice the club used on that hole |
