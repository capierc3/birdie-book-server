# Course Data Enrichment — Planning Document

## 1. Data Comparison Across Import Sources

### What Each Source Provides

| Category | Data Point | Garmin (Course) | MLM2PRO (Range) | Trackman (Range) |
|----------|-----------|-----------------|-----------------|------------------|
| **Distance** | Carry | -- | ✓ | ✓ |
| | Total | GPS-calculated | ✓ | ✓ |
| | Side (L/R) | -- | ✓ | ✓ |
| | Side Total | -- | -- | ✓ |
| | Apex/Height | -- | ✓ | ✓ |
| | Curve | -- | -- | ✓ |
| **Speed** | Ball Speed | -- | ✓ | ✓ |
| | Club Speed | -- | ✓ | ✓ |
| **Angles** | Launch Angle | -- | ✓ | ✓ |
| | Launch Direction | -- | ✓ | ✓ |
| | Attack Angle | -- | ✓ | ✓ |
| | Club Path | -- | ✓ | ✓ |
| | Descent/Landing | -- | ✓ | ✓ |
| | Face Angle | -- | -- | ✓ |
| | Face to Path | -- | -- | ✓ |
| | Dynamic Loft | -- | -- | ✓ |
| | Spin Loft | -- | -- | ✓ |
| | Swing Plane | -- | -- | ✓ |
| | Swing Direction | -- | -- | ✓ |
| | Dynamic Lie | -- | -- | ✓ |
| **Spin** | Spin Rate | -- | ✓ | ✓ |
| | Spin Axis | -- | ✓ | ✓ |
| **Impact** | Impact Offset | -- | -- | ✓ |
| | Impact Height | -- | -- | ✓ |
| | Low Point | -- | -- | ✓ |
| **Derived** | Smash Factor | -- | ✓ | ✓ |
| | Hang Time | -- | -- | ✓ |
| **Location** | Start GPS | ✓ | -- | -- |
| | End GPS | ✓ | -- | -- |
| | Start/End Lie | ✓ | -- | -- |
| | Shot Type | ✓ (TEE/APPROACH/CHIP/PUTT) | -- | -- |
| **Context** | Hole Number | ✓ | -- | -- |
| | Course/Round | ✓ | -- | -- |
| | Fairway Hit | ✓ | -- | -- |
| | GIR | ✓ | -- | -- |
| | Putts | ✓ | -- | -- |
| **Trajectory** | 3D Ball Path | -- | -- | ✓ |

### The Gap
Garmin gives **where** (GPS, lies, shot context) but not **how** (no swing/ball data).
Launch monitors give **how** (speeds, angles, spin) but not **where** (no GPS).

---

## 2. What We Can Compute from Course Geometry Data

### Available Geometry per Hole
- **Tee position**: `tee_lat`, `tee_lng` (manually placed or inferred from first shot)
- **Flag/Green position**: `flag_lat`, `flag_lng` (manually placed or inferred from last shot end)
- **Fairway path**: `fairway_path` JSON — array of `[lat, lng]` waypoints (user-drawn centerline)
- **Par, Yardage, Handicap**: from golf course API sync
- **Hole image**: satellite view with known center, zoom, dimensions

### Computable Metrics from Geometry + GPS Shots

| Metric | What It Tells You | Required Data | How to Compute |
|--------|-------------------|---------------|----------------|
| **Side from fairway** | How far L/R the ball landed from the fairway centerline (yards) | fairway_path + shot end GPS | Find closest point on fairway polyline, compute perpendicular distance. Sign: +R, -L relative to play direction |
| **Distance along fairway** | How far down the hole the ball advanced (useful distance) | fairway_path + shot start/end GPS | Project shot end point onto fairway path polyline, measure arc length from tee |
| **Pin distance remaining** | How far from the pin after each shot | flag GPS + shot end GPS | Haversine distance from end GPS to flag |
| **Strokes gained baseline** | Expected strokes from this distance/lie | end GPS + end lie + pin distance | Lookup from strokes gained tables (PGA baseline) |
| **Fairway corridor miss** | Whether shot landed in fairway corridor (L/R/hit) | fairway_path + shot end GPS + fairway width estimate | Check if perpendicular distance < estimated fairway half-width (~15-20 yds) |
| **Green proximity** | Distance to pin on approach shots | flag GPS + shot end GPS (approach/chip shots) | Haversine from shot end to flag |
| **Dispersion pattern** | Scatter plot of where shots land relative to target | Multiple shot end GPS + flag/fairway | Aggregate end positions relative to target |
| **Effective distance vs GPS distance** | How much of the GPS distance was "useful" toward the hole | fairway_path + shot vectors | Project shot vector onto fairway direction at shot start point |
| **Miss tendency** | Does the player tend to miss left or right per club | Aggregate side-from-fairway by club | Statistical analysis of signed side distances |

### Metrics That DON'T Require Fairway Path
These only need tee + flag positions:
- Pin distance remaining (after each shot)
- Total distance to pin (hole length validation)
- Green proximity (approach shots)
- Simple dispersion around pin (on approach/chip shots)

### Metrics That DO Require Fairway Path
- Side from fairway centerline
- Distance along fairway (useful distance)
- Fairway corridor hit/miss
- Effective distance vs GPS distance
- Miss tendency by direction

---

## 3. Fairway Path Quality — How Many Waypoints?

### What the Fairway Path Represents
The `fairway_path` is a **centerline** of the ideal play route. On a straight hole it could be 2-3 points (tee → landing zone → green). On a dogleg it needs waypoints at the turn.

### Waypoint Guidelines

| Hole Type | Minimum Waypoints | Recommended | Notes |
|-----------|------------------|-------------|-------|
| Straight par 3 | 2 | 3 | Tee → mid → green |
| Straight par 4 | 3 | 5 | Tee → landing → approach → green entrance → pin |
| Straight par 5 | 4 | 6-7 | More landing zones to cover |
| Dogleg par 4 | 5 | 7-8 | Need 2-3 points through the turn |
| Double dogleg par 5 | 7 | 10-12 | Each turn needs 2-3 points |
| Island green / peninsula | 3 | 4-5 | Mostly about approach targeting |

### Quality Assessment
- **2-3 points**: Bare minimum — only gives rough direction, poor side-distance accuracy on doglegs
- **5-7 points**: Good — handles single doglegs well, reasonable perpendicular distance calc
- **8-12 points**: Excellent — smooth curves, accurate side distances everywhere
- **12+ points**: Diminishing returns unless the hole has extreme curves

### Perpendicular Distance Accuracy
The key metric we want (side from fairway) depends on having enough density at the point where shots land. A drive that lands 250 yards out needs the fairway path to have points both before and after that distance so the perpendicular can be computed accurately.

**Rule of thumb**: At least one waypoint every 40-60 yards along the hole.
- Par 3 (150 yds): 3-4 points
- Par 4 (400 yds): 7-8 points
- Par 5 (550 yds): 10-12 points

### Current UI for Drawing Fairway Paths
The "Draw Fairway" tool lets users click points on the hole map to create the path. Points are saved as `[lat, lng]` pairs in order from tee to green.

### Possible Improvements
1. **Auto-suggest fairway path**: Use the tee and green positions to create a straight-line default path. User can then add bend points for doglegs.
2. **Waypoint density indicator**: Show the user how many points they've placed and suggest more if below threshold.
3. **Snap to shot data**: If enough rounds are played, auto-generate a fairway centerline from the aggregate of tee shot landing positions.
4. **Import from course data**: Some course databases include GIS data for fairways — could potentially import.

---

## 4. Implementation Priority

### Phase 1: Side-from-fairway computation (highest value)
- Compute perpendicular distance from shot end point to fairway path polyline
- Store as `side_from_fairway_yards` on Shot (or compute on-the-fly)
- This makes Garmin shots comparable to range shots on dispersion charts
- Requires: fairway_path with 5+ waypoints

### Phase 2: Pin distance remaining
- Simple Haversine from shot end GPS to flag GPS
- Store as `pin_distance_remaining_yards` on Shot
- Useful for approach shot analysis and strokes gained baseline
- Requires: flag position only

### Phase 3: Distance along fairway (useful distance)
- Project shot onto fairway path to get "how far did this advance the ball toward the hole"
- More meaningful than raw GPS distance for off-line shots
- Requires: fairway_path

### Phase 4: Strokes gained
- Using pin distance + lie type, look up expected strokes from PGA baseline data
- Compute strokes gained per shot = expected_before - expected_after - 1
- Requires: pin distance + strokes gained lookup tables

---

## 5. GPS Distance Computation Reference

### Haversine Formula (for short golf distances, accuracy ~0.1 yard)
```python
import math

def haversine_yards(lat1, lng1, lat2, lng2):
    R = 6371000  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    meters = R * c
    return meters * 1.09361  # meters to yards
```

### Perpendicular Distance to Polyline
```python
def point_to_segment_distance(px, py, ax, ay, bx, by):
    """Distance from point P to line segment AB."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return math.hypot(px - proj_x, py - proj_y)
```

For GPS coordinates, convert to a local Cartesian frame first (using the hole center as origin), compute perpendicular distance, then convert back to yards.
