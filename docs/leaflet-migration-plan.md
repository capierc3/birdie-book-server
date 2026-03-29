# Leaflet.js Migration Plan

## Overview

Replace the current Google Static Maps + Canvas overlay system with an interactive Leaflet.js map. This eliminates the complex pixel↔GPS coordinate math, crop/offset hacks, and static image caching in favor of a proper mapping library with built-in support for markers, polylines, and drawing tools.

## Current System vs Leaflet

| Feature | Current (Canvas) | Leaflet |
|---------|------------------|---------|
| Base imagery | Google Static Maps API (cached JPGs) | Tile-based satellite (ESRI/Google), loads on demand |
| Shot overlay | Manual GPS→pixel conversion, Canvas draw | Marker/Polyline layers, automatic GPS positioning |
| Fairway drawing | Click-to-place points on Canvas | Leaflet.Draw polyline with drag-to-edit |
| Tee/Green placement | Click Canvas, manual offset calc | Draggable markers with GPS snapping |
| Zoom/Pan | Fixed static image, no zoom | Native pinch-zoom, scroll-zoom, pan |
| Rotation | CSS rotation hack on image | Bearing-based map rotation (or keep north-up) |
| Crop/Bounds | Pixel-ratio crop stored, re-fetch image | `fitBounds()` auto-frames the hole |
| Coordinate conversion | Custom Mercator functions (70+ lines) | Built-in `latLngToContainerPoint()` |
| Image caching | Server-side JPGs, re-fetch on edit | Tiles cached by browser automatically |
| Performance | Re-renders entire Canvas on update | Only redraws changed layers |

## What We Gain

1. **Interactive maps** — zoom into a shot cluster, pan around the hole
2. **Better fairway drawing** — drag waypoints to adjust, insert points mid-path
3. **Green boundary drawing** — polygon/freehand draw around the green shape
4. **Multiple tee markers** — place Blue, White, Red tees on different spots
5. **Measurement tools** — click two points to get distance in yards
6. **Layer toggles** — show/hide shots, fairway, tees, green boundary
7. **No more offset hacks** — GPS coords just work, no crop math needed
8. **Mobile-friendly** — touch gestures built in

## What We Keep

- All existing data models (CourseHole fields: tee_lat/lng, flag_lat/lng, fairway_path, par, yardage, handicap)
- The API endpoints for hole editing
- The scorecard grid below the map
- Shot data rendering (just using Leaflet markers instead of Canvas arcs)
- Course sync from golf course API

## What We Remove

- `app/services/image_service.py` — no more server-side image fetching/caching
- `HoleImage` model — no more cached satellite images on disk
- `app/static/images/holes/` directory — tile caching handled by browser
- `rotation_deg` on CourseHole — Leaflet handles orientation differently
- `custom_zoom` on CourseHole — Leaflet auto-fits bounds
- `custom_bounds` on CourseHole — no more pixel-ratio crops
- `shot_offset_x`, `shot_offset_y` on CourseHole — no more offset hacks
- `gpsToPixel()`, `pixelToGps()` functions in app.js — Leaflet handles this
- `/api/images/` router — no more image management API

## What We Add to Data Model

### CourseHole — new fields
```
green_boundary    Text (JSON)  — polygon coords: [[lat,lng], ...] defining green edge
tee_positions     Text (JSON)  — {tee_name: {lat, lng}} for multiple tee boxes
elevation_tee_ft  Float        — elevation at tee (from USGS API, future)
elevation_green_ft Float       — elevation at green (from USGS API, future)
```

### CourseHole — fields to deprecate (keep for now, stop using)
```
rotation_deg      — Leaflet handles orientation
custom_zoom       — Leaflet auto-fits
custom_bounds     — no more cropping
shot_offset_x/y   — no more offset hacks
```

## Satellite Tile Options

### ESRI World Imagery (recommended)
```
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```
- Free for non-commercial / development use
- Good quality satellite imagery
- No API key needed
- Attribution required: "Tiles © Esri"

### Google Satellite (via Leaflet)
```javascript
L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 22,
    attribution: '© Google'
})
```
- Uses our existing Google Maps API key
- Highest quality imagery
- Technically against TOS for use outside Google Maps JS API

### Mapbox Satellite
- Requires API key, free tier 50K loads/month
- Good quality, smooth rendering
- Better programmatic control

**Recommendation**: Start with ESRI (free, no key), switch to Mapbox if we need better quality or 3D later.

## Implementation Phases

### Phase 1: Basic Leaflet Map (replace static image)

**Goal**: Show the hole on an interactive satellite map with shot overlays.

1. Add Leaflet CSS/JS to `base.html` (CDN)
2. Replace the `<canvas>` + `<img>` in hole view with a `<div id="hole-map">` for Leaflet
3. Initialize Leaflet map with ESRI satellite tiles
4. Auto-fit bounds using tee/green/shot positions (`map.fitBounds()`)
5. Render shots as polylines with arrowheads (Leaflet `L.polyline`)
6. Color-code shots by club (using existing club colors)
7. Show tee marker (green circle) and flag marker (red flag icon)
8. Draw fairway path as a dashed yellow polyline
9. Support both historic mode (semi-transparent shots) and round mode (numbered shots)
10. Shot click → highlight in scorecard, show detail

**Files changed**: `app/static/js/app.js` (hole view section), `app/templates/index.html`, `app/templates/base.html`

### Phase 2: Edit Mode with Leaflet.Draw

**Goal**: Replace Canvas edit tools with proper Leaflet drawing.

1. Add Leaflet.Draw plugin
2. **Place Tee**: Draggable marker, click to place, drag to adjust
3. **Place Green**: Draggable marker for flag position
4. **Draw Fairway**: Editable polyline — click to add points, drag points to adjust, double-click to finish
5. **Draw Green Boundary**: Polygon tool — draw the green outline by clicking corners, close the shape
6. Par/yardage/handicap inputs stay as they are (form fields)
7. Save sends GPS coords to API (same endpoint, no change needed)
8. Remove: crop tool, rotation tool, offset calculation — none needed with Leaflet

### Phase 3: Multiple Tee Positions

**Goal**: Support placing tee markers for each tee (Blue, White, Red, etc.).

1. Course sync tells us which tees exist (from `CourseTee` records)
2. UI shows a tee selector: "Place tee for: [Blue] [White] [Red]"
3. Each tee gets a colored draggable marker on the map
4. Stored as `tee_positions` JSON on CourseHole: `{"Blue": {"lat": 42.33, "lng": -83.12}, "White": {...}}`
5. When viewing a round, show the tee that was played (from `Round.tee_id`)
6. Yardage display updates based on selected tee position → flag distance

### Phase 4: Smart Fairway Placement

**Goal**: Guide users to place fairway waypoints at optimal locations.

1. If course is synced, we know par and yardage
2. Auto-generate initial straight-line path from tee → green
3. Prompt user: "This is a par 4 (420 yds). Place waypoints to mark the fairway. Recommended: 7-8 points."
4. As user places points, show distance from previous point
5. Suggest spacing: display rings at 40-60 yard intervals along current path
6. For doglegs: "Click to add a bend point at the dogleg"
7. Validate: warn if any segment > 80 yards without a waypoint
8. If no course sync data: prompt "Sync course data first for best results" with link to sync button

### Phase 5: Green Boundary Drawing

**Goal**: Allow users to draw the green shape.

1. Add polygon drawing tool for the green
2. User clicks around the green perimeter (8-15 points for a natural shape)
3. Or freehand draw mode — click and drag to trace the edge
4. Store as `green_boundary` JSON on CourseHole
5. Render as a semi-transparent green-colored polygon on the map
6. Use for: proximity-to-green calculations, GIR validation, approach shot analysis

### Phase 6: Cleanup

1. Remove `image_service.py` and `images` API router
2. Remove `HoleImage` model (keep table for migration safety)
3. Remove cached image files from `app/static/images/holes/`
4. Remove `rotation_deg`, `custom_zoom`, `custom_bounds`, `shot_offset_x/y` from CourseHole (or just stop reading them)
5. Remove `gpsToPixel`, `pixelToGps` from app.js
6. Remove all Canvas-based hole rendering code

## Library Dependencies

```html
<!-- Leaflet core -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<!-- Leaflet.Draw plugin (for edit mode) -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>
```

No npm/bundler needed — CDN links in `base.html`, same pattern as Chart.js.

## Migration Safety

- **No data loss** — all existing CourseHole data (tee/flag GPS, fairway path, par/yardage) is preserved
- **No API changes** — the hole update endpoint accepts the same fields
- **Gradual rollout** — can keep the old Canvas renderer as a fallback behind a feature flag
- **Backwards compatible** — old `rotation_deg`, `custom_bounds` fields just get ignored

## Leaflet Map Initialization Example

```javascript
// Initialize map
const map = L.map('hole-map', {
    zoomControl: true,
    attributionControl: true,
});

// ESRI satellite tiles
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    attribution: 'Tiles © Esri'
}).addTo(map);

// Auto-fit to hole bounds
const bounds = L.latLngBounds([
    [tee_lat, tee_lng],
    [flag_lat, flag_lng],
    ...shotPositions
]);
map.fitBounds(bounds, { padding: [40, 40] });

// Tee marker
L.circleMarker([tee_lat, tee_lng], {
    radius: 8, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 0.8
}).addTo(map).bindTooltip('Tee');

// Flag marker
L.marker([flag_lat, flag_lng], {
    icon: L.divIcon({ className: 'flag-icon', html: '⛳' })
}).addTo(map);

// Shot polyline
L.polyline([[start_lat, start_lng], [end_lat, end_lng]], {
    color: clubColor, weight: 3, opacity: 0.7,
    dashArray: null // solid line
}).addTo(map);

// Fairway path
L.polyline(fairwayCoords, {
    color: '#FFD700', weight: 2, dashArray: '8, 6',
    opacity: 0.6
}).addTo(map);
```

## Estimated Scope

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Basic map | Medium | Leaflet CDN |
| Phase 2: Edit mode | Medium | Leaflet.Draw CDN |
| Phase 3: Multiple tees | Small | Phase 2, CourseTee data |
| Phase 4: Smart fairway | Small | Phase 2, course sync data |
| Phase 5: Green boundary | Small | Phase 2 |
| Phase 6: Cleanup | Small | All phases complete |

Phases 1-2 are the core migration. Phases 3-5 are enhancements. Phase 6 is cleanup.
