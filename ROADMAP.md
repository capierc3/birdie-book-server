# Birdie Book — Feature Roadmap

> Living document tracking planned features, improvements, and analysis tools.
> Items are grouped by theme and roughly ordered by priority within each group.
> Status: `[ ]` planned | `[~]` in progress | `[x]` done

---

## 1. Strokes Gained Category Dashboard

**Goal:** Surface the most actionable insight in golf — *where* the player is losing strokes — by rolling up per-shot SG data into the four standard categories.

### 1a. SG Category Rollup API `[x]`
- New endpoint: `GET /api/stats/strokes-gained`
- Aggregate `sg_pga` and `sg_personal` from `shots` table by shot type:
  - **Off the Tee** — `shot_type = TEE` on par 4s and par 5s
  - **Approach** — `shot_type = APPROACH` (non-tee shots ending before the green)
  - **Short Game** — `shot_type = CHIP` + any non-putt shot that starts within ~50 yards of the green
  - **Putting** — `shot_type = PUTT`
- Return per-round breakdown + overall averages
- Support date range and last-N-rounds filters

### 1b. SG Trends Over Time `[x]`
- Per-category SG values plotted as a line chart across rounds
- Rolling average overlay (5-round, 10-round)
- Highlight best/worst rounds per category

### 1c. SG Summary Card on Dashboard `[x]`
- At-a-glance card: "Your biggest opportunity is **Approach**, costing 2.3 strokes/round vs PGA"
- Color-coded bars for each category (green = gaining, red = losing)
- Tap to drill into category detail

### 1d. SG Per-Club Breakdown `[x]`
- Within each SG category, show which clubs contribute most to gains/losses
- e.g. "Your 7-iron approach SG is -0.4/shot (worst in bag)"

---

## 2. Scoring Trends & Key Stats

**Goal:** Give the player a visual sense of progress and surface the traditional stats that matter most.

### 2a. Score Over Time Chart `[x]`
- Line chart of total score (or score vs par) by round date
- Trend line / rolling average (configurable: 5, 10, 20 rounds)
- Filter by 18-hole vs 9-hole rounds

### 2b. Key Stats Dashboard Cards `[x]`
- **GIR %** (Greens in Regulation) — overall and trend
- **Fairway %** — overall and trend
- **Putts per Round** — overall and trend
- **Putts per GIR** — key efficiency stat
- **Scramble %** — up-and-down success when missing GIR
- **3-Putt Rate** — and trend
- Each stat clickable to see per-round detail

### 2c. Par Breakdown `[x]`
- Average score on Par 3s, Par 4s, Par 5s
- Scoring distribution per par type (birdie / par / bogey / double+ percentages)
- Trend over time for each par type

### 2d. Scoring Distribution `[x]`
- Histogram: birdies, pars, bogeys, doubles, triples+ across all rounds
- Per-round scoring distribution (stacked bar or pie)

---

## 3. Proximity & Dispersion Analysis

**Goal:** Leverage the rich spatial/GPS data to show shot patterns and miss tendencies.

### 3a. Club Dispersion Scatter Plot `[ ]`
- Per-club scatter: X = lateral miss (fairway_side_yards), Y = distance
- Overlay on a fairway-shaped target for context
- Toggle between on-course, range, and Trackman data
- Show dispersion ellipse or bounding area

### 3b. Miss Tendency Summary → Absorbed into 5a `[x]`
- Per-club: "You miss **68% LEFT** with Driver"
- Aggregate miss direction stats: left %, right %, center %
- On-course (fairway_side) + range (side_carry_yards) + Trackman root cause (face_angle, club_path, face_to_path)
- *Implemented in practice plan engine's `_build_miss_analysis()` and displayed in Game Analysis card*

### 3c. ~~Approach Proximity to Pin~~ → Absorbed into 5a `[x]`
- *Implemented in `_build_proximity_analysis()` — bucketed by distance, shows GIR%, proximity, SG per shot*

### 3d. On-Course vs Range Dispersion Comparison `[ ]`
- Side-by-side dispersion patterns: same club, course vs range
- Standard deviation comparison
- "Your 7-iron has 15yd std dev on course vs 8yd on Trackman"
- *Partial: range vs course gaps computed and displayed. Scatter plot visualization not yet built.*

---

## ~~4. Putting Analysis~~ `CANCELED`

> Canceled — Garmin only provides putt count per hole, no actual putt distances or GPS on green. Key putting stats (3-putt rate, putts/GIR) are already covered in the Stats dashboard (Feature 2). Dedicated putting analysis would require a putting-specific data source (Arccos, etc.) which is not planned.

---

## 5. Smart Practice Recommendations

**Goal:** Synthesize SG data, miss patterns, and club stats into specific, actionable advice.

### 5a. "Focus Areas" Engine `[x]`
- Analyze SG category data + per-club breakdowns
- Generate top 3+ practice recommendations with real numbers and rationales
- **Smart drill selection** using decision tree: miss direction → alignment drills, low smash → contact drills, wide dispersion → consistency drills
- **5 analysis functions**: miss direction (L/R/CENTER + Trackman root cause), approach proximity by distance bucket, scoring patterns (3-putt, scramble, bogey causes), player context (keyword extraction from post-round notes), range swing analysis (Trackman launch/impact data)
- **Focus tags system**: club tags, skill tags, situational tags (swing_change, scoring_zones), surprise-me randomization
- **41 drills in DB** (seeded defaults + user-created custom drills via drill browser)
- **Activity editing**: inline edit club/balls/focus, add/remove activities, drill browser with search/filter
- **Include 3c (Approach Proximity to Pin)** — avg proximity by distance bucket, per-club, weakest band highlighted in Game Analysis

### 5b. Range ↔ Course Gap Analysis `[x]`
- Flag clubs where range performance significantly differs from on-course
- "Your 7-iron carries 165 on Trackman but averages 158 on course — 7 yard gap"
- Gap trending: compare recent 5 rounds vs recent 3 range sessions → closing/widening/stable arrows
- Gap deltas in session review (before/after comparison)

### 5c. Progress Tracking Against Recommendations `[x]`
- Session review on completed plans: before/after comparison of SG categories, scoring patterns, miss direction, gaps
- Analysis snapshot saved at generation time, compared against fresh data after practice
- Link practice plans to range sessions for session-specific tracking

---

## 6. Weather Impact Analysis

**Goal:** Correlate weather conditions with performance to understand environmental effects.

### 6a. Score vs Weather Correlation `[ ]`
- Scatter plot: score vs wind speed, temperature
- "You score 3.2 strokes worse when wind > 15mph"
- Performance bands: calm / moderate / windy

### 6b. Distance vs Weather `[ ]`
- Average driving distance in different conditions
- Club distance adjustments by temperature
- "Your driver averages 12 yards shorter below 50F"

### 6c. Condition Tags on Rounds `[ ]`
- Auto-tag rounds: "Windy", "Cold", "Rain"
- Filter round history by conditions

---

## 7. Course-Specific Insights

**Goal:** For courses played multiple times, surface hole-by-hole intelligence.

### 7a. Per-Course Scoring History `[x]`
- All rounds at a course with scoring trend
- Best/worst round, average score
- Score vs par trend at that specific course

### 7b. Hole-by-Hole Difficulty Ranking `[x]`
- Your personal hardest → easiest holes at each course
- Average score per hole, SG per hole
- "Hole #7 costs you 0.8 strokes/round — you miss left into the bunker 75% of the time"

### 7c. Course Strategy Insights `[x]`
- Per-hole miss tendency and best club choice — *done in 14a/14b*
- Advanced strategy recommendations (risk/reward, lay-up analysis) — *moved to Backlog*

---

## 8. Handicap Tracking

**Goal:** Track official handicap progression using available scoring and course data.

### 8a. Handicap Index Calculation `[x]`
- Compute differentials: `(113 / slope) * (score - course_rating)`
- Use best 8 of last 20 differentials (USGA formula)
- Display current estimated handicap index

### 8b. Handicap Trend Chart `[x]`
- Plot handicap index over time
- Show contributing differentials
- Milestone markers ("Broke single digits!")

### 8c. Handicap Projection `[x]`
- Based on scoring trend, project when milestones might be reached
- "At your current improvement rate, you could reach a 10 handicap in ~N rounds"

---

## 9. Round Detail & Comparison

**Goal:** Give each round its own detail page with a full breakdown, then layer on comparison tools to understand what changed between rounds or vs historical averages.

### 9a. Round Detail Page `[x]`
- New route: `#round/{roundId}` → dedicated round summary page (currently skips straight to hole view)
- **Header:** Date, course name (linked), tee played, score, vs par
- **Stat cards:** Score, vs Par, GIR%, FW%, Putts, Putts/Hole, 3-Putt count
- **Scorecard table:** Hole-by-hole grid showing par, score, vs par, putts, fairway, GIR per hole
  - Color-coded: birdie/par/bogey/double+
  - Front 9 / Back 9 / Total subtotals
- **SG breakdown:** Per-category SG for this round (Off the Tee, Approach, Short Game, Putting)
- **Scoring distribution:** Birdie/par/bogey/double+ counts for this round
- **Action links:** View Holes Map, View Course, Previous/Next round navigation

### 9b. Round Comparison `[x]`
- Compare this round against a baseline:
  - Another specific round (ideally same course)
  - Your historical average (all rounds)
  - Last 5 / Last 10 / Last 20 rounds
  - Course average (all rounds at this course)
  - Date range (last month, last 3 months, etc.)
- Side-by-side stat cards: this round vs baseline (with delta arrows)
- Hole-by-hole comparison table: score, vs par, putts — highlighted where this round was better/worse
- SG category comparison: "You gained 1.2 strokes putting vs your last 10 avg"

### 9c. Best Round Replay `[x]`
- For any round, show what went right
- Which holes had the biggest SG gains
- What clubs performed best that day
- Highlight streaks (e.g. "4 pars in a row on holes 5-8")

---

## 10. Add New Course (Pre-Round Prep)

**Goal:** Let the player add a course they haven't played yet, populate it with OSM/API data, and edit hole details — so they can study the layout before playing.

### 10a. Course Search & Create Flow `[x]`
- New UI section or modal: "Add a Course"
- Search by course name using existing `POST /api/courses/osm/search`
- Show search results with course name, location, hole count
- On selection, create a new `GolfClub` + `Course` record
- Link to OSM via existing `POST /api/courses/{course_id}/osm/link` (with `import_features: true`)
- Fallback: manual entry if course not found in OSM (name, address, holes, par)

### 10b. Course Data Sync & Enrichment `[x]`
- After linking, trigger existing `POST /api/courses/club/{golf_club_id}/sync` to pull tee box data from golf course API
- Run OSM feature detection (`POST /api/courses/{course_id}/detect-features`) to find hazards, greens, fairways
- Import features automatically (`POST /api/courses/{course_id}/import-features`)
- Auto-match OSM holes to course holes

### 10c. Hole Editor `[x]`
- Full-screen satellite map editor with Roll20-style floating toolbar
- Edit per hole: par, yardage, handicap index via Hole Info panel
- Adjust tee/green GPS positions via draggable markers (locked when Draw panel closed)
- Visual map with overlaid hazards, fairway boundaries, green boundaries, fairway paths
- Drawing tools: place tee, green, FW line, FW boundary, green boundary, hazard polygons
- Context-sensitive object list (filtered by active tool + hazard type)
- Measure tool for distance research between any points on the map
- Independent floating panels (Hole Info, Draw Tools, Insights, Data Import) — each draggable, open simultaneously
- Smart panel positioning (left/right of toolbar based on screen position)
- Strategy insights panel with club recommendations, miss tendencies, scoring data

### 10d. Tee Box Management `[x]`
- Default tee preference in Settings (localStorage) `[x]`
- View/select tees via Hole Info dropdown `[x]`
- Add/edit/delete tee boxes manually in Hole Info panel `[x]`
- Per-tee: total yardage, par, rating, slope editing `[x]`

### 10e. Pre-Round Strategy View `[x]`
- Strategy tools panel: Dispersion Cone, Distance Arc, Carry Check, Club Recommendation
- Ruler (drag-to-measure) integrated into strategy panel
- Place Ball tool for custom shot origin
- Club-colored overlays using real performance data (lateral dispersion, miss tendencies, p10/p90)
- Mutual exclusion with drawing tools
- Right-click/middle-click panning during tool use

---

## 11. Mobile PWA — On-Course Mode

**Goal:** A mobile-first Progressive Web App experience for use during a round. Installable on Android and iOS home screens, works offline with pre-cached course data. Three phases: pre-round prep, hole-by-hole during play, and post-round reflection.

### 11a. PWA Foundation & Data Architecture `[ ]`
- Add `manifest.json` for home screen install (app name, icon, theme color, standalone display)
- Responsive CSS pass on all key views (or dedicated mobile layout)
- Detect mobile viewport and offer "On-Course Mode" vs desktop experience

**Data architecture — server DB is the single source of truth:**
- **Online (normal flow):** All writes go directly to the server API — notes, ratings, goals, hole tags save immediately to the DB. The phone stores nothing permanently; it's just a UI to the same FastAPI backend.
- **Offline (golf course fallback):** When the phone has no signal, writes queue in IndexedDB/localStorage as a temporary buffer. A sync manager replays queued writes to the server as soon as connectivity returns. Local copy is discarded after successful sync.
- **Read caching:** Course data, club distances, hole layouts, and historical stats are cached locally via service worker so the on-course UI works without signal. This is a read-only cache, not a second database.
- **Cache freshness:** On app open (or pull-to-refresh), fetch latest data from server and update the local cache. Covers scenarios where new rounds were imported on PC, clubs were updated, stats were recomputed, etc. Use ETags or last-modified timestamps to avoid re-downloading unchanged data.
- **Conflict resolution:** Simple last-write-wins for offline queue — if the same journal was edited on PC while the phone was offline, the phone's queued write overwrites. Acceptable for a single-user app. Show a warning if a conflict is detected.
- **Pre-round cache priming:** "Preparing for round at [course]..." fetches and caches all hole data, hazards, historical stats, and club distances for that course so everything is available even in a dead zone.

**What gets cached locally (read-only, refreshed on sync):**
- Course hole data (par, yardage, hazards, GPS, green shapes)
- Club distance card (avg, median, p10/p90 per club)
- Historical stats for selected course (scoring avg per hole, SG, miss patterns)
- SG category summaries (for goal suggestions)
- Recent round/range journals (for reflection review)

**What gets written to server immediately (or queued if offline):**
- Session journal records (pre/post notes, ratings, goals)
- Per-hole notes and tags
- Range session plans and in-session notes

### 11b. Pre-Round Questionnaire `[ ]`
- Select course and tee box for today's round
- **Mindset check-in** (uses existing `rounds` fields):
  - Energy level (1-5 scale) → `energy_rating`
  - Focus level (1-5 scale) → `focus_rating`
  - Physical feeling (1-5 scale) → `physical_rating`
  - Free-text: "How are you feeling today?" → `pre_session_notes`
- **Goal setting:**
  - Pick 1-3 focus areas for the round → `session_goals`
  - Suggested goals based on recent SG data (e.g. "Last 5 rounds your approach play cost 2.1 strokes — focus on committed iron swings?")
  - Custom goal entry
- **Quick stats glance:**
  - Your scoring history at this course (if played before)
  - Current key stats snapshot (FW%, GIR%, putts/round)
  - Any course-specific notes from prior rounds
- Creates a new round record (or links to Garmin round later) with pre-session data filled in

### 11c. Hole-by-Hole On-Course Screen `[ ]`
- Swipeable hole-by-hole view, large touch targets for on-course use
- **Per-hole info panel:**
  - Hole number, par, yardage (from selected tee)
  - Hazard locations and carry distances
  - Green shape/size if available
- **Historical data for this hole** (if played before):
  - Your average score on this hole
  - SG breakdown (where you gain/lose strokes here)
  - Common miss pattern ("You've missed left 3 of 4 times here")
  - Best club choices historically
  - Strategy insights from 14d: risk/reward suggestions, "laying up here saves 0.5 strokes on average"
  - Hole verdict context: difficulty ranking, your scoring distribution on this hole
- **Approach helper:**
  - "You're X yards out" → suggested club based on your distance data
  - Club distance card: quick reference of your carry/total per club
- **In-round note taking:**
  - Quick-tap tags: great drive, missed fairway L/R, GIR, up-and-down, 3-putt, penalty
  - Free-text note per hole ("Pulled 7-iron, was between clubs")
  - These notes attach to the round_hole record for later review
- **Running score card:**
  - Cumulative score vs par visible at all times
  - Simple +/- indicator per completed hole

### 11d. Post-Round Questionnaire `[ ]`
- Triggered when round is complete (or manually after syncing Garmin data)
- **Session reflection** (uses existing `rounds` fields):
  - Overall round rating (1-5) → `overall_rating`
  - "What worked well today?" → `what_worked`
  - "What did you struggle with?" → `what_struggled`
  - "Key takeaway from this round?" → `key_takeaway`
  - "What to focus on next time?" → `next_focus`
  - Free-text additional notes → `post_session_notes`
- **Data-prompted reflection:**
  - Show SG summary for the round (once Garmin data is synced)
  - "You gained 1.2 strokes putting today — best in 10 rounds"
  - "Approaches from 150+ cost you 2.1 strokes — matches your pre-round goal area"
  - Prompt user to reflect on whether goals were met
- **Round journal entry:**
  - Combined view of pre-round goals + post-round notes for a complete journal entry
  - Viewable later from round detail as a "Round Journal" tab

### 11e. Session Notes as Standalone Records `[ ]`
- On-course notes (pre-round, hole notes, post-round) are saved as a **session journal** record
  - Stored independently — not inside the `rounds` table directly
  - New model: `session_journal` with fields for all pre/post data, plus per-hole notes
  - Linked to a course + date, but NOT yet linked to a Garmin round
- The journal has full value on its own even if Garmin data is never imported
- If user also manually scores on mobile, that lives here too (separate from Garmin scoring)

### 11f. Data Linking — Round Journal ↔ Garmin Round `[ ]`
- **Context:** Garmin data must be imported via PC (FIT file upload or full account data export). There is no way to auto-sync from the watch on mobile. So linking happens after the fact, typically from the desktop web UI.
- **Linking flow (desktop UI):**
  - After importing Garmin data, show unlinked session journals in a "Link Notes" panel
  - Auto-suggest matches by course + date (most cases will be obvious 1:1 matches)
  - User confirms or manually picks the correct Garmin round to link
  - On link: merge journal data (notes, ratings, goals) into the Garmin round record
  - Hole-level notes merge into corresponding `round_holes` records by hole number
- **Linking flow (mobile UI):**
  - Same flow accessible from mobile — user may import on PC then link on phone later
  - "You have 3 unlinked journals" badge on the rounds section
  - Tap to review and confirm matches
- **API:**
  - `GET /api/journals/unlinked` — list session journals not yet linked to a round
  - `POST /api/journals/{journal_id}/link/{round_id}` — merge journal into round
  - `DELETE /api/journals/{journal_id}/unlink` — detach journal from round (keeps both records)
- **Edge cases:**
  - Multiple rounds same day/course: show both, let user pick
  - No Garmin data ever imported: journal stands alone as reflection record
  - Garmin round already has notes: prompt to overwrite or merge

---

## 12. Mobile PWA — At-Range Mode

**Goal:** Structured practice sessions with planning, in-session note-taking, and post-session reflection. Help the player practice with purpose instead of mindlessly hitting balls.

### 12a. Pre-Range Session Planning `[ ]`
- **Data-driven practice suggestions:**
  - Pull from SG category data: "Your biggest leak is approaches 125-175 yards"
  - Pull from dispersion data: "Your 7-iron has a 15yd std dev — work on consistency"
  - Pull from range ↔ course gaps: "Driver carries 245 on Trackman but 232 on course"
  - Show top 3-5 recommended focus areas with supporting stats
- **Build a range plan:**
  - User selects from suggestions or adds custom focus areas
  - Per focus area: which clubs, what drill/intent, how many balls
  - Example plan:
    - "Warm up — wedges, 15 balls"
    - "7-iron consistency — 20 balls, focus on tempo"
    - "Driver alignment — 15 balls, aim at specific target"
  - Save plan to a new `range_session` record (source = "app")
- **Quick start option:**
  - Skip planning, just start a session with a single tap

### 12b. During-Range Session Screen `[ ]`
- Shows current practice plan with progress indicators
- **Per-focus-area tracking:**
  - Current focus area highlighted
  - Tap to mark focus area as done, move to next
  - Ball count tracker (optional)
- **Live note-taking:**
  - Quick-tap tags per club/focus area: "feeling good", "pulling left", "tempo off", "found something"
  - Free-text notes: "Moving ball back in stance fixed the pull"
  - Voice-to-text option (uses device speech recognition)
  - Notes are timestamped and tied to the session
- **Reference data:**
  - Your target numbers for each club (carry, total, ball speed)
  - Quick access to club distance card
  - If using Trackman/Rapsodo simultaneously, notes will merge with imported shot data later

### 12c. Post-Range Session Reflection `[ ]`
- **Session recap:**
  - What was the plan? What did you actually work on?
  - Per-focus-area: how did it go? (thumbs up/down/neutral)
- **Reflection prompts:**
  - "What felt good today?"
  - "Any breakthroughs or discoveries?"
  - "What do you want to carry to the course?"
  - "What to work on next session?"
- **Link to data:**
  - If Rapsodo/Trackman data is imported for this session, show summary stats alongside notes
  - "You hit 20 shots with 7-iron. Avg carry: 168, Std dev: 7 (down from 12 last session)"
- **Session journal:**
  - Combined plan + notes + reflection saved as a viewable session journal
  - Accessible from range session detail view

### 12d. Range Session Model Updates `[ ]`
- Add pre/post session fields to `range_sessions` table (mirrors round fields):
  - `energy_rating`, `focus_rating`, `physical_rating`
  - `pre_session_notes`, `session_goals`, `session_plan` (JSON: structured plan data)
  - `overall_rating`, `what_worked`, `what_struggled`, `key_takeaway`, `next_focus`, `post_session_notes`
- New table or JSON field for in-session notes:
  - `range_session_notes`: timestamped notes tied to focus areas
- API endpoints for creating/updating session plans and notes from mobile

### 12e. Data Linking — Range Journal ↔ Range Session (Trackman/Rapsodo) `[ ]`
- **Same problem as rounds:** Trackman/Rapsodo data is imported via PC (CSV upload or Trackman URL). Mobile range notes exist independently until linked.
- **Linking flow (desktop or mobile UI):**
  - After importing Trackman/Rapsodo session, show unlinked range journals
  - Auto-suggest matches by date (and optionally time window)
  - User confirms link
  - On link: merge journal data (plan, notes, reflection) into the range session record
  - In-session notes attach to the session timeline alongside shot data
- **API:**
  - `GET /api/range/journals/unlinked` — list range journals not yet linked
  - `POST /api/range/journals/{journal_id}/link/{session_id}` — merge journal into range session
- **Combined view after linking:**
  - Range session detail shows shot data + interleaved timestamped notes
  - "During your 7-iron block, you noted 'moving ball back fixed the pull' — your dispersion tightened from shot 8 onward"
- **No data import?** Journal still stands alone as a practice log

### 12f. Practice History & Trends `[ ]`
- View past range sessions with plans, notes, and data together
- Track practice frequency and what you've been working on
- "You've spent 60% of range time on irons this month"
- Connect practice focus to on-course improvement: "Since focusing on 7-iron, your approach SG improved from -0.4 to -0.1"

---

## 13. UI / UX Improvements

**Goal:** General polish and quality-of-life improvements.

### 13a. Configurable Table Columns `[ ]`
- Let user choose which columns appear in rounds/shots tables
- Save column preferences

### 13b. Club Detail Page Enhancements `[ ]`
- Club head SVG diagrams (driver, iron, wedge, putter outlines)
- Shot history timeline
- Performance trend per club

### 13c. Dark Mode `[ ]`
- System-preference-aware dark theme

### 13d. Data Export `[ ]`
- Export rounds, stats, or analysis as CSV/PDF
- Shareable round summary

### 13e. Game Format / Scramble Support `[ ]`
- Toggle to include/exclude scramble rounds from stats
- Scramble-specific stats page or filtered view
- Game format tagging (stroke play, scramble, best ball, etc.)
- Filter stats/trends by game format

---

## 14. Hole-by-Hole Screen Overhaul

**Goal:** Rebuild the hole view screen with rich historical data, strategy insights, and improved visualization. Best tackled after the Round screen (9) is complete.

### 14a. Per-Hole Historical Stats `[x]`
- Integrate course-level hole difficulty data (from 7b) into the hole view
- Show avg score, avg vs par, birdie/par/bogey percentages for each hole
- Miss tendency summary: "You miss left 68% of the time on this hole"
- SG breakdown per hole across all rounds

### 14b. Club Usage & Strategy `[x]`
- Club usage history per hole ("Driver 4/5 times, fairway 60%")
- Most common miss by club on this hole
- Best club choice historically based on scoring outcomes
- Personal strategy notes field per hole for game planning

---

## 15. Course Data & OSM Contribution

**Goal:** Improve the hole data editing workflow and contribute course data back to OpenStreetMap so the wider golf community benefits.

### 15a. Hole Data Editor Improvements `[x]`
- Streamlined workflow for adding/editing tee positions, green boundaries, fairway paths per hole
- Bulk import from GPS traces (Garmin shot data can seed tee/green positions)
- Auto-detect tee/green positions from round shot data (first shot = tee, last non-putt = green area)
- Visual validation: show data completeness per hole (tee ✓, green ✓, fairway ✓, hazards ✓)
- "Data health" dashboard for each course showing what's missing

### 15b. Hazard & Feature Management `[x]`
- Improved hazard editor: draw bunkers, water, OB boundaries on the map
- Import hazards from OSM if available
- Classify hazard types (fairway bunker, greenside bunker, water carry, lateral water, OB)
- Attach hazards to specific holes for strategy context

### 15c. OSM Data Export & Contribution `[ ]`
- Export course data (tee positions, green boundaries, fairway paths, hazards) in OSM-compatible format
- Generate OSM changesets from Birdie Book course data
- Guided workflow: review data quality → preview changeset → submit to OSM
- Track which courses have been contributed, show "Contributed to OSM" badge
- Respect OSM contribution guidelines and tagging conventions (golf=hole, ref=hole_number, par=X, etc.)

### 15d. Community Course Data `[ ]`
- Share course data between Birdie Book users (opt-in)
- "Verified by N players" badge for community-validated hole data
- Merge/conflict resolution when multiple users have data for the same course
- Course data quality scoring based on GPS precision and completeness

---

## 16. Unified Hole Workspace

**Goal:** Merge the course editor and hole-by-hole review screen (`#round/{id}/hole/{n}`) into a single full-screen "hole workspace." One screen for editing, reviewing, and planning — no more switching between views. Builds on the Roll20-style floating panel system from Feature 10c.

### 16a. Scorecard Sub-Pane `[x]`
- New floating panel with scorecard grid (holes × yds / par / hcp / goal / score)
- Tee selector synced with Hole Info panel (changing one updates both)
- Round selector: blank (no rounds), historic average, or specific round
- Goal row: set a target score per hole for game planning
- Click a hole number to navigate to that hole on the map
- Front 9 / Back 9 / Total subtotals

### 16b. Hole Overview Sub-Pane `[x]`
- Stats row: Score, Putts, GIR, Fairway, SG vs PGA, SG vs Personal, Hole Avg, Hole Best
- Reads round context from Scorecard (no duplicate round selector)
- SG category breakdown per hole (Tee, Approach, Short Game, Putting)
- Miss tendency + club usage history + avg drive distance
- Score comparison to avg with verdict badges (Great hole / Above average / Average / Below average)
- Putts comparison to avg
- Scoring distribution (eagle/birdie/par/bogey/double+ counts)
- GIR rate, Difficulty rank (#1 hardest / easiest)
- Avg SG per category in historic mode
- Contextual hints when data is missing (add tee GPS, green GPS, fairway path)

### 16c. Shots Sub-Pane + Map Rendering `[x]`
- Shot list for the hole (club, shot type, distance, SG per shot)
- Click a shot → opens existing shot detail floating panel
- Render shots on map with numbered markers and shot lines (replicate current hole screen)
- Filter: all historic shots / specific round / planning mode
- Planning mode: tie into strategy tools (dispersion, carry check) to simulate shots

### 16d. Edit Hole Info → Tee Management `[x]`
- Tee box CRUD in Edit Hole panel: add, inline-edit, delete tees
- Per-tee fields: name, total yardage, par, course rating, slope rating
- All tee selectors (Edit Hole + Scorecard) sync after changes
- New POST `/api/courses/{id}/tees` endpoint for manual tee creation
- Notes field per hole deferred to 16f

### 16e. Navigation & Route Integration `[x]`
- `#round/{id}/hole/{n}` redirects to workspace with that round + hole pre-selected
- `#course/{id}/holes` redirects to `#course/{id}/edit`
- New route: `#course/{id}/edit/round/{roundId}/hole/{holeNum}` for deep-linking with round context
- All "View Holes" / "View Hole-by-Hole" links updated across the app
- Auto-selects correct tee, round, and hole when opening with round context
- Old hole-by-hole screen code preserved for now (can be removed after full testing)

---

## 17. Round Planning & Note Taking

**Goal:** Add pre-round planning and in-context note taking to the hole workspace. Let the player prepare a game plan, set goals, write strategy notes per hole, and capture post-round reflections — all within the same screen they use to review and edit course data.

### 17a. Per-Hole Strategy Notes `[x]`
- Add `notes` text field to CourseHole model (DB migration)
- Editable in the Planning panel with edit/save toggle
- Notes persist per course/tee/hole — not tied to a specific round
- Displayed as "Course Note" in the Planning panel context

### 17b. Round Planning Mode `[x]`
- Dedicated Planning floating panel (toolbar button) — keeps existing panels unchanged
- RoundPlan / RoundPlanHole / RoundPlanShot models in DB with full CRUD API (`/api/plans`)
- Plan selector + create new plan flow
- Per-hole strategy notes (plan-specific, auto-save on blur)
- Goal scores auto-sync to scorecard Goal row on shot changes
- Data-driven insights per hole: best tee club, fairway impact on scoring, club-score correlation, scoring distribution
- Smart club recommendations by shot type (tee/approach/short game/putt)
- Club filtering: Driver only off tee, Unknown excluded everywhere
- Link plan to actual played round / unlink / delete plan

### 17c. Shot Planning `[x]`
- Plan shot sequence per hole: select club from dropdown → "Place Shot" → aim on map
- Live dispersion cone follows cursor while aiming (inner ±1σ, outer ±2σ, club-colored)
- Distance + probability label at cursor during aiming
- Per-shot probability + cumulative plan probability chain
- Ball position auto-advances after each shot (distance from tee, distance to green)
- Green boundary detection: auto-switches to Putting mode when ball is on green
- Putt count entry (number input, no map placement needed)
- Shot delete with auto-renumber
- Cancel aiming via Escape key
- "What if" achieved via try/delete/retry workflow with live cone feedback

### 17d. Round Journal Integration — *moved to Backlog*

### 17e. Game Plan Export — *moved to Backlog*

### 17f. Context-Aware Strategy Insights `[x]` *(bonus — not in original plan)*
- Strategy Insights panel now responds to ball position (Place Ball or planned shot)
- Four contexts: From the Tee, Approach Shot, Short Game, On the Green
- Tee: club off tee, approach club, scoring avg, FW%, GIR%, miss tendency, dispersion
- Approach: recommended club + alternative, miss tendency, distance/lateral dispersion, approach SG
- Short Game: wedge recommendation, short game SG
- Green: putting SG
- Hazard distances computed from current ball position
- Auto-refreshes on Place Ball, ball reset, and planned shot changes

---

## 18. Frontend Modernization — React + Vite

**Goal:** Replace the vanilla JS / Jinja2 frontend with a React + Vite SPA. One codebase that serves both desktop and mobile, with PWA capabilities and offline support baked in from the start. This is the foundation that enables Features 11 (On-Course Mode) and 12 (At-Range Mode) and improves the developer experience for all future UI work.

**Why now:** The vanilla JS frontend has grown past the point where it's lightweight. Complex screens like the Hole Workspace with floating panels, Chart.js dashboards, and Leaflet map interactions are increasingly difficult to maintain and extend without a component model, proper state management, or a build pipeline. Migrating to React unlocks the ecosystem needed for mobile, offline, and the next generation of features.

### 18a. Project Scaffold & Build Pipeline `[x]`
- `frontend/` directory with Vite 8 + React 19 + TypeScript 6
- Vite config: `base: '/app/'`, dev proxy forwards `/api` to FastAPI at `:8000`
- `main.py` updated: conditional CORS middleware (`CORS_ORIGINS` env var), SPA catch-all at `/app/{path}` serving `frontend/dist/index.html`, static assets at `/app/assets/`
- Coexistence: legacy Jinja2 app at `/`, React SPA at `/app/`, API at `/api/*` — all work simultaneously
- Multi-stage Dockerfile: Node 20 builds frontend, Python 3.12-slim serves everything
- Libraries installed: react-router-dom, @tanstack/react-query, react-leaflet, leaflet, recharts, idb, lucide-react
- Note: `vite-plugin-pwa` incompatible with Vite 8 — service worker deferred, PWA manifest handled manually

### 18b. Shared Component Library `[x]`
- **Design tokens**: `styles/tokens.css` (dark theme CSS custom properties — colors, spacing, radii), `styles/reset.css` (global reset + score color classes)
- **Layout shell**: `AppLayout` (sidebar + main + mobile header + overlay), `Sidebar` (NavLink navigation with lucide icons, "Legacy App" escape hatch), `MobileHeader` (hamburger menu, hidden on desktop)
- **13 UI components** (CSS Modules, TypeScript props):
  - `Button` (primary/secondary/ghost, sm size, forwardRef), `Badge` (blue/green/yellow/muted)
  - `StatCard` (label, value, unit, sub-text), `Card` + `CardHeader` (container with title + action)
  - `Input`, `Select`, `FormGroup` (form primitives with forwardRef)
  - `DataTable<T>` (generic, sortable columns, clickable rows, empty state)
  - `Modal` (portal, overlay close, Escape key, body scroll lock)
  - `EmptyState`, `StatusMessage`, `ProgressBar`, `OfflineIndicator`
- **Utilities**: `cn()` class joiner, `scoreColors.ts` (score-vs-par → CSS class)
- Responsive breakpoints: 768px (mobile), 480px (small)

### 18c. Data Layer & API Client `[x]`
- `api/types.ts`: TypeScript interfaces for rounds, courses, clubs, stats domains (~300 lines)
- `api/client.ts`: typed fetch wrapper (`get`, `post`, `put`, `patch`, `del`) with `ApiError` class
- **TanStack Query hooks** (scoped to 18e screens — range, plans, practice, import deferred to 18f):
  - `useRounds(limit)`, `useRound(id)` — 5min staleTime default
  - `useCourses()`, `useCourse(id)`, `useCourseStats(id)`, `useGolfClubs()` — detail 2min stale
  - `useClubs(windowDays)`, `useClubDetail(id)`
  - `useSGSummary()`, `useSGTrends()`, `useScoring()`, `useHandicap()` — 10min staleTime
- Barrel export at `api/index.ts` for clean imports

### 18d. Offline & PWA Foundation `[x]`
- **PWA manifest**: `manifest.json` with app name, standalone display, theme colors, placeholder icons (192x192, 512x512)
- **Meta tags**: theme-color, apple-mobile-web-app-capable, apple-touch-icon in `index.html`
- **TanStack Query persistence**: `PersistQueryClientProvider` + custom IndexedDB persister via `idb`, 24-hour max cache age, `gcTime` matched to persist age
- **Offline write queue**: `lib/offlineQueue.ts` — `queueMutation()`, `replayMutations()`, `getPendingCount()`, `clearQueue()` backed by IndexedDB store `offline-mutations`
- **Hooks**: `useOnlineStatus()` (reactive online/offline), `useOfflineSync()` (auto-replays mutations on reconnect, tracks pending count + syncing state)
- **OfflineIndicator component**: fixed bottom bar, "Offline — N changes pending" / "Syncing..." with animated icon, auto-hides when online
- Note: service worker deferred (vite-plugin-pwa incompatible with Vite 8) — query persistence provides offline read capability without it

### 18e. Screen Migration — Phase 1: Core Screens `[x]`
- **Dashboard** (`features/dashboard/`): 3 top stat cards (Total Rounds, Courses, Handicap), 18-hole + 9-hole scoring breakdowns (count, best, avg vs par, std dev), SG summary card (4 category bars + biggest opportunity), key stats card (GIR%, FW%, Putts/Hole, Scramble%, 3-Putt%), recent rounds list (top 5 with score badge)
- **Rounds list** (`features/rounds/RoundsPage.tsx`): sortable DataTable (date, course, score, vs par, holes, shots, format), hole count filter (All/18/9), inline exclude toggle (PATCH), inline format dropdown, row click → detail
- **Round detail** (`features/rounds/RoundDetailPage.tsx`): header with score badge + metadata badges, 7 stat cards, full scorecard component (front 9 / back 9 with color-coded cells for eagle/birdie/bogey/double, putts, FW ✓/←/→, GIR ●/○), SG breakdown bars, round highlights (best/worst holes, birdies, putting, fairway accuracy)
- **Strokes Gained** (`features/strokes-gained/`): PGA/Personal baseline toggle, 4 category stat cards, Recharts LineChart trend (4 category lines), per-round table with colored SG values
- **Scoring/Stats** (`features/scoring/`): 6 stat cards, scoring distribution bars (Birdie+/Par/Bogey/Double/Triple+), par breakdown (3/4/5 with percentages), per-round table
- **Handicap** (`features/handicap/`): 4 summary cards, Recharts trend chart (reversed Y-axis, index + differential lines), projections (improvement rate + milestones), differentials table
- **Clubs/My Bag** (`features/clubs/`): data source selector (Course/Range/Combined), box plot visualization (whiskers min/max, box P10-P90, median line, avg dot), distance table with source badges (G/R/T/M)
- **Shared utilities**: `utils/format.ts` (formatVsPar, formatSG, formatPct, formatDate, stdDev, vsParColor, sgColor, formatGameFormat), `utils/chartTheme.ts` (Recharts dark theme, SG colors/labels), `styles/pages.module.css` (shared layout classes)
- All 7 screens use path-based routing via React Router (/, /rounds, /rounds/:id, /strokes-gained, /scoring, /handicap, /clubs)
- Remaining screens (Range, Courses, Practice, Import, Settings) show placeholder with "Coming soon" message
- Old Jinja2 code preserved — no deletions

### 18f. Screen Migration — Phase 2: Complex Screens `[x]`
- **Course Editor** (`features/course-map/`): full-screen Leaflet map with floating toolbar, hole-by-hole navigation, draggable floating panels (overview, scorecard, shots, insights, draw tools, edit hole), `react-leaflet-draw` for polygon/polyline editing (tee boxes, greens, fairways, hazards), back button overlay, mobile toolbar repositioning
- **Courses** (`features/courses/`): golf club grouping with nested course DataTables, course search/create with OSM lookup, course stats page with hole-by-hole stats, score trend chart, SG breakdown, differentials table
- **Range Sessions** (`features/range/`): sortable sessions table (date, source, shots, title), session detail with club group stats, delete with confirmation, Rapsodo/Trackman source labels
- **Practice Plans** (`features/practice/`): plan list with card grid (goal, status, progress bar, focus tags), 3-step creation wizard, plan detail page with session/activity breakdown, activity editor (inline edit, add/remove, drill picker), plan review with before/after deltas, `usePractice` hook with full CRUD
- **Data Import** (`features/import/`): tab-based interface (Garmin JSON, FIT File, Trackman URL, Rapsodo CSV), DropZone component for file uploads, per-source import flows
- **Settings** (`features/settings/`): default tee preference (localStorage), clear all data with double confirmation, rebuild personal baseline action
- All screens use path-based routing, TanStack Query hooks, and shared page layout classes

### 18g. Screen Migration — Phase 3: Mobile Layouts `[x]`
- **Bottom navigation bar**: 5-tab fixed bottom nav (Home, Rounds, Stats, Bag, More) replacing hamburger menu on mobile (≤768px), "More" tab opens slide-up panel with remaining 7 routes (Strokes Gained, Handicap, Range, Courses, Practice, Import, Settings)
- **Mobile header**: simplified to centered brand title bar (no hamburger button)
- **New components**: `useIsMobile()` / `useIsNarrow()` hooks (`hooks/useMediaQuery.ts`), `BottomNav` + `MoreMenu` layout components, `MobileCardList<T>` generic card list component
- **Table-to-card conversions**: DataTable replaced with MobileCardList on mobile for Rounds, Scoring stats-by-round, Handicap differentials, SG per-round breakdown, Range sessions — each with custom card layout showing key data
- **Responsive CSS across all shared components**: Card (16px padding), StatCard (14px padding, smaller value text), Button `.sm` (44px touch target), FormControls (44px min-height, 16px font to prevent iOS zoom), DataTable (tighter padding), FloatingPanel (bottom sheet at viewport bottom), pages.module.css (chart container padding, filter bar gap)
- **Chart height optimization**: all Recharts charts (HandicapTrend, ScoreOverTime, ScoringTrend, SGTrend, CourseScoreTrend) use responsive height (220-240px mobile vs 300-350px desktop) via `useIsMobile()`
- **Per-screen responsive fixes**: Settings (full-width selects), Import (horizontally scrollable tabs), Courses (stacked header/search), Practice (single-column grid), ClubsPage (stacked filter selects), RoundScorecard (compact cells with touch-friendly scrolling), CourseMap (44px toolbar icons, hidden bottom nav for full-screen immersive)
- **Touch optimization**: 44px minimum touch targets on buttons/selects/nav items, iOS safe area padding (`env(safe-area-inset-bottom)`) on BottomNav, `-webkit-overflow-scrolling: touch` on scroll containers
- **Z-index stack**: FloatingPanel(200) > MoreMenu(195) > Overlay(190) > BottomNav(180) > MobileHeader(150)
- Design tokens added: `--bottom-nav-height: 64px`, `--touch-target: 44px`, `--z-bottom-nav: 180`

### 18h. GPS Rangefinder Integration `[ ]`
- `navigator.geolocation.watchPosition()` for live GPS tracking
- Display user position on the Leaflet hole map as a pulsing marker
- Distance calculations using Haversine formula against cached course data:
  - Distance to green center / front / back
  - Distance to hazards (carry distances)
  - Distance from tee
- Club suggestion based on remaining distance vs club distance data
- Works on any device with GPS (phone browser, tablet) — no native app required
- Requires connectivity only for initial map tile loading; distances computed from cached hole geometry

### 18i. Legacy Cleanup `[ ]`
- Remove Jinja2 templates (`app/templates/`)
- Remove vanilla JS files (`app/static/js/`)
- Remove old CSS (`app/static/css/style.css`)
- Remove Chart.js and raw Leaflet CDN script tags from `base.html`
- Update Dockerfile to include `npm run build` step
- Update any documentation referencing the old frontend

**Migration strategy — incremental, never broken:**
- During migration, both old (Jinja2) and new (React) screens coexist
- React app mounts at `/app/` initially; legacy stays at `/`
- As screens are migrated, routes shift from legacy to React
- Once all screens are migrated (18i), React takes over `/` and legacy is removed
- At every phase, the app is fully functional — no "half-broken" intermediate states

---

## Completed Bonus Work (not in original roadmap)

- **Pin distance estimation**: Garmin doesn't track distance once ball is on green. Added putt-count-based estimation (1 putt=6ft, 2=22ft, 3+=40ft) with green boundary capping.
- **Personal baseline Green buckets**: Built Green expected-strokes buckets from putt count data so personal SG works for approach shots landing on green.
- **Putting SG from hole data**: Garmin records zero putt shots. Synthesized putting SG per hole from `round_holes.putts` and estimated first-putt distance.
- **Score vs par recomputation**: Fixed `score_vs_par` to compute from actual hole strokes and course par instead of trusting Garmin's value. Handles 9-hole rounds on 18-hole courses correctly.
- **Shot classification expansion**: Added RECOVERY, LAYUP, UNKNOWN shot types to SG classification (Approach or Short Game based on distance to green).
- **Shot deletion**: Added `POST /api/clubs/delete-shot` endpoint and UI in the Edit Shot modal.
- **Dashboard 9/18-hole breakdowns**: Replaced single "Avg Score vs Par" with separate 18-hole and 9-hole stat cards (count, best, avg vs par, std dev).
- **Smart Practice Plans (Feature 5)**: Full practice plan system with 3-step wizard, SG-weighted recommendation engine, 5 analysis functions (miss direction, approach proximity, scoring patterns, player context, range swing analysis), decision-tree drill selection, focus tags (club/skill/situational/surprise-me), 41 seeded drills in DB with drill browser + custom drill creation, activity editing (inline edit, add/remove, drill picker), range session linking, session review with before/after deltas, gap trending.
- **Drills database table**: `drills` table with 41 default practice drills seeded on first startup. Users can create custom drills. Drills linked to activities by FK. Drill browser with search/filter by category, focus area, club type, session type.
- **Focus tags system**: Shared tag vocabulary across practice plans and round plans. Predefined tags (clubs, skills, situational) + custom tags. Tags steer the recommendation engine: club tags boost allocation 5x, skill tags override focus area, situational tags modify behavior (swing_change → fewer clubs/deeper reps, scoring_zones → force approach+short game).
- **Practice plan decision tree**: Comprehensive decision tree document (`docs/practice-plan-decision-tree.md`) mapping every data point to drill selection logic, with fallback behavior for missing data at each tier (T0 no data → T4 full Trackman).
- **SQLite for production**: Switched default DATABASE_URL from PostgreSQL to SQLite. Updated docker-compose.yml (removed postgres service), Dockerfile, .env.example, alembic.ini. PostgreSQL migration path documented in Architecture Notes for future multi-user.
- **Automatic database backups**: Silent backup service — daily at midnight (keep 7), weekly (keep 4), pre-import snapshots before every data import (keep 5). Uses SQLite atomic backup API. Skips empty databases. Background scheduler thread. Manual trigger via `POST /api/settings/backup`.

---

## Implementation Notes

- **Data availability:** Most features in sections 1-4 can be built entirely from existing data (shots, round_holes, rounds tables). No new data collection needed.
- **SG is the foundation:** The strokes gained category rollup (1a) is the highest-leverage feature — it powers recommendations (5a), identifies weaknesses, and is the most actionable stat in golf analytics.
- **Existing API infrastructure:** The Add New Course feature (10) can be built almost entirely on existing endpoints — the main work is the UI flow to tie them together and the pre-round strategy view.
- **Mobile PWA (11-12) depends on analytics (1-5) and frontend modernization (18):** The on-course and at-range screens are most powerful when they can surface SG insights, practice recommendations, and historical patterns. Build the analytics engine first. The React migration (18) provides the component model, offline data layer, and PWA foundation that Features 11-12 build on top of — do 18a-18d before starting 11/12 mobile screens.
- **Journal-first, link-later architecture:** Mobile notes are stored as standalone journal records (not directly in `rounds` or `range_sessions`). Data from Garmin/Trackman/Rapsodo is imported separately via PC. The two are linked after the fact by matching course+date (rounds) or date (range). This avoids any dependency on mobile data import and lets each record have value independently.
- **Existing round fields still useful:** The `rounds` table already has pre/post session fields. When a journal is linked to a round, the journal data merges into these fields. The range session model needs those fields added (12d).
- **Server-first, offline-resilient:** The server DB is the single source of truth. All writes go directly to the API when online. Offline is a fallback only — IndexedDB queues writes and replays them on reconnect. Read data (course info, stats, club distances) is cached locally via TanStack Query persistence so the UI works without signal but is refreshed from the server whenever connectivity is available.
- **React migration is incremental:** Feature 18 migrates screens one at a time. During migration, Jinja2 and React coexist — React mounts at `/app/`, legacy stays at `/`. Once all screens are ported, React takes over `/` and legacy templates are removed. The FastAPI backend and all API endpoints remain unchanged throughout.
- **Incremental delivery:** Each numbered section is independent and can be shipped standalone. Sub-items within a section should generally be done in order (a → b → c).

---

## Backlog (Future Enhancements)

> Items moved here from completed features. Not prioritized — revisit when enough data exists or when a related feature makes them relevant.

### Shot Pattern Visualization (from 14c)
- Shot pattern overlay on the hole map (all historical shots)
- Dispersion visualization: where tee shots land, approach miss patterns
- Side-by-side: historical patterns vs a specific round's actual shots
- Color-coded by outcome (fairway, rough, hazard, green)
- *Best tackled after 20+ rounds at a course provide enough data for meaningful patterns*

### ~~Course Strategy Insights (from 14d)~~ → Absorbed into Feature 17b/17c

### Planned vs Actual Shot Comparison (from 17c)
- Overlay planned shot route vs actual shots from a linked round
- Side-by-side: planned aim points vs actual landing spots
- Delta analysis: how far off was each shot from the plan?
- *Requires linked round with shot GPS data — build after more plans are played*

### Round Journal Integration (from 17d)
- Post-round reflection notes per hole (what worked, what didn't)
- Link journal entries to specific rounds (extends existing Round notes model)
- Per-hole tags: "Great drive", "Missed green left", "3-putt" (quick tagging)
- View journal entries in the Hole Overview when reviewing a past round
- *Needs data/UX research — defer until planning workflow is battle-tested*

### Data Export (from 17e + 13d)
- Export game plans as printable summary (PDF or formatted page)
- Hole-by-hole: yardage, par, goal, planned club, strategy notes, key stats
- Broader scope: export rounds, stats, club data as CSV/JSON/PDF
- Shareable round summaries and game plans
- *Plan all export formats together as one cohesive feature*

### Trackman Account Sync (API Discovery — April 2026)
Reverse-engineered the Trackman undocumented API. A "Connect to Trackman" flow could auto-import sessions without manual URL pasting.

**What we confirmed works:**
- `GET https://golf-player-activities.trackmangolf.com/api/activities` — lists all user activities (paginated: `page`, `pageSize`, `total`). Requires Bearer token from Trackman portal auth.
- Auth flow: `GET https://portal.trackmangolf.com/api/account/me` (with session cookie) returns `{ accessToken, refreshToken, expires }`. The `accessToken` (JWT) is used as `Authorization: Bearer` for the activities API.
- Activity kinds observed: `dynamic-report`, `urn:trackman:dr:practice:1`, `urn:trackman:dr:find-my-distance:1`, `video`
- `dynamic-report` activities contain `activityData.ReportId` — can be imported via existing `POST /api/reports/getreport` with `{"ReportId": "..."}` (no auth needed, public endpoint)
- `?a=` URL activities (e.g. practice on TPS units) use `POST /api/reports/getactivityreport` with `{"ActivityId": "..."}` (no auth needed, public endpoint). Response structure is identical to `getreport`.
- Practice sessions (`urn:trackman:dr:practice:1`) — metadata accessible via authenticated API but **stroke data is NOT available** through `getactivityreport` (returns 404). Practice data appears to only live in the Trackman mobile app. Sub-resource paths (`/strokes`, `/events`, `/shots`, `/measurements`, `/report`) all return 404.

**Potential "Connect to Trackman" feature:**
1. User logs into Trackman portal in browser → we grab `accessToken`
2. List activities → filter to `dynamic-report` kind
3. Auto-import any sessions not already in our DB (match on `report_id`)
4. Skip `video` and `practice` types (no accessible stroke data)

**Open questions:**
- Token refresh flow — `refreshToken` is available but we haven't tested the refresh endpoint
- Token lifetime (`expires` field observed) — how long before re-auth needed?
- Whether Trackman will ever expose practice stroke data via API
- *For now, CSV import and OCR remain the only paths for Trackman Range practice sessions*

---

## Architecture Notes

### Database: SQLite (current) → PostgreSQL (if multi-user)

**Current:** SQLite is the default for both dev and deployed. Single-file, zero-config, sufficient for single-user with thousands of rounds.

**If multi-user is adopted**, migrate to PostgreSQL:
- Update `DATABASE_URL` in `.env` to `postgresql://...`
- Add `db` service back to `docker-compose.yml` (postgres:16-alpine)
- Add `alembic upgrade head` back to Dockerfile CMD
- `psycopg2-binary` is already in requirements.txt
- `app/database.py` already handles both SQLite and PostgreSQL (connection args, foreign key pragmas)
- Run Alembic migrations to create schema in PostgreSQL
- Test: concurrent writes, connection pooling, JSON field queries
- Consider: user authentication, row-level security, connection limits
