document.addEventListener('DOMContentLoaded', () => {

    // ========== SPA Navigation ==========
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuToggle = document.getElementById('menu-toggle');
    const sections = document.querySelectorAll('.content-section');
    const navItems = document.querySelectorAll('.nav-item[data-section]');

    function navigateTo(sectionId) {
        // Exit hole edit mode when navigating away
        if (typeof holeEditMode !== 'undefined' && holeEditMode && sectionId !== 'section-hole-view') {
            exitEditMode();
        }

        sections.forEach(s => s.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));

        const target = document.getElementById(sectionId);
        if (target) target.classList.add('active');

        const navLink = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (navLink) navLink.classList.add('active');

        // Close mobile sidebar
        sidebar.classList.remove('open');
        overlay.classList.remove('open');

        // Scroll to top
        window.scrollTo(0, 0);

        // Re-render box plot when clubs section becomes visible (fixes zero-width canvas)
        if (sectionId === 'section-clubs' && _lastBoxPlotClubs) {
            requestAnimationFrame(() => renderClubBoxPlot(_lastBoxPlotClubs));
        }

        // Load strokes gained data when navigating to that section
        if (sectionId === 'section-strokes-gained') {
            loadStrokesGained();
        }
        if (sectionId === 'section-handicap') {
            loadHandicap();
        }
        if (sectionId === 'section-scoring') {
            loadScoringStats();
        }
        // Invalidate editor map size when entering full-screen editor
        if (sectionId === 'section-course-editor' && typeof editorMap !== 'undefined' && editorMap) {
            requestAnimationFrame(() => editorMap.invalidateSize());
        }
    }

    // Sidebar nav clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = item.dataset.section;
            window.location.hash = item.getAttribute('href');
            navigateTo(sectionId);
        });
    });

    // In-page nav links (e.g. "View All" buttons)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link[data-section]');
        if (link) {
            e.preventDefault();
            const sectionId = link.dataset.section;
            const hash = link.getAttribute('href');
            if (hash) window.location.hash = hash;
            navigateTo(sectionId);
        }
    });

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
        handleRoute();
    });

    function handleRoute() {
        const hash = window.location.hash.replace('#', '');

        // Round hole view route: round/123/hole/5 (check FIRST — more specific)
        const roundHoleMatch = hash.match(/^round\/(\d+)\/hole\/(\d+)$/);
        if (roundHoleMatch) {
            const roundId = parseInt(roundHoleMatch[1]);
            const holeNum = parseInt(roundHoleMatch[2]);
            const round = roundsCache.find(r => r.id === roundId);
            if (round && round.course_id) {
                navigateTo('section-hole-view');
                loadHoleView(round.course_id, roundId, holeNum);
            } else {
                fetch(`/api/rounds/${roundId}`).then(r => r.json()).then(data => {
                    if (data.course_id) {
                        navigateTo('section-hole-view');
                        loadHoleView(data.course_id, roundId, holeNum);
                    }
                });
            }
            return;
        }

        // Round detail route: round/123
        const roundMatch = hash.match(/^round\/(\d+)$/);
        if (roundMatch) {
            navigateTo('section-round-detail');
            loadRoundDetail(parseInt(roundMatch[1]));
            return;
        }

        // Course editor route: course/123/edit
        const editorMatch = hash.match(/^course\/(\d+)\/edit$/);
        if (editorMatch) {
            navigateTo('section-course-editor');
            loadCourseEditor(parseInt(editorMatch[1]));
            return;
        }

        // Course holes route: course/123/holes
        const holesMatch = hash.match(/^course\/(\d+)\/holes$/);
        if (holesMatch) {
            navigateTo('section-hole-view');
            loadHoleView(parseInt(holesMatch[1]));
            return;
        }

        // Equipment club detail route: club-detail/123
        const clubDetailMatch = hash.match(/^club-detail\/(\d+)$/);
        if (clubDetailMatch) {
            navigateTo('section-club-detail');
            loadClubDetailShots(parseInt(clubDetailMatch[1]));
            return;
        }

        // Golf club (venue) detail route: club/123
        const clubMatch = hash.match(/^club\/(\d+)$/);
        if (clubMatch) {
            navigateTo('section-course-detail');
            loadClubDetail(parseInt(clubMatch[1]));
            return;
        }

        // Course stats route: course/123
        const courseMatch = hash.match(/^course\/(\d+)$/);
        if (courseMatch) {
            navigateTo('section-course-stats');
            loadCourseStats(parseInt(courseMatch[1]));
            return;
        }

        // Range analytics route: range/123 or range/analytics
        const rangeMatch = hash.match(/^range\/(\d+)$/);
        if (rangeMatch) {
            navigateTo('section-range-detail');
            loadRangeAnalytics(parseInt(rangeMatch[1]));
            return;
        }
        if (hash === 'range/analytics') {
            navigateTo('section-range-detail');
            loadRangeAnalytics(null);
            return;
        }

        // Strokes Gained route
        if (hash === 'strokes-gained') {
            navigateTo('section-strokes-gained');
            loadStrokesGained();
            return;
        }

        // Scoring stats route
        if (hash === 'scoring') {
            navigateTo('section-scoring');
            loadScoringStats();
            return;
        }

        // Handicap route
        if (hash === 'handicap') {
            navigateTo('section-handicap');
            loadHandicap();
            return;
        }

        // Range list
        if (hash === 'range') {
            loadRangeSessions();
        }

        const sectionId = 'section-' + (hash || 'dashboard');
        navigateTo(sectionId);
    }

    // Mobile menu toggle
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    }

    // Initial route
    if (window.location.hash) {
        handleRoute();
    }

    // ========== JSON Bulk Import ==========
    const jsonUploadZone = document.getElementById('json-upload-zone');
    const jsonFileInput = document.getElementById('json-files');
    const jsonFileList = document.getElementById('json-file-list');
    const jsonFileNames = document.getElementById('json-file-names');
    const btnJsonImport = document.getElementById('btn-json-import');
    const btnJsonCancel = document.getElementById('btn-json-cancel');
    const jsonStatusMsg = document.getElementById('json-status-msg');

    let jsonFiles = null;

    const JSON_FILE_MAP = {
        'golf-club_types': 'club_types',
        'golf-club': 'clubs',
        'golf-course': 'courses',
        'golf-scorecard': 'scorecards',
        'golf-shot': 'shots',
    };

    function matchJsonField(filename) {
        const lower = filename.toLowerCase().replace('.json', '');
        const sorted = Object.entries(JSON_FILE_MAP).sort((a, b) => b[0].length - a[0].length);
        for (const [pattern, field] of sorted) {
            if (lower.includes(pattern)) return field;
        }
        return null;
    }

    jsonUploadZone.addEventListener('click', () => jsonFileInput.click());
    jsonUploadZone.addEventListener('dragover', (e) => { e.preventDefault(); jsonUploadZone.classList.add('dragover'); });
    jsonUploadZone.addEventListener('dragleave', () => jsonUploadZone.classList.remove('dragover'));

    jsonUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        jsonUploadZone.classList.remove('dragover');
        handleJsonFiles(e.dataTransfer.files);
    });

    jsonFileInput.addEventListener('change', () => handleJsonFiles(jsonFileInput.files));

    function handleJsonFiles(files) {
        jsonFiles = files;
        jsonFileNames.innerHTML = '';
        let matched = 0;
        for (const f of files) {
            const field = matchJsonField(f.name);
            const li = document.createElement('li');
            li.textContent = `${f.name} \u2192 ${field || 'unrecognized'}`;
            if (!field) li.classList.add('unrecognized');
            jsonFileNames.appendChild(li);
            if (field) matched++;
        }
        jsonFileList.style.display = matched > 0 ? 'block' : 'none';
        jsonStatusMsg.style.display = 'none';
    }

    btnJsonImport.addEventListener('click', async () => {
        if (!jsonFiles) return;
        btnJsonImport.disabled = true;
        btnJsonImport.textContent = 'Importing\u2026';

        const formData = new FormData();
        for (const f of jsonFiles) {
            const field = matchJsonField(f.name);
            if (field) formData.append(field, f);
        }

        // Show progress area
        jsonStatusMsg.className = 'status status-progress';
        jsonStatusMsg.style.display = 'block';
        jsonStatusMsg.textContent = 'Starting import...';

        const STEP_LABELS = {
            clubs: 'Importing clubs...',
            courses: 'Importing courses...',
            scorecards: 'Importing rounds & shots...',
            tees: 'Inferring tee data...',
            finalizing: 'Finalizing...',
            done: 'Complete!',
        };

        try {
            const resp = await fetch('/api/import/garmin-json', { method: 'POST', body: formData });
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = JSON.parse(line.slice(6));

                    if (payload.type === 'start') {
                        const s = payload.summary;
                        jsonStatusMsg.textContent = `Importing ${s.scorecards} rounds, ${s.courses} courses, ${s.clubs} clubs, ${s.shots} shots...`;
                    } else if (payload.type === 'progress') {
                        jsonStatusMsg.textContent = payload.detail || STEP_LABELS[payload.step] || payload.step;
                    } else if (payload.type === 'complete') {
                        const r = payload.results;
                        const s = payload.summary;
                        jsonStatusMsg.textContent = `Imported: ${s.scorecards} rounds (${r.scorecards?.created || 0} new, ${r.scorecards?.updated || 0} updated), `
                            + `${s.courses} courses, ${s.clubs} clubs, ${s.shots} shots`;
                        jsonStatusMsg.className = 'status status-success';
                        autoDismiss(jsonStatusMsg, 6000);
                        jsonFileList.style.display = 'none';
                        jsonFiles = null;
                        jsonFileInput.value = '';
                        loadAllData();
                    } else if (payload.type === 'error') {
                        jsonStatusMsg.textContent = payload.detail || 'Import failed';
                        jsonStatusMsg.className = 'status status-error';
                        autoDismiss(jsonStatusMsg, 5000);
                    }
                }
            }
        } catch (e) {
            jsonStatusMsg.textContent = 'Import error: ' + e.message;
            jsonStatusMsg.className = 'status status-error';
            jsonStatusMsg.style.display = 'block';
            autoDismiss(jsonStatusMsg, 5000);
        } finally {
            btnJsonImport.disabled = false;
            btnJsonImport.textContent = 'Import All';
        }
    });

    btnJsonCancel.addEventListener('click', () => {
        jsonFileList.style.display = 'none';
        jsonFiles = null;
        jsonFileInput.value = '';
    });

    // ========== FIT Upload ==========
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('fit-file');
    const previewPanel = document.getElementById('preview-panel');
    const statusMsg = document.getElementById('status-msg');
    const btnImport = document.getElementById('btn-import');
    const btnCancel = document.getElementById('btn-cancel');

    let currentFile = null;

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.fit')) {
            currentFile = file;
            previewFit(file);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            currentFile = fileInput.files[0];
            previewFit(fileInput.files[0]);
        }
    });

    async function previewFit(file) {
        hideStatus();
        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetch('/api/import/fit/preview', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json();
                showStatus(err.detail || 'Failed to parse FIT file', 'error');
                return;
            }

            const data = await resp.json();

            document.getElementById('p-course').textContent = data.course;
            document.getElementById('p-date').textContent = data.date;
            document.getElementById('p-tee').textContent = data.tee || 'N/A';
            document.getElementById('p-player').textContent = data.player;
            document.getElementById('p-strokes').textContent = data.total_strokes;
            document.getElementById('p-holes').textContent = data.holes_completed;
            document.getElementById('p-rating').textContent = data.course_rating?.toFixed(1);
            document.getElementById('p-slope').textContent = data.slope_rating;
            document.getElementById('p-shots').textContent = data.shots_tracked;

            const vsPar = data.score_vs_par;
            const vsParEl = document.getElementById('p-vs-par');
            vsParEl.textContent = vsPar > 0 ? `+${vsPar}` : vsPar;
            vsParEl.className = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';

            const scorecardEl = document.getElementById('p-scorecard');
            scorecardEl.innerHTML = '';
            const holeMap = {};
            data.hole_data.forEach(h => { holeMap[h.hole] = h; });

            data.scorecard.forEach(s => {
                const par = holeMap[s.hole]?.par || 0;
                const diff = s.strokes - par;
                let cls = 'score-par';
                if (diff <= -2) cls = 'score-eagle';
                else if (diff === -1) cls = 'score-birdie';
                else if (diff === 1) cls = 'score-bogey';
                else if (diff >= 2) cls = 'score-double';

                const cell = document.createElement('div');
                cell.className = 'hole-cell';
                cell.innerHTML = `<div class="hole-num">${s.hole}</div><div class="${cls}">${s.strokes}</div>`;
                scorecardEl.appendChild(cell);
            });

            previewPanel.classList.add('visible');
        } catch (e) {
            showStatus('Error parsing file: ' + e.message, 'error');
        }
    }

    btnImport.addEventListener('click', async () => {
        if (!currentFile) return;
        btnImport.disabled = true;
        btnImport.textContent = 'Importing\u2026';

        const formData = new FormData();
        formData.append('file', currentFile);

        try {
            const resp = await fetch('/api/import/fit', { method: 'POST', body: formData });
            const data = await resp.json();

            if (resp.ok) {
                showStatus(`Imported: ${data.course} \u2014 ${data.date} \u2014 ${data.strokes} strokes (${data.shots_tracked} shots tracked)`, 'success');
                previewPanel.classList.remove('visible');
                currentFile = null;
                fileInput.value = '';
                loadAllData();
            } else {
                showStatus(data.detail || 'Import failed', 'error');
            }
        } catch (e) {
            showStatus('Import error: ' + e.message, 'error');
        } finally {
            btnImport.disabled = false;
            btnImport.textContent = 'Import to Database';
        }
    });

    btnCancel.addEventListener('click', () => {
        previewPanel.classList.remove('visible');
        currentFile = null;
        fileInput.value = '';
    });

    // ========== Trackman URL Import ==========
    const btnTrackmanImport = document.getElementById('btn-trackman-import');
    const trackmanUrlInput = document.getElementById('trackman-url');
    const trackmanStatusMsg = document.getElementById('trackman-status-msg');

    if (btnTrackmanImport) {
        btnTrackmanImport.addEventListener('click', async () => {
            const url = trackmanUrlInput.value.trim();
            if (!url) return;

            btnTrackmanImport.disabled = true;
            btnTrackmanImport.textContent = 'Importing\u2026';
            trackmanStatusMsg.className = 'status status-progress';
            trackmanStatusMsg.style.display = 'block';
            trackmanStatusMsg.textContent = 'Fetching Trackman report...';

            try {
                const resp = await fetch('/api/range/import/trackman', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url }),
                });
                const data = await resp.json();

                if (!resp.ok) {
                    trackmanStatusMsg.textContent = data.detail || 'Import failed';
                    trackmanStatusMsg.className = 'status status-error';
                    autoDismiss(trackmanStatusMsg, 5000);
                    return;
                }

                if (data.status === 'duplicate') {
                    trackmanStatusMsg.textContent = data.message || 'This report was already imported.';
                    trackmanStatusMsg.className = 'status status-error';
                    autoDismiss(trackmanStatusMsg, 5000);
                } else {
                    trackmanStatusMsg.textContent = `Imported ${data.shot_count} shots from Trackman (${data.clubs.join(', ')})`;
                    trackmanStatusMsg.className = 'status status-success';
                    autoDismiss(trackmanStatusMsg, 6000);
                    trackmanUrlInput.value = '';
                    loadRangeSessions();
                    loadClubs();
                }
            } catch (e) {
                trackmanStatusMsg.textContent = 'Import error: ' + e.message;
                trackmanStatusMsg.className = 'status status-error';
                trackmanStatusMsg.style.display = 'block';
                autoDismiss(trackmanStatusMsg, 5000);
            } finally {
                btnTrackmanImport.disabled = false;
                btnTrackmanImport.textContent = 'Import';
            }
        });
    }

    // ========== Rapsodo MLM2PRO Import ==========
    const rapsodoUploadZone = document.getElementById('rapsodo-upload-zone');
    const rapsodoFileInput = document.getElementById('rapsodo-file');
    const rapsodoStatusMsg = document.getElementById('rapsodo-status-msg');

    if (rapsodoUploadZone) {
        rapsodoUploadZone.addEventListener('click', () => rapsodoFileInput.click());
        rapsodoUploadZone.addEventListener('dragover', (e) => { e.preventDefault(); rapsodoUploadZone.classList.add('dragover'); });
        rapsodoUploadZone.addEventListener('dragleave', () => rapsodoUploadZone.classList.remove('dragover'));

        rapsodoUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            rapsodoUploadZone.classList.remove('dragover');
            const csvFiles = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.csv'));
            if (csvFiles.length > 0) importRapsodoCsvBatch(csvFiles);
        });

        rapsodoFileInput.addEventListener('change', () => {
            if (rapsodoFileInput.files.length > 0) {
                importRapsodoCsvBatch([...rapsodoFileInput.files]);
            }
        });
    }

    async function importRapsodoCsvBatch(files) {
        rapsodoStatusMsg.className = 'status status-progress';
        rapsodoStatusMsg.style.display = 'block';

        let totalShots = 0, totalCreated = 0, totalRelinked = 0;
        let imported = 0, duplicates = 0, errors = 0;

        for (let i = 0; i < files.length; i++) {
            rapsodoStatusMsg.textContent = `Importing file ${i + 1} of ${files.length}...`;

            const formData = new FormData();
            formData.append('file', files[i]);

            try {
                const resp = await fetch('/api/range/import/rapsodo', { method: 'POST', body: formData });
                const data = await resp.json();

                if (!resp.ok) {
                    errors++;
                    continue;
                }

                if (data.status === 'duplicate') {
                    duplicates++;
                } else {
                    imported++;
                    totalShots += data.shot_count || 0;
                    totalCreated += data.clubs_created || 0;
                    totalRelinked += data.relinked || 0;
                }
            } catch (e) {
                errors++;
            }
        }

        // Build summary message
        let parts = [];
        if (imported > 0) parts.push(`${imported} session(s) imported (${totalShots} shots)`);
        if (duplicates > 0) parts.push(`${duplicates} duplicate(s) skipped`);
        if (errors > 0) parts.push(`${errors} error(s)`);
        if (totalCreated > 0) parts.push(`${totalCreated} club(s) created`);
        if (totalRelinked > 0) parts.push(`${totalRelinked} shot(s) re-linked`);

        rapsodoStatusMsg.textContent = parts.join('. ') + '.';
        rapsodoStatusMsg.className = errors > 0 ? 'status status-error' : 'status status-success';
        autoDismiss(rapsodoStatusMsg, 6000);
        rapsodoFileInput.value = '';

        if (imported > 0) {
            loadRangeSessions();
            loadClubs();
        }
    }

    // ========== Data Loading ==========

    let roundsCache = [];
    let coursesCache = [];
    let clubsCache = [];

    async function loadAllData() {
        await Promise.all([loadRounds(), loadCourses(), loadClubs(), loadRangeSessions()]);
        updateDashboard();
    }

    async function loadRounds() {
        try {
            const resp = await fetch('/api/rounds/?limit=100');
            roundsCache = await resp.json();
            renderRoundsTable();
        } catch (e) {
            console.error('Failed to load rounds:', e);
        }
    }

    let roundsSortCol = 'date';
    let roundsSortDir = 'desc';
    let roundsHolesFilter = 'all';

    document.getElementById('rounds-holes-filter')?.addEventListener('change', (e) => {
        roundsHolesFilter = e.target.value;
        renderRoundsTable();
    });

    window._sortRounds = function(col) {
        if (roundsSortCol === col) {
            roundsSortDir = roundsSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            roundsSortCol = col;
            roundsSortDir = col === 'date' || col === 'course_name' || col === 'source' ? 'desc' : 'desc';
        }
        renderRoundsTable();
    };

    const GAME_FORMATS = [
        { value: 'STROKE_PLAY', label: 'Stroke' },
        { value: 'SCRAMBLE', label: 'Scramble' },
        { value: 'MATCH_PLAY', label: 'Match' },
        { value: 'BEST_BALL', label: 'Best Ball' },
        { value: 'STABLEFORD', label: 'Stableford' },
        { value: 'OTHER', label: 'Other' },
    ];

    const FORMAT_COLORS = {
        STROKE_PLAY: '#888', SCRAMBLE: '#FF9800', MATCH_PLAY: '#9C27B0',
        BEST_BALL: '#2196F3', STABLEFORD: '#4CAF50', OTHER: '#78909C',
    };

    window._toggleRoundExclude = async function(roundId) {
        const round = roundsCache.find(r => r.id === roundId);
        if (!round) return;
        const newVal = !round.exclude_from_stats;
        try {
            const resp = await fetch(`/api/rounds/${roundId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exclude_from_stats: newVal }),
            });
            if (resp.ok) {
                round.exclude_from_stats = newVal;
                renderRoundsTable();
                updateDashboard();
            }
        } catch (e) { console.error('Failed to toggle exclude:', e); }
    };

    window._setRoundFormat = async function(roundId, format) {
        const round = roundsCache.find(r => r.id === roundId);
        if (!round) return;
        try {
            const resp = await fetch(`/api/rounds/${roundId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game_format: format }),
            });
            if (resp.ok) {
                round.game_format = format;
                renderRoundsTable();
            }
        } catch (e) { console.error('Failed to set format:', e); }
    };

    function renderRoundsTable() {
        const tbody = document.getElementById('rounds-body');
        if (roundsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No rounds yet. Import data to get started.</td></tr>';
            return;
        }

        // Update sort indicators in header
        const headers = document.querySelectorAll('#rounds-table thead th.sortable');
        const colOrder = ['date', 'course_name', 'total_strokes', 'score_vs_par', 'holes_completed', 'shots_tracked', 'game_format'];
        headers.forEach((th, i) => {
            const col = colOrder[i];
            if (!col) return;
            const base = th.textContent.replace(/ [\u25B2\u25BC]$/, '');
            th.textContent = col === roundsSortCol ? `${base} ${roundsSortDir === 'desc' ? '\u25BC' : '\u25B2'}` : base;
        });

        // Filter by holes
        let filtered = roundsCache;
        if (roundsHolesFilter === '18') {
            filtered = roundsCache.filter(r => r.holes_completed >= 18);
        } else if (roundsHolesFilter === '9') {
            filtered = roundsCache.filter(r => r.holes_completed && r.holes_completed < 18);
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No rounds match this filter.</td></tr>';
            return;
        }

        // Sort
        const dir = roundsSortDir === 'desc' ? -1 : 1;
        const sorted = [...filtered].sort((a, b) => {
            const isStr = roundsSortCol === 'date' || roundsSortCol === 'course_name' || roundsSortCol === 'source' || roundsSortCol === 'game_format';
            if (isStr) {
                const va = (a[roundsSortCol] || '').toLowerCase();
                const vb = (b[roundsSortCol] || '').toLowerCase();
                return va < vb ? -dir : va > vb ? dir : 0;
            }
            const va = a[roundsSortCol] != null ? a[roundsSortCol] : -Infinity;
            const vb = b[roundsSortCol] != null ? b[roundsSortCol] : -Infinity;
            return (va - vb) * dir;
        });

        tbody.innerHTML = sorted.map(r => {
            const vsPar = r.score_vs_par;
            const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
            const cls = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
            const excluded = r.exclude_from_stats;
            const rowStyle = excluded ? 'opacity:0.5;' : '';
            const fmt = r.game_format || 'STROKE_PLAY';
            const fmtColor = FORMAT_COLORS[fmt] || '#888';
            const fmtLabel = GAME_FORMATS.find(f => f.value === fmt)?.label || fmt;

            // Format dropdown
            const fmtOptions = GAME_FORMATS.map(f =>
                `<option value="${f.value}"${f.value === fmt ? ' selected' : ''}>${f.label}</option>`
            ).join('');

            // Exclude toggle
            const toggleIcon = excluded ? '\u2717' : '\u2713';
            const toggleTitle = excluded ? 'Excluded from stats \u2014 click to include' : 'Included in stats \u2014 click to exclude';
            const toggleColor = excluded ? '#f44336' : '#4CAF50';

            return `<tr class="clickable" style="${rowStyle}" onclick="location.hash='round/${r.id}'">
                <td>${r.date}</td>
                <td>${r.course_name || '\u2014'}</td>
                <td>${r.total_strokes || '\u2014'}</td>
                <td class="${cls}">${vsParStr}</td>
                <td>${r.holes_completed || '\u2014'}</td>
                <td>${r.shots_tracked || '\u2014'}</td>
                <td onclick="event.stopPropagation();">
                    <select class="club-window-select" style="font-size:0.75rem; padding:2px 4px; background:${fmtColor}22; border-color:${fmtColor}; color:var(--text);" onchange="window._setRoundFormat(${r.id}, this.value)">
                        ${fmtOptions}
                    </select>
                </td>
                <td onclick="event.stopPropagation();">
                    <span style="cursor:pointer; font-size:1.1rem; color:${toggleColor}; font-weight:bold;" title="${toggleTitle}" onclick="window._toggleRoundExclude(${r.id})">${toggleIcon}</span>
                </td>
            </tr>`;
        }).join('');
    }

    let clubsListCache = [];

    async function loadCourses() {
        try {
            // Load both: clubs list (for courses page) and flat courses (for rounds linkage)
            const [clubsResp, coursesResp] = await Promise.all([
                fetch('/api/courses/clubs'),
                fetch('/api/courses/'),
            ]);
            clubsListCache = await clubsResp.json();
            coursesCache = await coursesResp.json();
            renderClubsList();
        } catch (e) {
            console.error('Failed to load courses:', e);
        }
    }

    function renderClubsList() {
        const container = document.getElementById('clubs-list-container');
        if (!container) return;

        if (clubsListCache.length === 0) {
            container.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px;"><p>No courses yet. Import Garmin data to get started.</p></div></div>`;
            return;
        }

        container.innerHTML = clubsListCache.map(club => {
            const courseRows = club.courses.map(c => {
                let slopeStr = '\u2014';
                if (c.slope_min != null && c.slope_max != null) {
                    slopeStr = c.slope_min === c.slope_max
                        ? `${c.slope_min}`
                        : `${c.slope_min}\u2013${c.slope_max}`;
                }
                return `<tr class="clickable" onclick="location.hash='course/${c.id}'">
                    <td>${c.name || '(Main)'}</td>
                    <td>${c.holes || '\u2014'}</td>
                    <td>${c.par || '\u2014'}</td>
                    <td>${c.tee_count || '\u2014'}</td>
                    <td>${slopeStr}</td>
                    <td>${c.rounds_played || 0}</td>
                </tr>`;
            }).join('');

            return `<div class="card" style="cursor:pointer;" onclick="location.hash='club/${club.id}'">
                <div class="card-header">
                    <h2>${club.name}</h2>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <span style="color:var(--text-muted); font-size:0.84rem;">${club.course_count} course${club.course_count !== 1 ? 's' : ''}</span>
                        <span class="badge">${club.total_rounds} round${club.total_rounds !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                ${club.address ? `<p style="color:var(--text-muted); font-size:0.84rem; margin-bottom:12px;">${club.address}</p>` : ''}
                <div class="table-wrap" onclick="event.stopPropagation();">
                    <table>
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Holes</th>
                                <th>Par</th>
                                <th>Tees</th>
                                <th>Slope</th>
                                <th>Rounds</th>
                            </tr>
                        </thead>
                        <tbody>${courseRows}</tbody>
                    </table>
                </div>
            </div>`;
        }).join('');
    }

    // Keep legacy renderCoursesTable for anything that still calls it
    function renderCoursesTable() { renderClubsList(); }

    // ========== Course Detail ==========

    let currentCourseDetail = null;
    let currentClubDetail = null;  // { club data + all course details }
    let currentClubCourses = [];   // array of CourseDetailResponse
    let csDataCache = null;        // course stats cache
    let csTrendChart = null;       // Chart.js instance for course trend

    async function loadCourseDetail(courseId) {
        try {
            const resp = await fetch(`/api/courses/${courseId}`);
            if (!resp.ok) throw new Error('Course not found');
            currentCourseDetail = await resp.json();
            // Load as a single-course club view
            currentClubCourses = [currentCourseDetail];
            renderCourseDetail();
        } catch (e) {
            console.error('Failed to load course detail:', e);
            document.getElementById('course-detail-name').textContent = 'Course not found';
        }
    }

    async function loadClubDetail(clubId) {
        try {
            // Find all courses for this club
            const club = clubsListCache.find(c => c.id === clubId);
            if (!club) {
                // Fallback: load clubs list first
                const clubsResp = await fetch('/api/courses/clubs');
                clubsListCache = await clubsResp.json();
            }
            const clubData = clubsListCache.find(c => c.id === clubId);
            if (!clubData) throw new Error('Club not found');

            currentClubDetail = clubData;

            // Load detail for each course
            const coursePromises = clubData.courses.map(c =>
                fetch(`/api/courses/${c.id}`).then(r => r.json())
            );
            currentClubCourses = await Promise.all(coursePromises);
            currentCourseDetail = currentClubCourses[0] || null;

            renderCourseDetail();
        } catch (e) {
            console.error('Failed to load club detail:', e);
            document.getElementById('course-detail-name').textContent = 'Club not found';
        }
    }

    function renderCourseDetail() {
        const c = currentCourseDetail;
        if (!c) return;

        const clubName = currentClubDetail?.name || c.club_name || c.display_name;
        const clubId = currentClubDetail?.id || c.golf_club_id;

        // Hero banner (cache-bust local club photos)
        const hero = document.getElementById('course-hero');
        if (c.photo_url) {
            const bust = c.photo_url.startsWith('/static/') ? `?t=${Date.now()}` : '';
            hero.style.backgroundImage = `url(${c.photo_url}${bust})`;
        } else {
            hero.style.backgroundImage = '';
        }

        document.getElementById('course-detail-name').textContent = clubName;
        const subtitle = c.address || `${currentClubCourses.length} course${currentClubCourses.length !== 1 ? 's' : ''}`;
        document.getElementById('course-detail-subtitle').textContent = subtitle;

        // Stats cards — aggregated across all courses
        const totalCourses = currentClubCourses.length;
        const totalTees = currentClubCourses.reduce((sum, cc) => sum + (cc.tee_count || 0), 0);
        const statsRow = document.getElementById('course-detail-stats');
        statsRow.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Courses</div>
                <div class="stat-value">${totalCourses}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tee Sets</div>
                <div class="stat-value">${totalTees}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Slope Range</div>
                <div class="stat-value">${c.slope_min != null && c.slope_max != null
                    ? (c.slope_min === c.slope_max ? c.slope_min : `${c.slope_min}\u2013${c.slope_max}`)
                    : '\u2014'}</div>
            </div>
        `;

        // Courses section — one card per course with tees table and View Holes button
        const coursesContainer = document.getElementById('course-detail-courses');
        coursesContainer.innerHTML = currentClubCourses.map(cc => {
            const hasTees = cc.tees && cc.tees.length > 0;
            const teesHtml = hasTees ? `
                <table class="tees-table">
                    <thead>
                        <tr><th>Tee</th><th>Par</th><th>Yards</th><th>Rating</th><th>Slope</th><th style="width:80px;"></th></tr>
                    </thead>
                    <tbody>
                        ${cc.tees.map(t => `<tr data-tee-id="${t.id}" data-course-id="${cc.id}">
                            <td><strong>${t.tee_name}</strong></td>
                            <td>${t.par_total || '\u2014'}</td>
                            <td>${t.total_yards ? t.total_yards.toLocaleString() : '\u2014'}</td>
                            <td>${t.course_rating?.toFixed(1) || '\u2014'}</td>
                            <td>${t.slope_rating || '\u2014'}</td>
                            <td style="text-align:right;">
                                <button class="btn-icon tee-edit-btn" title="Edit tee" onclick="startTeeEdit(this)" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 6px; font-size:0.9rem;">&#9998;</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            ` : `<div class="empty-state" style="padding:16px;">
                <p style="color:var(--text-muted);">No tee data. Click "Sync All Courses" above.</p>
            </div>`;

            // Build merge dropdown options (other courses in same club)
            const otherCourses = currentClubCourses.filter(oc => oc.id !== cc.id);
            const mergeHtml = otherCourses.length > 0 ? `
                <select class="merge-target-select" data-source-id="${cc.id}" style="font-size:0.8rem; padding:4px 8px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:6px;">
                    <option value="">Merge into...</option>
                    ${otherCourses.map(oc => `<option value="${oc.id}">${oc.course_name || '(Main Course)'} (${oc.holes || 18}h)</option>`).join('')}
                </select>
            ` : '';

            return `<div class="card">
                <div class="card-header">
                    <h2><a href="#course/${cc.id}" style="color:inherit; text-decoration:none;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='inherit'">${cc.course_name || '(Main Course)'}</a> <span style="color:var(--text-muted); font-size:0.84rem;">${cc.holes || 18} holes \u00b7 Par ${cc.par || '\u2014'}</span></h2>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${mergeHtml}
                        <button class="btn btn-ghost btn-sm" onclick="location.hash='course/${cc.id}/edit'">Edit Course</button>
                        <button class="btn btn-primary btn-sm" onclick="location.hash='course/${cc.id}/holes'">View Holes</button>
                    </div>
                </div>
                ${teesHtml}
            </div>`;
        }).join('');

        // Rounds played — across all courses at this club
        const courseIds = currentClubCourses.map(cc => cc.id);
        const clubRounds = roundsCache.filter(r => courseIds.includes(r.course_id));
        const roundsContainer = document.getElementById('course-detail-rounds');
        document.getElementById('course-rounds-count').textContent = clubRounds.length;

        if (clubRounds.length === 0) {
            roundsContainer.innerHTML = `
                <div class="empty-state" style="padding:24px;">
                    <p style="color:var(--text-muted);">No rounds recorded at this club.</p>
                </div>
            `;
        } else {
            roundsContainer.innerHTML = clubRounds.map(r => {
                const vsPar = r.score_vs_par || 0;
                const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
                const scoreClass = vsPar < 0 ? 'under' : vsPar === 0 ? 'even' : 'over';
                const colorClass = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
                const courseName = coursesCache.find(cc => cc.id === r.course_id)?.course_name || '';
                // Build tee options from the matching course's tees
                const courseDetail = currentClubCourses.find(cc => cc.id === r.course_id);
                const tees = courseDetail?.tees || [];
                let teeHtml = '';
                if (tees.length > 0) {
                    const opts = tees.map(t =>
                        `<option value="${t.id}"${t.tee_name === r.tee_name ? ' selected' : ''}>${t.tee_name}</option>`
                    ).join('');
                    teeHtml = `<select class="round-tee-select" data-round-id="${r.id}" onclick="event.stopPropagation()">
                        <option value="">—</option>${opts}</select>`;
                } else {
                    teeHtml = `<span class="round-tee-label">${r.tee_name || '—'}</span>`;
                }
                return `<div class="recent-round" onclick="location.hash='round/${r.id}'">
                    <div class="round-score ${scoreClass}">${r.total_strokes || '\u2014'}</div>
                    <div class="round-info">
                        <div class="round-course">${r.date}${courseName ? ` \u2014 ${courseName}` : ''}</div>
                        <div class="round-meta">${r.holes_completed || 18} holes \u00b7 ${r.shots_tracked || 0} shots \u00b7 ${r.source || 'unknown'} \u00b7 ${teeHtml}</div>
                    </div>
                    <div class="round-detail">
                        <div class="round-vs-par ${colorClass}">${vsParStr}</div>
                    </div>
                </div>`;
            }).join('');

            // Wire up tee select change handlers
            roundsContainer.querySelectorAll('.round-tee-select').forEach(sel => {
                sel.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const roundId = e.target.dataset.roundId;
                    const teeId = e.target.value ? parseInt(e.target.value) : null;
                    try {
                        await fetch(`/api/rounds/${roundId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tee_id: teeId }),
                        });
                        // Update cache
                        const cached = roundsCache.find(r => r.id === parseInt(roundId));
                        if (cached) {
                            const courseDetail = currentClubCourses.find(cc => cc.id === cached.course_id);
                            const tee = courseDetail?.tees?.find(t => t.id === teeId);
                            cached.tee_name = tee?.tee_name || null;
                        }
                    } catch (err) {
                        console.error('Failed to update tee:', err);
                    }
                });
            });
        }

        // Store club ID for sync buttons
        const syncBtn = document.getElementById('btn-course-sync');
        if (syncBtn) syncBtn.dataset.clubId = clubId;

        // Pre-fill OSM search with club name
        const osmSearch = document.getElementById('osm-club-search');
        if (osmSearch) osmSearch.value = clubName.replace(/Country Club|Golf Course|Golf Club|GC/gi, '').trim();

        // Render per-course OSM link status
        renderOSMCourseLinks();
    }

    function renderOSMCourseLinks() {
        const container = document.getElementById('osm-course-links');
        if (!container || !currentClubCourses) return;

        // Count data per course from loaded course details
        function getCourseDataCounts(cc) {
            const tees = cc.tees || [];
            let holesWithTee = 0, holesWithGreen = 0, holesWithFairway = 0;
            for (const t of tees) {
                for (const h of (t.holes || [])) {
                    if (h.tee_lat) holesWithTee++;
                    if (h.green_boundary) holesWithGreen++;
                    if (h.fairway_path) holesWithFairway++;
                }
                break; // Only count first tee set
            }
            const hazards = (cc.hazards || []).length;
            const osmHoles = (cc.osm_holes || []).length;
            return { holesWithTee, holesWithGreen, holesWithFairway, hazards, osmHoles };
        }

        // Club-level hazard count (shared across all courses)
        const clubHazards = (currentClubCourses[0]?.hazards || []).length;

        // Club-level status line
        const clubStatusParts = [];
        if (clubHazards > 0) clubStatusParts.push(`${clubHazards} hazards`);

        // Determine if any course has data (for default collapse state)
        const anyData = currentClubCourses.some(cc => {
            const counts = getCourseDataCounts(cc);
            return counts.holesWithTee > 0 || counts.osmHoles > 0 || cc.osm_id;
        });
        const collapsed = anyData;  // Collapse if data exists, expand if empty

        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;" id="osm-section-toggle">
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; cursor:pointer;">Per-Course Data</label>
                    ${clubStatusParts.length > 0 ? `<span style="font-size:0.82rem; color:var(--accent);">Club: ${clubStatusParts.join(' \u00b7 ')}</span>` : ''}
                </div>
                <span id="osm-section-arrow" style="color:var(--text-muted); font-size:0.8rem;">${collapsed ? '\u25B6' : '\u25BC'}</span>
            </div>
            <div id="osm-section-body" style="${collapsed ? 'display:none;' : ''} margin-top:8px;">
                ${currentClubCourses.map(cc => {
                    const linked = cc.osm_id ? true : false;
                    const synced = cc.tee_count > 0 || (cc.tees && cc.tees.length > 0 && cc.tees.some(t => !t.inferred));
                    const counts = getCourseDataCounts(cc);
                    const hasBoundary = cc.osm_boundary ? true : false;

                    // Build status icon (reflects OSM status only)
                    let statusIcon, statusColor;
                    if (linked && counts.holesWithTee > 0) {
                        statusIcon = '&#10003;&#10003;'; // double check - OSM linked + GPS data
                        statusColor = 'var(--accent)';
                    } else if (linked) {
                        statusIcon = '&#10003;'; // single check - OSM linked
                        statusColor = 'var(--accent)';
                    } else if (counts.holesWithTee > 0 || hasBoundary) {
                        statusIcon = '&#9679;'; // dot - has some data but not OSM linked
                        statusColor = '#FFB74D';
                    } else {
                        statusIcon = '&#8211;'; // dash - no OSM data
                        statusColor = 'var(--text-dim)';
                    }

                    // Build OSM-specific status tags
                    const tags = [];
                    if (linked) {
                        tags.push('<span style="color:var(--accent); font-size:0.75rem; background:rgba(76,175,80,0.15); padding:1px 6px; border-radius:3px;">Synced</span>');
                    } else if (counts.holesWithTee > 0 || hasBoundary) {
                        tags.push('<span style="color:var(--accent); font-size:0.75rem; background:rgba(76,175,80,0.15); padding:1px 6px; border-radius:3px;">Synced</span>');
                    } else {
                        tags.push('<span style="color:var(--text-dim); font-size:0.75rem; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:3px;">Not synced</span>');
                    }

                    // Data counts line — always show all categories
                    const numHoles = cc.holes || '?';
                    const dataParts = [];
                    dataParts.push(`${counts.holesWithTee}/${numHoles} tees`);
                    dataParts.push(`${counts.holesWithGreen}/${numHoles} greens`);
                    dataParts.push(`${counts.holesWithFairway}/${numHoles} fairways`);
                    if (counts.osmHoles > 0) dataParts.push(`${counts.osmHoles} OSM holes`);
                    const hasAnyData = counts.holesWithTee > 0 || counts.holesWithGreen > 0 || counts.holesWithFairway > 0 || counts.osmHoles > 0;
                    const dataStr = hasAnyData
                        ? `<span style="color:var(--text-muted); font-size:0.78rem;">${dataParts.join(' \u00b7 ')}</span>`
                        : `<span style="color:var(--text-dim); font-size:0.78rem;">No GPS data</span>`;

                    return `<div style="display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--border);">
                        <span style="flex:0 0 24px; text-align:center; color:${statusColor}; font-size:0.9rem;">${statusIcon}</span>
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <strong>${cc.course_name || cc.display_name}</strong>
                                <span style="color:var(--text-dim); font-size:0.84rem;">${cc.holes}h</span>
                                ${tags.join('')}
                            </div>
                            <div style="margin-top:3px;">${dataStr}</div>
                        </div>
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="text" class="edit-input osm-course-search-input" data-course-id="${cc.id}"
                                value="${cc.course_name || cc.display_name || ''}" placeholder="Search course..." style="width:180px; font-size:0.82rem;">
                            <button class="btn btn-ghost btn-sm osm-course-search-btn" data-course-id="${cc.id}" style="font-size:0.75rem;">Search</button>
                        </div>
                    </div>`;
                }).join('')}
                <div id="osm-course-search-results" style="margin-top:8px;"></div>
            </div>
        `;

        // Toggle handler for collapsible section
        document.getElementById('osm-section-toggle')?.addEventListener('click', () => {
            const body = document.getElementById('osm-section-body');
            const arrow = document.getElementById('osm-section-arrow');
            if (body.style.display === 'none') {
                body.style.display = '';
                arrow.textContent = '\u25BC';
            } else {
                body.style.display = 'none';
                arrow.textContent = '\u25B6';
            }
        });

        // Attach per-course search handlers
        container.querySelectorAll('.osm-course-search-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const courseId = parseInt(btn.dataset.courseId);
                const input = container.querySelector(`.osm-course-search-input[data-course-id="${courseId}"]`);
                if (input && input.value.trim()) {
                    searchOSMForCourse(courseId, input.value.trim());
                }
            });
        });
    }

    // ========== Course Stats Page ==========

    async function loadCourseStats(courseId) {
        try {
            const resp = await fetch(`/api/courses/${courseId}/stats`);
            if (!resp.ok) throw new Error('Course not found');
            csDataCache = await resp.json();
        } catch (e) {
            console.error('Failed to load course stats:', e);
            document.getElementById('cs-course-name').textContent = 'Course not found';
            return;
        }

        const d = csDataCache;
        const courseName = d.course_name ? `${d.club_name} — ${d.course_name}` : d.club_name;
        document.getElementById('cs-course-name').textContent = courseName;
        document.getElementById('cs-course-subtitle').textContent =
            [d.holes ? `${d.holes} holes` : null, d.par ? `Par ${d.par}` : null].filter(Boolean).join(' · ') || '';

        // Breadcrumb links
        const clubLink = document.getElementById('cs-club-link');
        clubLink.href = `#club/${d.club_id}`;
        clubLink.textContent = `← ${d.club_name}`;
        clubLink.style.display = '';

        document.getElementById('cs-view-holes').href = `#course/${courseId}/holes`;
        document.getElementById('cs-view-club').href = `#club/${d.club_id}`;

        // Stat cards
        const fmt = (v, decimals = 1) => v != null ? v.toFixed(decimals) : '--';
        const fmtVsPar = v => {
            if (v == null) return '--';
            const s = v.toFixed(1);
            return v > 0 ? `+${s}` : s;
        };
        const roundsEl = document.getElementById('cs-rounds');
        roundsEl.textContent = d.rounds_played;
        if (d.excluded_rounds > 0) {
            roundsEl.innerHTML += `<div style="font-size:0.65rem; color:var(--text-dim); font-weight:400; margin-top:2px;">${d.excluded_rounds} excluded</div>`;
        }
        document.getElementById('cs-avg-score').textContent = fmt(d.avg_score);
        document.getElementById('cs-best').textContent = d.best_score ?? '--';
        const vsParEl = document.getElementById('cs-avg-vs-par');
        vsParEl.textContent = fmtVsPar(d.avg_vs_par);
        vsParEl.style.color = d.avg_vs_par == null ? '' : d.avg_vs_par <= 0 ? '#22c55e' : d.avg_vs_par <= 5 ? '#f59e0b' : '#ef4444';
        document.getElementById('cs-gir').textContent = d.gir_pct != null ? `${d.gir_pct}%` : '--';
        document.getElementById('cs-fw').textContent = d.fairway_pct != null ? `${d.fairway_pct}%` : '--';
        document.getElementById('cs-putts').textContent = fmt(d.avg_putts_per_hole, 2);

        document.getElementById('cs-round-count').textContent = d.rounds_played;

        renderCsSgBreakdown();
        renderCsHandicap();
        renderCsTrendChart();
        renderCsHoleTable('difficulty');
        renderCsDistribution();
        renderCsRoundsList();

        // Sort toggle handlers
        document.querySelectorAll('.cs-sort-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.cs-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderCsHoleTable(btn.dataset.sort);
            };
        });

        // SG mode toggle handlers
        document.querySelectorAll('.cs-sg-mode').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.cs-sg-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderCsSgBreakdown(btn.dataset.mode);
            };
        });
    }

    function renderCsSgBreakdown(mode = 'pga') {
        const container = document.getElementById('cs-sg-breakdown');
        if (!container || !csDataCache) return;

        const sg = csDataCache.sg_categories;
        if (!sg || Object.values(sg).every(c => c.round_count === 0)) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No SG data yet.</p></div>';
            return;
        }

        const isPersonal = mode === 'personal';
        const valKey = isPersonal ? 'personal_per_round' : 'per_round';
        const label = isPersonal ? 'per round vs your avg' : 'per round vs PGA avg';

        const cats = [
            { key: 'off_the_tee', label: 'Off the Tee' },
            { key: 'approach', label: 'Approach' },
            { key: 'short_game', label: 'Short Game' },
            { key: 'putting', label: 'Putting' },
        ];

        // Check if personal data exists
        const hasPersonal = cats.some(c => sg[c.key]?.[valKey] != null);
        if (isPersonal && !hasPersonal) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No personal SG baseline yet. Play more rounds to build one.</p></div>';
            return;
        }

        const vals = cats.map(c => sg[c.key]?.[valKey] || 0);
        const maxAbs = Math.max(...vals.map(Math.abs), 0.1);

        container.innerHTML = cats.map(c => {
            const d = sg[c.key] || {};
            const v = d[valKey] ?? 0;
            const color = v >= 0 ? '#22c55e' : '#ef4444';
            const sign = v > 0 ? '+' : '';
            const barPct = Math.min(Math.abs(v) / maxAbs * 100, 100);
            const isPositive = v >= 0;

            return `<div style="display:flex; align-items:center; margin-bottom:10px; gap:8px;">
                <span style="width:80px; font-size:0.82rem; color:var(--text-muted); flex-shrink:0;">${c.label}</span>
                <div style="flex:1; display:flex; height:20px;">
                    <div style="width:50%; display:flex; justify-content:flex-end;">
                        ${!isPositive ? `<div style="width:${barPct}%; background:${color}; border-radius:4px 0 0 4px; min-width:2px;"></div>` : ''}
                    </div>
                    <div style="width:1px; background:var(--text-dim);"></div>
                    <div style="width:50%; display:flex;">
                        ${isPositive ? `<div style="width:${barPct}%; background:${color}; border-radius:0 4px 4px 0; min-width:2px;"></div>` : ''}
                    </div>
                </div>
                <span style="width:50px; text-align:right; font-size:0.85rem; font-weight:600; color:${color}; flex-shrink:0;">${sign}${v.toFixed(2)}</span>
            </div>`;
        }).join('') + `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px; text-align:right;">${label}</div>`;
    }

    function renderCsHandicap() {
        const container = document.getElementById('cs-handicap');
        if (!container || !csDataCache) return;

        const diffs = csDataCache.differentials;
        if (!diffs || !diffs.length) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No handicap data yet.</p></div>';
            return;
        }

        const avgDiff = csDataCache.avg_differential;
        const bestDiff = csDataCache.best_differential;

        container.innerHTML = `
            <div style="display:flex; gap:16px; margin-bottom:16px;">
                <div style="flex:1; text-align:center; padding:12px; background:var(--bg-hover); border-radius:8px;">
                    <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Avg Differential</div>
                    <div style="font-size:1.5rem; font-weight:700; margin-top:4px;">${avgDiff != null ? avgDiff.toFixed(1) : '--'}</div>
                </div>
                <div style="flex:1; text-align:center; padding:12px; background:var(--bg-hover); border-radius:8px;">
                    <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Best Differential</div>
                    <div style="font-size:1.5rem; font-weight:700; color:#22c55e; margin-top:4px;">${bestDiff != null ? bestDiff.toFixed(1) : '--'}</div>
                </div>
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted);">
                ${diffs.map(d => {
                    const diffColor = d.differential <= (avgDiff || 999) ? '#22c55e' : '#f59e0b';
                    return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
                        <span>${d.date}</span>
                        <span>Score ${d.score} · Rating ${d.rating} · Slope ${d.slope}</span>
                        <span style="color:${diffColor}; font-weight:600;">${d.differential.toFixed(1)}</span>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    function renderCsTrendChart() {
        const canvas = document.getElementById('cs-trend-chart');
        const card = document.getElementById('cs-trend-card');
        if (!canvas || !csDataCache) return;
        if (csTrendChart) { csTrendChart.destroy(); csTrendChart = null; }

        const rounds = csDataCache.rounds;
        if (rounds.length < 2) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';

        // Cumulative average (per-hole normalized)
        let sum = 0;
        const avgData = rounds.map((r, i) => {
            sum += r.vs_par_per_hole;
            return { x: r.date, y: Math.round((sum / (i + 1)) * 100) / 100 };
        });

        csTrendChart = new Chart(canvas, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Cumulative Avg',
                        data: avgData,
                        borderColor: '#3b82f6',
                        backgroundColor: '#3b82f633',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        fill: true,
                    },
                    {
                        label: 'vs Par / Hole',
                        data: rounds.map(r => ({ x: r.date, y: r.vs_par_per_hole })),
                        borderColor: '#8b8f9866',
                        borderWidth: 1,
                        borderDash: [4, 3],
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#8b8f9899',
                        tension: 0.2,
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    if (idx >= 0 && idx < rounds.length) {
                        window.location.hash = `round/${rounds[idx].round_id}`;
                    }
                },
                onHover: (evt, elements) => {
                    evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        callbacks: {
                            title: ctxs => {
                                if (!ctxs[0]) return '';
                                const i = ctxs[0].dataIndex;
                                const r = rounds[i];
                                return r ? `${ctxs[0].label} — ${r.holes_played}h (${r.score_vs_par > 0 ? '+' : ''}${r.score_vs_par} total)` : '';
                            },
                            label: ctx => {
                                const v = ctx.raw?.y;
                                if (v == null) return '';
                                const sign = v > 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${sign}${v}`;
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', displayFormats: { month: 'MMM yyyy' }, tooltipFormat: 'MMM d, yyyy' },
                        ticks: { color: '#64748b', font: { size: 11 } },
                        grid: { color: '#1e293b' },
                    },
                    y: {
                        ticks: { color: '#64748b', callback: v => (v > 0 ? '+' : '') + v.toFixed(1), font: { size: 11 } },
                        grid: { color: '#1e293b' },
                        title: { display: true, text: 'vs Par / Hole', color: '#64748b', font: { size: 11 } },
                    },
                },
            },
        });
    }

    function renderCsHoleTable(sortMode) {
        const container = document.getElementById('cs-hole-table-wrap');
        if (!container || !csDataCache) return;

        const holes = [...csDataCache.hole_stats];
        if (!holes.length) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No hole data yet.</p></div>';
            return;
        }

        if (sortMode === 'difficulty') {
            holes.sort((a, b) => b.avg_vs_par - a.avg_vs_par);
        } else {
            holes.sort((a, b) => a.hole_number - b.hole_number);
        }

        container.innerHTML = `<table>
            <thead>
                <tr>
                    <th>Hole</th>
                    <th>Par</th>
                    <th>Yds</th>
                    <th>Avg</th>
                    <th>vs Par</th>
                    <th>Birdie</th>
                    <th>Par</th>
                    <th>Bogey</th>
                    <th>Dbl+</th>
                </tr>
            </thead>
            <tbody>
                ${holes.map(h => {
                    const vsStr = h.avg_vs_par > 0 ? `+${h.avg_vs_par.toFixed(2)}` : h.avg_vs_par.toFixed(2);
                    const vsColor = h.avg_vs_par <= -0.1 ? '#22c55e' : h.avg_vs_par <= 0.3 ? '#3b82f6' : h.avg_vs_par <= 0.8 ? '#f59e0b' : '#ef4444';
                    return `<tr>
                        <td><strong>${h.hole_number}</strong></td>
                        <td>${h.par}</td>
                        <td>${h.yardage || '—'}</td>
                        <td>${h.avg_score.toFixed(1)}</td>
                        <td style="color:${vsColor}; font-weight:600;">${vsStr}</td>
                        <td style="color:#22c55e;">${h.birdie_pct}%</td>
                        <td style="color:#3b82f6;">${h.par_pct}%</td>
                        <td style="color:#f59e0b;">${h.bogey_pct}%</td>
                        <td style="color:#ef4444;">${h.double_plus_pct}%</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    }

    function renderCsDistribution() {
        const container = document.getElementById('cs-distribution');
        if (!container || !csDataCache) return;

        const d = csDataCache.scoring_distribution;
        if (!d || Object.values(d).every(v => v === 0)) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No scoring data yet.</p></div>';
            return;
        }

        const items = [
            { label: 'Birdie+', count: d.birdie_or_better, color: '#22c55e' },
            { label: 'Par', count: d.par, color: '#3b82f6' },
            { label: 'Bogey', count: d.bogey, color: '#f59e0b' },
            { label: 'Double', count: d.double, color: '#ef4444' },
            { label: 'Triple+', count: d.triple_plus, color: '#dc2626' },
        ];
        const total = items.reduce((s, i) => s + i.count, 0);
        const maxCount = Math.max(...items.map(i => i.count), 1);

        container.innerHTML = items.map(i => {
            const pct = total ? (i.count / total * 100).toFixed(1) : '0';
            const barPct = Math.min(i.count / maxCount * 100, 100);
            return `<div style="display:flex; align-items:center; margin-bottom:8px; gap:10px;">
                <span style="width:60px; font-size:0.82rem; color:var(--text-muted); flex-shrink:0;">${i.label}</span>
                <div style="flex:1; background:var(--bg-hover); border-radius:4px; height:20px; overflow:hidden;">
                    <div style="width:${barPct}%; background:${i.color}; height:100%; border-radius:4px;"></div>
                </div>
                <span style="width:35px; text-align:right; font-size:0.8rem; font-weight:600; color:${i.color}; flex-shrink:0;">${i.count}</span>
                <span style="width:40px; text-align:right; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${pct}%</span>
            </div>`;
        }).join('');
    }

    function renderCsRoundsList() {
        const container = document.getElementById('cs-rounds-list');
        if (!container || !csDataCache) return;

        const rounds = [...csDataCache.rounds].reverse(); // newest first
        if (!rounds.length) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No rounds recorded at this course.</p></div>';
            return;
        }

        container.innerHTML = rounds.map(r => {
            const vsPar = r.score_vs_par || 0;
            const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
            const scoreClass = vsPar < 0 ? 'under' : vsPar === 0 ? 'even' : 'over';
            const colorClass = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
            const stats = [
                r.gir_pct != null ? `GIR ${r.gir_pct}%` : null,
                r.fw_pct != null ? `FW ${r.fw_pct}%` : null,
                r.putts != null ? `${r.putts} putts` : null,
            ].filter(Boolean).join(' · ');
            return `<div class="recent-round" onclick="location.hash='round/${r.round_id}'">
                <div class="round-score ${scoreClass}">${r.score || '—'}</div>
                <div class="round-info">
                    <div class="round-course">${r.date}${r.tee_name ? ` · ${r.tee_name} tees` : ''}</div>
                    <div class="round-meta">${r.holes_played} holes${stats ? ' · ' + stats : ''}</div>
                </div>
                <div class="round-detail">
                    <div class="round-vs-par ${colorClass}">${vsParStr}</div>
                </div>
            </div>`;
        }).join('');
    }

    // ========== Round Detail Page ==========

    let rdCache = null;        // RoundDetailResponse
    let rdCourseCache = null;  // CourseDetailResponse
    let rdParMap = {};         // { holeNumber: par }
    let rdCompareData = null;  // { gir_pct, fairway_pct, avg_putts_per_hole, three_putt_pct, avg_vs_par, label }

    function classifySgCategory(shot, par) {
        if (shot.shot_type === 'PENALTY' || shot.auto_shot_type === 'PENALTY') return null;
        if (shot.shot_type === 'PUTT') return 'putting';
        if (shot.shot_type === 'TEE' && par >= 4) return 'off_the_tee';
        if (shot.shot_type === 'TEE' && par === 3) return 'approach';
        if (shot.shot_type === 'APPROACH' || shot.shot_type === 'LAYUP') return 'approach';
        if (shot.shot_type === 'CHIP') return 'short_game';
        if (shot.green_distance_yards != null && shot.green_distance_yards <= 50 && !shot.on_green) return 'short_game';
        if (['RECOVERY', 'UNKNOWN'].includes(shot.shot_type) || shot.green_distance_yards != null) return 'approach';
        return null;
    }

    async function loadRoundDetail(roundId) {
        try {
            const resp = await fetch(`/api/rounds/${roundId}`);
            if (!resp.ok) throw new Error('Round not found');
            rdCache = await resp.json();
        } catch (e) {
            console.error('Failed to load round:', e);
            document.getElementById('rd-title').textContent = 'Round not found';
            return;
        }

        // Fetch course data for par values
        rdParMap = {};
        rdCourseCache = null;
        if (rdCache.course_id) {
            try {
                const cResp = await fetch(`/api/courses/${rdCache.course_id}`);
                rdCourseCache = await cResp.json();
                // Find matching tee
                const tees = rdCourseCache.tees || [];
                const matchedTee = tees.find(t => t.id === rdCache.tee_id)
                    || tees.find(t => t.tee_name === rdCache.tee_name)
                    || tees[0];
                if (matchedTee && matchedTee.holes) {
                    for (const h of matchedTee.holes) {
                        rdParMap[h.hole_number] = h.par;
                    }
                }
            } catch (e) {
                console.error('Failed to load course for par data:', e);
            }
        }

        renderRdHeader();
        renderRdStats();
        renderRdScorecard();
        renderRdHighlights();
        renderRdSg();
        renderRdDistribution();
        renderRdNotes();
        renderRdNav();

        // Action links
        const firstHole = rdCache.holes?.length ? rdCache.holes[0].hole_number : 1;
        document.getElementById('rd-view-holes').href = `#round/${rdCache.id}/hole/${firstHole}`;
        if (rdCache.course_id) {
            document.getElementById('rd-view-course').href = `#course/${rdCache.course_id}`;
            document.getElementById('rd-view-course').style.display = '';
        } else {
            document.getElementById('rd-view-course').style.display = 'none';
        }

        // Compare dropdown: hide "This Course Avg" if no course
        const courseOpt = document.querySelector('#rd-compare-select option[value="course"]');
        if (courseOpt) courseOpt.style.display = rdCache.course_id ? '' : 'none';

        // Reset comparison
        rdCompareData = null;
        const sel = document.getElementById('rd-compare-select');
        sel.value = '';
        sel.onchange = async () => {
            const val = sel.value;
            if (!val) {
                rdCompareData = null;
                renderRdStats();
                renderRdHighlights();
                renderRdSg();
                renderRdDistribution();
                return;
            }
            try {
                if (val === 'avg') {
                    const [scoring, sg] = await Promise.all([
                        fetch('/api/stats/scoring').then(r => r.json()),
                        fetch('/api/stats/strokes-gained').then(r => r.json()),
                    ]);
                    rdCompareData = { label: 'your avg', ...extractScoringBaseline(scoring), ...extractSgBaseline(sg) };
                } else if (val.startsWith('last')) {
                    const n = parseInt(val.replace('last', ''));
                    const [scoring, sg] = await Promise.all([
                        fetch(`/api/stats/scoring?last_n_rounds=${n}`).then(r => r.json()),
                        fetch(`/api/stats/strokes-gained?last_n_rounds=${n}`).then(r => r.json()),
                    ]);
                    rdCompareData = { label: `last ${n}`, ...extractScoringBaseline(scoring), ...extractSgBaseline(sg) };
                } else if (val === 'course' && rdCache.course_id) {
                    const r = await fetch(`/api/courses/${rdCache.course_id}/stats`).then(r => r.json());
                    rdCompareData = {
                        label: 'course avg',
                        gir_pct: r.gir_pct,
                        fairway_pct: r.fairway_pct,
                        avg_putts_per_hole: r.avg_putts_per_hole,
                        three_putt_pct: r.three_putt_pct,
                        avg_vs_par: r.avg_vs_par,
                        avg_vs_par_per_hole: r.rounds?.length
                            ? r.rounds.reduce((s, rr) => s + (rr.vs_par_per_hole || 0), 0) / r.rounds.length
                            : null,
                        rounds_played: r.rounds_played,
                        sg: r.sg_categories ? {
                            off_the_tee: r.sg_categories.off_the_tee?.per_round || 0,
                            approach: r.sg_categories.approach?.per_round || 0,
                            short_game: r.sg_categories.short_game?.per_round || 0,
                            putting: r.sg_categories.putting?.per_round || 0,
                        } : null,
                        dist: r.scoring_distribution || null,
                    };
                }
            } catch (e) {
                console.error('Failed to fetch comparison data:', e);
                rdCompareData = null;
            }
            renderRdStats();
            renderRdHighlights();
            renderRdSg();
            renderRdDistribution();
        };
    }

    function extractScoringBaseline(scoringData) {
        // Compute avg vs par per hole from per-round data (normalized for 9/18 mix)
        const rounds = scoringData.per_round || [];
        const totalVsPar = rounds.reduce((s, r) => s + r.score_vs_par, 0);
        const avgVsPar = rounds.length ? totalVsPar / rounds.length : null;
        const totalHolesPlayed = rounds.reduce((s, r) => s + (r.holes_played || 18), 0);
        const avgVsParPerHole = totalHolesPlayed ? totalVsPar / totalHolesPlayed : null;
        // Compute avg 3-putts per round
        const total3Putts = rounds.reduce((s, r) => s + (r.three_putts || 0), 0);
        const avg3Putts = rounds.length ? total3Putts / rounds.length : null;
        // Compute avg scoring distribution per round
        const avgDist = rounds.length ? {
            birdie_or_better: rounds.reduce((s, r) => s + (r.birdie_or_better || 0), 0) / rounds.length,
            par: rounds.reduce((s, r) => s + (r.pars || 0), 0) / rounds.length,
            bogey: rounds.reduce((s, r) => s + (r.bogeys || 0), 0) / rounds.length,
            double: rounds.reduce((s, r) => s + (r.doubles || 0), 0) / rounds.length,
            triple_plus: rounds.reduce((s, r) => s + (r.triple_plus || 0), 0) / rounds.length,
        } : null;

        return {
            gir_pct: scoringData.gir_pct,
            fairway_pct: scoringData.fairway_pct,
            avg_putts_per_hole: scoringData.avg_putts_per_hole,
            three_putt_pct: scoringData.three_putt_pct,
            avg_vs_par: avgVsPar != null ? Math.round(avgVsPar * 10) / 10 : null,
            avg_vs_par_per_hole: avgVsParPerHole != null ? Math.round(avgVsParPerHole * 100) / 100 : null,
            avg_3putts: avg3Putts != null ? Math.round(avg3Putts * 10) / 10 : null,
            rounds_played: rounds.length,
            dist: avgDist,
        };
    }

    function extractSgBaseline(sgData) {
        // sgData has .overall: { off_the_tee, approach, short_game, putting } each with sg_pga_per_round
        const o = sgData.overall || {};
        return {
            sg: {
                off_the_tee: o.off_the_tee?.sg_pga_per_round || 0,
                approach: o.approach?.sg_pga_per_round || 0,
                short_game: o.short_game?.sg_pga_per_round || 0,
                putting: o.putting?.sg_pga_per_round || 0,
            },
        };
    }

    function renderRdHeader() {
        const d = rdCache;
        // Title: date
        document.getElementById('rd-title').textContent = d.date;

        // Subtitle: course + tee + holes
        const parts = [
            d.course_name,
            d.tee_name ? `${d.tee_name} tees` : null,
            `${d.holes_completed || d.holes?.length || '?'} holes`,
            d.shots_tracked ? `${d.shots_tracked} shots` : null,
        ].filter(Boolean);
        document.getElementById('rd-subtitle').textContent = parts.join(' · ');

        // Score badge
        const badge = document.getElementById('rd-score-badge');
        if (d.total_strokes) {
            const vsPar = d.score_vs_par || 0;
            const vsStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
            const colorClass = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
            badge.innerHTML = `<span class="round-score ${vsPar < 0 ? 'under' : vsPar === 0 ? 'even' : 'over'}" style="font-size:1.5rem;">${d.total_strokes}</span>
                <span class="round-vs-par ${colorClass}" style="font-size:1.1rem; margin-left:8px;">${vsStr}</span>`;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        // Course link
        const courseLink = document.getElementById('rd-course-link');
        if (d.course_id && rdCourseCache) {
            courseLink.href = `#course/${d.course_id}`;
            courseLink.textContent = `← ${d.course_name}`;
            courseLink.style.display = '';
        } else {
            courseLink.style.display = 'none';
        }

        // Badges
        const badges = [];
        if (d.exclude_from_stats) badges.push('<span style="background:#f59e0b22; color:#f59e0b; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Excluded from Stats</span>');
        if (d.game_format && d.game_format !== 'STROKE_PLAY') badges.push(`<span style="background:#3b82f622; color:#3b82f6; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${d.game_format.replace(/_/g, ' ')}</span>`);
        if (d.weather_temp_f != null) {
            const wParts = [d.weather_description, `${Math.round(d.weather_temp_f)}°F`].filter(Boolean);
            badges.push(`<span style="background:#64748b22; color:#94a3b8; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${wParts.join(', ')}</span>`);
        }
        if (d.source) badges.push(`<span style="background:#64748b22; color:#64748b; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${d.source}</span>`);
        document.getElementById('rd-badges').innerHTML = badges.join('');
    }

    function renderRdStats() {
        const container = document.getElementById('rd-stat-cards');
        const holes = rdCache.holes || [];
        if (!holes.length) {
            container.innerHTML = '';
            return;
        }

        let girCount = 0, girTotal = 0;
        let fwHit = 0, fwTotal = 0;
        let puttsSum = 0, puttsHoles = 0;
        let threePutts = 0, penalties = 0;

        for (const h of holes) {
            if (h.gir != null) { girTotal++; if (h.gir) girCount++; }
            if (h.fairway != null) { fwTotal++; if (h.fairway === 'HIT') fwHit++; }
            if (h.putts != null) { puttsSum += h.putts; puttsHoles++; if (h.putts >= 3) threePutts++; }
            penalties += h.penalty_strokes || 0;
        }

        const girPct = girTotal ? (girCount / girTotal * 100).toFixed(1) : '--';
        const fwPct = fwTotal ? (fwHit / fwTotal * 100).toFixed(1) : '--';
        const puttsPerHole = puttsHoles ? (puttsSum / puttsHoles).toFixed(2) : '--';

        const vsPar = rdCache.score_vs_par || 0;
        const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
        const vsColor = vsPar <= 0 ? '#22c55e' : vsPar <= 5 ? '#f59e0b' : '#ef4444';

        // Per-hole vs par for normalized comparison across 9/18 hole rounds
        const holesPlayed = holes.length || rdCache.holes_completed || 18;
        const vsParPerHole = holesPlayed ? vsPar / holesPlayed : 0;

        // Delta helper: computes delta string with arrow and color
        // higherIsBetter: true for GIR%, FW% (more = good); false for putts, 3-putts, vs par (less = good)
        function delta(thisVal, baselineVal, higherIsBetter, decimals = 1, suffix = '') {
            if (!rdCompareData || thisVal === '--' || baselineVal == null) return '';
            const diff = parseFloat(thisVal) - baselineVal;
            if (isNaN(diff)) return '';
            const isBetter = higherIsBetter ? diff > 0 : diff < 0;
            const isWorse = higherIsBetter ? diff < 0 : diff > 0;
            const color = isBetter ? '#22c55e' : isWorse ? '#ef4444' : 'var(--text-dim)';
            const arrow = isBetter ? '▲' : isWorse ? '▼' : '–';
            const sign = diff > 0 ? '+' : '';
            return `<div style="font-size:0.65rem; color:${color}; font-weight:400; margin-top:2px;">${arrow} ${sign}${diff.toFixed(decimals)}${suffix} vs ${rdCompareData.label}</div>`;
        }

        // vs Par delta: compare per-hole normalized values
        function vsParDelta() {
            if (!rdCompareData || rdCompareData.avg_vs_par_per_hole == null) return '';
            const diff = vsParPerHole - rdCompareData.avg_vs_par_per_hole;
            const isBetter = diff < 0;
            const isWorse = diff > 0;
            const color = isBetter ? '#22c55e' : isWorse ? '#ef4444' : 'var(--text-dim)';
            const arrow = isBetter ? '▲' : isWorse ? '▼' : '–';
            const sign = diff > 0 ? '+' : '';
            return `<div style="font-size:0.65rem; color:${color}; font-weight:400; margin-top:2px;">${arrow} ${sign}${diff.toFixed(2)}/hole vs ${rdCompareData.label}</div>`;
        }

        container.innerHTML = `
            <div class="stat-card"><div class="stat-label">Score</div><div class="stat-value">${rdCache.total_strokes || '--'}</div></div>
            <div class="stat-card"><div class="stat-label">vs Par</div><div class="stat-value" style="color:${vsColor}">${rdCache.total_strokes ? vsParStr : '--'}${vsParDelta()}</div></div>
            <div class="stat-card"><div class="stat-label">GIR %</div><div class="stat-value">${girPct}${girPct !== '--' ? '%' : ''}${delta(girPct, rdCompareData?.gir_pct, true, 1, '%')}</div></div>
            <div class="stat-card"><div class="stat-label">FW %</div><div class="stat-value">${fwPct}${fwPct !== '--' ? '%' : ''}${delta(fwPct, rdCompareData?.fairway_pct, true, 1, '%')}</div></div>
            <div class="stat-card"><div class="stat-label">Putts/Hole</div><div class="stat-value">${puttsPerHole}${delta(puttsPerHole, rdCompareData?.avg_putts_per_hole, false, 2)}</div></div>
            <div class="stat-card"><div class="stat-label">3-Putts</div><div class="stat-value">${threePutts}${delta(threePutts, rdCompareData?.avg_3putts, false)}</div></div>
            <div class="stat-card"><div class="stat-label">Penalties</div><div class="stat-value">${penalties}</div></div>
        `;
    }

    function renderRdScorecard() {
        const container = document.getElementById('rd-scorecard');
        const holes = rdCache.holes || [];
        if (!holes.length) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No hole data.</p></div>';
            return;
        }

        const hasPar = Object.keys(rdParMap).length > 0;
        const maxHole = Math.max(...holes.map(h => h.hole_number));
        const is18 = maxHole > 9;

        // Build hole data lookup
        const holeData = {};
        for (const h of holes) holeData[h.hole_number] = h;

        function buildHalf(start, end, label) {
            const nums = [];
            for (let i = start; i <= end; i++) if (holeData[i]) nums.push(i);
            if (nums.length === 0) return null;

            let parTotal = 0, scoreTotal = 0, puttsTotal = 0;
            nums.forEach(n => {
                parTotal += rdParMap[n] || 0;
                scoreTotal += holeData[n].strokes || 0;
                puttsTotal += holeData[n].putts || 0;
            });

            const holeHeaders = nums.map(n =>
                `<th style="cursor:pointer; min-width:32px;" onclick="location.hash='round/${rdCache.id}/hole/${n}'">${n}</th>`
            ).join('') + `<th style="background:var(--bg-hover); min-width:36px;">${label}</th>`;

            const parRow = hasPar ? '<tr><td style="font-weight:600; color:var(--text-dim);">Par</td>' +
                nums.map(n => `<td>${rdParMap[n] || ''}</td>`).join('') +
                `<td style="background:var(--bg-hover); font-weight:600;">${parTotal}</td></tr>` : '';

            const scoreRow = '<tr><td style="font-weight:600;">Score</td>' +
                nums.map(n => {
                    const h = holeData[n];
                    const s = h.strokes;
                    if (!s) return '<td>—</td>';
                    const par = rdParMap[n];
                    let bg = '', color = '';
                    if (hasPar && par) {
                        const diff = s - par;
                        if (diff <= -2) { bg = 'background:#22c55e33;'; color = 'color:#22c55e; font-weight:700;'; }
                        else if (diff === -1) { bg = 'background:#22c55e1a;'; color = 'color:#22c55e;'; }
                        else if (diff === 0) { color = ''; }
                        else if (diff === 1) { bg = 'background:#ef44441a;'; color = 'color:#f59e0b;'; }
                        else { bg = 'background:#ef444433;'; color = 'color:#ef4444; font-weight:700;'; }
                    }
                    return `<td style="${bg}${color}">${s}</td>`;
                }).join('') +
                `<td style="background:var(--bg-hover); font-weight:700;">${scoreTotal}</td></tr>`;

            const vsParRow = hasPar ? '<tr><td style="font-weight:600; color:var(--text-dim);">+/-</td>' +
                nums.map(n => {
                    const s = holeData[n]?.strokes;
                    const p = rdParMap[n];
                    if (!s || !p) return '<td>—</td>';
                    const diff = s - p;
                    const str = diff > 0 ? `+${diff}` : `${diff}`;
                    const color = diff < 0 ? 'color:#22c55e;' : diff === 0 ? 'color:var(--text-dim);' : 'color:#ef4444;';
                    return `<td style="${color}">${str}</td>`;
                }).join('') +
                `<td style="background:var(--bg-hover); font-weight:600; ${(scoreTotal - parTotal) > 0 ? 'color:#ef4444;' : (scoreTotal - parTotal) < 0 ? 'color:#22c55e;' : ''}">${(scoreTotal - parTotal) > 0 ? '+' : ''}${scoreTotal - parTotal}</td></tr>` : '';

            const puttsRow = '<tr><td style="font-weight:600; color:var(--text-dim);">Putts</td>' +
                nums.map(n => {
                    const p = holeData[n]?.putts;
                    return p != null ? `<td>${p}</td>` : '<td>—</td>';
                }).join('') +
                `<td style="background:var(--bg-hover);">${puttsTotal}</td></tr>`;

            const fwRow = '<tr><td style="font-weight:600; color:var(--text-dim);">FW</td>' +
                nums.map(n => {
                    const fw = holeData[n]?.fairway;
                    if (fw === 'HIT') return '<td style="color:#22c55e;">✓</td>';
                    if (fw === 'LEFT') return '<td style="color:#f59e0b;">←</td>';
                    if (fw === 'RIGHT') return '<td style="color:#f59e0b;">→</td>';
                    return '<td style="color:var(--text-dim);">—</td>';
                }).join('') +
                '<td style="background:var(--bg-hover);"></td></tr>';

            const girRow = '<tr><td style="font-weight:600; color:var(--text-dim);">GIR</td>' +
                nums.map(n => {
                    const g = holeData[n]?.gir;
                    if (g === true) return '<td style="color:#22c55e;">●</td>';
                    if (g === false) return '<td style="color:#ef4444;">○</td>';
                    return '<td style="color:var(--text-dim);">—</td>';
                }).join('') +
                '<td style="background:var(--bg-hover);"></td></tr>';

            return `<tr><td></td>${holeHeaders}</tr>${parRow}${scoreRow}${vsParRow}${puttsRow}${fwRow}${girRow}`;
        }

        const front = buildHalf(1, 9, 'OUT');
        const back = is18 ? buildHalf(10, 18, 'IN') : null;

        // Total row for 18-hole
        let totalRow = '';
        if (is18 && hasPar) {
            let totalPar = 0, totalScore = 0, totalPutts = 0;
            holes.forEach(h => {
                totalPar += rdParMap[h.hole_number] || 0;
                totalScore += h.strokes || 0;
                totalPutts += h.putts || 0;
            });
            const totalDiff = totalScore - totalPar;
            totalRow = `<tr style="border-top:2px solid var(--border);">
                <td colspan="${is18 ? 10 : (Math.min(maxHole, 9) + 1)}" style="text-align:right; font-weight:700; padding-right:12px;">Total</td>
                <td style="font-weight:700;">${totalPar}</td>
                <td style="font-weight:700;">${totalScore}</td>
                <td style="font-weight:700; ${totalDiff > 0 ? 'color:#ef4444;' : totalDiff < 0 ? 'color:#22c55e;' : ''}">${totalDiff > 0 ? '+' : ''}${totalDiff}</td>
                <td style="font-weight:700;">${totalPutts}</td>
                <td colspan="2"></td>
            </tr>`;
        }

        container.innerHTML = `<table style="font-size:0.82rem; text-align:center;">
            <tbody>
                ${front || ''}
                ${back ? `<tr><td colspan="20" style="padding:4px;"></td></tr>${back}` : ''}
            </tbody>
        </table>`;
    }

    function renderRdHighlights() {
        const card = document.getElementById('rd-highlights-card');
        const container = document.getElementById('rd-highlights');
        const holes = rdCache.holes || [];
        const hasPar = Object.keys(rdParMap).length > 0;

        if (!holes.length || !hasPar) {
            card.style.display = 'none';
            return;
        }

        const insights = [];

        // 1. Best and worst holes (by vs par)
        const holeScores = holes
            .filter(h => h.strokes && rdParMap[h.hole_number])
            .map(h => ({ num: h.hole_number, strokes: h.strokes, par: rdParMap[h.hole_number], diff: h.strokes - rdParMap[h.hole_number] }));

        if (holeScores.length) {
            const best = holeScores.reduce((a, b) => a.diff < b.diff ? a : b);
            const worst = holeScores.reduce((a, b) => a.diff > b.diff ? a : b);
            if (best.diff <= -1) {
                const label = best.diff <= -2 ? 'Eagle' : 'Birdie';
                insights.push({ icon: '🏆', text: `${label} on hole ${best.num} (${best.strokes} on par ${best.par})`, color: '#22c55e' });
            }
            if (worst.diff >= 3) {
                insights.push({ icon: '⚠', text: `Toughest hole: #${worst.num} — ${worst.strokes} on par ${worst.par} (+${worst.diff})`, color: '#ef4444' });
            }
        }

        // 2. Streaks (consecutive pars or better, consecutive bogeys or worse)
        if (holeScores.length >= 3) {
            let bestStreak = [], currentStreak = [];
            for (const h of holeScores.sort((a, b) => a.num - b.num)) {
                if (h.diff <= 0) {
                    currentStreak.push(h);
                    if (currentStreak.length > bestStreak.length) bestStreak = [...currentStreak];
                } else {
                    currentStreak = [];
                }
            }
            if (bestStreak.length >= 3) {
                const from = bestStreak[0].num;
                const to = bestStreak[bestStreak.length - 1].num;
                const birdies = bestStreak.filter(h => h.diff < 0).length;
                const desc = birdies > 0 ? `(${birdies} birdie${birdies > 1 ? 's' : ''})` : '(all pars)';
                insights.push({ icon: '🔥', text: `${bestStreak.length}-hole streak of par or better: holes ${from}–${to} ${desc}`, color: '#f59e0b' });
            }
        }

        // 3. Top clubs by SG (if shot data exists)
        if (rdCache.shots_tracked) {
            const clubSg = {};
            for (const hole of holes) {
                for (const shot of (hole.shots || [])) {
                    if (shot.sg_pga == null || !shot.club || shot.shot_type === 'PUTT' || shot.shot_type === 'PENALTY') continue;
                    if (!clubSg[shot.club]) clubSg[shot.club] = { total: 0, count: 0 };
                    clubSg[shot.club].total += shot.sg_pga;
                    clubSg[shot.club].count++;
                }
            }
            const clubs = Object.entries(clubSg)
                .filter(([, d]) => d.count >= 2)
                .map(([name, d]) => ({ name, total: d.total, count: d.count, avg: d.total / d.count }))
                .sort((a, b) => b.total - a.total);

            if (clubs.length && clubs[0].total > 0) {
                const best = clubs[0];
                insights.push({ icon: '⭐', text: `Best club: ${best.name} — gained ${best.total.toFixed(1)} strokes (${best.count} shots)`, color: '#22c55e' });
            }
            if (clubs.length && clubs[clubs.length - 1].total < -1) {
                const worst = clubs[clubs.length - 1];
                insights.push({ icon: '📉', text: `Costliest club: ${worst.name} — lost ${Math.abs(worst.total).toFixed(1)} strokes (${worst.count} shots)`, color: '#ef4444' });
            }
        }

        // 4. Putting highlights
        const putts = holes.filter(h => h.putts != null);
        if (putts.length) {
            const onePutts = putts.filter(h => h.putts === 1).length;
            const threePutts = putts.filter(h => h.putts >= 3).length;
            if (onePutts >= 3) {
                insights.push({ icon: '🎯', text: `${onePutts} one-putts this round`, color: '#22c55e' });
            }
            if (threePutts >= 3) {
                insights.push({ icon: '😬', text: `${threePutts} three-putts this round`, color: '#ef4444' });
            }
        }

        // 5. Fairway accuracy highlight
        const fwHoles = holes.filter(h => h.fairway != null);
        if (fwHoles.length >= 6) {
            const hitPct = fwHoles.filter(h => h.fairway === 'HIT').length / fwHoles.length * 100;
            if (hitPct >= 70) {
                insights.push({ icon: '🎯', text: `Great driving: ${hitPct.toFixed(0)}% fairways hit`, color: '#22c55e' });
            }
            // Miss tendency
            const lefts = fwHoles.filter(h => h.fairway === 'LEFT').length;
            const rights = fwHoles.filter(h => h.fairway === 'RIGHT').length;
            const misses = lefts + rights;
            if (misses >= 3) {
                const dominant = lefts > rights ? 'left' : rights > lefts ? 'right' : null;
                if (dominant) {
                    const pct = Math.round((dominant === 'left' ? lefts : rights) / misses * 100);
                    if (pct >= 65) {
                        insights.push({ icon: '↩', text: `Miss tendency: ${pct}% of misses go ${dominant}`, color: '#f59e0b' });
                    }
                }
            }
        }

        // 6. Comparison-aware insights (only when a baseline is active)
        if (rdCompareData) {
            const cmp = rdCompareData;
            const label = cmp.label;

            // GIR comparison
            if (cmp.gir_pct != null) {
                const girCount = holes.filter(h => h.gir != null).length;
                const girHit = holes.filter(h => h.gir === true).length;
                if (girCount) {
                    const girPct = girHit / girCount * 100;
                    const diff = girPct - cmp.gir_pct;
                    if (diff > 10) insights.push({ icon: '📈', text: `GIR ${girPct.toFixed(0)}% — ${diff.toFixed(1)}% better than ${label}`, color: '#22c55e' });
                    else if (diff < -10) insights.push({ icon: '📉', text: `GIR ${girPct.toFixed(0)}% — ${Math.abs(diff).toFixed(1)}% worse than ${label}`, color: '#ef4444' });
                }
            }

            // Fairway comparison
            if (cmp.fairway_pct != null && fwHoles.length >= 6) {
                const hitPct = fwHoles.filter(h => h.fairway === 'HIT').length / fwHoles.length * 100;
                const diff = hitPct - cmp.fairway_pct;
                if (diff > 10) insights.push({ icon: '📈', text: `Fairways ${hitPct.toFixed(0)}% — ${diff.toFixed(1)}% better than ${label}`, color: '#22c55e' });
                else if (diff < -10) insights.push({ icon: '📉', text: `Fairways ${hitPct.toFixed(0)}% — ${Math.abs(diff).toFixed(1)}% worse than ${label}`, color: '#ef4444' });
            }

            // Putts comparison
            if (cmp.avg_putts_per_hole != null && putts.length) {
                const pph = putts.reduce((s, h) => s + h.putts, 0) / putts.length;
                const diff = pph - cmp.avg_putts_per_hole;
                if (diff < -0.2) insights.push({ icon: '📈', text: `Putting ${pph.toFixed(2)}/hole — ${Math.abs(diff).toFixed(2)} better than ${label}`, color: '#22c55e' });
                else if (diff > 0.2) insights.push({ icon: '📉', text: `Putting ${pph.toFixed(2)}/hole — ${diff.toFixed(2)} worse than ${label}`, color: '#ef4444' });
            }

            // SG comparison (if baseline SG exists)
            if (cmp.sg) {
                const sgTotals = { off_the_tee: 0, approach: 0, short_game: 0, putting: 0 };
                for (const hole of holes) {
                    const par = rdParMap[hole.hole_number];
                    for (const shot of (hole.shots || [])) {
                        if (shot.sg_pga == null) continue;
                        const cat = classifySgCategory(shot, par);
                        if (cat && sgTotals.hasOwnProperty(cat)) sgTotals[cat] += shot.sg_pga;
                    }
                }
                // Find biggest improvement and biggest drop vs baseline
                const catLabels = { off_the_tee: 'Off the Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' };
                let bestCat = null, bestDiff = -Infinity;
                let worstCat = null, worstDiff = Infinity;
                for (const cat of Object.keys(sgTotals)) {
                    const diff = sgTotals[cat] - (cmp.sg[cat] || 0);
                    if (diff > bestDiff) { bestDiff = diff; bestCat = cat; }
                    if (diff < worstDiff) { worstDiff = diff; worstCat = cat; }
                }
                if (bestDiff > 1) insights.push({ icon: '⬆', text: `Best improvement vs ${label}: ${catLabels[bestCat]} — gained ${bestDiff.toFixed(1)} more strokes`, color: '#22c55e' });
                if (worstDiff < -1) insights.push({ icon: '⬇', text: `Biggest drop vs ${label}: ${catLabels[worstCat]} — lost ${Math.abs(worstDiff).toFixed(1)} more strokes`, color: '#ef4444' });
            }
        }

        if (!insights.length) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';
        container.innerHTML = insights.map(i =>
            `<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
                <span style="font-size:1.1rem; width:24px; text-align:center;">${i.icon}</span>
                <span style="font-size:0.88rem; color:${i.color};">${i.text}</span>
            </div>`
        ).join('');
    }

    function renderRdSg() {
        const sgCard = document.getElementById('rd-sg-card');
        const container = document.getElementById('rd-sg-breakdown');

        if (!rdCache.shots_tracked) {
            sgCard.style.display = 'none';
            return;
        }
        sgCard.style.display = '';

        const sgTotals = { off_the_tee: 0, approach: 0, short_game: 0, putting: 0 };
        let hasData = false;

        for (const hole of (rdCache.holes || [])) {
            const par = rdParMap[hole.hole_number];
            for (const shot of (hole.shots || [])) {
                if (shot.sg_pga == null) continue;
                const cat = classifySgCategory(shot, par);
                if (cat && sgTotals.hasOwnProperty(cat)) {
                    sgTotals[cat] += shot.sg_pga;
                    hasData = true;
                }
            }
        }

        // Build missing-data notice if course GPS is incomplete
        function buildMissingDataNotice() {
            if (!rdCourseCache) return '';
            const tees = rdCourseCache.tees || [];
            const matchedTee = tees.find(t => t.id === rdCache.tee_id) || tees[0];
            const holes = matchedTee?.holes || [];
            const holesWithTee = holes.filter(h => h.tee_lat).length;
            const holesWithGreen = holes.filter(h => h.green_boundary).length;
            const totalHoles = holes.length || rdCache.holes_completed || 18;
            if (holesWithTee < totalHoles || holesWithGreen < totalHoles) {
                const courseId = rdCache.course_id;
                return `<div style="margin-top:10px; padding:8px 12px; background:#f59e0b11; border:1px solid #f59e0b33; border-radius:6px; font-size:0.78rem; color:#f59e0b;">
                    ⚠ Hole GPS data is incomplete (${holesWithTee}/${totalHoles} tees, ${holesWithGreen}/${totalHoles} greens).
                    <a href="#course/${courseId}/holes" style="color:#f59e0b; text-decoration:underline;">Edit holes</a> to enable full SG analysis.
                </div>`;
            }
            return '';
        }

        if (!hasData) {
            const notice = buildMissingDataNotice();
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No SG data for this round.</p></div>' + notice;
            return;
        }

        const cats = [
            { key: 'off_the_tee', label: 'Off the Tee' },
            { key: 'approach', label: 'Approach' },
            { key: 'short_game', label: 'Short Game' },
            { key: 'putting', label: 'Putting' },
        ];

        const vals = cats.map(c => sgTotals[c.key]);
        const maxAbs = Math.max(...vals.map(Math.abs), 0.1);

        // Check if non-putt categories are all zero — likely missing course GPS data
        const nonPuttZero = sgTotals.off_the_tee === 0 && sgTotals.approach === 0 && sgTotals.short_game === 0;
        const missingDataNotice = nonPuttZero ? buildMissingDataNotice() : '';

        // Include baseline values in maxAbs calculation if comparing
        const baselineSg = rdCompareData?.sg;
        const allVals = [...vals];
        if (baselineSg) cats.forEach(c => allVals.push(baselineSg[c.key] || 0));
        const finalMaxAbs = Math.max(...allVals.map(Math.abs), 0.1);

        // Colors: this round = bright, baseline = muted/dark variant
        // Green: bright #22c55e / muted #15803d   Red: bright #ef4444 / muted #991b1b
        const thisGreen = '#22c55e', baseGreen = '#15803d';
        const thisRed = '#ef4444', baseRed = '#991b1b';

        container.innerHTML = cats.map(c => {
            const v = Math.round(sgTotals[c.key] * 100) / 100;
            const thisColor = v >= 0 ? thisGreen : thisRed;
            const sign = v > 0 ? '+' : '';
            const barPct = Math.min(Math.abs(v) / finalMaxAbs * 100, 100);
            const isPositive = v >= 0;

            // Helper: render a single-side bar pair (bigger behind, smaller on top)
            function layeredBar(side, thisPct, thisCol, basePct, baseCol) {
                const radius = side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0';
                const align = side === 'left' ? 'right:0;' : 'left:0;';
                const bigPct = Math.max(thisPct, basePct);
                const smallPct = Math.min(thisPct, basePct);
                const bigCol = thisPct >= basePct ? thisCol : baseCol;
                const smallCol = thisPct >= basePct ? baseCol : thisCol;
                if (bigPct <= 0) return '';
                return `<div style="width:${bigPct}%; position:relative;">
                    <div style="width:100%; height:20px; background:${bigCol}; border-radius:${radius};"></div>
                    ${smallPct > 0 ? `<div style="position:absolute; ${align} top:0; width:${(smallPct/bigPct*100)}%; height:20px; background:${smallCol}; border-radius:${radius};"></div>` : ''}
                </div>`;
            }

            let leftBars = '', rightBars = '';

            if (baselineSg) {
                const bv = baselineSg[c.key] || 0;
                const bPct = Math.min(Math.abs(bv) / finalMaxAbs * 100, 100);
                const bPositive = bv >= 0;
                const bColor = bPositive ? baseGreen : baseRed;

                if (!isPositive && !bPositive) {
                    leftBars = layeredBar('left', barPct, thisColor, bPct, bColor);
                } else if (isPositive && bPositive) {
                    rightBars = layeredBar('right', barPct, thisColor, bPct, bColor);
                } else {
                    // Different sides — separate bars
                    if (!isPositive) leftBars = `<div style="width:${barPct}%; height:20px; background:${thisColor}; border-radius:4px 0 0 4px; min-width:2px;"></div>`;
                    else rightBars = `<div style="width:${barPct}%; height:20px; background:${thisColor}; border-radius:0 4px 4px 0; min-width:2px;"></div>`;
                    if (!bPositive) leftBars += `<div style="width:${bPct}%; height:20px; background:${bColor}; border-radius:4px 0 0 4px; min-width:2px;"></div>`;
                    else rightBars += `<div style="width:${bPct}%; height:20px; background:${bColor}; border-radius:0 4px 4px 0; min-width:2px;"></div>`;
                }
            } else {
                if (!isPositive) leftBars = `<div style="width:${barPct}%; height:20px; background:${thisColor}; border-radius:4px 0 0 4px; min-width:2px;"></div>`;
                else rightBars = `<div style="width:${barPct}%; height:20px; background:${thisColor}; border-radius:0 4px 4px 0; min-width:2px;"></div>`;
            }

            // Delta text for SG
            let sgDelta = '';
            if (baselineSg) {
                const bv = baselineSg[c.key] || 0;
                const diff = Math.round((v - bv) * 100) / 100;
                const dSign = diff > 0 ? '+' : '';
                const dColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--text-dim)';
                sgDelta = `<div style="font-size:0.65rem; color:${dColor}; font-weight:400;">(${dSign}${diff.toFixed(2)})</div>`;
            }

            return `<div style="display:flex; align-items:center; margin-bottom:10px; gap:8px;">
                <span style="width:80px; font-size:0.82rem; color:var(--text-muted); flex-shrink:0;">${c.label}</span>
                <div style="flex:1; display:flex; height:20px;">
                    <div style="width:50%; display:flex; justify-content:flex-end;">${leftBars}</div>
                    <div style="width:1px; background:var(--text-dim);"></div>
                    <div style="width:50%; display:flex;">${rightBars}</div>
                </div>
                <span style="width:65px; text-align:right; flex-shrink:0;">
                    <div style="font-size:0.85rem; font-weight:600; color:${thisColor};">${sign}${v.toFixed(2)}</div>
                    ${sgDelta}
                </span>
            </div>`;
        }).join('')
        + `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px; text-align:right;">${baselineSg
            ? `<span style="display:inline-block; width:12px; height:8px; background:${thisRed}; border-radius:2px; vertical-align:middle;"></span> this round · <span style="display:inline-block; width:12px; height:8px; background:${baseRed}; border-radius:2px; vertical-align:middle;"></span> ${rdCompareData.label}`
            : 'total strokes gained vs PGA'}</div>`
        + missingDataNotice;
    }

    function renderRdDistribution() {
        const container = document.getElementById('rd-distribution');
        const holes = rdCache.holes || [];
        const hasPar = Object.keys(rdParMap).length > 0;

        if (!holes.length || !hasPar) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No scoring data.</p></div>';
            return;
        }

        const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
        for (const h of holes) {
            if (!h.strokes) continue;
            const par = rdParMap[h.hole_number];
            if (!par) continue;
            const diff = h.strokes - par;
            if (diff <= -2) dist.eagle++;
            else if (diff === -1) dist.birdie++;
            else if (diff === 0) dist.par++;
            else if (diff === 1) dist.bogey++;
            else if (diff === 2) dist.double++;
            else dist.triple++;
        }

        const baselineDist = rdCompareData?.dist;

        const items = [
            { label: 'Eagle+', count: dist.eagle, baseKey: 'birdie_or_better', color: '#16a34a', muted: '#0d5c2a' },
            { label: 'Birdie', count: dist.birdie, baseKey: null, color: '#22c55e', muted: '#15803d' },
            { label: 'Par', count: dist.par, baseKey: 'par', color: '#3b82f6', muted: '#1e40af' },
            { label: 'Bogey', count: dist.bogey, baseKey: 'bogey', color: '#f59e0b', muted: '#92400e' },
            { label: 'Double', count: dist.double, baseKey: 'double', color: '#ef4444', muted: '#991b1b' },
            { label: 'Triple+', count: dist.triple, baseKey: 'triple_plus', color: '#dc2626', muted: '#7f1d1d' },
        ];

        // For baseline, eagle+birdie are combined as birdie_or_better
        // Split: show baseline on Eagle+ row only (combined), skip Birdie baseline
        const allCounts = items.map(i => i.count);
        if (baselineDist) items.forEach(i => {
            if (i.baseKey && baselineDist[i.baseKey] != null) allCounts.push(baselineDist[i.baseKey]);
        });
        const maxCount = Math.max(...allCounts, 1);

        // Only show rows that have data (this round or baseline)
        const visibleItems = items.filter(i => {
            if (i.count > 0) return true;
            if (baselineDist && i.baseKey && baselineDist[i.baseKey] > 0.1) return true;
            return false;
        });

        container.innerHTML = visibleItems.map(i => {
            const barPct = Math.min(i.count / maxCount * 100, 100);
            const lightColor = i.color + '55'; // 33% opacity version

            let barHtml;
            if (baselineDist && i.baseKey && baselineDist[i.baseKey] != null) {
                const bv = baselineDist[i.baseKey];
                const bPct = Math.min(bv / maxCount * 100, 100);
                // Two bars stacked: bigger behind, smaller on top — both always visible
                // This round = bright color, baseline = muted/dark variant of same hue
                const bigPct = Math.max(barPct, bPct);
                const smallPct = Math.min(barPct, bPct);
                const bigIsThis = barPct >= bPct;
                barHtml = `<div style="flex:1; background:var(--bg-hover); border-radius:4px; height:20px; position:relative;">
                    <div style="width:${bigPct}%; background:${bigIsThis ? i.color : i.muted}; height:100%; border-radius:4px;"></div>
                    <div style="position:absolute; top:0; left:0; width:${smallPct}%; background:${bigIsThis ? i.muted : i.color}; height:100%; border-radius:4px;"></div>
                </div>`;
            } else {
                barHtml = `<div style="flex:1; background:var(--bg-hover); border-radius:4px; height:20px; overflow:hidden;">
                    <div style="width:${barPct}%; background:${i.color}; height:100%; border-radius:4px;"></div>
                </div>`;
            }

            // Delta text for distribution
            let distDelta = '';
            if (baselineDist && i.baseKey && baselineDist[i.baseKey] != null) {
                const diff = Math.round((i.count - baselineDist[i.baseKey]) * 10) / 10;
                const dSign = diff > 0 ? '+' : '';
                // For scoring dist: more birdies/pars = good (green), more bogeys+ = bad (red)
                const isGoodCategory = ['birdie_or_better', 'par'].includes(i.baseKey);
                const dColor = (isGoodCategory ? diff > 0 : diff < 0) ? '#22c55e' : (isGoodCategory ? diff < 0 : diff > 0) ? '#ef4444' : 'var(--text-dim)';
                distDelta = `<div style="font-size:0.65rem; color:${dColor}; font-weight:400;">(${dSign}${diff.toFixed(1)})</div>`;
            }

            return `<div style="display:flex; align-items:center; margin-bottom:8px; gap:10px;">
                <span style="width:60px; font-size:0.82rem; color:var(--text-muted); flex-shrink:0;">${i.label}</span>
                ${barHtml}
                <span style="width:40px; text-align:right; flex-shrink:0;">
                    <div style="font-size:0.85rem; font-weight:600; color:${i.color};">${i.count}</div>
                    ${distDelta}
                </span>
            </div>`;
        }).join('')
        + (baselineDist ? `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px; text-align:right;">bright = this round · dark = ${rdCompareData.label}</div>` : '');
    }

    function renderRdNotes() {
        const card = document.getElementById('rd-notes-card');
        const container = document.getElementById('rd-notes');
        const d = rdCache;

        if (!d.key_takeaway && !d.overall_rating) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';

        let html = '';
        if (d.overall_rating) {
            const stars = '★'.repeat(d.overall_rating) + '☆'.repeat(5 - d.overall_rating);
            html += `<div style="font-size:1.2rem; color:#f59e0b; margin-bottom:8px;">${stars}</div>`;
        }
        if (d.key_takeaway) {
            html += `<p style="color:var(--text-muted); font-size:0.9rem; line-height:1.5;">${d.key_takeaway}</p>`;
        }
        container.innerHTML = html;
    }

    function renderRdNav() {
        const container = document.getElementById('rd-nav');
        if (!roundsCache.length) { container.innerHTML = ''; return; }

        const idx = roundsCache.findIndex(r => r.id === rdCache.id);
        // roundsCache is sorted newest first, so "prev" (older) is idx+1, "next" (newer) is idx-1
        const prevRound = idx >= 0 && idx < roundsCache.length - 1 ? roundsCache[idx + 1] : null;
        const nextRound = idx > 0 ? roundsCache[idx - 1] : null;

        let html = '';
        if (prevRound) {
            html += `<a href="#round/${prevRound.id}" class="btn btn-ghost btn-sm" style="font-size:0.8rem;">← ${prevRound.date}</a>`;
        }
        if (nextRound) {
            html += `<a href="#round/${nextRound.id}" class="btn btn-ghost btn-sm" style="font-size:0.8rem;">${nextRound.date} →</a>`;
        }
        container.innerHTML = html;
    }

    // ========== View Holes Button ==========
    const btnViewHoles = document.getElementById('btn-view-holes');
    if (btnViewHoles) {
        btnViewHoles.addEventListener('click', () => {
            if (currentCourseDetail) {
                location.hash = `course/${currentCourseDetail.id}/holes`;
            }
        });
    }

    // ========== Hole View ==========
    let holeViewCourse = null;    // CourseDetailResponse
    let holeViewRounds = [];      // RoundSummaryResponse[] at this course
    let holeViewRoundDetail = null; // Full RoundDetailResponse (when a round is selected)
    let holeViewMode = 'historic'; // 'historic' or roundId
    let selectedHole = 1;

    async function loadHoleView(courseId, roundId = null, holeNum = null) {
        // Fetch course detail with tees/holes
        try {
            const resp = await fetch(`/api/courses/${courseId}`);
            holeViewCourse = await resp.json();
        } catch (e) {
            console.error('Failed to load course:', e);
            return;
        }

        // Get rounds at this course from cache
        holeViewRounds = roundsCache.filter(r => r.course_id === courseId);

        // Set up header
        const title = document.getElementById('hole-view-title');
        const subtitle = document.getElementById('hole-view-subtitle');
        const backBtn = document.getElementById('hole-view-back');
        title.textContent = holeViewCourse.club_name || holeViewCourse.display_name;
        subtitle.textContent = holeViewCourse.course_name || '';

        // Set back button — smart: goes to round detail if came from a round, otherwise course
        const courseLink = document.getElementById('hole-view-course-link');
        if (roundId) {
            backBtn.href = `#round/${roundId}`;
            backBtn.textContent = '← Round';
            courseLink.href = `#course/${courseId}`;
            courseLink.textContent = '← Course';
            courseLink.style.display = '';
        } else {
            backBtn.href = `#course/${courseId}`;
            backBtn.textContent = '← Course';
            courseLink.style.display = 'none';
        }

        // Build round selector
        const roundSelect = document.getElementById('round-select');
        roundSelect.innerHTML = '<option value="historic">Historic</option>';
        holeViewRounds.forEach(r => {
            const vsPar = r.score_vs_par || 0;
            const vsParStr = vsPar > 0 ? `+${vsPar}` : vsPar === 0 ? 'E' : `${vsPar}`;
            // Pretty date: "April 27th, 2025"
            const d = new Date(r.date + 'T12:00:00');
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const day = d.getDate();
            const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
            const prettyDate = `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
            const label = `${prettyDate}  ${r.total_strokes}(${vsParStr})`;
            roundSelect.innerHTML += `<option value="${r.id}">${label}</option>`;
        });

        // Set default selection
        if (roundId) {
            roundSelect.value = String(roundId);
            holeViewMode = roundId;
        } else {
            roundSelect.value = 'historic';
            holeViewMode = 'historic';
        }

        // Load the selected view
        await onRoundSelect(roundSelect.value);
        selectedHole = (holeNum && holeNum >= 1) ? holeNum : 1;
        renderHoleDetail();
    }

    // Round selector change handler
    const roundSelect = document.getElementById('round-select');
    if (roundSelect) {
        roundSelect.addEventListener('change', async () => {
            await onRoundSelect(roundSelect.value);
            renderHoleDetail();
        });
    }

    async function onRoundSelect(value) {
        // Exit edit mode when switching rounds
        if (holeEditMode) exitEditMode();

        if (value === 'historic') {
            holeViewMode = 'historic';
            holeViewRoundDetail = null;
            // Fetch all round details for historic computation
            // For now, use summary data — we'll enhance later if needed
        } else {
            const roundId = parseInt(value);
            holeViewMode = roundId;
            try {
                const resp = await fetch(`/api/rounds/${roundId}`);
                holeViewRoundDetail = await resp.json();
            } catch (e) {
                console.error('Failed to load round:', e);
                holeViewRoundDetail = null;
            }
        }
        renderScorecard();
    }

    function getCourseTeeHoles() {
        // Pick the first male tee with holes, or any tee with holes
        if (!holeViewCourse || !holeViewCourse.tees) return [];
        const maleTees = holeViewCourse.tees.filter(t => !t.tee_name.includes('(W)'));
        const teesWithHoles = maleTees.filter(t => t.holes && t.holes.length > 0);
        if (teesWithHoles.length > 0) return teesWithHoles[0].holes;
        // Fallback to any tee with holes
        const anyWithHoles = holeViewCourse.tees.filter(t => t.holes && t.holes.length > 0);
        if (anyWithHoles.length > 0) return anyWithHoles[0].holes;
        // Generate placeholder holes from course data
        const numHoles = holeViewCourse.holes || 9;
        return Array.from({length: numHoles}, (_, i) => ({
            hole_number: i + 1,
            par: null,
            yardage: null,
            handicap: null,
        }));
    }

    function renderScorecard() {
        const container = document.getElementById('scorecard-container');
        if (!container || !holeViewCourse) return;

        const courseHoles = getCourseTeeHoles();
        const numHoles = courseHoles.length || holeViewCourse.holes || 9;
        const is18 = numHoles > 9;

        // Get score data
        let scoreData = {};  // {holeNumber: {strokes, putts, fairway, ...}}
        if (holeViewMode === 'historic') {
            // Compute best/avg from all rounds at this course
            // We'll fetch round details on demand — for now use basic data
            scoreData = computeHistoricScores();
        } else if (holeViewRoundDetail) {
            holeViewRoundDetail.holes.forEach(h => {
                scoreData[h.hole_number] = h;
            });
        }

        // Build scorecard HTML
        let html = '<table class="scorecard-table"><tbody>';

        // Hole number row
        html += '<tr class="scorecard-header"><td class="scorecard-label">Hole</td>';
        for (let i = 1; i <= numHoles; i++) {
            if (is18 && i === 10) html += '<td class="scorecard-total">OUT</td>';
            const active = i === selectedHole ? ' active' : '';
            html += `<td class="scorecard-cell${active}" data-hole="${i}">${i}</td>`;
        }
        html += `<td class="scorecard-total">${is18 ? 'IN' : 'OUT'}</td>`;
        if (is18) html += '<td class="scorecard-total">TOT</td>';
        html += '</tr>';

        // Yardage row
        html += '<tr class="scorecard-yardage"><td class="scorecard-label">Yds</td>';
        let frontYards = 0, backYards = 0;
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            const yds = ch?.yardage || '';
            if (i <= 9) frontYards += (ch?.yardage || 0);
            else backYards += (ch?.yardage || 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${frontYards || ''}</td>`;
            html += `<td class="scorecard-cell" data-hole="${i}">${yds}</td>`;
        }
        const lastNine = is18 ? backYards : frontYards;
        html += `<td class="scorecard-total">${lastNine || ''}</td>`;
        if (is18) html += `<td class="scorecard-total">${frontYards + backYards || ''}</td>`;
        html += '</tr>';

        // Par row
        html += '<tr class="scorecard-par"><td class="scorecard-label">Par</td>';
        let frontPar = 0, backPar = 0;
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            const par = ch?.par || '';
            if (i <= 9) frontPar += (ch?.par || 0);
            else backPar += (ch?.par || 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${frontPar || ''}</td>`;
            html += `<td class="scorecard-cell" data-hole="${i}">${par}</td>`;
        }
        const lastNinePar = is18 ? backPar : frontPar;
        html += `<td class="scorecard-total">${lastNinePar || ''}</td>`;
        if (is18) html += `<td class="scorecard-total">${frontPar + backPar || ''}</td>`;
        html += '</tr>';

        // HCP row
        html += '<tr class="scorecard-hcp"><td class="scorecard-label">HCP</td>';
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            if (is18 && i === 10) html += '<td class="scorecard-total"></td>';
            html += `<td class="scorecard-cell" data-hole="${i}">${ch?.handicap || ''}</td>`;
        }
        html += '<td class="scorecard-total"></td>';
        if (is18) html += '<td class="scorecard-total"></td>';
        html += '</tr>';

        // Score row
        html += '<tr class="scorecard-score"><td class="scorecard-label">' +
            (holeViewMode === 'historic' ? 'Best' : 'Score') + '</td>';
        let frontScore = 0, backScore = 0, hasScores = false;
        for (let i = 1; i <= numHoles; i++) {
            const sd = scoreData[i];
            const ch = courseHoles.find(h => h.hole_number === i);
            const par = ch?.par || 0;
            let strokes = '';
            let cls = '';

            if (holeViewMode === 'historic' && sd) {
                strokes = sd.best;
                hasScores = true;
            } else if (sd && sd.strokes) {
                strokes = sd.strokes;
                hasScores = true;
            }

            if (strokes && par) {
                const diff = strokes - par;
                if (diff <= -2) cls = ' score-eagle';
                else if (diff === -1) cls = ' score-birdie';
                else if (diff === 0) cls = ' score-par';
                else if (diff === 1) cls = ' score-bogey';
                else cls = ' score-double';
            }

            if (i <= 9) frontScore += (typeof strokes === 'number' ? strokes : 0);
            else backScore += (typeof strokes === 'number' ? strokes : 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${hasScores ? frontScore : ''}</td>`;
            const active = i === selectedHole ? ' active' : '';
            html += `<td class="scorecard-cell${cls}${active}" data-hole="${i}">${strokes}</td>`;
        }
        const lastNineScore = is18 ? backScore : frontScore;
        html += `<td class="scorecard-total">${hasScores ? lastNineScore : ''}</td>`;
        if (is18) html += `<td class="scorecard-total">${hasScores ? frontScore + backScore : ''}</td>`;
        html += '</tr>';

        // Avg row (historic only)
        if (holeViewMode === 'historic' && Object.keys(scoreData).length > 0) {
            html += '<tr class="scorecard-avg"><td class="scorecard-label">Avg</td>';
            let frontAvg = 0, backAvg = 0;
            for (let i = 1; i <= numHoles; i++) {
                const sd = scoreData[i];
                const avg = sd?.avg ? sd.avg.toFixed(1) : '';
                if (i <= 9) frontAvg += (sd?.avg || 0);
                else backAvg += (sd?.avg || 0);
                if (is18 && i === 10) html += `<td class="scorecard-total">${frontAvg ? frontAvg.toFixed(1) : ''}</td>`;
                html += `<td class="scorecard-cell" data-hole="${i}">${avg}</td>`;
            }
            const lastNineAvg = is18 ? backAvg : frontAvg;
            html += `<td class="scorecard-total">${lastNineAvg ? lastNineAvg.toFixed(1) : ''}</td>`;
            if (is18) html += `<td class="scorecard-total">${(frontAvg + backAvg).toFixed(1)}</td>`;
            html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

        // Click handlers on cells
        container.querySelectorAll('.scorecard-cell[data-hole]').forEach(cell => {
            cell.addEventListener('click', () => {
                selectedHole = parseInt(cell.dataset.hole);
                renderScorecard();  // re-render to update active highlight
                renderHoleDetail();
            });
        });
    }

    function computeHistoricScores() {
        // Compute best and average score per hole from all rounds
        // For now, use roundsCache summary data — we'd need full round details for per-hole stats
        // TODO: fetch all round details for proper historic per-hole computation
        // Placeholder: return empty if we don't have per-hole data cached
        const scores = {};
        if (!holeViewAllRoundDetails || holeViewAllRoundDetails.length === 0) return scores;

        const numHoles = holeViewCourse?.holes || 9;
        for (let h = 1; h <= numHoles; h++) {
            const holeScores = holeViewAllRoundDetails
                .flatMap(r => r.holes || [])
                .filter(rh => rh.hole_number === h && rh.strokes > 0)
                .map(rh => rh.strokes);
            if (holeScores.length > 0) {
                const courseHoles = getCourseTeeHoles();
                const chData = courseHoles.find(ch => ch.hole_number === h);
                scores[h] = {
                    best: Math.min(...holeScores),
                    avg: holeScores.reduce((a, b) => a + b, 0) / holeScores.length,
                    rounds: holeScores.length,
                    par: chData?.par || 0,
                };
            }
        }
        return scores;
    }

    // Cache for all round details at current course (for historic mode)
    let holeViewAllRoundDetails = [];

    async function loadAllRoundDetailsForCourse() {
        holeViewAllRoundDetails = [];
        for (const r of holeViewRounds) {
            try {
                const resp = await fetch(`/api/rounds/${r.id}`);
                const detail = await resp.json();
                holeViewAllRoundDetails.push(detail);
            } catch (e) {
                console.error('Failed to load round', r.id, e);
            }
        }
    }

    // Override onRoundSelect to load all round details for historic
    const _origOnRoundSelect = onRoundSelect;
    async function onRoundSelectWrapped(value) {
        // Always load all round details for historic context (needed for comparisons in round view too)
        if (holeViewAllRoundDetails.length === 0 && holeViewRounds.length > 0) {
            await loadAllRoundDetailsForCourse();
        }
        holeViewMode = value === 'historic' ? 'historic' : parseInt(value);
        if (value !== 'historic') {
            const roundId = parseInt(value);
            try {
                const existing = holeViewAllRoundDetails.find(r => r.id === roundId);
                holeViewRoundDetail = existing || await (await fetch(`/api/rounds/${roundId}`)).json();
            } catch (e) {
                holeViewRoundDetail = null;
            }
        } else {
            holeViewRoundDetail = null;
        }
        renderScorecard();
    }
    // Re-bind
    onRoundSelect = onRoundSelectWrapped;
    if (roundSelect) {
        roundSelect.removeEventListener('change', null);
        roundSelect.addEventListener('change', async () => {
            await onRoundSelect(roundSelect.value);
            renderHoleDetail();
        });
    }

    // ========== Hole Map Rendering ==========

    // Default colors per club type — unique for each
    const DEFAULT_CLUB_COLORS = {
        'Driver':         '#2196F3',
        '2 Wood':         '#1565C0',
        '3 Wood':         '#1E88E5',
        '4 Wood':         '#42A5F5',
        '5 Wood':         '#64B5F6',
        '7 Wood':         '#90CAF9',
        '9 Wood':         '#BBDEFB',
        '2 Hybrid':       '#7B1FA2',
        '3 Hybrid':       '#9C27B0',
        '4 Hybrid':       '#AB47BC',
        '5 Hybrid':       '#CE93D8',
        '6 Hybrid':       '#E1BEE7',
        '1 Iron':         '#B71C1C',
        '2 Iron':         '#C62828',
        '3 Iron':         '#D32F2F',
        '4 Iron':         '#E53935',
        '5 Iron':         '#EF5350',
        '6 Iron':         '#E91E63',
        '7 Iron':         '#F06292',
        '8 Iron':         '#F48FB1',
        '9 Iron':         '#F8BBD0',
        'Pitching Wedge': '#FF6F00',
        'Gap Wedge':      '#FF9800',
        'Sand Wedge':     '#FFB74D',
        'Lob Wedge':      '#FFE0B2',
        'Putter':         '#78909C',
        'Unknown':        '#9E9E9E',
    };

    // Club color cache — populated from API responses (club.color field)
    const clubColorCache = {};

    function getClubColor(club) {
        if (!club) return '#888';
        // 1. Check cache (set from clubs API with user-customized colors)
        if (clubColorCache[club]) return clubColorCache[club];
        // 2. Check default map by exact name
        if (DEFAULT_CLUB_COLORS[club]) return DEFAULT_CLUB_COLORS[club];
        // 3. Fallback hash
        let h = 0;
        for (let i = 0; i < club.length; i++) h = club.charCodeAt(i) + ((h << 5) - h);
        return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
    }

    // ── Leaflet Hole Map ──

    let holeLeafletMap = null;
    let holeShotLayers = null;  // L.LayerGroup for shot polylines
    let holeMarkerLayers = null;  // L.LayerGroup for tee/flag/fairway
    let osmPreviewLayers = null;  // L.LayerGroup for OSM hole preview markers

    function _calcBearing(lat1, lng1, lat2, lng2) {
        const toRad = d => d * Math.PI / 180;
        const toDeg = r => r * 180 / Math.PI;
        const dLng = toRad(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function initLeafletMap() {
        const container = document.getElementById('hole-leaflet-map');
        if (!container) return null;

        if (holeLeafletMap) {
            holeLeafletMap.remove();
            holeLeafletMap = null;
        }

        const map = L.map(container, {
            zoomControl: true,
            attributionControl: false,
        }).setView([0, 0], 17);

        // ESRI satellite tiles
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 22,
            maxNativeZoom: 19,
        }).addTo(map);

        // Layer groups for organized rendering
        holeMarkerLayers = L.layerGroup().addTo(map);
        holeShotLayers = L.layerGroup().addTo(map);
        osmPreviewLayers = L.layerGroup().addTo(map);

        holeLeafletMap = map;
        return map;
    }

    function renderHoleMapLeaflet(shots, isHistoric, holeData) {
        if (!holeLeafletMap) return;

        // Clear previous overlays
        holeShotLayers.clearLayers();
        holeMarkerLayers.clearLayers();

        const allLatLngs = [];
        const hasShots = shots.some(s => s.start_lat && s.end_lat);

        // Only show tee/flag/fairway when there are no shots (as reference) — otherwise just shots
        if (!hasShots) {
            // Draw fairway path as reference
            if (holeData?.fairway_path) {
                try {
                    const path = typeof holeData.fairway_path === 'string'
                        ? JSON.parse(holeData.fairway_path) : holeData.fairway_path;
                    if (path.length >= 2) {
                        L.polyline(path, {
                            color: '#FFD700', weight: 2, dashArray: '8, 6', opacity: 0.4,
                        }).addTo(holeMarkerLayers);
                        path.forEach(p => allLatLngs.push(p));
                    }
                } catch (e) { /* ignore bad JSON */ }
            }

            // Tee marker
            if (holeData?.tee_lat && holeData?.tee_lng) {
                L.circleMarker([holeData.tee_lat, holeData.tee_lng], {
                    radius: 7, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 0.9, weight: 2,
                }).bindTooltip('Tee', { permanent: false }).addTo(holeMarkerLayers);
                allLatLngs.push([holeData.tee_lat, holeData.tee_lng]);
            }

            // Flag/green marker
            if (holeData?.flag_lat && holeData?.flag_lng) {
                L.marker([holeData.flag_lat, holeData.flag_lng], {
                    icon: L.divIcon({
                        className: 'leaflet-flag-icon',
                        html: '<svg width="16" height="24" viewBox="0 0 16 24"><line x1="2" y1="0" x2="2" y2="24" stroke="#ff1744" stroke-width="2"/><polygon points="2,0 16,4 2,8" fill="#ff1744"/></svg>',
                        iconSize: [16, 24],
                        iconAnchor: [2, 24],
                    }),
                }).addTo(holeMarkerLayers);
                allLatLngs.push([holeData.flag_lat, holeData.flag_lng]);
            }
        }

        // Still use tee/flag positions for bounds calculation even when not showing markers
        if (holeData?.tee_lat && holeData?.tee_lng) allLatLngs.push([holeData.tee_lat, holeData.tee_lng]);
        if (holeData?.flag_lat && holeData?.flag_lng) allLatLngs.push([holeData.flag_lat, holeData.flag_lng]);

        // Hazards only render in edit mode (handled by redrawEditOverlay)

        // Draw shots
        shots.forEach((shot, idx) => {
            if (!shot.start_lat || !shot.end_lat) return;

            const start = [shot.start_lat, shot.start_lng];
            const end = [shot.end_lat, shot.end_lng];
            const color = getClubColor(shot.club);
            allLatLngs.push(start, end);

            // Shot polyline
            const line = L.polyline([start, end], {
                color: color,
                weight: isHistoric ? 2 : 3,
                opacity: isHistoric ? 0.4 : 0.8,
                _shotId: shot.id,
            }).addTo(holeShotLayers);

            // Click handler on polyline
            if (!isHistoric) {
                line.on('click', () => window._showCourseShotDetail(shot.id));
            }

            // End dot (landing position)
            const endMarker = L.circleMarker(end, {
                radius: isHistoric ? 3 : 5,
                color: color,
                fillColor: color,
                fillOpacity: isHistoric ? 0.5 : 0.8,
                weight: 1,
                _shotId: shot.id,
            }).addTo(holeShotLayers);

            if (!isHistoric) {
                endMarker.on('click', () => window._showCourseShotDetail(shot.id));
            }

            // In round mode: shot number marker at start
            if (!isHistoric) {
                L.marker(start, {
                    icon: L.divIcon({
                        className: 'leaflet-shot-number',
                        html: `<div style="background:${color}; color:#000; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; border:2px solid #000;">${idx + 1}</div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                    }),
                }).addTo(holeShotLayers);

                // Tooltip with shot info
                const dist = shot.distance_yards ? `${shot.distance_yards.toFixed(0)} yds` : '';
                const club = shot.club || '';
                if (dist || club) {
                    line.bindTooltip(`${club}${club && dist ? ' — ' : ''}${dist}`, { sticky: true });
                }
            }
        });

        // Calculate bearing from tee → green so hole plays left-to-right
        let bearing = 0;
        const teeLat = holeData?.tee_lat;
        const teeLng = holeData?.tee_lng;
        const flagLat = holeData?.flag_lat;
        const flagLng = holeData?.flag_lng;

        if (teeLat && teeLng && flagLat && flagLng) {
            // Rotate so tee-to-green direction goes left→right (bearing - 90°)
            bearing = -_calcBearing(teeLat, teeLng, flagLat, flagLng) + 90;
        } else if (shots.length > 0) {
            // Infer from first shot's start to last shot's end
            const first = shots.find(s => s.start_lat);
            const last = [...shots].reverse().find(s => s.end_lat);
            if (first && last) {
                bearing = -_calcBearing(first.start_lat, first.start_lng, last.end_lat, last.end_lng) + 90;
            }
        }

        // Fit bounds first, then set bearing (order matters for rotate plugin)
        if (allLatLngs.length >= 2) {
            const bounds = L.latLngBounds(allLatLngs);
            holeLeafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: false });
        } else if (allLatLngs.length === 1) {
            holeLeafletMap.setView(allLatLngs[0], 18, { animate: false });
        }

        // Note: rotation disabled — CSS transform approach shows ugly corners
        // TODO: revisit with Mapbox GL JS or a fixed leaflet-rotate plugin
    }

    async function renderHoleMap(holeNumber) {
        const leafletContainer = document.getElementById('hole-leaflet-map');
        const emptyContainer = document.getElementById('hole-map-empty');
        const msgEl = document.getElementById('hole-map-message');

        if (!leafletContainer || !holeViewCourse) return;

        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === holeNumber);

        // Gather shots for this hole
        let shots = [];
        const isHistoric = holeViewMode === 'historic';
        if (isHistoric && holeViewAllRoundDetails.length > 0) {
            shots = holeViewAllRoundDetails.flatMap(r =>
                (r.holes || [])
                    .filter(h => h.hole_number === holeNumber)
                    .flatMap(h => h.shots || [])
            );
        } else if (holeViewRoundDetail) {
            const rh = holeViewRoundDetail.holes.find(h => h.hole_number === holeNumber);
            shots = rh ? (rh.shots || []) : [];
        }

        // Check if we have any GPS data to show (shots, tee, or flag positions)
        const hasGPS = shots.some(s => s.start_lat && s.end_lat)
            || (ch?.tee_lat && ch?.tee_lng)
            || (ch?.flag_lat && ch?.flag_lng);

        if (!hasGPS) {
            leafletContainer.style.display = 'none';
            emptyContainer.style.display = 'flex';
            if (msgEl) msgEl.textContent = ch
                ? 'No GPS data — play a round with shot tracking or place tee/green markers'
                : 'No hole data available';
            return;
        }

        // Show map, hide empty state
        leafletContainer.style.display = 'block';
        emptyContainer.style.display = 'none';

        // Initialize Leaflet map if not yet created
        if (!holeLeafletMap) {
            initLeafletMap();
        }

        // Small delay to ensure container is visible before Leaflet measures it
        setTimeout(() => {
            holeLeafletMap.invalidateSize();
            renderHoleMapLeaflet(shots, isHistoric, ch);
        }, 50);
    }

    function renderHoleDetail() {
        // Always exit edit mode when switching holes
        if (holeEditMode) exitEditMode();
        // Close course shot panel when switching holes
        if (_coursePanelContext === 'course') hideShotPanel();

        const titleEl = document.getElementById('hole-detail-title');
        const statsEl = document.getElementById('hole-detail-stats');
        const shotListEl = document.getElementById('hole-shot-list');
        if (!titleEl || !holeViewCourse) return;

        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        const par = ch?.par || '?';
        const yds = ch?.yardage ? `${ch.yardage} yds` : '';
        const hcp = ch?.handicap ? `HCP ${ch.handicap}` : '';

        titleEl.textContent = `Hole ${selectedHole} \u2014 Par ${par}${yds ? ' \u00b7 ' + yds : ''}${hcp ? ' \u00b7 ' + hcp : ''}`;

        // Data completeness indicator
        const statusEl = document.getElementById('hole-data-status');
        if (statusEl && ch) {
            const checks = [
                { label: 'Par', ok: !!ch.par },
                { label: 'Yardage', ok: !!ch.yardage },
                { label: 'Tee GPS', ok: !!ch.tee_lat },
                { label: 'Green', ok: !!ch.green_boundary },
                { label: 'Fairway', ok: !!ch.fairway_path },
            ];
            const allGood = checks.every(c => c.ok);
            if (!allGood) {
                statusEl.style.display = 'flex';
                statusEl.innerHTML = checks.map(c =>
                    `<span style="font-size:0.72rem; padding:1px 6px; border-radius:3px; background:${c.ok ? '#22c55e1a' : '#ef44441a'}; color:${c.ok ? '#22c55e' : '#ef4444'};">${c.ok ? '✓' : '✗'} ${c.label}</span>`
                ).join('');
            } else {
                statusEl.style.display = 'none';
            }
        }

        if (holeViewMode === 'historic') {
            // Historic stats
            const historicScores = computeHistoricScores();
            const hs = historicScores[selectedHole];
            if (hs) {
                const holePar = ch?.par || 0;
                const bestDiff = hs.best - holePar;
                const bestStr = bestDiff > 0 ? `+${bestDiff}` : bestDiff === 0 ? 'E' : `${bestDiff}`;
                const avgDiff = hs.avg - holePar;
                const avgStr = avgDiff > 0 ? `+${avgDiff.toFixed(1)}` : avgDiff === 0 ? 'E' : avgDiff.toFixed(1);
                const avgClass = avgDiff < 0 ? 'score-birdie' : avgDiff < 1 ? 'score-par' : 'score-bogey';

                // Avg putts for this hole
                const allPutts = holeViewAllRoundDetails
                    .map(rd => rd.holes.find(h => h.hole_number === selectedHole)?.putts)
                    .filter(p => p != null);
                const avgPutts = allPutts.length > 0
                    ? (allPutts.reduce((a, b) => a + b, 0) / allPutts.length).toFixed(1)
                    : '\u2014';

                // Fairway hit rate
                const allFairways = holeViewAllRoundDetails
                    .map(rd => rd.holes.find(h => h.hole_number === selectedHole)?.fairway)
                    .filter(f => f);
                let fairwayRate = '';
                if (allFairways.length > 0) {
                    const hits = allFairways.filter(f => f === 'HIT').length;
                    fairwayRate = `${hits}/${allFairways.length}`;
                }

                // Most used club off tee
                const teeShots = holeViewAllRoundDetails.flatMap(rd => {
                    const h = rd.holes.find(h => h.hole_number === selectedHole);
                    return (h?.shots || []).filter(s => s.shot_number === 1 && s.club);
                });
                const clubCounts = {};
                teeShots.forEach(s => { clubCounts[s.club] = (clubCounts[s.club] || 0) + 1; });
                const topClub = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0];

                // Avg drive distance
                const drives = teeShots.filter(s => s.distance_yards);
                const avgDrive = drives.length > 0
                    ? (drives.reduce((a, s) => a + s.distance_yards, 0) / drives.length).toFixed(0)
                    : null;

                // Trend: last round vs previous
                let trend = '';
                if (hs.rounds >= 2) {
                    const sortedRounds = holeViewAllRoundDetails
                        .map(rd => {
                            const h = rd.holes.find(h => h.hole_number === selectedHole);
                            return h ? { score: h.strokes, date: rd.date } : null;
                        })
                        .filter(Boolean)
                        .sort((a, b) => b.date.localeCompare(a.date));
                    if (sortedRounds.length >= 2) {
                        const lastScore = sortedRounds[0].score;
                        const prevScore = sortedRounds[1].score;
                        const trendDiff = lastScore - prevScore;
                        if (trendDiff !== 0) {
                            const tCls = trendDiff < 0 ? 'delta-positive' : 'delta-negative';
                            trend = `<span class="${tCls}">${trendDiff > 0 ? '+' : ''}${trendDiff} vs last</span>`;
                        } else {
                            trend = '<span style="color:var(--text-dim);">same as last</span>';
                        }
                    }
                }

                // Scoring distribution for this hole
                const holePar2 = ch?.par || 0;
                const allScores = holeViewAllRoundDetails
                    .map(rd => rd.holes.find(h => h.hole_number === selectedHole)?.strokes)
                    .filter(s => s != null && s > 0);
                let distHtml = '';
                if (allScores.length > 0 && holePar2 > 0) {
                    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
                    allScores.forEach(s => {
                        const d = s - holePar2;
                        if (d <= -2) dist.eagle++;
                        else if (d === -1) dist.birdie++;
                        else if (d === 0) dist.par++;
                        else if (d === 1) dist.bogey++;
                        else if (d === 2) dist.double++;
                        else dist.triple++;
                    });
                    const badges = [
                        dist.eagle > 0 ? `<span style="color:#16a34a;">${dist.eagle} eagle</span>` : '',
                        dist.birdie > 0 ? `<span style="color:#22c55e;">${dist.birdie} birdie</span>` : '',
                        dist.par > 0 ? `<span style="color:#3b82f6;">${dist.par} par</span>` : '',
                        dist.bogey > 0 ? `<span style="color:#f59e0b;">${dist.bogey} bogey</span>` : '',
                        dist.double > 0 ? `<span style="color:#ef4444;">${dist.double} dbl</span>` : '',
                        dist.triple > 0 ? `<span style="color:#dc2626;">${dist.triple} trpl+</span>` : '',
                    ].filter(Boolean).join(' · ');
                    distHtml = `<div style="font-size:0.78rem; margin-top:8px;">${badges}</div>`;
                }

                // Miss tendency
                let missTendency = '';
                if (allFairways.length >= 3) {
                    const lefts = allFairways.filter(f => f === 'LEFT').length;
                    const rights = allFairways.filter(f => f === 'RIGHT').length;
                    const misses = lefts + rights;
                    if (misses >= 2) {
                        const dominant = lefts > rights ? 'left' : rights > lefts ? 'right' : null;
                        if (dominant) {
                            const pct = Math.round((dominant === 'left' ? lefts : rights) / misses * 100);
                            if (pct >= 60) {
                                const arrow = dominant === 'left' ? '←' : '→';
                                missTendency = `<div class="hole-stat"><span class="hole-stat-label">Miss Tendency</span><span class="hole-stat-value" style="color:#f59e0b;">${arrow} ${pct}% ${dominant}</span></div>`;
                            }
                        }
                    }
                }

                // Difficulty ranking
                let difficultyHtml = '';
                const historicAll = computeHistoricScores();
                const holeAvgs = Object.entries(historicAll)
                    .filter(([, v]) => v.rounds > 0 && v.par > 0)
                    .map(([num, v]) => ({ num: parseInt(num), avgVsPar: v.avg - v.par }))
                    .sort((a, b) => b.avgVsPar - a.avgVsPar);
                if (holeAvgs.length > 1) {
                    const rank = holeAvgs.findIndex(h => h.num === selectedHole) + 1;
                    if (rank === 1) difficultyHtml = '<span style="background:#ef44441a; color:#ef4444; padding:1px 6px; border-radius:3px; font-size:0.72rem;">Hardest hole</span>';
                    else if (rank === holeAvgs.length) difficultyHtml = '<span style="background:#22c55e1a; color:#22c55e; padding:1px 6px; border-radius:3px; font-size:0.72rem;">Easiest hole</span>';
                    else if (rank <= 3) difficultyHtml = `<span style="background:#f59e0b1a; color:#f59e0b; padding:1px 6px; border-radius:3px; font-size:0.72rem;">#${rank} hardest</span>`;
                }

                statsEl.innerHTML = `
                    <div class="hole-stats-grid">
                        <div class="hole-stat"><span class="hole-stat-label">Best</span><span class="hole-stat-value">${hs.best} (${bestStr})</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Average</span><span class="hole-stat-value ${avgClass}">${hs.avg.toFixed(1)} (${avgStr}) ${difficultyHtml}</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Avg Putts</span><span class="hole-stat-value">${avgPutts}</span></div>
                        ${fairwayRate ? `<div class="hole-stat"><span class="hole-stat-label">Fairway Hit</span><span class="hole-stat-value">${fairwayRate}</span></div>` : ''}
                        ${missTendency}
                        ${topClub ? `<div class="hole-stat"><span class="hole-stat-label">Tee Club</span><span class="hole-stat-value">${topClub[0]}</span></div>` : ''}
                        ${avgDrive ? `<div class="hole-stat"><span class="hole-stat-label">Avg Drive</span><span class="hole-stat-value">${avgDrive} yds</span></div>` : ''}
                        <div class="hole-stat"><span class="hole-stat-label">Rounds</span><span class="hole-stat-value">${hs.rounds} ${trend}</span></div>
                    </div>
                    ${distHtml}
                `;
                // Club usage & SG insights (in shot list area for historic mode)
                const allShots = holeViewAllRoundDetails.flatMap(rd => {
                    const h = rd.holes.find(h => h.hole_number === selectedHole);
                    return (h?.shots || []).filter(s => s.club && s.shot_type !== 'PENALTY');
                });

                let clubInsightsHtml = '';
                if (allShots.length > 0) {
                    // Group by shot type then club
                    const byType = {};
                    allShots.forEach(s => {
                        const type = s.shot_type || 'OTHER';
                        if (!byType[type]) byType[type] = {};
                        if (!byType[type][s.club]) byType[type][s.club] = { count: 0, distances: [], sg: [] };
                        byType[type][s.club].count++;
                        if (s.distance_yards) byType[type][s.club].distances.push(s.distance_yards);
                        if (s.sg_pga != null) byType[type][s.club].sg.push(s.sg_pga);
                    });

                    const typeLabels = { TEE: 'Off the Tee', APPROACH: 'Approach', CHIP: 'Short Game', LAYUP: 'Layup', RECOVERY: 'Recovery', PUTT: 'Putting' };
                    const typeOrder = ['TEE', 'APPROACH', 'CHIP', 'LAYUP', 'RECOVERY'];

                    const sections = typeOrder
                        .filter(t => byType[t])
                        .map(type => {
                            const clubs = Object.entries(byType[type])
                                .map(([name, d]) => {
                                    const avgDist = d.distances.length ? Math.round(d.distances.reduce((a, b) => a + b, 0) / d.distances.length) : null;
                                    const avgSg = d.sg.length ? (d.sg.reduce((a, b) => a + b, 0) / d.sg.length) : null;
                                    return { name, count: d.count, avgDist, avgSg };
                                })
                                .sort((a, b) => b.count - a.count);

                            const clubStrs = clubs.map(c => {
                                const parts = [`<strong>${c.name}</strong>`];
                                if (c.avgDist) parts.push(`avg ${c.avgDist}yds`);
                                parts.push(`(${c.count} shot${c.count !== 1 ? 's' : ''})`);
                                if (c.avgSg != null) {
                                    const sgColor = c.avgSg >= 0 ? '#22c55e' : '#ef4444';
                                    const sgSign = c.avgSg >= 0 ? '+' : '';
                                    parts.push(`<span style="color:${sgColor};">${sgSign}${c.avgSg.toFixed(2)} SG</span>`);
                                }
                                return parts.join(' · ');
                            });

                            return `<div style="margin-bottom:6px;">
                                <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">${typeLabels[type] || type}</span>
                                <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${clubStrs.join('<br>')}</div>
                            </div>`;
                        }).join('');

                    if (sections) {
                        clubInsightsHtml = `<div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
                            <div style="font-size:0.82rem; font-weight:600; color:var(--text); margin-bottom:8px;">Club History on this Hole</div>
                            ${sections}
                        </div>`;
                    }
                }

                shotListEl.innerHTML = clubInsightsHtml;
            } else {
                statsEl.innerHTML = '<p style="color:var(--text-muted);">No round data for this hole.</p>';
                shotListEl.innerHTML = '';
            }
        } else if (holeViewRoundDetail) {
            // Round-specific stats
            const rh = holeViewRoundDetail.holes.find(h => h.hole_number === selectedHole);
            if (rh) {
                const holePar = ch?.par || 0;
                const diff = rh.strokes - holePar;
                const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
                const diffClass = diff < 0 ? 'score-birdie' : diff === 0 ? 'score-par' : diff > 1 ? 'score-double' : 'score-bogey';

                // Compute historic comparisons
                const historicScores = computeHistoricScores();
                const hs = historicScores[selectedHole];

                // Putts comparison
                let puttsComp = '';
                if (rh.putts != null && hs) {
                    const allPutts = holeViewAllRoundDetails
                        .map(rd => rd.holes.find(h => h.hole_number === selectedHole)?.putts)
                        .filter(p => p != null);
                    if (allPutts.length > 0) {
                        const avgPutts = allPutts.reduce((a, b) => a + b, 0) / allPutts.length;
                        const puttDiff = rh.putts - avgPutts;
                        if (Math.abs(puttDiff) >= 0.1) {
                            const pCls = puttDiff > 0 ? 'delta-negative' : 'delta-positive';
                            puttsComp = `<span class="${pCls}">(${puttDiff > 0 ? '+' : ''}${puttDiff.toFixed(1)} avg)</span>`;
                        }
                    }
                }

                // Score vs hole avg
                let scoreComp = '';
                if (hs && hs.rounds > 1) {
                    const scoreDiff = rh.strokes - hs.avg;
                    if (Math.abs(scoreDiff) >= 0.1) {
                        const sCls = scoreDiff > 0 ? 'delta-negative' : 'delta-positive';
                        scoreComp = `<span class="${sCls}">(${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)} vs avg)</span>`;
                    }
                }

                // SG for this hole's shots
                const holeShots = rh.shots || [];
                let holeSgPga = 0, holeSgPersonal = 0, sgShotCount = 0, sgPersonalCount = 0;
                const sgByType = {};
                for (const s of holeShots) {
                    if (s.sg_pga != null) {
                        const cat = classifySgCategory(s, holePar);
                        if (cat) {
                            holeSgPga += s.sg_pga;
                            sgShotCount++;
                            if (!sgByType[cat]) sgByType[cat] = { pga: 0, count: 0 };
                            sgByType[cat].pga += s.sg_pga;
                            sgByType[cat].count++;
                        }
                    }
                    if (s.sg_personal != null) { holeSgPersonal += s.sg_personal; sgPersonalCount++; }
                }

                let sgHtml = '';
                if (sgShotCount > 0) {
                    const sgSign = holeSgPga >= 0 ? '+' : '';
                    const sgColor = holeSgPga >= 0 ? '#22c55e' : '#ef4444';
                    const catLabels = { off_the_tee: 'Tee', approach: 'App', short_game: 'Short', putting: 'Putt' };
                    const sgParts = Object.entries(sgByType).map(([cat, d]) => {
                        const v = Math.round(d.pga * 100) / 100;
                        const c = v >= 0 ? '#22c55e' : '#ef4444';
                        const s = v >= 0 ? '+' : '';
                        return `<span style="color:${c};">${catLabels[cat] || cat} ${s}${v.toFixed(2)}</span>`;
                    }).join(' · ');
                    sgHtml = `<div class="hole-stat"><span class="hole-stat-label">SG vs PGA</span><span class="hole-stat-value" style="color:${sgColor};">${sgSign}${holeSgPga.toFixed(2)}</span></div>`;
                    if (sgPersonalCount > 0) {
                        const pSign = holeSgPersonal >= 0 ? '+' : '';
                        const pColor = holeSgPersonal >= 0 ? '#22c55e' : '#ef4444';
                        sgHtml += `<div class="hole-stat"><span class="hole-stat-label">SG vs Personal</span><span class="hole-stat-value" style="color:${pColor};">${pSign}${holeSgPersonal.toFixed(2)}</span></div>`;
                    }
                }

                // Hole verdict: good / average / below average
                let verdictHtml = '';
                if (hs && hs.rounds >= 2 && holePar > 0) {
                    const scoreDiff = rh.strokes - hs.avg;
                    if (scoreDiff <= -1) verdictHtml = '<span style="background:#22c55e1a; color:#22c55e; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Great hole</span>';
                    else if (scoreDiff <= -0.3) verdictHtml = '<span style="background:#22c55e1a; color:#22c55e; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Above average</span>';
                    else if (scoreDiff >= 1) verdictHtml = '<span style="background:#ef44441a; color:#ef4444; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Below average</span>';
                    else verdictHtml = '<span style="background:#3b82f61a; color:#3b82f6; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Average</span>';
                } else if (holePar > 0) {
                    if (diff <= -1) verdictHtml = '<span style="background:#22c55e1a; color:#22c55e; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Great hole</span>';
                    else if (diff === 0) verdictHtml = '<span style="background:#3b82f61a; color:#3b82f6; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Par</span>';
                }

                // Difficulty badge
                let difficultyBadge = '';
                const historicAll = computeHistoricScores();
                const holeAvgs = Object.entries(historicAll)
                    .filter(([, v]) => v.rounds > 0 && v.par > 0)
                    .map(([num, v]) => ({ num: parseInt(num), avgVsPar: v.avg - v.par }))
                    .sort((a, b) => b.avgVsPar - a.avgVsPar);
                if (holeAvgs.length > 1) {
                    const rank = holeAvgs.findIndex(h => h.num === selectedHole) + 1;
                    if (rank === 1) difficultyBadge = '<span style="background:#ef44441a; color:#ef4444; padding:1px 6px; border-radius:3px; font-size:0.72rem;">Hardest hole</span>';
                    else if (rank === holeAvgs.length) difficultyBadge = '<span style="background:#22c55e1a; color:#22c55e; padding:1px 6px; border-radius:3px; font-size:0.72rem;">Easiest hole</span>';
                    else if (rank <= 3) difficultyBadge = `<span style="background:#f59e0b1a; color:#f59e0b; padding:1px 6px; border-radius:3px; font-size:0.72rem;">#${rank} hardest</span>`;
                }

                // SG breakdown line
                let sgBreakdownHtml = '';
                if (Object.keys(sgByType).length > 0) {
                    const catLabels = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' };
                    sgBreakdownHtml = `<div style="font-size:0.78rem; margin-top:8px;">` +
                        Object.entries(sgByType).map(([cat, d]) => {
                            const v = Math.round(d.pga * 100) / 100;
                            const c = v >= 0 ? '#22c55e' : '#ef4444';
                            const s = v >= 0 ? '+' : '';
                            return `<span style="color:${c};">${catLabels[cat] || cat}: ${s}${v.toFixed(2)}</span>`;
                        }).join(' · ') + `</div>`;
                }

                statsEl.innerHTML = `
                    <div class="hole-stats-grid">
                        <div class="hole-stat"><span class="hole-stat-label">Score</span><span class="hole-stat-value ${diffClass}">${rh.strokes} (${diffStr}) ${scoreComp} ${verdictHtml}</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Putts</span><span class="hole-stat-value">${rh.putts ?? '\u2014'} ${puttsComp}</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Fairway</span><span class="hole-stat-value">${rh.fairway || '\u2014'}</span></div>
                        ${rh.penalty_strokes ? `<div class="hole-stat"><span class="hole-stat-label">Penalties</span><span class="hole-stat-value">${rh.penalty_strokes}</span></div>` : ''}
                        ${sgHtml}
                        ${hs ? `<div class="hole-stat"><span class="hole-stat-label">Hole Avg</span><span class="hole-stat-value">${hs.avg.toFixed(1)} ${difficultyBadge}</span></div>` : ''}
                        ${hs ? `<div class="hole-stat"><span class="hole-stat-label">Hole Best</span><span class="hole-stat-value">${hs.best}</span></div>` : ''}
                    </div>
                    ${sgBreakdownHtml}
                `;

                // Enhanced shot list with club analytics
                const shots = rh.shots || [];
                if (shots.length > 0) {
                    // Build club stats lookup from clubsCache
                    const clubAvgs = {};
                    const clubMaxes = {};
                    for (const c of clubsCache) {
                        if (c.stats) {
                            clubAvgs[c.club_type] = c.stats.avg_yards;
                            clubMaxes[c.club_type] = c.stats.max_yards;
                        }
                    }

                    // Get hole-specific average drive distance
                    const allDrives = holeViewAllRoundDetails.flatMap(rd => {
                        const h = rd.holes.find(h => h.hole_number === selectedHole);
                        return (h?.shots || []).filter(s => s.shot_number === 1 && s.distance_yards);
                    });
                    const avgDriveThisHole = allDrives.length > 1
                        ? allDrives.reduce((a, s) => a + s.distance_yards, 0) / allDrives.length
                        : null;

                    shotListEl.innerHTML = `
                        <h3 style="font-size:0.9rem; color:var(--text-muted); margin: 16px 0 8px;">Shots</h3>
                        <div class="shot-list">
                            ${shots.map((s, i) => {
                                const dist = s.distance_yards ? s.distance_yards.toFixed(0) : '';
                                const shotColor = getClubColor(s.club);
                                const clubName = s.club || 'Unknown';

                                // vs club average
                                let vsAvg = '';
                                let isBest = false;
                                if (s.distance_yards && s.club && clubAvgs[s.club]) {
                                    const avg = clubAvgs[s.club];
                                    const delta = s.distance_yards - avg;
                                    if (Math.abs(delta) >= 1) {
                                        const cls = delta > 0 ? 'delta-positive' : 'delta-negative';
                                        vsAvg = `<span class="${cls}">${delta > 0 ? '+' : ''}${delta.toFixed(0)}</span>`;
                                    }
                                    // Check personal best
                                    if (clubMaxes[s.club] && s.distance_yards >= clubMaxes[s.club]) {
                                        isBest = true;
                                    }
                                }

                                // Lie transition
                                let lieInfo = '';
                                if (s.start_lat) {
                                    // We have lie data from the shot overlay
                                    // Shot type badge
                                    const typeMap = { TEE: 'Tee', APPROACH: 'Approach', CHIP: 'Chip', LAYUP: 'Layup', RECOVERY: 'Recovery', PUTT: 'Putt' };
                                    const typeLabel = typeMap[s.shot_type] || '';
                                    if (typeLabel) {
                                        lieInfo = `<span style="font-size:0.72rem; color:var(--text-dim); background:var(--bg-hover); padding:1px 6px; border-radius:3px;">${typeLabel}</span>`;
                                    }
                                }

                                return `<div class="shot-item" data-shot-id="${s.id}" onclick="window._showCourseShotDetail(${s.id})" style="cursor:pointer;">
                                    <span class="shot-num" style="background:${shotColor}; color:#000;">${i + 1}</span>
                                    <span class="shot-club">${clubName} ${lieInfo}${isBest ? ' <span style="font-size:0.72rem;" title="Personal best with this club">\uD83C\uDFC6</span>' : ''}</span>
                                    <span class="shot-dist">${dist ? dist + ' yds' : ''} ${vsAvg}</span>
                                </div>`;
                            }).join('')}
                        </div>
                        ${!ch?.fairway_path && shots.some(s => s.shot_type === 'TEE') ? '<p style="font-size:0.76rem; color:var(--text-dim); margin-top:8px; font-style:italic;">Tip: Draw a fairway path in Edit mode to see drive accuracy</p>' : ''}
                    `;
                } else {
                    shotListEl.innerHTML = '';
                }
            } else {
                statsEl.innerHTML = '<p style="color:var(--text-muted);">No data for this hole.</p>';
                shotListEl.innerHTML = '';
            }
        }

        // Show edit button and render hole map
        updateEditButton();
        renderHoleMap(selectedHole);
    }

    // ========== Hole Edit Mode ==========

    let holeEditMode = false;
    let editTool = 'tee';  // 'tee', 'green', 'fairway', 'green-boundary'
    let editTeePos = null;   // {lat, lng} — for the currently selected tee
    let editTeeName = '';    // which tee box we're editing (e.g. "Blue", "White")
    let editTeePositions = {};  // { teeName: {lat, lng}, ... } — all tees for this hole
    let editGreenPos = null; // {lat, lng}
    let editFairwayPath = []; // [{lat, lng}, ...]
    let editGreenBoundary = []; // [{lat, lng}, ...] polygon points
    let editHazards = []; // [{id?, hazard_type, name, boundary: [{lat, lng}], _new?}, ...]
    let editCurrentHazard = []; // points for the hazard currently being drawn
    let editPar = null;
    let editYardage = null;
    let editHandicap = null;
    // Leaflet edit markers
    let editTeeMarker = null;
    let editGreenMarker = null;
    let editFairwayLine = null;
    let editFairwayMarkers = [];
    let editGreenPolygon = null;
    let editLayerGroup = null;

    const HAZARD_COLORS = {
        bunker: { fill: '#EDC967', stroke: '#C4A34D', label: 'Bunker' },
        water: { fill: '#2196F3', stroke: '#1565C0', label: 'Water' },
        out_of_bounds: { fill: '#f44336', stroke: '#c62828', label: 'OB' },
        trees: { fill: '#2E7D32', stroke: '#1B5E20', label: 'Trees' },
        waste_area: { fill: '#8D6E63', stroke: '#5D4037', label: 'Waste' },
    };

    function getFirstShotForHole(holeNumber) {
        // Get first shot from any round for this hole
        let shots = [];
        if (holeViewRoundDetail) {
            const h = holeViewRoundDetail.holes?.find(h => h.hole_number === holeNumber);
            shots = h?.shots || [];
        } else if (holeViewAllRoundDetails.length > 0) {
            shots = holeViewAllRoundDetails.flatMap(r =>
                (r.holes || []).filter(h => h.hole_number === holeNumber).flatMap(h => h.shots || [])
            );
        }
        // Return first shot that has GPS
        return shots.find(s => s.start_lat && s.start_lng) || null;
    }

    // Show/hide edit button when a hole is selected
    function updateEditButton() {
        const btn = document.getElementById('btn-edit-hole');
        if (btn) btn.style.display = selectedHole ? 'inline-flex' : 'none';
    }

    // Enter edit mode
    document.getElementById('btn-edit-hole')?.addEventListener('click', async () => {
        // Refresh course data before entering edit mode to pick up any new OSM/sync data
        if (holeViewCourse?.id) {
            try {
                const resp = await fetch(`/api/courses/${holeViewCourse.id}`);
                if (resp.ok) {
                    holeViewCourse = await resp.json();
                }
            } catch (e) {
                console.warn('Failed to refresh course data:', e);
            }
        }

        holeEditMode = true;
        editTool = 'tee';

        // Load existing values from the primary tee's hole data
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);

        editGreenPos = (ch?.flag_lat && ch?.flag_lng) ? { lat: ch.flag_lat, lng: ch.flag_lng } : null;
        editFairwayPath = [];
        if (ch?.fairway_path) {
            try {
                const pts = JSON.parse(ch.fairway_path);
                editFairwayPath = pts.map(p => ({ lat: p[0], lng: p[1] }));
            } catch (e) {}
        }
        editGreenBoundary = [];
        if (ch?.green_boundary) {
            try {
                const pts = JSON.parse(ch.green_boundary);
                editGreenBoundary = pts.map(p => ({ lat: p[0], lng: p[1] }));
            } catch (e) {}
        }
        editHazards = (holeViewCourse?.hazards || []).map(h => {
            try {
                return {
                    id: h.id,
                    hazard_type: h.hazard_type,
                    name: h.name,
                    boundary: JSON.parse(h.boundary).map(p => ({ lat: p[0], lng: p[1] })),
                };
            } catch (e) { return null; }
        }).filter(Boolean);
        editCurrentHazard = [];
        editPar = ch?.par || null;
        editYardage = ch?.yardage || null;
        editHandicap = ch?.handicap || null;

        // Build tee positions from ALL tees for this hole
        editTeePositions = {};
        const teeSelect = document.getElementById('edit-tee-select');
        teeSelect.innerHTML = '';
        if (holeViewCourse?.tees) {
            for (const tee of holeViewCourse.tees) {
                const teeHole = (tee.holes || []).find(h => h.hole_number === selectedHole);
                if (teeHole?.tee_lat && teeHole?.tee_lng) {
                    editTeePositions[tee.tee_name] = { lat: teeHole.tee_lat, lng: teeHole.tee_lng };
                }
                const opt = document.createElement('option');
                opt.value = tee.tee_name;
                opt.textContent = tee.tee_name;
                teeSelect.appendChild(opt);
            }
        }
        // Default to the tee the current round was played from, or first tee
        let defaultTee = '';
        if (holeViewRoundDetail && holeViewRoundDetail.tee_name) {
            // Try to match round's tee name to a dropdown option
            for (const opt of teeSelect.options) {
                if (opt.value.toLowerCase() === holeViewRoundDetail.tee_name.toLowerCase()) {
                    defaultTee = opt.value;
                    break;
                }
            }
        }
        if (defaultTee) {
            teeSelect.value = defaultTee;
        }
        editTeeName = teeSelect.value || '';
        editTeePos = editTeePositions[editTeeName] || null;

        // Show toolbar
        const toolbar = document.getElementById('hole-edit-toolbar');
        toolbar.style.display = 'flex';
        document.getElementById('edit-hole-label').textContent = `Hole ${selectedHole}`;
        document.getElementById('edit-par').value = editPar || '';
        document.getElementById('edit-yardage').value = editYardage || '';
        document.getElementById('edit-handicap').value = editHandicap || '';

        // Populate OSM hole dropdown
        const osmSelect = document.getElementById('edit-osm-hole-select');
        osmSelect.innerHTML = '<option value="">Not linked</option>';
        if (holeViewCourse?.osm_holes) {
            // Sort by hole number
            const sorted = [...holeViewCourse.osm_holes].sort((a, b) => (a.hole_number || 99) - (b.hole_number || 99));
            for (const oh of sorted) {
                const opt = document.createElement('option');
                opt.value = oh.id;
                const label = oh.hole_number ? `Hole ${oh.hole_number}` : `OSM #${oh.osm_id}`;
                const parStr = oh.par ? ` (Par ${oh.par})` : '';
                opt.textContent = `${label}${parStr}`;
                osmSelect.appendChild(opt);
            }
        }
        // Set current link
        if (ch?.osm_hole_id) {
            osmSelect.value = String(ch.osm_hole_id);
        }

        // Show fairway guide based on par
        updateFairwayGuide();

        // Set active tool
        document.querySelectorAll('.edit-tool[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'tee');
        });

        // Create edit layer group on Leaflet map
        if (holeLeafletMap) {
            if (editLayerGroup) editLayerGroup.remove();
            editLayerGroup = L.layerGroup().addTo(holeLeafletMap);

            holeLeafletMap.off('click', onEditMapClick);
            holeLeafletMap.on('click', onEditMapClick);
            holeLeafletMap.off('dblclick');
            holeLeafletMap.on('dblclick', (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                if (editTool === 'hazard' && editCurrentHazard.length >= 3) {
                    finishCurrentHazard();
                }
            });
            holeLeafletMap.doubleClickZoom.disable();
            // Keep dragging enabled — Leaflet distinguishes click vs drag

            holeShotLayers.eachLayer(l => { if (l.setStyle) l.setStyle({ opacity: 0.3, fillOpacity: 0.2 }); });
        }

        redrawEditOverlay();
    });

    // Tee selector change
    document.getElementById('edit-tee-select')?.addEventListener('change', (e) => {
        // Save current tee position before switching
        if (editTeeName && editTeePos) {
            editTeePositions[editTeeName] = editTeePos;
        }
        editTeeName = e.target.value;
        editTeePos = editTeePositions[editTeeName] || null;
        redrawEditOverlay();
    });

    // Phase 4: Smart fairway guide
    function updateFairwayGuide() {
        const guideEl = document.getElementById('edit-fairway-guide');
        if (!guideEl) return;

        const par = parseInt(document.getElementById('edit-par').value);
        if (!par || par < 3 || par > 6) {
            guideEl.style.display = 'none';
            return;
        }

        const recommended = par === 3 ? '3-4' : par === 4 ? '7-8' : par === 5 ? '10-12' : '5-7';
        const current = editFairwayPath.length;
        const countColor = current >= parseInt(recommended) ? 'var(--accent)' : '#ff9800';

        // Check for large gaps between consecutive points
        let gapWarning = '';
        if (current >= 2) {
            const fullPath = [];
            if (editTeePos) fullPath.push(editTeePos);
            fullPath.push(...editFairwayPath);
            if (editGreenPos) fullPath.push(editGreenPos);

            let maxGap = 0;
            let maxGapIdx = -1;
            for (let i = 0; i < fullPath.length - 1; i++) {
                const gap = _haversineYards(fullPath[i].lat, fullPath[i].lng, fullPath[i + 1].lat, fullPath[i + 1].lng);
                if (gap > maxGap) { maxGap = gap; maxGapIdx = i; }
            }
            if (maxGap > 80) {
                gapWarning = ` <span style="color:#f44336;">| ${Math.round(maxGap)} yd gap — add a point to improve accuracy</span>`;
            }
        }

        guideEl.style.display = 'block';
        guideEl.innerHTML = `Fairway: <strong style="color:${countColor}">${current}</strong> / ${recommended} recommended for par ${par}${gapWarning}`;
    }

    // Update guide when par changes
    document.getElementById('edit-par')?.addEventListener('input', updateFairwayGuide);

    // Tool selection
    document.querySelectorAll('.edit-tool[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Finish any in-progress hazard when switching tools
            if (editTool === 'hazard' && editCurrentHazard.length >= 3 && btn.dataset.tool !== 'hazard') {
                finishCurrentHazard();
            } else if (editTool === 'hazard' && btn.dataset.tool !== 'hazard') {
                editCurrentHazard = [];
            }
            editTool = btn.dataset.tool;
            document.querySelectorAll('.edit-tool[data-tool]').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === editTool);
            });
            updateHazardButtons();
        });
    });

    // Leaflet map click handler for edit mode
    function onEditMapClick(e) {
        if (!holeEditMode) return;
        L.DomEvent.stopPropagation(e);
        const { lat, lng } = e.latlng;

        // Save current view to prevent map shifting on redraw
        const savedCenter = holeLeafletMap.getCenter();
        const savedZoom = holeLeafletMap.getZoom();

        if (editTool === 'tee') {
            editTeePos = { lat, lng };
            editTeePositions[editTeeName] = editTeePos;
        } else if (editTool === 'green') {
            editGreenPos = { lat, lng };
        } else if (editTool === 'fairway') {
            const newPt = { lat, lng };
            if (editFairwayPath.length >= 2) {
                // Find the closest segment in the fairway path and insert there
                let bestDist = Infinity;
                let bestIdx = editFairwayPath.length; // default: append

                // Check each segment between consecutive fairway points
                for (let i = 0; i < editFairwayPath.length - 1; i++) {
                    const a = editFairwayPath[i];
                    const b = editFairwayPath[i + 1];
                    const d = _pointToSegmentDist(lat, lng, a.lat, a.lng, b.lat, b.lng);
                    if (d < bestDist) {
                        bestDist = d;
                        bestIdx = i + 1;
                    }
                }

                // Also check segment from tee to first point
                if (editTeePos) {
                    const d = _pointToSegmentDist(lat, lng, editTeePos.lat, editTeePos.lng, editFairwayPath[0].lat, editFairwayPath[0].lng);
                    if (d < bestDist) { bestDist = d; bestIdx = 0; }
                }

                // Also check segment from last point to green
                if (editGreenPos) {
                    const last = editFairwayPath[editFairwayPath.length - 1];
                    const d = _pointToSegmentDist(lat, lng, last.lat, last.lng, editGreenPos.lat, editGreenPos.lng);
                    if (d < bestDist) { bestDist = d; bestIdx = editFairwayPath.length; }
                }

                editFairwayPath.splice(bestIdx, 0, newPt);
            } else {
                editFairwayPath.push(newPt);
            }
            updateFairwayGuide();
        } else if (editTool === 'green-boundary') {
            editGreenBoundary.push({ lat, lng });
        } else if (editTool === 'hazard') {
            editCurrentHazard.push({ lat, lng });
            updateHazardButtons();
        }

        redrawEditOverlay();

        // Restore exact view position to prevent shifting
        holeLeafletMap.setView(savedCenter, savedZoom, { animate: false });
    }

    // Clear fairway
    document.getElementById('tool-clear-fairway')?.addEventListener('click', () => {
        editFairwayPath = [];
        updateFairwayGuide();
        redrawEditOverlay();
    });

    // Clear green boundary
    document.getElementById('tool-clear-green')?.addEventListener('click', () => {
        editGreenBoundary = [];
        redrawEditOverlay();
    });

    function updateHazardButtons() {
        const finishBtn = document.getElementById('tool-finish-hazard');
        const cancelBtn = document.getElementById('tool-cancel-hazard');
        if (finishBtn) finishBtn.style.display = (editTool === 'hazard' && editCurrentHazard.length >= 3) ? '' : 'none';
        if (cancelBtn) cancelBtn.style.display = (editTool === 'hazard' && editCurrentHazard.length >= 1) ? '' : 'none';
    }

    function finishCurrentHazard() {
        if (editCurrentHazard.length >= 3) {
            const hazardType = document.getElementById('edit-hazard-type')?.value || 'bunker';
            const hc = HAZARD_COLORS[hazardType] || HAZARD_COLORS.bunker;
            editHazards.push({
                hazard_type: hazardType,
                name: hc.label,
                boundary: [...editCurrentHazard],
                _new: true,
            });
        }
        editCurrentHazard = [];
        updateHazardButtons();
        redrawEditOverlay();
    }

    document.getElementById('tool-finish-hazard')?.addEventListener('click', finishCurrentHazard);
    document.getElementById('tool-cancel-hazard')?.addEventListener('click', () => {
        editCurrentHazard = [];
        updateHazardButtons();
        redrawEditOverlay();
    });

    // (Old Canvas crop/rotation/click handlers removed — Leaflet handles all map interaction now)

    function _pointToSegmentDist(pLat, pLng, aLat, aLng, bLat, bLng) {
        // Distance from point P to line segment AB in yards
        // Project P onto segment AB, find closest point, return haversine distance
        // Apply cos(lat) correction to longitude so degrees are comparable
        const cosLat = Math.cos(pLat * Math.PI / 180);
        // Convert to flat coords (lat stays, lng scaled by cos)
        const ax = aLng * cosLat, ay = aLat;
        const bx = bLng * cosLat, by = bLat;
        const px = pLng * cosLat, py = pLat;
        const dx = bx - ax, dy = by - ay;
        if (dx === 0 && dy === 0) return _haversineYards(pLat, pLng, aLat, aLng);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        // Interpolate back to GPS
        const projLat = aLat + t * (bLat - aLat);
        const projLng = aLng + t * (bLng - aLng);
        return _haversineYards(pLat, pLng, projLat, projLng);
    }

    function _haversineYards(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth radius in meters
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.asin(Math.sqrt(a));
        return R * c * 1.09361; // meters to yards
    }

    function redrawEditOverlay() {
        if (!holeLeafletMap || !editLayerGroup) return;
        editLayerGroup.clearLayers();

        // Build full path: tee → fairway points → green (for distance calculations)
        const fullPath = [];
        if (editTeePos) fullPath.push(editTeePos);
        fullPath.push(...editFairwayPath);
        if (editGreenPos) fullPath.push(editGreenPos);

        // Draw fairway path with draggable waypoints
        if (editFairwayPath.length >= 1) {
            // Draw line through all points (tee → waypoints → green)
            const linePoints = fullPath.map(p => [p.lat, p.lng]);
            if (linePoints.length >= 2) {
                editFairwayLine = L.polyline(linePoints, {
                    color: '#FFD700', weight: 3, dashArray: '10, 6', opacity: 0.7,
                }).addTo(editLayerGroup);
            }

            // Draggable waypoint markers with distance labels
            editFairwayMarkers = editFairwayPath.map((wp, i) => {
                const marker = L.marker([wp.lat, wp.lng], {
                    draggable: true,
                    icon: L.divIcon({
                        className: 'leaflet-fairway-wp',
                        html: `<div style="background:#FFD700; width:14px; height:14px; border-radius:50%; border:2px solid #fff; cursor:grab;"></div>`,
                        iconSize: [14, 14],
                        iconAnchor: [7, 7],
                    }),
                }).addTo(editLayerGroup);

                // Tooltip with distance from tee
                let distFromTee = 0;
                if (editTeePos) {
                    let prev = editTeePos;
                    for (let j = 0; j <= i; j++) {
                        distFromTee += _haversineYards(prev.lat, prev.lng, editFairwayPath[j].lat, editFairwayPath[j].lng);
                        prev = editFairwayPath[j];
                    }
                }
                marker.bindTooltip(`${Math.round(distFromTee)} yds from tee`, {
                    permanent: false, direction: 'top', offset: [0, -10],
                });

                marker.on('drag', (e) => {
                    const pos = e.target.getLatLng();
                    editFairwayPath[i] = { lat: pos.lat, lng: pos.lng };
                    // Update the line without full redraw (smoother)
                    if (editFairwayLine) {
                        const pts = [];
                        if (editTeePos) pts.push([editTeePos.lat, editTeePos.lng]);
                        editFairwayPath.forEach(p => pts.push([p.lat, p.lng]));
                        if (editGreenPos) pts.push([editGreenPos.lat, editGreenPos.lng]);
                        editFairwayLine.setLatLngs(pts);
                    }
                });
                marker.on('dragend', () => {
                    redrawEditOverlay(); // Full redraw to update distances
                });

                // Right-click to remove waypoint
                marker.on('contextmenu', (e) => {
                    L.DomEvent.stopPropagation(e);
                    editFairwayPath.splice(i, 1);
                    redrawEditOverlay();
                });

                return marker;
            });

            // Distance labels between consecutive points
            for (let i = 0; i < fullPath.length - 1; i++) {
                const p1 = fullPath[i];
                const p2 = fullPath[i + 1];
                const dist = _haversineYards(p1.lat, p1.lng, p2.lat, p2.lng);
                const midLat = (p1.lat + p2.lat) / 2;
                const midLng = (p1.lng + p2.lng) / 2;

                L.marker([midLat, midLng], {
                    icon: L.divIcon({
                        className: 'leaflet-dist-label',
                        html: `<div style="background:rgba(0,0,0,0.7); color:#FFD700; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold; white-space:nowrap;">${Math.round(dist)} yds</div>`,
                        iconSize: [0, 0],
                        iconAnchor: [0, 8],
                    }),
                    interactive: false,
                }).addTo(editLayerGroup);
            }
        } else if (editTeePos && editGreenPos) {
            // Just tee and green — draw direct line
            L.polyline([[editTeePos.lat, editTeePos.lng], [editGreenPos.lat, editGreenPos.lng]], {
                color: '#FFD700', weight: 2, dashArray: '10, 6', opacity: 0.5,
            }).addTo(editLayerGroup);

            // Total distance label
            const dist = _haversineYards(editTeePos.lat, editTeePos.lng, editGreenPos.lat, editGreenPos.lng);
            const midLat = (editTeePos.lat + editGreenPos.lat) / 2;
            const midLng = (editTeePos.lng + editGreenPos.lng) / 2;
            L.marker([midLat, midLng], {
                icon: L.divIcon({
                    className: 'leaflet-dist-label',
                    html: `<div style="background:rgba(0,0,0,0.7); color:#FFD700; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold; white-space:nowrap;">${Math.round(dist)} yds</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 8],
                }),
                interactive: false,
            }).addTo(editLayerGroup);
        }

        // Total distance display (tee → green along path)
        if (fullPath.length >= 2) {
            let totalDist = 0;
            for (let i = 0; i < fullPath.length - 1; i++) {
                totalDist += _haversineYards(fullPath[i].lat, fullPath[i].lng, fullPath[i + 1].lat, fullPath[i + 1].lng);
            }
            // Update the yardage field if it's empty
            const ydsInput = document.getElementById('edit-yardage');
            if (ydsInput && !ydsInput.value) {
                ydsInput.value = Math.round(totalDist);
            }
        }

        // All tee markers — show each tee position with its name
        const teeColors = { 'Blue': '#2196F3', 'White': '#fff', 'Red': '#f44336', 'Gold': '#FFD700', 'Black': '#333', 'Green': '#4CAF50' };
        for (const [teeName, pos] of Object.entries(editTeePositions)) {
            const isActive = teeName === editTeeName;
            const color = teeColors[teeName] || '#4CAF50';
            const textColor = (teeName === 'White' || teeName === 'Gold') ? '#000' : '#fff';
            const marker = L.marker([pos.lat, pos.lng], {
                draggable: isActive,
                icon: L.divIcon({
                    className: 'leaflet-edit-tee',
                    html: `<div style="background:${color}; color:${textColor}; width:${isActive ? 28 : 22}px; height:${isActive ? 28 : 22}px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:${isActive ? 10 : 8}px; border:2px solid ${isActive ? '#fff' : 'rgba(255,255,255,0.5)'}; cursor:${isActive ? 'grab' : 'default'}; opacity:${isActive ? 1 : 0.7};">${teeName.substring(0, 2)}</div>`,
                    iconSize: [isActive ? 28 : 22, isActive ? 28 : 22],
                    iconAnchor: [isActive ? 14 : 11, isActive ? 14 : 11],
                }),
            }).addTo(editLayerGroup);

            if (isActive) {
                editTeeMarker = marker;
                marker.on('dragend', () => {
                    const p = marker.getLatLng();
                    editTeePos = { lat: p.lat, lng: p.lng };
                    editTeePositions[editTeeName] = editTeePos;
                    redrawEditOverlay();
                });
            }
        }

        // If active tee has no position yet, still listen for placement
        if (!editTeePositions[editTeeName] && editTeePos) {
            editTeeMarker = L.marker([editTeePos.lat, editTeePos.lng], {
                draggable: true,
                icon: L.divIcon({
                    className: 'leaflet-edit-tee',
                    html: `<div style="background:#4CAF50; color:#000; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:10px; border:2px solid #fff; cursor:grab;">${editTeeName.substring(0, 2) || 'T'}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                }),
            }).addTo(editLayerGroup);
            editTeeMarker.on('dragend', () => {
                const p = editTeeMarker.getLatLng();
                editTeePos = { lat: p.lat, lng: p.lng };
                editTeePositions[editTeeName] = editTeePos;
                redrawEditOverlay();
            });
        }

        // Green/flag marker (draggable)
        if (editGreenPos) {
            editGreenMarker = L.marker([editGreenPos.lat, editGreenPos.lng], {
                draggable: true,
                icon: L.divIcon({
                    className: 'leaflet-edit-flag',
                    html: '<svg width="16" height="28" viewBox="0 0 16 28"><line x1="2" y1="0" x2="2" y2="28" stroke="#fff" stroke-width="3"/><line x1="2" y1="0" x2="2" y2="28" stroke="#ef5350" stroke-width="2"/><polygon points="2,0 16,5 2,10" fill="#ef5350"/><circle cx="2" cy="28" r="4" fill="#ef5350"/></svg>',
                    iconSize: [16, 28],
                    iconAnchor: [2, 28],
                }),
            }).addTo(editLayerGroup);
            editGreenMarker.on('dragend', () => {
                const pos = editGreenMarker.getLatLng();
                editGreenPos = { lat: pos.lat, lng: pos.lng };
                redrawEditOverlay();
            });
        }

        // Green boundary polygon
        if (editGreenBoundary.length >= 3) {
            editGreenPolygon = L.polygon(
                editGreenBoundary.map(p => [p.lat, p.lng]),
                { color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 0.25, weight: 2, dashArray: '6, 4' }
            ).addTo(editLayerGroup);

            // Draggable polygon corner markers
            editGreenBoundary.forEach((wp, i) => {
                const m = L.marker([wp.lat, wp.lng], {
                    draggable: true,
                    icon: L.divIcon({
                        className: 'leaflet-fairway-wp',
                        html: '<div style="background:#4CAF50; width:10px; height:10px; border-radius:50%; border:2px solid #fff; cursor:grab;"></div>',
                        iconSize: [10, 10],
                        iconAnchor: [5, 5],
                    }),
                }).addTo(editLayerGroup);
                m.on('drag', (e) => {
                    editGreenBoundary[i] = { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng };
                    if (editGreenPolygon) editGreenPolygon.setLatLngs(editGreenBoundary.map(p => [p.lat, p.lng]));
                });
                m.on('dragend', () => redrawEditOverlay());
                m.on('contextmenu', (e) => {
                    L.DomEvent.stopPropagation(e);
                    editGreenBoundary.splice(i, 1);
                    redrawEditOverlay();
                });
            });
        } else if (editGreenBoundary.length >= 1) {
            // Show partial boundary as dots
            editGreenBoundary.forEach((wp) => {
                L.circleMarker([wp.lat, wp.lng], {
                    radius: 5, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 0.9, weight: 2,
                }).addTo(editLayerGroup);
            });
        }

        // Render existing hazards
        editHazards.forEach((h, hIdx) => {
            const hc = HAZARD_COLORS[h.hazard_type] || HAZARD_COLORS.bunker;
            if (h.boundary.length >= 3) {
                const poly = L.polygon(h.boundary.map(p => [p.lat, p.lng]), {
                    color: hc.stroke, fillColor: hc.fill, fillOpacity: 0.35, weight: 2,
                }).addTo(editLayerGroup);

                // Label
                const center = poly.getBounds().getCenter();
                L.marker(center, {
                    icon: L.divIcon({
                        className: 'leaflet-dist-label',
                        html: `<div style="background:rgba(0,0,0,0.6); color:${hc.fill}; padding:1px 5px; border-radius:3px; font-size:9px; font-weight:bold; white-space:nowrap;">${h.name || hc.label}</div>`,
                        iconSize: [0, 0],
                    }),
                    interactive: false,
                }).addTo(editLayerGroup);

                // Right-click to delete hazard
                poly.on('contextmenu', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (confirm(`Delete ${h.name || hc.label}?`)) {
                        editHazards.splice(hIdx, 1);
                        if (h.id) {
                            // Mark for deletion on save
                            editHazards._deletedIds = editHazards._deletedIds || [];
                            editHazards._deletedIds.push(h.id);
                        }
                        redrawEditOverlay();
                    }
                });
            }
        });

        // Render current hazard being drawn (in progress)
        if (editCurrentHazard.length >= 1) {
            const hazardType = document.getElementById('edit-hazard-type')?.value || 'bunker';
            const hc = HAZARD_COLORS[hazardType] || HAZARD_COLORS.bunker;

            if (editCurrentHazard.length >= 3) {
                L.polygon(editCurrentHazard.map(p => [p.lat, p.lng]), {
                    color: hc.stroke, fillColor: hc.fill, fillOpacity: 0.2, weight: 2, dashArray: '6, 4',
                }).addTo(editLayerGroup);
            } else if (editCurrentHazard.length >= 2) {
                L.polyline(editCurrentHazard.map(p => [p.lat, p.lng]), {
                    color: hc.stroke, weight: 2, dashArray: '6, 4',
                }).addTo(editLayerGroup);
            }

            // Draw dots for each point
            editCurrentHazard.forEach((wp) => {
                L.circleMarker([wp.lat, wp.lng], {
                    radius: 4, color: hc.stroke, fillColor: hc.fill, fillOpacity: 0.9, weight: 2,
                }).addTo(editLayerGroup);
            });
        }
    }

    // Save edits
    document.getElementById('btn-save-hole')?.addEventListener('click', async () => {
        if (!holeViewCourse) return;

        // Save current tee pos to the map
        if (editTeeName && editTeePos) {
            editTeePositions[editTeeName] = editTeePos;
        }

        const parVal = parseInt(document.getElementById('edit-par').value);
        const ydsVal = parseInt(document.getElementById('edit-yardage').value);
        const hcpVal = parseInt(document.getElementById('edit-handicap').value);

        // Save to each tee's hole record
        const allTees = holeViewCourse.tees || [];
        let savedAny = false;

        for (const tee of allTees) {
            const teeHole = (tee.holes || []).find(h => h.hole_number === selectedHole);
            if (!teeHole) continue;

            const body = {};
            if (!isNaN(parVal)) body.par = parVal;
            if (!isNaN(ydsVal)) body.yardage = ydsVal;
            if (!isNaN(hcpVal)) body.handicap = hcpVal;

            // Tee position for this specific tee
            const teePos = editTeePositions[tee.tee_name];
            if (teePos) { body.tee_lat = teePos.lat; body.tee_lng = teePos.lng; }

            // Shared: green, fairway, green boundary (same for all tees)
            if (editGreenPos) { body.flag_lat = editGreenPos.lat; body.flag_lng = editGreenPos.lng; }
            if (editFairwayPath.length > 0) {
                body.fairway_path = JSON.stringify(editFairwayPath.map(p => [p.lat, p.lng]));
            }
            if (editGreenBoundary.length >= 3) {
                body.green_boundary = JSON.stringify(editGreenBoundary.map(p => [p.lat, p.lng]));
            }

            try {
                await fetch(`/api/courses/${holeViewCourse.id}/holes/${teeHole.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                savedAny = true;
            } catch (e) {
                console.error(`Failed to save hole for tee ${tee.tee_name}:`, e);
            }
        }

        // Finish any in-progress hazard
        if (editCurrentHazard.length >= 3) {
            finishCurrentHazard();
        }

        // Save hazards — find the primary hole ID for hazard storage
        const primaryHoles = getCourseTeeHoles();
        const primaryHole = primaryHoles.find(h => h.hole_number === selectedHole);
        if (primaryHole?.id) {
            // Delete removed hazards
            const deletedIds = editHazards._deletedIds || [];
            for (const did of deletedIds) {
                try {
                    await fetch(`/api/courses/${holeViewCourse.id}/hazards/${did}`, { method: 'DELETE' });
                } catch (e) { console.error('Failed to delete hazard:', e); }
            }

            // Create new hazards
            for (const h of editHazards) {
                if (h._new && h.boundary.length >= 3) {
                    try {
                        await fetch(`/api/courses/${holeViewCourse.id}/hazards`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                hazard_type: h.hazard_type,
                                name: h.name,
                                boundary: JSON.stringify(h.boundary.map(p => [p.lat, p.lng])),
                            }),
                        });
                        savedAny = true;
                    } catch (e) { console.error('Failed to save hazard:', e); }
                }
            }
        }

        if (savedAny) {
            // Reload course data
            const courseResp = await fetch(`/api/courses/${holeViewCourse.id}`);
            holeViewCourse = await courseResp.json();

            exitEditMode();
            renderScorecard();
            renderHoleDetail();
        }
    });

    // Cancel edits
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
        exitEditMode();
        renderHoleDetail();
    });

    // Prev/Next hole in edit mode
    document.getElementById('edit-prev-hole')?.addEventListener('click', async () => {
        if (!holeEditMode || selectedHole <= 1) return;
        // Save current hole first, then move
        document.getElementById('btn-save-hole')?.click();
        // Wait for save, then switch
        setTimeout(() => {
            selectedHole--;
            document.getElementById('btn-edit-hole')?.click();
            renderScorecard();
        }, 500);
    });
    document.getElementById('edit-next-hole')?.addEventListener('click', async () => {
        const numHoles = holeViewCourse?.holes || 18;
        if (!holeEditMode || selectedHole >= numHoles) return;
        document.getElementById('btn-save-hole')?.click();
        setTimeout(() => {
            selectedHole++;
            document.getElementById('btn-edit-hole')?.click();
            renderScorecard();
        }, 500);
    });

    // OSM hole linking
    document.getElementById('edit-osm-hole-select')?.addEventListener('change', async (e) => {
        const osmHoleId = e.target.value ? parseInt(e.target.value) : null;
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch) return;

        // Show preview markers on the map for the selected OSM hole
        if (osmPreviewLayers) osmPreviewLayers.clearLayers();
        if (osmHoleId && holeViewCourse?.osm_holes && holeLeafletMap) {
            const osmHole = holeViewCourse.osm_holes.find(oh => oh.id === osmHoleId);
            if (osmHole) {
                const bounds = [];
                // Tee preview marker (green diamond)
                if (osmHole.tee_lat && osmHole.tee_lng) {
                    const teeIcon = L.divIcon({
                        className: 'osm-preview-marker',
                        html: '<div style="width:14px;height:14px;background:#4CAF50;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 6px rgba(76,175,80,0.8);"></div>',
                        iconSize: [14, 14],
                        iconAnchor: [7, 7],
                    });
                    L.marker([osmHole.tee_lat, osmHole.tee_lng], { icon: teeIcon })
                        .bindTooltip('OSM Tee', { permanent: true, direction: 'top', offset: [0, -10], className: 'osm-preview-tooltip' })
                        .addTo(osmPreviewLayers);
                    bounds.push([osmHole.tee_lat, osmHole.tee_lng]);
                }
                // Green preview marker (red diamond)
                if (osmHole.green_lat && osmHole.green_lng) {
                    const greenIcon = L.divIcon({
                        className: 'osm-preview-marker',
                        html: '<div style="width:14px;height:14px;background:#f44336;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 6px rgba(244,67,54,0.8);"></div>',
                        iconSize: [14, 14],
                        iconAnchor: [7, 7],
                    });
                    L.marker([osmHole.green_lat, osmHole.green_lng], { icon: greenIcon })
                        .bindTooltip('OSM Green', { permanent: true, direction: 'top', offset: [0, -10], className: 'osm-preview-tooltip' })
                        .addTo(osmPreviewLayers);
                    bounds.push([osmHole.green_lat, osmHole.green_lng]);
                }
                // Dashed line between tee and green
                if (osmHole.tee_lat && osmHole.green_lat) {
                    L.polyline(
                        [[osmHole.tee_lat, osmHole.tee_lng], [osmHole.green_lat, osmHole.green_lng]],
                        { color: '#FFD700', weight: 2, dashArray: '8, 6', opacity: 0.8 }
                    ).addTo(osmPreviewLayers);
                }
                // Zoom to show both markers if they're outside current view
                if (bounds.length > 0) {
                    const mapBounds = holeLeafletMap.getBounds();
                    const allVisible = bounds.every(b => mapBounds.contains(b));
                    if (!allVisible) {
                        holeLeafletMap.fitBounds(L.latLngBounds(bounds).pad(0.3));
                    }
                }
            }
        }

        try {
            const resp = await fetch(`/api/courses/${holeViewCourse.id}/holes/${ch.id}/link-osm`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ osm_hole_id: osmHoleId, apply_gps: false }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail);
        } catch (err) {
            console.error('Failed to link OSM hole:', err);
        }
    });

    document.getElementById('btn-apply-osm-hole')?.addEventListener('click', async () => {
        const osmSelect = document.getElementById('edit-osm-hole-select');
        const osmHoleId = osmSelect.value ? parseInt(osmSelect.value) : null;
        if (!osmHoleId) return alert('Select an OSM hole first');

        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch) return;

        try {
            const resp = await fetch(`/api/courses/${holeViewCourse.id}/holes/${ch.id}/link-osm`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ osm_hole_id: osmHoleId, apply_gps: true }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail);

            // Reload course data and re-render
            const courseResp = await fetch(`/api/courses/${holeViewCourse.id}`);
            holeViewCourse = await courseResp.json();
            exitEditMode();
            renderHoleDetail();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });

    function exitEditMode() {
        holeEditMode = false;
        document.getElementById('hole-edit-toolbar').style.display = 'none';

        // Clear OSM preview markers
        if (osmPreviewLayers) osmPreviewLayers.clearLayers();

        // Remove Leaflet edit layers and click handler
        if (editLayerGroup) {
            editLayerGroup.remove();
            editLayerGroup = null;
        }
        if (holeLeafletMap) {
            holeLeafletMap.off('click', onEditMapClick);
            holeLeafletMap.off('dblclick');
            holeLeafletMap.doubleClickZoom.enable();
            // Restore shot layer opacity
            holeShotLayers.eachLayer(l => { if (l.setStyle) l.setStyle({ opacity: 0.8, fillOpacity: 0.8 }); });
        }
    }

    // ========== Course Sync — Search + Modal + Apply ==========
    const btnCourseSync = document.getElementById('btn-course-sync');
    const courseSyncStatus = document.getElementById('course-sync-status');
    const matchModal = document.getElementById('course-match-modal');
    const modalCandidates = document.getElementById('modal-candidates');
    const modalSearchInfo = document.getElementById('modal-search-info');
    const btnModalClose = document.getElementById('btn-modal-close');
    const btnModalCancel = document.getElementById('btn-modal-cancel');

    function showCourseStatus(msg, type) {
        courseSyncStatus.textContent = msg;
        courseSyncStatus.className = `status status-${type}`;
        courseSyncStatus.style.display = 'block';
        if (type !== 'progress') autoDismiss(courseSyncStatus, type === 'error' ? 5000 : 3000);
    }

    function closeModal() {
        matchModal.style.display = 'none';
    }

    if (btnModalClose) btnModalClose.addEventListener('click', closeModal);
    if (btnModalCancel) btnModalCancel.addEventListener('click', closeModal);

    if (matchModal) {
        matchModal.addEventListener('click', (e) => {
            if (e.target === matchModal) closeModal();
        });
    }

    async function applyCandidate(apiId) {
        closeModal();
        btnCourseSync.disabled = true;
        btnCourseSync.textContent = 'Applying\u2026';
        courseSyncStatus.style.display = 'none';

        try {
            const resp = await fetch(`/api/courses/${currentCourseDetail.id}/apply-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_id: apiId }),
            });
            const data = await resp.json();
            if (resp.ok && data.status === 'enriched') {
                courseSyncStatus.textContent = `Synced: ${data.matched} \u2014 ${data.tees_created} tees loaded.`;
                courseSyncStatus.className = 'status status-success';
                courseSyncStatus.style.display = 'block';
                autoDismiss(courseSyncStatus);
                await loadCourseDetail(currentCourseDetail.id);
                loadCourses();
            } else {
                courseSyncStatus.textContent = data.reason || 'Failed to apply course data.';
                courseSyncStatus.className = 'status status-error';
                courseSyncStatus.style.display = 'block';
                autoDismiss(courseSyncStatus, 5000);
            }
        } catch (e) {
            courseSyncStatus.textContent = 'Error: ' + e.message;
            courseSyncStatus.className = 'status status-error';
            courseSyncStatus.style.display = 'block';
            autoDismiss(courseSyncStatus, 5000);
        } finally {
            btnCourseSync.disabled = false;
            btnCourseSync.textContent = 'Sync All Courses';
        }
    }

    if (btnCourseSync) {
        btnCourseSync.addEventListener('click', async () => {
            const clubId = btnCourseSync.dataset.clubId || (currentCourseDetail && currentCourseDetail.golf_club_id);
            if (!clubId) return;

            const clubName = currentClubDetail?.name || currentCourseDetail?.club_name || 'this club';
            if (!confirm(`Sync all courses for "${clubName}"? This will fetch course data from the golf database.`)) return;

            btnCourseSync.disabled = true;
            btnCourseSync.textContent = 'Syncing\u2026';
            showCourseStatus('Syncing courses from golf database...', 'progress');

            try {
                // Step 1: Sync courses from golf API
                const syncResp = await fetch(`/api/courses/club/${clubId}/sync`, { method: 'POST' });
                const syncResult = await syncResp.json();

                if (syncResp.ok && syncResult.status === 'ok') {
                    const details = syncResult.details || [];
                    const synced = details.filter(d => d.status && d.status.includes('synced')).length;
                    showCourseStatus(`Synced ${synced} course(s). Use per-course OSM search below to add GPS features.`, 'success');
                } else {
                    showCourseStatus(syncResult.reason || 'Sync failed', 'error');
                }

                await loadAllData();
                if (currentClubDetail) {
                    loadClubDetail(currentClubDetail.id);
                } else if (currentCourseDetail) {
                    loadCourseDetail(currentCourseDetail.id);
                }
            } catch (e) {
                showCourseStatus('Error: ' + e.message, 'error');
            } finally {
                btnCourseSync.disabled = false;
                btnCourseSync.textContent = 'Sync All Courses';
            }

        });
    }

    // ========== Course Merge ==========
    async function _executeMerge(targetId, sourceId, resolveHoles, resolvePar) {
        const params = new URLSearchParams();
        if (resolveHoles != null) params.set('resolve_holes', resolveHoles);
        if (resolvePar != null) params.set('resolve_par', resolvePar);
        const qs = params.toString() ? `?${params}` : '';
        const resp = await fetch(`/api/courses/${targetId}/merge/${sourceId}${qs}`, { method: 'POST' });
        return { resp, data: await resp.json() };
    }

    function _showMergeConflictDialog(preview, onConfirm, onCancel) {
        const existing = document.getElementById('merge-conflict-dialog');
        if (existing) existing.remove();

        let html = `<div id="merge-conflict-dialog" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 8px;">Merge Conflicts</h3>
                <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 16px;">
                    These fields differ between the two courses. Choose which value to keep:
                </p>`;

        for (const c of preview.conflicts) {
            html += `<div style="margin-bottom:12px;">
                <label style="font-weight:600;font-size:0.85rem;">${c.label}</label>
                <div style="display:flex;gap:8px;margin-top:4px;">
                    <label style="flex:1;display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.85rem;">
                        <input type="radio" name="resolve_${c.field}" value="${c.target_value}" checked>
                        <span>${c.target_value} <span style="color:var(--text-muted);">(target)</span></span>
                    </label>
                    <label style="flex:1;display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.85rem;">
                        <input type="radio" name="resolve_${c.field}" value="${c.source_value}">
                        <span>${c.source_value} <span style="color:var(--text-muted);">(source)</span></span>
                    </label>
                </div>
            </div>`;
        }

        html += `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                    <button id="merge-conflict-cancel" class="btn btn-ghost btn-sm">Cancel</button>
                    <button id="merge-conflict-confirm" class="btn btn-primary btn-sm">Merge</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        const dialog = document.getElementById('merge-conflict-dialog');
        document.getElementById('merge-conflict-cancel').onclick = () => { dialog.remove(); onCancel(); };
        dialog.addEventListener('click', (e) => { if (e.target === dialog) { dialog.remove(); onCancel(); } });
        document.getElementById('merge-conflict-confirm').onclick = () => {
            const resolutions = {};
            for (const c of preview.conflicts) {
                const checked = dialog.querySelector(`input[name="resolve_${c.field}"]:checked`);
                resolutions[c.field] = checked ? parseInt(checked.value) : c.target_value;
            }
            dialog.remove();
            onConfirm(resolutions);
        };
    }

    document.getElementById('course-detail-courses')?.addEventListener('change', async (e) => {
        const sel = e.target.closest('.merge-target-select');
        if (!sel) return;

        const sourceId = sel.dataset.sourceId;
        const targetId = sel.value;
        if (!targetId) return;

        const sourceName = currentClubCourses.find(c => c.id == sourceId)?.course_name || '(Main Course)';
        const targetName = currentClubCourses.find(c => c.id == targetId)?.course_name || '(Main Course)';

        // Preview merge to check for conflicts
        sel.disabled = true;
        showCourseStatus(`Checking merge...`, 'progress');

        try {
            const previewResp = await fetch(`/api/courses/${targetId}/merge-preview/${sourceId}`);
            const preview = await previewResp.json();
            if (!previewResp.ok) {
                showCourseStatus(preview.detail || 'Preview failed', 'error');
                sel.value = ''; sel.disabled = false;
                return;
            }

            const doMerge = async (resolveHoles, resolvePar) => {
                showCourseStatus(`Merging "${sourceName}" into "${targetName}"...`, 'progress');
                const { resp, data } = await _executeMerge(targetId, sourceId, resolveHoles, resolvePar);
                if (resp.ok && data.status === 'merged') {
                    showCourseStatus(`Merged: ${data.rounds_moved} round(s), ${data.tees_moved} tee set(s) moved.`, 'success');
                    await loadAllData();
                    loadClubDetail(currentClubDetail.id);
                } else {
                    showCourseStatus(data.detail || 'Merge failed', 'error');
                    sel.value = ''; sel.disabled = false;
                }
            };

            if (preview.conflicts.length > 0) {
                // Show conflict resolution dialog
                _showMergeConflictDialog(preview, async (resolutions) => {
                    try {
                        await doMerge(resolutions.holes, resolutions.par);
                    } catch (err) {
                        showCourseStatus('Error: ' + err.message, 'error');
                        sel.value = ''; sel.disabled = false;
                    }
                }, () => {
                    sel.value = ''; sel.disabled = false;
                    showCourseStatus('Merge cancelled.', 'error');
                });
            } else {
                // No conflicts — confirm and merge directly
                if (!confirm(`Merge "${sourceName}" into "${targetName}"?\n\n${preview.rounds_to_move} round(s) and ${preview.tees_to_move} tee set(s) will be moved. "${sourceName}" will be deleted.`)) {
                    sel.value = ''; sel.disabled = false;
                    showCourseStatus('', '');
                    return;
                }
                await doMerge(null, null);
            }
        } catch (e) {
            showCourseStatus('Error: ' + e.message, 'error');
            sel.value = ''; sel.disabled = false;
        }
    });

    // ========== Tee Inline Edit ==========
    window.startTeeEdit = function(btn) {
        const row = btn.closest('tr');
        const cells = row.querySelectorAll('td');
        const teeId = row.dataset.teeId;
        const courseId = row.dataset.courseId;

        // Read current values from display cells
        const name = cells[0].textContent.trim();
        const par = cells[1].textContent.trim().replace('\u2014', '');
        const yards = cells[2].textContent.trim().replace(/,/g, '').replace('\u2014', '');
        const rating = cells[3].textContent.trim().replace('\u2014', '');
        const slope = cells[4].textContent.trim().replace('\u2014', '');

        // Replace cells with inputs
        cells[0].innerHTML = `<input type="text" value="${name}" style="width:100%; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-size:0.85rem;">`;
        cells[1].innerHTML = `<input type="number" value="${par}" style="width:60px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-size:0.85rem;">`;
        cells[2].innerHTML = `<input type="number" value="${yards}" style="width:80px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-size:0.85rem;">`;
        cells[3].innerHTML = `<input type="number" step="0.1" value="${rating}" style="width:70px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-size:0.85rem;">`;
        cells[4].innerHTML = `<input type="number" value="${slope}" style="width:60px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-size:0.85rem;">`;

        // Replace action cell with save/delete/cancel
        cells[5].innerHTML = `
            <span style="display:flex; gap:4px; justify-content:flex-end;">
                <button class="btn-icon" title="Save" onclick="saveTeeEdit(this)" style="background:none; border:none; color:#4caf50; cursor:pointer; padding:2px 4px; font-size:0.95rem;">&#10003;</button>
                <button class="btn-icon" title="Delete tee" onclick="deleteTee(this)" style="background:none; border:none; color:#d32f2f; cursor:pointer; padding:2px 4px; font-size:0.95rem;">&#128465;</button>
                <button class="btn-icon" title="Cancel" onclick="cancelTeeEdit()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 4px; font-size:0.95rem;">&#10007;</button>
            </span>`;
    };

    window.saveTeeEdit = async function(btn) {
        const row = btn.closest('tr');
        const inputs = row.querySelectorAll('input');
        const teeId = row.dataset.teeId;
        const courseId = row.dataset.courseId;

        const body = {
            tee_name: inputs[0].value.trim(),
            par_total: inputs[1].value ? parseInt(inputs[1].value) : null,
            total_yards: inputs[2].value ? parseInt(inputs[2].value) : null,
            course_rating: inputs[3].value ? parseFloat(inputs[3].value) : null,
            slope_rating: inputs[4].value ? parseFloat(inputs[4].value) : null,
        };

        try {
            const resp = await fetch(`/api/courses/${courseId}/tees/${teeId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const err = await resp.json();
                showCourseStatus(err.detail || 'Failed to update tee', 'error');
                return;
            }
            showCourseStatus('Tee updated.', 'success');
            loadClubDetail(currentClubDetail.id);
        } catch (e) {
            showCourseStatus('Error: ' + e.message, 'error');
        }
    };

    window.deleteTee = async function(btn) {
        const row = btn.closest('tr');
        const teeId = row.dataset.teeId;
        const courseId = row.dataset.courseId;
        const name = row.querySelectorAll('input')[0]?.value || 'this tee';

        if (!confirm(`Delete "${name}" and all its hole data? This cannot be undone.`)) return;

        try {
            const resp = await fetch(`/api/courses/${courseId}/tees/${teeId}`, { method: 'DELETE' });
            if (resp.status === 409) {
                // Rounds are linked — show reassignment dialog
                const info = await resp.json();
                const detail = info.detail;
                _showTeeReassignDialog(courseId, teeId, name, detail.rounds, detail.available_tees);
                return;
            }
            if (!resp.ok) {
                const err = await resp.json();
                showCourseStatus(err.detail || 'Failed to delete tee', 'error');
                return;
            }
            showCourseStatus('Tee deleted.', 'success');
            loadClubDetail(currentClubDetail.id);
        } catch (e) {
            showCourseStatus('Error: ' + e.message, 'error');
        }
    };

    function _showTeeReassignDialog(courseId, teeId, teeName, rounds, availableTees) {
        // Remove any existing dialog
        document.querySelector('.tee-reassign-dialog')?.remove();

        const noTees = availableTees.length === 0;
        const teeOptions = availableTees.map(t => `<option value="${t.id}">${t.tee_name}</option>`).join('');

        const roundRows = rounds.map(r => `
            <tr data-round-id="${r.id}">
                <td>${r.date}</td>
                <td>${r.total_strokes || '\u2014'}</td>
                <td>${noTees ? '<span style="color:var(--text-muted);">No other tees</span>'
                    : `<select class="reassign-tee-select" style="font-size:0.85rem; padding:2px 6px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:4px;">${teeOptions}</select>`}
                </td>
            </tr>
        `).join('');

        const dialog = document.createElement('div');
        dialog.className = 'tee-reassign-dialog';
        dialog.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000;';
        dialog.innerHTML = `
            <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:12px; padding:24px; max-width:500px; width:90%;">
                <h3 style="margin-bottom:12px; color:var(--accent);">Reassign Rounds</h3>
                <p style="color:var(--text-muted); margin-bottom:16px; font-size:0.88rem;">
                    "${teeName}" has ${rounds.length} round(s) linked to it. ${noTees
                        ? 'There are no other tees on this course to reassign to. Create another tee first.'
                        : 'Reassign each round to another tee before deleting.'}
                </p>
                <table style="width:100%; margin-bottom:16px; font-size:0.88rem;">
                    <thead>
                        <tr><th style="text-align:left;">Date</th><th>Score</th><th>Assign to</th></tr>
                    </thead>
                    <tbody>${roundRows}</tbody>
                </table>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    ${noTees ? '' : '<button class="btn btn-primary btn-sm" id="btn-reassign-confirm">Reassign & Delete</button>'}
                    <button class="btn btn-secondary btn-sm" id="btn-reassign-cancel">Cancel</button>
                </div>
            </div>`;

        document.body.appendChild(dialog);

        dialog.querySelector('#btn-reassign-cancel').onclick = () => dialog.remove();

        const confirmBtn = dialog.querySelector('#btn-reassign-confirm');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const assignments = {};
                dialog.querySelectorAll('tr[data-round-id]').forEach(tr => {
                    const roundId = parseInt(tr.dataset.roundId);
                    const sel = tr.querySelector('.reassign-tee-select');
                    if (sel) assignments[roundId] = parseInt(sel.value);
                });

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Reassigning...';
                try {
                    const resp = await fetch(`/api/courses/${courseId}/tees/${teeId}/reassign-rounds`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ assignments }),
                    });
                    if (!resp.ok) {
                        const err = await resp.json();
                        showCourseStatus(err.detail || 'Reassignment failed', 'error');
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = 'Reassign & Delete';
                        return;
                    }
                    dialog.remove();
                    showCourseStatus('Tee deleted and rounds reassigned.', 'success');
                    loadClubDetail(currentClubDetail.id);
                } catch (e) {
                    showCourseStatus('Error: ' + e.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Reassign & Delete';
                }
            };
        }
    }

    window.cancelTeeEdit = function() {
        // Simply reload the club detail to restore original state
        if (currentClubDetail) loadClubDetail(currentClubDetail.id);
    };

    // ========== Photo Picker ==========
    const photoModal = document.getElementById('photo-picker-modal');
    const photoGrid = document.getElementById('photo-grid');
    const photoStatus = document.getElementById('photo-picker-status');
    let photoPickerClubId = null;
    let photoResources = [];

    document.getElementById('btn-change-photo')?.addEventListener('click', async () => {
        photoPickerClubId = currentClubDetail?.id;
        if (!photoPickerClubId) return;
        photoModal.style.display = 'flex';
        photoGrid.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:24px;">Loading photos from Google Places...</p>';
        photoStatus.textContent = '';
        document.getElementById('photo-upload-preview').innerHTML = '';
        // Reset tabs
        document.querySelectorAll('.photo-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.photo-tab-btn[data-tab="google"]').classList.add('active');
        document.getElementById('photo-tab-google').style.display = '';
        document.getElementById('photo-tab-upload').style.display = 'none';

        try {
            const resp = await fetch(`/api/courses/club/${photoPickerClubId}/photos`);
            const data = await resp.json();
            if (!resp.ok) {
                photoGrid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:24px;">${data.detail || 'Failed to load photos'}</p>`;
                return;
            }
            photoResources = data.photos;
            if (photoResources.length === 0) {
                photoGrid.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:24px;">No photos found on Google Places</p>';
                return;
            }
            photoGrid.innerHTML = photoResources.map((p, i) => `
                <div class="photo-thumb" data-resource="${p.resource}" style="cursor:pointer; border:2px solid transparent; border-radius:8px; overflow:hidden; aspect-ratio:16/10; background:var(--surface-alt);">
                    <img src="/api/courses/club/${photoPickerClubId}/photo-thumbnail?resource=${encodeURIComponent(p.resource)}"
                         alt="Photo ${i + 1}" loading="lazy"
                         style="width:100%; height:100%; object-fit:cover; display:block;">
                </div>
            `).join('');
        } catch (e) {
            photoGrid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:24px;">Error: ${e.message}</p>`;
        }
    });

    // Tab switching
    document.querySelectorAll('.photo-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.photo-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('photo-tab-google').style.display = btn.dataset.tab === 'google' ? '' : 'none';
            document.getElementById('photo-tab-upload').style.display = btn.dataset.tab === 'upload' ? '' : 'none';
        });
    });

    // Click on a Google photo to select it
    photoGrid?.addEventListener('click', async (e) => {
        const thumb = e.target.closest('.photo-thumb');
        if (!thumb || !photoPickerClubId) return;

        const resource = thumb.dataset.resource;
        // Highlight selection
        photoGrid.querySelectorAll('.photo-thumb').forEach(t => t.style.borderColor = 'transparent');
        thumb.style.borderColor = 'var(--primary)';
        photoStatus.textContent = 'Setting photo...';

        try {
            const resp = await fetch(`/api/courses/club/${photoPickerClubId}/set-photo-places`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({photo_resource: resource}),
            });
            const data = await resp.json();
            if (resp.ok && data.photo_url) {
                // Update hero banner immediately (cache-bust)
                const hero = document.getElementById('course-hero');
                hero.style.backgroundImage = `url(${data.photo_url}?t=${Date.now()})`;
                photoModal.style.display = 'none';
                // Update all cached references so navigation back doesn't show old photo
                if (currentCourseDetail) currentCourseDetail.photo_url = data.photo_url;
                if (currentClubDetail) currentClubDetail.photo_url = data.photo_url;
                const cached = clubsListCache.find(c => c.id === photoPickerClubId);
                if (cached) cached.photo_url = data.photo_url;
                currentClubCourses.forEach(cc => { cc.photo_url = data.photo_url; });
            } else {
                photoStatus.textContent = data.detail || 'Failed to set photo';
            }
        } catch (err) {
            photoStatus.textContent = 'Error: ' + err.message;
        }
    });

    // Upload tab
    document.getElementById('btn-photo-browse')?.addEventListener('click', () => {
        document.getElementById('photo-upload-input').click();
    });

    document.getElementById('photo-upload-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !photoPickerClubId) return;

        // Preview
        const preview = document.getElementById('photo-upload-preview');
        const reader = new FileReader();
        reader.onload = (ev) => {
            preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%; max-height:200px; border-radius:8px; margin-top:8px;">`;
        };
        reader.readAsDataURL(file);

        photoStatus.textContent = 'Uploading...';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetch(`/api/courses/club/${photoPickerClubId}/set-photo-upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await resp.json();
            if (resp.ok && data.photo_url) {
                const hero = document.getElementById('course-hero');
                hero.style.backgroundImage = `url(${data.photo_url}?t=${Date.now()})`;
                photoModal.style.display = 'none';
                if (currentCourseDetail) currentCourseDetail.photo_url = data.photo_url;
                if (currentClubDetail) currentClubDetail.photo_url = data.photo_url;
                const cached = clubsListCache.find(c => c.id === photoPickerClubId);
                if (cached) cached.photo_url = data.photo_url;
                currentClubCourses.forEach(cc => { cc.photo_url = data.photo_url; });
            } else {
                photoStatus.textContent = data.detail || 'Upload failed';
            }
        } catch (err) {
            photoStatus.textContent = 'Error: ' + err.message;
        }

        // Reset file input
        e.target.value = '';
    });

    // Modal close
    document.getElementById('btn-photo-modal-close')?.addEventListener('click', () => { photoModal.style.display = 'none'; });
    document.getElementById('btn-photo-modal-cancel')?.addEventListener('click', () => { photoModal.style.display = 'none'; });
    photoModal?.addEventListener('click', (e) => { if (e.target === photoModal) photoModal.style.display = 'none'; });

    // ========== OSM Feature Detection ==========
    const btnDetectFeatures = document.getElementById('btn-detect-features');
    if (btnDetectFeatures) {
        btnDetectFeatures.addEventListener('click', async () => {
            const clubId = btnDetectFeatures.dataset.clubId || (currentCourseDetail && currentCourseDetail.golf_club_id);
            if (!clubId) return;
            btnDetectFeatures.disabled = true;
            btnDetectFeatures.textContent = 'Searching OSM\u2026';
            showCourseStatus('Querying OpenStreetMap for course features...', 'progress');

            try {
                const resp = await fetch(`/api/courses/club/${clubId}/detect-features`, { method: 'POST' });
                const data = await resp.json();

                if (!resp.ok) {
                    showCourseStatus(data.detail || 'Detection failed', 'error');
                    return;
                }

                const s = data.summary;
                if (s.total === 0) {
                    showCourseStatus('No golf features found in OpenStreetMap for this area. Features must be mapped by OSM contributors.', 'error');
                    return;
                }

                // Show confirmation
                const parts = [];
                if (s.bunkers) parts.push(`${s.bunkers} bunker(s)`);
                if (s.water) parts.push(`${s.water} water hazard(s)`);
                if (s.greens) parts.push(`${s.greens} green(s)`);
                if (s.tees) parts.push(`${s.tees} tee(s)`);
                if (s.fairways) parts.push(`${s.fairways} fairway(s)`);
                if (s.pins) parts.push(`${s.pins} pin(s)`);

                if (s.holes) parts.push(`${s.holes} hole centerline(s)`);

                const msg = `Found ${s.total} features: ${parts.join(', ')}. Import hazards, hole positions, and green boundaries?`;
                if (!confirm(msg)) {
                    showCourseStatus('Detection cancelled.', 'error');
                    return;
                }

                // Import everything
                const importResp = await fetch(`/api/courses/club/${clubId}/import-features`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bunkers: data.bunkers,
                        water: data.water,
                        greens: data.greens,
                        holes: data.holes,
                    }),
                });
                const importData = await importResp.json();

                if (importResp.ok) {
                    const details = [];
                    if (importData.bunkers) details.push(`${importData.bunkers} bunker(s)`);
                    if (importData.water) details.push(`${importData.water} water hazard(s)`);
                    if (importData.holes_enriched) details.push(`${importData.holes_enriched} hole(s) enriched with tee/green/fairway`);
                    if (importData.greens_set) details.push(`${importData.greens_set} green boundary(s)`);
                    showCourseStatus(`Imported from OSM: ${details.join(', ')}.`, 'success');
                    // Reload club or course view
                    if (currentClubDetail) {
                        await loadClubDetail(currentClubDetail.id);
                    } else if (currentCourseDetail) {
                        await loadCourseDetail(currentCourseDetail.id);
                    }
                } else {
                    showCourseStatus(importData.detail || 'Import failed', 'error');
                }
            } catch (e) {
                showCourseStatus('Error: ' + e.message, 'error');
            } finally {
                btnDetectFeatures.disabled = false;
                btnDetectFeatures.textContent = 'Detect Features (OSM)';
            }
        });
    }

    // ========== OSM Card Toggle ==========
    document.getElementById('osm-card-toggle')?.addEventListener('click', () => {
        const body = document.getElementById('osm-data-section');
        const arrow = document.getElementById('osm-card-arrow');
        if (body.style.display === 'none') {
            body.style.display = '';
            arrow.innerHTML = '&#9660;';
        } else {
            body.style.display = 'none';
            arrow.innerHTML = '&#9654;';
        }
    });

    // ========== OSM Search & Link ==========
    const btnOsmClubSearch = document.getElementById('btn-osm-club-search');
    if (btnOsmClubSearch) {
        btnOsmClubSearch.addEventListener('click', () => {
            const query = document.getElementById('osm-club-search').value.trim();
            if (query) searchOSMClub(query);
        });
        // Enter key
        document.getElementById('osm-club-search')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnOsmClubSearch.click();
        });
    }

    async function searchOSMClub(query) {
        const resultsEl = document.getElementById('osm-club-results');
        resultsEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.84rem;">Searching...</p>';

        const clubLat = currentClubDetail?.lat || currentCourseDetail?.lat;
        const clubLng = currentClubDetail?.lng || currentCourseDetail?.lng;

        try {
            const resp = await fetch('/api/courses/osm/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, near_lat: clubLat, near_lng: clubLng }),
            });
            const results = await resp.json();

            if (!resp.ok) throw new Error(results.detail || 'Search failed');
            if (results.length === 0) {
                resultsEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.84rem;">No golf courses found. Try a different search term.</p>';
                return;
            }

            resultsEl.innerHTML = results.map(r => `
                <div class="recent-round" style="cursor:pointer; padding:8px 12px;" onclick="window._linkOsmToClub(${r.osm_id}, '${r.osm_type}', '${r.name.replace(/'/g, "\\'")}')">
                    <div class="round-info">
                        <div class="round-course">${r.name}</div>
                        <div class="round-meta">${r.display_name.substring(0, 80)}${r.distance_miles != null ? ' \u00b7 ' + r.distance_miles + ' mi' : ''}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            resultsEl.innerHTML = `<p style="color:var(--error);">${e.message}</p>`;
        }
    }

    window._linkOsmToClub = async function(osmId, osmType, osmName) {
        const clubId = currentClubDetail?.id || currentCourseDetail?.golf_club_id;
        if (!clubId) return;

        if (!confirm(`Link "${osmName}" to this club and import features?`)) return;

        showCourseStatus('Fetching features from OSM...', 'progress');
        try {
            const resp = await fetch(`/api/courses/club/${clubId}/osm/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ osm_id: osmId, osm_type: osmType, import_features: true }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Link failed');

            const parts = [];
            if (data.bunkers) parts.push(`${data.bunkers} bunker(s)`);
            if (data.water) parts.push(`${data.water} water hazard(s)`);
            if (data.osm_holes_saved) parts.push(`${data.osm_holes_saved} hole(s)`);
            if (data.courses_matched) parts.push(`${data.courses_matched} course(s) auto-matched`);

            showCourseStatus(`Linked! Imported: ${parts.join(', ') || 'no features found'}.`, 'success');

            // Clear results and reload
            document.getElementById('osm-club-results').innerHTML = '';
            if (currentClubDetail) await loadClubDetail(currentClubDetail.id);
            else if (currentCourseDetail) await loadCourseDetail(currentCourseDetail.id);
        } catch (e) {
            showCourseStatus('Error: ' + e.message, 'error');
        }
    };

    async function searchOSMForCourse(courseId, query) {
        const resultsEl = document.getElementById('osm-course-search-results');
        resultsEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.84rem;">Searching...</p>';

        const clubLat = currentClubDetail?.lat || currentCourseDetail?.lat;
        const clubLng = currentClubDetail?.lng || currentCourseDetail?.lng;

        try {
            const resp = await fetch('/api/courses/osm/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, near_lat: clubLat, near_lng: clubLng }),
            });
            const results = await resp.json();

            if (!resp.ok) throw new Error(results.detail || 'Search failed');
            if (results.length === 0) {
                resultsEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.84rem;">No results. Try different search terms.</p>';
                return;
            }

            resultsEl.innerHTML = `<label style="font-size:0.78rem; color:var(--text-muted);">Select a course to link:</label>` +
                results.map(r => `
                <div class="recent-round" style="cursor:pointer; padding:8px 12px;" onclick="window._linkOsmToCourse(${courseId}, ${r.osm_id}, '${r.osm_type}', '${r.name.replace(/'/g, "\\'")}')">
                    <div class="round-info">
                        <div class="round-course">${r.name}</div>
                        <div class="round-meta">${r.display_name.substring(0, 80)}${r.distance_miles != null ? ' \u00b7 ' + r.distance_miles + ' mi' : ''}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            resultsEl.innerHTML = `<p style="color:var(--error);">${e.message}</p>`;
        }
    }

    window._linkOsmToCourse = async function(courseId, osmId, osmType, osmName) {
        if (!confirm(`Link "${osmName}" to this course and import features?`)) return;

        showCourseStatus('Fetching features from OSM...', 'progress');
        try {
            const resp = await fetch(`/api/courses/${courseId}/osm/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ osm_id: osmId, osm_type: osmType, import_features: true }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Link failed');

            const parts = [];
            if (data.bunkers) parts.push(`${data.bunkers} bunker(s)`);
            if (data.water) parts.push(`${data.water} water hazard(s)`);
            if (data.osm_holes_saved) parts.push(`${data.osm_holes_saved} hole(s)`);

            showCourseStatus(`Linked! Imported: ${parts.join(', ') || 'no features found'}.`, 'success');

            document.getElementById('osm-course-search-results').innerHTML = '';
            if (currentClubDetail) await loadClubDetail(currentClubDetail.id);
            else if (currentCourseDetail) await loadCourseDetail(currentCourseDetail.id);
        } catch (e) {
            showCourseStatus('Error: ' + e.message, 'error');
        }
    };

    // ========== Club Window Selector ==========
    let clubWindow = '';
    let clubSource = 'combined';
    const clubWindowSelect = document.getElementById('club-window-select');
    const clubSourceSelect = document.getElementById('club-source-select');

    if (clubWindowSelect) {
        clubWindowSelect.addEventListener('change', () => {
            clubWindow = clubWindowSelect.value;
            // Source comparisons use local data — just re-render, no API call needed
            if (clubWindow.startsWith('source:') || clubWindow === '') {
                renderClubsTable();
            } else {
                loadClubs();
            }
        });
    }

    function updateCompareOptions() {
        if (!clubWindowSelect) return;
        const src = clubSource;
        clubWindowSelect.innerHTML = '';

        const add = (val, label) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            clubWindowSelect.appendChild(opt);
        };

        add('', 'All Time');
        add('source:range', 'vs Range Data');
        add('source:course', 'vs Course Data');

        if (src === 'course') {
            add('rounds:1', 'Last Round');
            add('rounds:3', 'Last 3 Rounds');
            add('rounds:5', 'Last 5 Rounds');
            add('rounds:10', 'Last 10 Rounds');
            add('rounds:20', 'Last 20 Rounds');
        } else if (src === 'range') {
            add('sessions:1', 'Last Session');
            add('sessions:3', 'Last 3 Sessions');
            add('sessions:5', 'Last 5 Sessions');
            add('sessions:10', 'Last 10 Sessions');
        } else {
            add('rounds:1', 'Last Round');
            add('rounds:3', 'Last 3 Rounds');
            add('rounds:6', 'Last 6 Rounds');
            add('sessions:1', 'Last Session');
            add('sessions:3', 'Last 3 Sessions');
            add('sessions:6', 'Last 6 Sessions');
        }

        add('months:1', 'Last Month');
        add('months:3', 'Last 3 Months');
        add('months:6', 'Last 6 Months');

        // Reset selection
        clubWindow = '';
        clubWindowSelect.value = '';
    }

    if (clubSourceSelect) {
        clubSourceSelect.addEventListener('change', () => {
            clubSource = clubSourceSelect.value;
            updateCompareOptions();
            renderClubsTable();
        });
    }

    async function loadClubs() {
        try {
            let url = '/api/clubs/';
            // source:range and source:course use local stats, no API window params
            if (clubWindow && !clubWindow.startsWith('source:')) {
                const [type, value] = clubWindow.split(':');
                url += `?window_type=${type}&window_value=${value}`;
            }
            const resp = await fetch(url);
            clubsCache = await resp.json();
            // Populate color cache from club data
            clubsCache.forEach(c => {
                if (c.color) clubColorCache[c.club_type] = c.color;
            });
            renderClubsTable();
        } catch (e) {
            console.error('Failed to load clubs:', e);
        }
    }

    function formatWithDelta(allTimeVal, windowedVal, unit) {
        if (allTimeVal == null) return '\u2014';
        let str = `${allTimeVal.toFixed(1)}${unit || ''}`;
        if (windowedVal != null) {
            const delta = windowedVal - allTimeVal;
            if (Math.abs(delta) >= 0.1) {
                const sign = delta > 0 ? '+' : '';
                const cls = delta > 0 ? 'delta-positive' : 'delta-negative';
                str += ` <span class="${cls}">(${sign}${delta.toFixed(1)})</span>`;
            }
        }
        return str;
    }

    // Bag order: Driver > Woods > Hybrids > Irons (low to high) > Wedges (PW > GW > SW > LW) > Putter
    function clubBagOrder(clubType) {
        const t = clubType.toLowerCase();
        if (t === 'driver') return 100;
        if (t.includes('wood')) {
            const num = parseInt(t) || 3;
            return 200 + num;
        }
        if (t.includes('hybrid')) {
            const num = parseInt(t) || 3;
            return 300 + num;
        }
        if (t.includes('iron')) {
            const num = parseInt(t) || 5;
            return 400 + num;
        }
        if (t.includes('pitching')) return 500;
        if (t.includes('gap')) return 510;
        if (t.includes('sand')) return 520;
        if (t.includes('lob')) return 530;
        if (t.includes('wedge')) return 540;  // generic wedge fallback
        if (t.includes('putter') || t === 'putter') return 600;
        if (t === 'unknown') return 700;
        return 550;  // unrecognized clubs after wedges
    }

    function renderClubsTable() {
        const tbody = document.getElementById('clubs-body');
        if (clubsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No clubs yet. Import data or add a club to get started.</td></tr>';
            return;
        }

        const hasWindow = clubWindow !== '';
        const isSourceCompare = clubWindow.startsWith('source:');

        // Sort by bag order
        const sorted = [...clubsCache].sort((a, b) => clubBagOrder(a.club_type) - clubBagOrder(b.club_type));

        tbody.innerHTML = sorted.map(c => {
            const s = c.stats;

            // For source comparison, build windowed_stats from the other source's data
            let w = c.windowed_stats;
            if (isSourceCompare && s) {
                const cmpSource = clubWindow.split(':')[1]; // "range" or "course"
                if (cmpSource === 'range') {
                    w = s.range_avg_yards != null ? {
                        avg_yards: s.range_avg_yards, median_yards: s.range_median_yards,
                        std_dev: s.range_std_dev, min_yards: s.range_min_yards,
                        max_yards: s.range_max_yards, p10: s.range_p10, p90: s.range_p90,
                        sample_count: s.range_sample_count,
                    } : null;
                } else if (cmpSource === 'course') {
                    w = s.avg_yards != null ? {
                        avg_yards: s.avg_yards, median_yards: s.median_yards,
                        std_dev: s.std_dev, min_yards: s.min_yards,
                        max_yards: s.max_yards, p10: s.p10, p90: s.p90,
                        sample_count: s.sample_count,
                    } : null;
                }
            }

            // Pick the right stats based on source toggle
            let avgVal, medianVal, maxVal, stdDevVal, minVal, p10Val, p90Val, shotCount;
            if (clubSource === 'range') {
                avgVal = s?.range_avg_yards;
                medianVal = s?.range_median_yards;
                stdDevVal = s?.range_std_dev;
                minVal = s?.range_min_yards;
                maxVal = s?.range_max_yards;
                p10Val = s?.range_p10;
                p90Val = s?.range_p90;
                shotCount = s?.range_sample_count;
            } else if (clubSource === 'combined') {
                avgVal = s?.combined_avg_yards;
                medianVal = s?.combined_median_yards;
                stdDevVal = s?.combined_std_dev;
                minVal = s?.combined_min_yards;
                maxVal = s?.combined_max_yards;
                p10Val = s?.combined_p10;
                p90Val = s?.combined_p90;
                shotCount = s?.combined_sample_count;
            } else {
                avgVal = s?.avg_yards;
                medianVal = s?.median_yards;
                stdDevVal = s?.std_dev;
                minVal = s?.min_yards;
                maxVal = s?.max_yards;
                p10Val = s?.p10;
                p90Val = s?.p90;
                shotCount = s?.sample_count;
            }

            const avg = hasWindow && w
                ? formatWithDelta(avgVal, w.avg_yards, ' yds')
                : (avgVal != null ? `${avgVal.toFixed(1)} yds` : '\u2014');

            const maxD = hasWindow && w
                ? formatWithDelta(maxVal, w.max_yards, ' yds')
                : (maxVal != null ? `${maxVal.toFixed(1)} yds` : '\u2014');

            const median = hasWindow && w
                ? formatWithDelta(medianVal, w.median_yards, ' yds')
                : (medianVal != null ? `${medianVal.toFixed(1)} yds` : '\u2014');

            const stdDev = stdDevVal != null ? `\u00b1${stdDevVal.toFixed(1)}` : '\u2014';

            const shots = shotCount ?? '\u2014';
            const wShots = hasWindow && w ? ` <span style="color:var(--text-muted); font-size:0.8rem;">(${w.sample_count})</span>` : '';

            const srcLabel = { garmin: 'G', rapsodo_mlm2pro: 'R', trackman: 'T', manual: 'M' }[c.source] || 'M';
            const clubColor = c.color || getClubColor(c.club_type);
            const textColor = _isLightColor(clubColor) ? '#000' : '#fff';

            // Store box plot data on the element for later
            c._boxData = { minVal, p10Val, medianVal, avgVal, p90Val, maxVal, color: clubColor };

            return `<tr class="clickable" onclick="location.hash='club-detail/${c.id}'" style="cursor:pointer;">
                <td style="width:28px;"><span class="source-badge" style="background:${clubColor}; color:${textColor}; cursor:pointer;" title="Click to change color" onclick="event.stopPropagation(); window._pickClubColor(${c.id})">${srcLabel}</span></td>
                <td><strong>${c.club_type}</strong>${c.name ? ` <span style="color:var(--accent); font-size:0.8rem;">"${c.name}"</span>` : ''}${c.model ? ` <span style="color:var(--text-muted); font-size:0.84rem;">${c.model}</span>` : ''}</td>
                <td>${avg}</td>
                <td>${maxD}</td>
                <td>${median}</td>
                <td>${stdDev}</td>
                <td>${shots}${wShots}</td>
                <td style="width:60px;"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._mergeClub(${c.id})" title="Merge another club into this one" style="font-size:0.75rem;">Merge</button></td>
            </tr>`;
        }).join('');

        // Render box plot
        renderClubBoxPlot(sorted);
    }

    let _lastBoxPlotClubs = null;

    function renderClubBoxPlot(clubs) {
        const canvas = document.getElementById('club-boxplot-canvas');
        if (!canvas) return;

        _lastBoxPlotClubs = clubs; // Store for re-render on section visible

        const W = canvas.parentElement.offsetWidth;
        if (W < 10) return; // Not visible yet — will re-render when section shown

        const validClubs = clubs.filter(c => c._boxData && c._boxData.minVal != null && c._boxData.maxVal != null && c.club_type !== 'Unknown' && c.club_type !== 'Putter');
        if (validClubs.length === 0) {
            canvas.parentElement.style.height = '60px';
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = W * dpr;
            canvas.height = 60 * dpr;
            ctx.scale(dpr, dpr);
            ctx.fillStyle = '#666';
            ctx.font = '13px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('No club data available', W / 2, 35);
            return;
        }

        // Sort longest at top
        validClubs.sort((a, b) => (b._boxData.avgVal || 0) - (a._boxData.avgVal || 0));

        // Build comparison data for source comparisons
        const isSourceCompare = clubWindow.startsWith('source:');
        if (isSourceCompare) {
            const cmpSrc = clubWindow.split(':')[1];
            for (const c of validClubs) {
                const s = c.stats;
                if (!s) continue;
                if (cmpSrc === 'range' && s.range_min_yards != null) {
                    c._compareData = { minVal: s.range_min_yards, p10Val: s.range_p10, medianVal: s.range_median_yards, avgVal: s.range_avg_yards, p90Val: s.range_p90, maxVal: s.range_max_yards };
                } else if (cmpSrc === 'course' && s.min_yards != null) {
                    c._compareData = { minVal: s.min_yards, p10Val: s.p10, medianVal: s.median_yards, avgVal: s.avg_yards, p90Val: s.p90, maxVal: s.max_yards };
                } else {
                    c._compareData = null;
                }
            }
        } else {
            for (const c of validClubs) {
                const ws = c.windowed_stats;
                c._compareData = ws && ws.min_yards != null ? {
                    minVal: ws.min_yards, p10Val: ws.p10, medianVal: ws.median_yards,
                    avgVal: ws.avg_yards, p90Val: ws.p90, maxVal: ws.max_yards,
                } : null;
            }
        }

        // Build rows: each club = 1 row, plus comparison row if data exists
        const hasComparison = clubWindow !== '' && validClubs.some(c => c._compareData);
        const mainRowHeight = 36;
        const compRowHeight = 28;
        const rows = []; // { type: 'main'|'compare', club, y }
        let y = 0;
        for (const c of validClubs) {
            rows.push({ type: 'main', club: c, y });
            y += mainRowHeight;
            if (hasComparison) {
                rows.push({ type: 'compare', club: c, y });
                y += compRowHeight;
            }
        }

        const labelWidth = 150;
        const padTop = 25;
        const padBottom = 30;
        const padRight = 20;
        const totalHeight = padTop + y + padBottom;

        canvas.parentElement.style.height = totalHeight + 'px';

        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = totalHeight * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, totalHeight);

        // Find global range for x-axis
        let globalMin = Infinity, globalMax = -Infinity;
        for (const c of validClubs) {
            const b = c._boxData;
            if (b.minVal < globalMin) globalMin = b.minVal;
            if (b.maxVal > globalMax) globalMax = b.maxVal;
            const w = c.windowed_stats;
            if (w && w.min_yards != null && w.min_yards < globalMin) globalMin = w.min_yards;
            if (w && w.max_yards != null && w.max_yards > globalMax) globalMax = w.max_yards;
        }
        globalMin = Math.floor(globalMin / 10) * 10;
        globalMax = Math.ceil(globalMax / 10) * 10;
        const xRange = globalMax - globalMin || 1;

        const plotLeft = labelWidth;
        const plotRight = W - padRight;
        const toX = (val) => plotLeft + ((val - globalMin) / xRange) * (plotRight - plotLeft);

        // Grid lines
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        const step = xRange > 200 ? 50 : xRange > 100 ? 25 : 10;
        for (let v = globalMin; v <= globalMax; v += step) {
            const x = toX(v);
            ctx.strokeStyle = '#2a2d35';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, padTop);
            ctx.lineTo(x, padTop + y);
            ctx.stroke();
            ctx.fillStyle = '#888';
            ctx.fillText(v + '', x, padTop - 8);
            ctx.fillText(v + '', x, padTop + y + 16);
        }

        // Yards label
        ctx.fillStyle = '#666';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Yards', (plotLeft + plotRight) / 2, totalHeight - 4);

        // Get the compare-to label
        const windowSelect = document.getElementById('club-window-select');
        const compareLabel = windowSelect?.selectedOptions[0]?.textContent || '';

        // Draw rows
        for (const row of rows) {
            const c = row.club;
            const color = c._boxData.color;
            const centerY = padTop + row.y + (row.type === 'main' ? mainRowHeight / 2 : compRowHeight / 2);

            if (row.type === 'main') {
                const b = c._boxData;
                const boxHeight = 18;
                const whiskerH = 8;

                // Club name
                ctx.fillStyle = color;
                ctx.font = 'bold 11px system-ui';
                ctx.textAlign = 'right';
                ctx.fillText(c.club_type, labelWidth - 10, centerY + 4);

                // Source label under name
                const srcLabel = clubSource === 'range' ? 'Range' : clubSource === 'combined' ? 'Combined' : 'On-Course';
                ctx.fillStyle = '#555';
                ctx.font = '9px system-ui';
                ctx.fillText(srcLabel, labelWidth - 10, centerY + 15);

                const xMin = toX(b.minVal);
                const xMax = toX(b.maxVal);
                const xP10 = toX(b.p10Val ?? b.minVal);
                const xP90 = toX(b.p90Val ?? b.maxVal);
                const xMedian = toX(b.medianVal ?? b.avgVal);
                const xAvg = toX(b.avgVal);

                // Whisker line + caps
                ctx.strokeStyle = color + '80';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(xMin, centerY);
                ctx.lineTo(xMax, centerY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(xMin, centerY - whiskerH / 2);
                ctx.lineTo(xMin, centerY + whiskerH / 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(xMax, centerY - whiskerH / 2);
                ctx.lineTo(xMax, centerY + whiskerH / 2);
                ctx.stroke();

                // Box (P10-P90)
                const boxTop = centerY - boxHeight / 2;
                ctx.fillStyle = color + '35';
                ctx.fillRect(xP10, boxTop, xP90 - xP10, boxHeight);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(xP10, boxTop, xP90 - xP10, boxHeight);

                // Median
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(xMedian, boxTop + 2);
                ctx.lineTo(xMedian, boxTop + boxHeight - 2);
                ctx.stroke();

                // Avg dot
                ctx.beginPath();
                ctx.arc(xAvg, centerY, 3.5, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();

            } else if (row.type === 'compare') {
                const cd = c._compareData;
                if (cd && cd.minVal != null && cd.maxVal != null) {
                    const boxH = 12;
                    const whiskerH = 6;

                    // Compare label
                    ctx.fillStyle = '#555';
                    ctx.font = '9px system-ui';
                    ctx.textAlign = 'right';
                    ctx.fillText(compareLabel, labelWidth - 10, centerY + 3);

                    const wMin = toX(cd.minVal);
                    const wMax = toX(cd.maxVal);
                    const wP10 = toX(cd.p10Val ?? cd.minVal);
                    const wP90 = toX(cd.p90Val ?? cd.maxVal);
                    const wMed = toX(cd.medianVal ?? cd.avgVal);
                    const wAvg = toX(cd.avgVal);

                    // Whisker
                    ctx.setLineDash([3, 2]);
                    ctx.strokeStyle = color + '50';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(wMin, centerY);
                    ctx.lineTo(wMax, centerY);
                    ctx.stroke();

                    // Caps
                    ctx.beginPath();
                    ctx.moveTo(wMin, centerY - whiskerH / 2);
                    ctx.lineTo(wMin, centerY + whiskerH / 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(wMax, centerY - whiskerH / 2);
                    ctx.lineTo(wMax, centerY + whiskerH / 2);
                    ctx.stroke();

                    // Box
                    ctx.strokeStyle = color + '80';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(wP10, centerY - boxH / 2, wP90 - wP10, boxH);
                    ctx.setLineDash([]);

                    // Median
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(wMed, centerY - boxH / 2);
                    ctx.lineTo(wMed, centerY + boxH / 2);
                    ctx.stroke();

                    // Avg
                    ctx.beginPath();
                    ctx.arc(wAvg, centerY, 2.5, 0, 2 * Math.PI);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else {
                    // No comparison data for this club
                    ctx.fillStyle = '#333';
                    ctx.font = '9px system-ui';
                    ctx.textAlign = 'right';
                    ctx.fillText(compareLabel, labelWidth - 10, centerY + 3);
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#444';
                    ctx.fillText('No data', plotLeft + 10, centerY + 3);
                }

                // Separator after compare row
                const sepY = padTop + row.y + compRowHeight;
                ctx.strokeStyle = '#222630';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, sepY);
                ctx.lineTo(W, sepY);
                ctx.stroke();
            }
        }

        // Toggle comparison legend
        const compareLegend = document.getElementById('boxplot-legend-compare');
        if (compareLegend) {
            compareLegend.style.display = hasComparison ? 'flex' : 'none';
        }
    }

    // ========== Club Edit Modal ==========
    const clubEditModal = document.getElementById('club-edit-modal');
    const btnAddClub = document.getElementById('btn-add-club');
    const btnClubModalClose = document.getElementById('btn-club-modal-close');
    const btnClubModalCancel = document.getElementById('btn-club-modal-cancel');
    const btnClubModalSave = document.getElementById('btn-club-modal-save');

    function openClubModal(club = null) {
        document.getElementById('club-modal-title').textContent = club ? 'Edit Club' : 'Add Club';
        document.getElementById('club-edit-id').value = club ? club.id : '';
        document.getElementById('club-edit-type').value = club ? club.club_type : '';
        document.getElementById('club-edit-type').disabled = club && club.source === 'garmin';
        document.getElementById('club-edit-name').value = club?.name || '';
        document.getElementById('club-edit-model').value = club?.model || '';
        document.getElementById('club-edit-flex').value = club?.flex || '';
        document.getElementById('club-edit-loft').value = club?.loft_deg || '';
        document.getElementById('club-edit-lie').value = club?.lie_deg || '';
        document.getElementById('club-edit-shaft').value = club?.shaft_length_in || '';
        document.getElementById('club-edit-color').value = club?.color || getClubColor(club?.club_type || 'Unknown');
        clubEditModal.style.display = 'flex';
    }

    function closeClubModal() {
        clubEditModal.style.display = 'none';
    }

    if (btnAddClub) btnAddClub.addEventListener('click', () => openClubModal());
    if (btnClubModalClose) btnClubModalClose.addEventListener('click', closeClubModal);
    if (btnClubModalCancel) btnClubModalCancel.addEventListener('click', closeClubModal);
    clubEditModal?.addEventListener('click', (e) => { if (e.target === clubEditModal) closeClubModal(); });

    if (btnClubModalSave) {
        btnClubModalSave.addEventListener('click', async () => {
            const id = document.getElementById('club-edit-id').value;
            const body = {
                club_type: document.getElementById('club-edit-type').value.trim(),
                name: document.getElementById('club-edit-name').value.trim() || null,
                model: document.getElementById('club-edit-model').value.trim() || null,
                flex: document.getElementById('club-edit-flex').value.trim() || null,
                loft_deg: parseFloat(document.getElementById('club-edit-loft').value) || null,
                lie_deg: parseFloat(document.getElementById('club-edit-lie').value) || null,
                shaft_length_in: parseFloat(document.getElementById('club-edit-shaft').value) || null,
                color: document.getElementById('club-edit-color').value || null,
            };

            if (!body.club_type) return alert('Club type is required');

            try {
                const url = id ? `/api/clubs/${id}` : '/api/clubs/';
                const method = id ? 'PUT' : 'POST';
                const resp = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
                if (!resp.ok) throw new Error((await resp.json()).detail || 'Failed');
                closeClubModal();
                loadClubs();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        });
    }

    // Global function for onclick handlers
    window._editClub = function(clubId) {
        const club = clubsCache.find(c => c.id === clubId);
        if (club) openClubModal(club);
    };

    // Quick color picker — uses a hidden input to open native color picker
    window._pickClubColor = function(clubId) {
        const club = clubsCache.find(c => c.id === clubId);
        if (!club) return;
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = club.color || getClubColor(club.club_type);
        picker.style.position = 'fixed';
        picker.style.opacity = '0';
        document.body.appendChild(picker);
        picker.addEventListener('input', async () => {
            try {
                await fetch(`/api/clubs/${clubId}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ color: picker.value }),
                });
                loadClubs();
            } catch (e) { console.error(e); }
        });
        picker.addEventListener('change', () => {
            setTimeout(() => picker.remove(), 100);
        });
        picker.click();
    };

    function _isLightColor(hex) {
        if (!hex || hex.startsWith('hsl')) return false;
        const c = hex.replace('#', '');
        const r = parseInt(c.substr(0, 2), 16);
        const g = parseInt(c.substr(2, 2), 16);
        const b = parseInt(c.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 160;
    }

    // ========== Club Merge Modal ==========
    const clubMergeModal = document.getElementById('club-merge-modal');
    let mergeTargetId = null;

    window._mergeClub = function(targetId) {
        mergeTargetId = targetId;
        const target = clubsCache.find(c => c.id === targetId);
        document.getElementById('merge-modal-info').textContent =
            `Merge another club's shots into "${target.club_type}${target.name ? ' "' + target.name + '"' : ''}":`;

        const list = document.getElementById('merge-modal-list');
        const others = clubsCache.filter(c => c.id !== targetId);
        list.innerHTML = others.map(c => {
            const srcMap = { garmin: 'G', rapsodo_mlm2pro: 'R', trackman: 'T', manual: 'M' };
            const srcBadge = srcMap[c.source] || 'M';
            return `<div class="recent-round" style="cursor:pointer;" onclick="window._doMerge(${targetId}, ${c.id})">
                <div class="round-score even" style="font-size:0.75rem;">${srcBadge}</div>
                <div class="round-info">
                    <div class="round-course">${c.club_type}${c.name ? ' "' + c.name + '"' : ''}${c.model ? ' — ' + c.model : ''}</div>
                </div>
            </div>`;
        }).join('');

        clubMergeModal.style.display = 'flex';
    };

    window._doMerge = async function(targetId, sourceId) {
        const source = clubsCache.find(c => c.id === sourceId);
        const target = clubsCache.find(c => c.id === targetId);
        if (!confirm(`Merge all shots from "${source.club_type}" into "${target.club_type}"? The source club will be deleted.`)) return;

        try {
            const resp = await fetch(`/api/clubs/${targetId}/merge/${sourceId}`, { method: 'POST' });
            if (!resp.ok) throw new Error((await resp.json()).detail || 'Merge failed');
            clubMergeModal.style.display = 'none';
            loadClubs();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };

    document.getElementById('btn-merge-modal-close')?.addEventListener('click', () => { clubMergeModal.style.display = 'none'; });
    document.getElementById('btn-merge-modal-cancel')?.addEventListener('click', () => { clubMergeModal.style.display = 'none'; });
    clubMergeModal?.addEventListener('click', (e) => { if (e.target === clubMergeModal) clubMergeModal.style.display = 'none'; });

    // ========== Shot Reassign Modal ==========
    const shotReassignModal = document.getElementById('shot-reassign-modal');
    let reassignShotType = null;
    let reassignShotId = null;

    const btnReassignNewClub = document.getElementById('btn-reassign-new-club');

    window._reassignShot = function(shotType, shotId) {
        reassignShotType = shotType;
        reassignShotId = shotId;

        // Render club list
        const list = document.getElementById('reassign-club-list');
        const sorted = [...clubsCache].sort((a, b) => clubBagOrder(a.club_type) - clubBagOrder(b.club_type));
        list.innerHTML = sorted.map(c => {
            const detail = [c.name ? `"${c.name}"` : null, c.model].filter(Boolean).join(' \u2014 ');
            return `<div class="reassign-item" onclick="window._doReassign(${c.id})">
                <span class="reassign-club-name">${c.club_type}</span>
                ${detail ? `<span class="reassign-club-sep">\u2014</span><span class="reassign-club-detail">${detail}</span>` : ''}
            </div>`;
        }).join('');

        // Clear new club form
        ['reassign-new-type','reassign-new-name','reassign-new-model','reassign-new-flex','reassign-new-loft','reassign-new-lie'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        shotReassignModal.style.display = 'flex';
    };

    window._doReassign = async function(targetClubId) {
        try {
            const resp = await fetch('/api/clubs/reassign-shot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ shot_type: reassignShotType, shot_id: reassignShotId, target_club_id: targetClubId }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || 'Failed');
            shotReassignModal.style.display = 'none';
            loadClubs();
            if (currentRangeDetail) loadRangeAnalytics(rangeState.selectedSession === 'all' ? null : parseInt(rangeState.selectedSession));
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };

    btnReassignNewClub?.addEventListener('click', async () => {
        const clubType = document.getElementById('reassign-new-type')?.value.trim();
        if (!clubType) return alert('Club type is required');

        const newClub = {
            club_type: clubType,
            name: document.getElementById('reassign-new-name')?.value.trim() || null,
            model: document.getElementById('reassign-new-model')?.value.trim() || null,
            flex: document.getElementById('reassign-new-flex')?.value.trim() || null,
            loft_deg: parseFloat(document.getElementById('reassign-new-loft')?.value) || null,
            lie_deg: parseFloat(document.getElementById('reassign-new-lie')?.value) || null,
        };

        try {
            const resp = await fetch('/api/clubs/reassign-shot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ shot_type: reassignShotType, shot_id: reassignShotId, new_club: newClub }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || 'Failed');
            shotReassignModal.style.display = 'none';
            loadClubs();
            if (currentRangeDetail) loadRangeAnalytics(rangeState.selectedSession === 'all' ? null : parseInt(rangeState.selectedSession));
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });

    document.getElementById('btn-reassign-modal-close')?.addEventListener('click', () => { shotReassignModal.style.display = 'none'; });
    document.getElementById('btn-reassign-modal-cancel')?.addEventListener('click', () => { shotReassignModal.style.display = 'none'; });
    shotReassignModal?.addEventListener('click', (e) => { if (e.target === shotReassignModal) shotReassignModal.style.display = 'none'; });

    document.getElementById('btn-delete-shot')?.addEventListener('click', async () => {
        if (!reassignShotType || !reassignShotId) return;
        if (!confirm('Are you sure you want to delete this shot? This cannot be undone.')) return;
        try {
            const resp = await fetch('/api/clubs/delete-shot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ shot_type: reassignShotType, shot_id: reassignShotId }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || 'Failed');
            shotReassignModal.style.display = 'none';
            loadClubs();
            // Reload current detail view if open
            const clubDetailEl = document.getElementById('section-club-detail');
            if (clubDetailEl?.classList.contains('active')) {
                const match = window.location.hash.match(/^#club-detail\/(\d+)$/);
                if (match) loadClubDetailShots(parseInt(match[1]));
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });

    function updateDashboard() {
        // Stats
        document.getElementById('stat-rounds').textContent = roundsCache.length || '0';
        document.getElementById('stat-courses').textContent = coursesCache.length || '0';

        if (roundsCache.length > 0) {
            const included = roundsCache.filter(r => !r.exclude_from_stats);

            function _stdDev(arr) {
                if (arr.length < 2) return null;
                const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
                const sq = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
                return Math.sqrt(sq);
            }

            // Bucket rounds: >= 14 holes = 18-hole, 7-13 holes = 9-hole
            const r18 = included.filter(r => r.total_strokes && r.holes_completed >= 14 && r.score_vs_par != null);
            document.getElementById('stat-18-count').textContent = r18.length || '--';
            if (r18.length > 0) {
                document.getElementById('stat-18-best').textContent = Math.min(...r18.map(r => r.total_strokes));
                const avg18 = r18.reduce((s, r) => s + r.score_vs_par, 0) / r18.length;
                document.getElementById('stat-18-avg').textContent = (avg18 > 0 ? '+' : '') + avg18.toFixed(1);
                const sd18 = _stdDev(r18.map(r => r.total_strokes));
                document.getElementById('stat-18-stddev').textContent = sd18 != null ? sd18.toFixed(1) : '--';
            }

            // 9-hole stats (7-13 holes played)
            const r9 = included.filter(r => r.total_strokes && r.holes_completed >= 7 && r.holes_completed < 14 && r.score_vs_par != null);
            document.getElementById('stat-9-count').textContent = r9.length || '--';
            if (r9.length > 0) {
                document.getElementById('stat-9-best').textContent = Math.min(...r9.map(r => r.total_strokes));
                const avg9 = r9.reduce((s, r) => s + r.score_vs_par, 0) / r9.length;
                document.getElementById('stat-9-avg').textContent = (avg9 > 0 ? '+' : '') + avg9.toFixed(1);
                const sd9 = _stdDev(r9.map(r => r.total_strokes));
                document.getElementById('stat-9-stddev').textContent = sd9 != null ? sd9.toFixed(1) : '--';
            }
        }

        // Check if there's ANY data at all — show get-started prompt if empty
        const hasAnyData = roundsCache.length > 0 || rangeSessionsCache.length > 0 || clubsCache.length > 0;
        if (!hasAnyData) {
            const container = document.getElementById('dash-recent-rounds');
            container.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>Welcome to Birdie Book</p>
                <p><a href="#import" class="nav-link" data-section="section-import" style="color:var(--accent);">Import your data</a> to get started</p>
                <p style="font-size:0.78rem; color:var(--text-dim);">Supports Garmin, Trackman, and Rapsodo MLM2PRO</p>
            </div>`;
            document.getElementById('dash-courses').innerHTML = '';
            return;
        }

        // Recent rounds (top 5)
        const container = document.getElementById('dash-recent-rounds');
        const recent = roundsCache.slice(0, 5);

        if (recent.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <p>No rounds yet</p>
            </div>`;
            return;
        }

        container.innerHTML = recent.map(r => {
            const vsPar = r.score_vs_par || 0;
            const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
            const scoreClass = vsPar < 0 ? 'under' : vsPar === 0 ? 'even' : 'over';
            const colorClass = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
            return `<div class="recent-round" onclick="location.hash='round/${r.id}'">
                <div class="round-score ${scoreClass}">${r.total_strokes || '\u2014'}</div>
                <div class="round-info">
                    <div class="round-course">${r.course_name || 'Unknown Course'}</div>
                    <div class="round-meta">${r.date} \u00b7 ${r.holes_completed || 18} holes \u00b7 ${r.shots_tracked || 0} shots</div>
                </div>
                <div class="round-detail">
                    <div class="round-vs-par ${colorClass}">${vsParStr}</div>
                </div>
            </div>`;
        }).join('');

        // Dashboard courses
        renderDashCourses();

        // SG summary card
        loadSGSummary();
        loadHandicapSummary();
        loadScoringSummary();
    }

    function renderDashCourses() {
        const coursesContainer = document.getElementById('dash-courses');
        if (!coursesContainer) return;

        if (coursesCache.length === 0) {
            coursesContainer.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <p>No courses yet</p>
            </div>`;
            return;
        }

        const sortMode = document.getElementById('dash-courses-sort')?.value || 'most-played';

        // Compute rounds played and most recent date per course from roundsCache
        const roundsByCourse = {};
        for (const r of roundsCache) {
            if (!r.course_id) continue;
            if (!roundsByCourse[r.course_id]) roundsByCourse[r.course_id] = { count: 0, lastDate: '' };
            roundsByCourse[r.course_id].count++;
            if (r.date > roundsByCourse[r.course_id].lastDate) roundsByCourse[r.course_id].lastDate = r.date;
        }

        let sorted = [...coursesCache];
        if (sortMode === 'most-played') {
            sorted.sort((a, b) => (roundsByCourse[b.id]?.count || 0) - (roundsByCourse[a.id]?.count || 0));
        } else {
            sorted.sort((a, b) => (roundsByCourse[b.id]?.lastDate || '') .localeCompare(roundsByCourse[a.id]?.lastDate || ''));
        }

        coursesContainer.innerHTML = sorted.slice(0, 5).map(c => {
            const info = roundsByCourse[c.id];
            const roundCount = info?.count || 0;
            const lastPlayed = info?.lastDate ? new Date(info.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const metaExtra = sortMode === 'most-played'
                ? `${roundCount} round${roundCount !== 1 ? 's' : ''}`
                : (lastPlayed || 'No rounds');
            return `
            <div class="recent-round" onclick="location.hash='course/${c.id}'">
                <div class="round-score even" style="font-size:0.85rem;">${c.holes || 18}</div>
                <div class="round-info">
                    <div class="round-course">${c.display_name}</div>
                    <div class="round-meta">Par ${c.par || '\u2014'} \u00b7 ${metaExtra}</div>
                </div>
            </div>`;
        }).join('');
    }

    document.getElementById('dash-courses-sort')?.addEventListener('change', () => renderDashCourses());

    // ========== Range Sessions ==========

    let rangeSessionsCache = [];

    async function loadRangeSessions() {
        try {
            const resp = await fetch('/api/range/sessions');
            rangeSessionsCache = await resp.json();
            renderRangeTable();
        } catch (e) {
            console.error('Failed to load range sessions:', e);
        }
    }

    function renderRangeTable() {
        const tbody = document.getElementById('range-body');
        if (!tbody) return;
        if (rangeSessionsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No range sessions yet. Import MLM2PRO data to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = rangeSessionsCache.map(s => {
            const d = new Date(s.session_date);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const sourceLabel = s.source === 'rapsodo_mlm2pro' ? 'MLM2PRO' : s.source;
            return `<tr class="clickable" onclick="location.hash='range/${s.id}'">
                <td>${dateStr}</td>
                <td>${sourceLabel}</td>
                <td>${s.shot_count}</td>
                <td>${s.title || '\u2014'}</td>
                <td><button class="btn btn-ghost btn-sm range-delete-btn" data-id="${s.id}" onclick="event.stopPropagation();">Delete</button></td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.range-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('Delete this range session?')) return;
                try {
                    await fetch(`/api/range/sessions/${id}`, { method: 'DELETE' });
                    loadRangeSessions();
                    loadClubs();
                } catch (e) {
                    console.error('Failed to delete session:', e);
                }
            });
        });
    }

    // ========== Range Analytics ==========

    let currentRangeDetail = null; // kept for reassign modal compat

    const rangeState = {
        allShots: [],
        sessions: [],
        clubs: [],
        enabledClubs: new Set(), // empty = all enabled
        selectedSession: 'all',
        viewMode: 'total',
        highlightedShotIds: new Set(), // shots to highlight (empty = none highlighted, show all normal)
        compareSession: null,       // session id or 'all' for compare
        compareShots: [],           // shots from compare API call
        sessionCompareMode: false,  // whether session compare is active
    };

    async function loadRangeAnalytics(sessionId) {
        const sid = sessionId || 'all';
        rangeState.selectedSession = String(sid);

        try {
            const resp = await fetch(`/api/range/shots?session_id=${sid}`);
            const data = await resp.json();
            rangeState.allShots = data.shots;
            // Populate color cache from shot data
            data.shots.forEach(s => {
                if (s.club_color && s.club_name) clubColorCache[s.club_name] = s.club_color;
            });
            rangeState.sessions = data.sessions;
            rangeState.clubs = data.clubs;

            // Populate session dropdown
            const sessionSelect = document.getElementById('range-session-select');
            if (sessionSelect) {
                sessionSelect.innerHTML = '<option value="all">All Time</option>';
                data.sessions.forEach(s => {
                    const d = new Date(s.session_date);
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const src = s.source === 'rapsodo_mlm2pro' ? 'MLM2PRO' : s.source;
                    sessionSelect.innerHTML += `<option value="${s.id}">${label} — ${src} (${s.shot_count})</option>`;
                });
                sessionSelect.value = String(sid);
            }

            // Populate compare dropdown
            const compareSelect = document.getElementById('range-compare-select');
            const compareSelectorWrap = document.getElementById('range-compare-selector');
            if (compareSelect && compareSelectorWrap) {
                compareSelect.innerHTML = '<option value="">None</option>' +
                    '<option value="all">All Time</option>';
                data.sessions.forEach(s => {
                    if (String(s.id) === String(sid)) return; // exclude primary
                    const d = new Date(s.session_date);
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const src = s.source === 'rapsodo_mlm2pro' ? 'MLM2PRO' : s.source;
                    compareSelect.innerHTML += `<option value="${s.id}">${label} — ${src} (${s.shot_count})</option>`;
                });
                // If primary is "all", remove "All Time" from compare
                if (String(sid) === 'all') {
                    compareSelect.querySelector('option[value="all"]')?.remove();
                }
                // Show compare dropdown if there are sessions to compare against
                const hasOptions = compareSelect.options.length > 1;
                compareSelectorWrap.style.display = hasOptions ? 'flex' : 'none';
                // Reset compare if selected session was removed
                if (rangeState.compareSession && !compareSelect.querySelector(`option[value="${rangeState.compareSession}"]`)) {
                    rangeState.compareSession = null;
                    rangeState.compareShots = [];
                    rangeState.sessionCompareMode = false;
                }
                compareSelect.value = rangeState.compareSession || '';
            }

            // Initialize enabled clubs on first load, preserve on session switch
            if (rangeState.enabledClubs.size === 0 && data.clubs.length > 0) {
                rangeState.enabledClubs = new Set(data.clubs);
            }
            renderClubToggles();

            // Set currentRangeDetail for reassign compat
            currentRangeDetail = { shots: data.shots };

            renderRangeAnalytics();
        } catch (e) {
            console.error('Failed to load range analytics:', e);
        }
    }

    function getFilteredShots() {
        let shots = rangeState.allShots;
        // Only show shots for enabled clubs (empty set = nothing shown)
        if (rangeState.enabledClubs.size === 0) return [];
        shots = shots.filter(s => rangeState.enabledClubs.has(s.club_name || s.club_type_raw));
        return shots;
    }

    function getFilteredCompareShots() {
        if (!rangeState.sessionCompareMode) return [];
        if (rangeState.enabledClubs.size === 0) return [];
        return rangeState.compareShots.filter(s => rangeState.enabledClubs.has(s.club_name || s.club_type_raw));
    }

    async function loadCompareData(sessionId) {
        if (!sessionId) {
            rangeState.compareSession = null;
            rangeState.compareShots = [];
            rangeState.sessionCompareMode = false;
            renderRangeAnalytics();
            return;
        }
        rangeState.compareSession = String(sessionId);
        rangeState.sessionCompareMode = true;
        try {
            const url = sessionId === 'all' ? '/api/range/shots?session_id=all' : `/api/range/shots?session_id=${sessionId}`;
            const resp = await fetch(url);
            const data = await resp.json();
            rangeState.compareShots = data.shots;
            data.shots.forEach(s => {
                if (s.club_color && s.club_name) clubColorCache[s.club_name] = s.club_color;
            });
            renderRangeAnalytics();
        } catch (e) {
            console.error('Failed to load compare data:', e);
        }
    }

    function renderRangeAnalytics() {
        const shots = getFilteredShots();
        const compareShots = getFilteredCompareShots();

        // Clear highlights on re-render
        rangeState.highlightedShotIds.clear();

        // Update view toggle
        document.getElementById('btn-view-total')?.classList.toggle('active', rangeState.viewMode === 'total');
        document.getElementById('btn-view-carry')?.classList.toggle('active', rangeState.viewMode === 'carry');

        drawScatterChart(shots, compareShots);
        drawTrajectoryChart(shots, compareShots);

        // Compare stats table
        const compareStatsEl = document.getElementById('range-compare-stats');
        if (compareStatsEl) {
            if (rangeState.sessionCompareMode && compareShots.length > 0) {
                renderCompareStatsTable(shots, compareShots);
            } else {
                compareStatsEl.innerHTML = '';
            }
        }

        renderClubSections(shots);
    }

    // View toggle
    window._setRangeView = function(mode) {
        rangeState.viewMode = mode;
        renderRangeAnalytics();
    };

    // Session select
    document.getElementById('range-session-select')?.addEventListener('change', (e) => {
        loadRangeAnalytics(e.target.value === 'all' ? null : parseInt(e.target.value));
    });

    // Compare session select
    document.getElementById('range-compare-select')?.addEventListener('change', (e) => {
        const val = e.target.value;
        loadCompareData(val === 'all' ? 'all' : val ? parseInt(val) : null);
    });

    // ── Club Toggles ──

    function renderClubToggles() {
        const container = document.getElementById('range-club-toggles');
        if (!container) return;

        const clubs = [...rangeState.clubs].sort((a, b) => clubBagOrder(a) - clubBagOrder(b));
        // "All" is active only when every club is individually enabled
        const allOn = rangeState.enabledClubs.size === clubs.length;

        container.innerHTML =
            `<span class="club-toggle${allOn ? ' active' : ''}" data-club="all" style="--club-color:var(--accent);">All</span>` +
            clubs.map(c => {
                const color = getClubColor(c);
                const active = rangeState.enabledClubs.has(c);
                return `<span class="club-toggle${active ? ' active' : ''}" data-club="${c}" style="--club-color:${color};">` +
                    `<span class="club-color-dot" style="background:${color};"></span>${c}</span>`;
            }).join('');

        // Attach click handlers
        container.querySelectorAll('.club-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const club = el.dataset.club;
                if (club === 'all') {
                    if (allOn) {
                        // All are on — turn all off
                        rangeState.enabledClubs.clear();
                    } else {
                        // Not all on — turn all on
                        rangeState.enabledClubs = new Set(clubs);
                    }
                } else {
                    // Simple toggle: on → off, off → on
                    if (rangeState.enabledClubs.has(club)) {
                        rangeState.enabledClubs.delete(club);
                    } else {
                        rangeState.enabledClubs.add(club);
                    }
                }
                renderClubToggles();
                renderRangeAnalytics();
            });
        });
    }

    window._toggleClubFromSection = function(clubName) {
        if (rangeState.enabledClubs.size === 0) {
            rangeState.enabledClubs.add(clubName);
        } else if (rangeState.enabledClubs.has(clubName)) {
            rangeState.enabledClubs.delete(clubName);
        } else {
            rangeState.enabledClubs.add(clubName);
        }
        renderClubToggles();
        renderRangeAnalytics();
    };

    // ── Chart.js Instances ──
    let scatterChartInstance = null;
    let trajectoryChartInstance = null;

    // ── Highlighting ──
    function highlightShots(shotIds) {
        rangeState.highlightedShotIds = new Set(shotIds);
        updateChartHighlights();
        updateTableHighlights();
    }

    function clearHighlights() {
        rangeState.highlightedShotIds.clear();
        updateChartHighlights();
        updateTableHighlights();
    }

    function updateChartHighlights() {
        const hl = rangeState.highlightedShotIds;
        const hasHighlight = hl.size > 0;

        // Update scatter chart point styles
        if (scatterChartInstance) {
            scatterChartInstance.data.datasets.forEach(ds => {
                if (!ds._shotIds) return;
                ds.pointBackgroundColor = ds._shotIds.map((id, i) => {
                    const baseColor = ds._baseColors[i];
                    if (!hasHighlight) return baseColor + 'B3';
                    return hl.has(id) ? baseColor : baseColor + '20';
                });
                ds.pointBorderColor = ds._shotIds.map((id, i) => {
                    const baseColor = ds._baseColors[i];
                    if (!hasHighlight) return baseColor;
                    return hl.has(id) ? baseColor : baseColor + '20';
                });
                ds.pointRadius = ds._shotIds.map(id => {
                    if (!hasHighlight) return 6;
                    return hl.has(id) ? 8 : 4;
                });
            });
            scatterChartInstance.update('none');
        }

        // Update trajectory chart line styles
        if (trajectoryChartInstance) {
            trajectoryChartInstance.data.datasets.forEach(ds => {
                if (ds._shotId == null) return;
                if (!hasHighlight) {
                    ds.borderColor = ds._baseColor;
                    ds.borderWidth = 2;
                } else if (hl.has(ds._shotId)) {
                    ds.borderColor = ds._baseColor;
                    ds.borderWidth = 3;
                } else {
                    ds.borderColor = ds._baseColor + '15';
                    ds.borderWidth = 1;
                }
            });
            trajectoryChartInstance.update('none');
        }
    }

    function updateTableHighlights() {
        const hl = rangeState.highlightedShotIds;
        const hasHighlight = hl.size > 0;
        const primaryId = rangeState.primaryShotId;
        const compareId = rangeState.compareShotId;
        document.querySelectorAll('#range-club-sections tr[data-shot-id]').forEach(tr => {
            const id = tr.dataset.shotId;
            tr.classList.remove('shot-highlighted', 'shot-compare', 'shot-dimmed');
            if (!hasHighlight) return;
            if (id === primaryId) {
                tr.classList.add('shot-highlighted');
            } else if (id === compareId) {
                tr.classList.add('shot-compare');
            } else {
                tr.classList.add('shot-dimmed');
            }
        });
    }

    // ── Scatter Chart (Top-Down Dispersion) ──

    function drawScatterChart(shots, compareShots = []) {
        const canvas = document.getElementById('range-scatter-canvas');
        if (!canvas) return;

        // Destroy previous instance
        if (scatterChartInstance) {
            scatterChartInstance.destroy();
            scatterChartInstance = null;
        }

        const distKey = rangeState.viewMode === 'carry' ? 'carry_yards' : 'total_yards';
        const validShots = shots.filter(s => s.side_carry_yards != null && s[distKey] != null);

        // Group by club for datasets
        const clubGroups = {};
        for (const s of validShots) {
            const name = s.club_name || s.club_type_raw;
            if (!clubGroups[name]) clubGroups[name] = [];
            clubGroups[name].push(s);
        }

        const datasets = Object.entries(clubGroups).map(([clubName, clubShots]) => {
            const color = getClubColor(clubName);
            return {
                label: clubName,
                data: clubShots.map(s => ({
                    x: s.side_carry_yards,
                    y: s[distKey],
                })),
                backgroundColor: clubShots.map(() => color + 'B3'),
                borderColor: clubShots.map(() => color),
                pointBackgroundColor: clubShots.map(() => color + 'B3'),
                pointBorderColor: clubShots.map(() => color),
                pointRadius: 6,
                pointHoverRadius: 9,
                pointBorderWidth: 1.5,
                // Store metadata for highlighting
                _shotIds: clubShots.map(s => s.id),
                _baseColors: clubShots.map(() => color),
            };
        });

        // Compare datasets (diamond markers, hollow fill)
        if (compareShots.length > 0) {
            const validCompare = compareShots.filter(s => s.side_carry_yards != null && s[distKey] != null);
            const compareGroups = {};
            for (const s of validCompare) {
                const name = s.club_name || s.club_type_raw;
                if (!compareGroups[name]) compareGroups[name] = [];
                compareGroups[name].push(s);
            }
            Object.entries(compareGroups).forEach(([clubName, clubShots]) => {
                const color = getClubColor(clubName);
                datasets.push({
                    label: clubName + ' (compare)',
                    data: clubShots.map(s => ({ x: s.side_carry_yards, y: s[distKey] })),
                    backgroundColor: clubShots.map(() => 'transparent'),
                    borderColor: clubShots.map(() => color + 'B3'),
                    pointBackgroundColor: clubShots.map(() => 'transparent'),
                    pointBorderColor: clubShots.map(() => color + 'B3'),
                    pointStyle: 'rectRot',
                    pointRadius: 6,
                    pointHoverRadius: 9,
                    pointBorderWidth: 2,
                    _shotIds: clubShots.map(s => s.id),
                    _baseColors: clubShots.map(() => color),
                    _isCompare: true,
                });
            });
        }

        const ctx = canvas.getContext('2d');

        // Custom plugin to draw concentric arcs and center line
        const arcPlugin = {
            id: 'dispersionArcs',
            beforeDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                const yScale = scales.y;
                const originX = xScale.getPixelForValue(0);
                const originY = yScale.getPixelForValue(0);

                // Concentric arcs every 50 yards
                ctx.save();
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 1;
                ctx.font = '10px system-ui';
                ctx.fillStyle = '#aaa';
                ctx.textAlign = 'left';

                const maxY = yScale.max;
                for (let d = 50; d <= maxY; d += 50) {
                    const r = Math.abs(originY - yScale.getPixelForValue(d));
                    ctx.beginPath();
                    ctx.arc(originX, originY, r, Math.PI, 2 * Math.PI);
                    ctx.stroke();
                    ctx.fillText(d + '', originX + 4, yScale.getPixelForValue(d) + 12);
                }

                // Center dashed line
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ccc';
                ctx.beginPath();
                ctx.moveTo(originX, chartArea.top);
                ctx.lineTo(originX, originY);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        };

        scatterChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            plugins: [arcPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                layout: { padding: { top: 10, right: 10, bottom: 5, left: 10 } },
                scales: {
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: { display: false },
                        suggestedMin: -30,
                        suggestedMax: 30,
                    },
                    y: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: { display: false },
                        beginAtZero: true,
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const ds = ctx.dataset;
                                const distLabel = rangeState.viewMode === 'carry' ? 'Carry' : 'Total';
                                const compareTag = ds._isCompare ? ' (compare)' : '';
                                const clubLabel = ds._isCompare ? ds.label.replace(' (compare)', '') : ds.label;
                                return `${clubLabel}${compareTag}: ${distLabel} ${ctx.parsed.y?.toFixed(1)} yds, Side ${ctx.parsed.x?.toFixed(1)} yds`;
                            }
                        }
                    }
                },
                onClick: (evt, elements) => {
                    if (elements.length === 0) {
                        clearHighlights();
                        return;
                    }
                    // Gather all shot IDs near the click (handles overlapping dots)
                    const clickedIds = elements.map(el => {
                        const ds = scatterChartInstance.data.datasets[el.datasetIndex];
                        return ds._shotIds?.[el.index];
                    }).filter(Boolean);
                    highlightShots(clickedIds);
                },
            },
        });

        // Legend
        const legendEl = document.getElementById('range-scatter-legend');
        if (legendEl) {
            const clubNames = Object.keys(clubGroups);
            let html = clubNames.map(name =>
                `<span class="range-legend-item"><span class="club-color-dot" style="background:${getClubColor(name)}"></span>${name}</span>`
            ).join('');
            if (compareShots.length > 0) {
                html += '<span class="range-legend-compare-note">\u25C9 = primary \u25C7 = compare</span>';
            }
            legendEl.innerHTML = html;
        }
    }

    // ── Trajectory Chart (Ball Flight Side View) ──

    function drawTrajectoryChart(shots, compareShots = []) {
        const canvas = document.getElementById('range-trajectory-canvas');
        if (!canvas) return;

        if (trajectoryChartInstance) {
            trajectoryChartInstance.destroy();
            trajectoryChartInstance = null;
        }

        const validShots = shots.filter(s =>
            s.carry_yards != null && s.carry_yards > 5 &&
            s.apex_yards != null && s.apex_yards > 0
        );
        const validCompare = compareShots.filter(s =>
            s.carry_yards != null && s.carry_yards > 5 &&
            s.apex_yards != null && s.apex_yards > 0
        );
        const allValid = [...validShots, ...validCompare];

        const maxCarry = allValid.length > 0 ? Math.max(...allValid.map(s => s.carry_yards)) : 100;
        const maxApex = allValid.length > 0 ? Math.max(...allValid.map(s => s.apex_yards)) : 30;

        // Build one dataset per shot (each is a trajectory line)
        const datasets = validShots.map(s => {
            const carry = s.carry_yards;
            const apex = s.apex_yards;
            const color = getClubColor(s.club_name);
            const clubName = s.club_name || s.club_type_raw;

            let points = [];

            // Use real trajectory data from Trackman if available
            if (s.trajectory_json) {
                try {
                    const traj = typeof s.trajectory_json === 'string' ? JSON.parse(s.trajectory_json) : s.trajectory_json;
                    // Trackman trajectory: X = forward (meters), Y = height (meters), Z = side (meters)
                    // Convert to yards/feet for display: X → yds, Y → ft then scale to yds for chart consistency
                    points = traj.map(p => ({
                        x: p.X * 1.09361,  // meters to yards
                        y: p.Y * 1.09361,  // meters to yards (keeping same units as bezier fallback)
                    }));
                } catch (e) {
                    // Fallback to bezier
                }
            }

            // Bezier fallback for MLM2PRO or failed trajectory parse
            if (points.length === 0) {
                const launchDeg = s.launch_angle_deg || 12;
                const descentDeg = s.descent_angle_deg || 40;
                const launchRad = launchDeg * Math.PI / 180;
                const descentRad = descentDeg * Math.PI / 180;

                const steps = 30;
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const cp1x = carry * 0.3;
                    const cp1y = cp1x * Math.tan(launchRad);
                    const cp2x = carry * 0.75;
                    const cp2y = (carry - cp2x) * Math.tan(descentRad);

                    const x = (1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * cp1x + 3 * (1 - t) * t ** 2 * cp2x + t ** 3 * carry;
                    const y = (1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * cp1y + 3 * (1 - t) * t ** 2 * cp2y + t ** 3 * 0;
                    points.push({ x, y });
                }
            }

            return {
                label: clubName,
                data: points,
                borderColor: color,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 0,
                tension: 0.3,  // Smooth real trajectory points
                fill: false,
                showLine: true,
                _shotId: s.id,
                _baseColor: color,
            };
        });

        // Compare trajectory datasets (dashed, thinner)
        if (validCompare.length > 0) {
            validCompare.forEach(s => {
                const carry = s.carry_yards;
                const apex = s.apex_yards;
                const color = getClubColor(s.club_name);
                const clubName = s.club_name || s.club_type_raw;
                let points = [];

                if (s.trajectory_json) {
                    try {
                        const traj = typeof s.trajectory_json === 'string' ? JSON.parse(s.trajectory_json) : s.trajectory_json;
                        points = traj.map(p => ({ x: p.X * 1.09361, y: p.Y * 1.09361 }));
                    } catch (e) { /* fallback */ }
                }
                if (points.length === 0) {
                    const launchDeg = s.launch_angle_deg || 12;
                    const descentDeg = s.descent_angle_deg || 40;
                    const launchRad = launchDeg * Math.PI / 180;
                    const descentRad = descentDeg * Math.PI / 180;
                    const steps = 30;
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const cp1x = carry * 0.3;
                        const cp1y = cp1x * Math.tan(launchRad);
                        const cp2x = carry * 0.75;
                        const cp2y = (carry - cp2x) * Math.tan(descentRad);
                        const x = (1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * cp1x + 3 * (1 - t) * t ** 2 * cp2x + t ** 3 * carry;
                        const y = (1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * cp1y + 3 * (1 - t) * t ** 2 * cp2y + t ** 3 * 0;
                        points.push({ x, y });
                    }
                }
                datasets.push({
                    label: clubName + ' (compare)',
                    data: points,
                    borderColor: color + '80',
                    borderWidth: 1.5,
                    borderDash: [6, 3],
                    pointRadius: 0,
                    pointHitRadius: 0,
                    tension: 0.3,
                    fill: false,
                    showLine: true,
                    _shotId: s.id,
                    _baseColor: color,
                    _isCompare: true,
                });
            });
        }

        const ctx = canvas.getContext('2d');

        trajectoryChartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                scales: {
                    x: {
                        type: 'linear',
                        beginAtZero: true,
                        max: Math.ceil(maxCarry * 1.1 / 50) * 50,
                        title: { display: false },
                        grid: { color: '#e0e0e0' },
                        ticks: {
                            stepSize: 50,
                            callback: v => v + ' yds',
                            font: { size: 10 },
                            color: '#aaa',
                        },
                    },
                    y: {
                        beginAtZero: true,
                        max: Math.ceil(maxApex * 1.3 / 10) * 10,
                        title: { display: false },
                        grid: { color: '#e0e0e0' },
                        ticks: {
                            stepSize: maxApex > 30 ? 10 : 5,
                            callback: v => v + ' yds',
                            font: { size: 10 },
                            color: '#aaa',
                        },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
                interaction: { mode: 'nearest', intersect: false },
            },
        });

        // Legend (deduplicate club names)
        const clubsSeen = new Set(validShots.map(s => s.club_name || s.club_type_raw));
        const legendEl = document.getElementById('range-trajectory-legend');
        if (legendEl) {
            let html = [...clubsSeen].map(name =>
                `<span class="range-legend-item"><span class="club-color-dot" style="background:${getClubColor(name)}"></span>${name}</span>`
            ).join('');
            if (validCompare.length > 0) {
                html += '<span class="range-legend-compare-note">solid = primary, dashed = compare</span>';
            }
            legendEl.innerHTML = html;
        }
    }

    // ── Compare Stats Table ──

    const COMPARE_METRICS = [
        { key: 'carry_yards', label: 'Carry', fmt: '_fmt', better: 'higher' },
        { key: 'total_yards', label: 'Total', fmt: '_fmt', better: 'higher' },
        { key: 'ball_speed_mph', label: 'Ball Spd', fmt: '_fmt', better: 'higher' },
        { key: 'club_speed_mph', label: 'Club Spd', fmt: '_fmt', better: 'higher' },
        { key: 'launch_angle_deg', label: 'Launch', fmt: '_fmtDeg', better: null },
        { key: 'spin_rate_rpm', label: 'Spin', fmt: '_fmtInt', better: null },
        { key: 'apex_yards', label: 'Apex', fmt: '_fmt', better: null },
        { key: 'side_carry_yards', label: 'Side', fmt: '_fmtSigned', better: 'zero' },
        { key: 'smash_factor', label: 'Smash', fmt: '_fmt2', better: 'higher' },
    ];

    function _computeClubAvgs(shots) {
        const groups = {};
        for (const s of shots) {
            const name = s.club_name || s.club_type_raw;
            if (!groups[name]) groups[name] = [];
            groups[name].push(s);
        }
        const result = {};
        for (const [club, clubShots] of Object.entries(groups)) {
            const avgs = {};
            for (const m of COMPARE_METRICS) {
                const vals = clubShots.map(s => s[m.key]).filter(v => v != null);
                avgs[m.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            }
            avgs._count = clubShots.length;
            result[club] = avgs;
        }
        return result;
    }

    function _deltaClass(metric, primaryVal, compareVal) {
        if (primaryVal == null || compareVal == null) return '';
        const diff = primaryVal - compareVal;
        if (Math.abs(diff) < 0.05) return '';
        if (metric.better === 'higher') return diff > 0 ? 'delta-pos' : 'delta-neg';
        if (metric.better === 'zero') return Math.abs(primaryVal) < Math.abs(compareVal) ? 'delta-pos' : 'delta-neg';
        return '';
    }

    function _getSessionLabel(sessionId) {
        if (!sessionId || sessionId === 'all') return 'All Time';
        const s = rangeState.sessions.find(x => String(x.id) === String(sessionId));
        if (!s) return 'Session ' + sessionId;
        const d = new Date(s.session_date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function renderCompareStatsTable(primaryShots, compareShots) {
        const container = document.getElementById('range-compare-stats');
        if (!container) return;

        const primaryAvgs = _computeClubAvgs(primaryShots);
        const compareAvgs = _computeClubAvgs(compareShots);

        const allClubs = [...new Set([...Object.keys(primaryAvgs), ...Object.keys(compareAvgs)])]
            .sort((a, b) => clubBagOrder(a) - clubBagOrder(b));

        if (allClubs.length === 0) {
            container.innerHTML = '<div class="card" style="padding:16px;color:var(--text-muted);font-size:0.85rem;">No shots to compare.</div>';
            return;
        }

        const primaryLabel = _getSessionLabel(rangeState.selectedSession);
        const compareLabel = _getSessionLabel(rangeState.compareSession);

        let html = `<div class="card"><div class="card-header" style="padding:12px 16px;">
            <h3 style="margin:0;font-size:0.9rem;">Session Comparison</h3>
            <div class="compare-session-labels">
                <span class="primary-label">${primaryLabel}</span>
                <span class="compare-label">${compareLabel}</span>
            </div>
        </div>
        <div style="overflow-x:auto;">
        <table class="compare-stats-table">
            <thead><tr>
                <th style="text-align:left;">Club</th>
                ${COMPARE_METRICS.map(m => `<th>${m.label}</th>`).join('')}
            </tr></thead>
            <tbody>`;

        for (const club of allClubs) {
            const pAvg = primaryAvgs[club] || {};
            const cAvg = compareAvgs[club] || {};
            const color = getClubColor(club);

            html += `<tr><td><span class="club-color-dot" style="background:${color};"></span>${club}`;
            if (pAvg._count || cAvg._count) {
                html += ` <span style="color:var(--text-muted);font-size:0.72rem;">(${pAvg._count || 0}/${cAvg._count || 0})</span>`;
            }
            html += `</td>`;

            for (const m of COMPARE_METRICS) {
                const pVal = pAvg[m.key];
                const cVal = cAvg[m.key];
                const fmtFn = FORMATTERS[m.fmt] || _fmt;
                const delta = (pVal != null && cVal != null) ? pVal - cVal : null;
                const cls = _deltaClass(m, pVal, cVal);

                let deltaStr = '';
                if (delta != null && Math.abs(delta) >= 0.05) {
                    const sign = delta > 0 ? '+' : '';
                    const fmtDelta = m.fmt === '_fmtInt' ? Math.round(delta).toString() :
                                     m.fmt === '_fmt2' ? delta.toFixed(2) : delta.toFixed(1);
                    deltaStr = `<span class="compare-cell-delta ${cls}">${sign}${fmtDelta}</span>`;
                }

                html += `<td>
                    <span class="compare-cell-primary">${fmtFn(pVal)}</span>
                    ${deltaStr}
                </td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div></div>';
        container.innerHTML = html;
    }

    // ── Collapsible Club Sections ──

    // ── Column Configuration System ──

    function _fmt(v, dec = 1) { return v != null ? v.toFixed(dec) : '\u2014'; }
    function _fmt2(v) { return v != null ? v.toFixed(2) : '\u2014'; }
    function _fmtDeg(v) { return v != null ? v.toFixed(1) + '\u00b0' : '\u2014'; }
    function _fmtInt(v) { return v != null ? Math.round(v).toString() : '\u2014'; }
    function _fmtSigned(v) { return v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) : '\u2014'; }

    const FORMATTERS = { _fmt, _fmt2, _fmtDeg, _fmtInt, _fmtSigned };

    const ALL_COLUMNS = [
        { key: 'shot_number', label: '#', fmt: null, align: 'center', width: '40px', fixed: true },
        { key: 'carry_yards', label: 'Carry', fmt: '_fmt' },
        { key: 'total_yards', label: 'Total', fmt: '_fmt' },
        { key: 'ball_speed_mph', label: 'Ball Spd', fmt: '_fmt' },
        { key: 'club_speed_mph', label: 'Club Spd', fmt: '_fmt' },
        { key: 'launch_angle_deg', label: 'Launch', fmt: '_fmtDeg' },
        { key: 'spin_rate_rpm', label: 'Spin', fmt: '_fmtInt' },
        { key: 'apex_yards', label: 'Apex', fmt: '_fmt' },
        { key: 'side_carry_yards', label: 'Side', fmt: '_fmtSigned' },
        { key: 'descent_angle_deg', label: 'Descent', fmt: '_fmtDeg' },
        { key: 'smash_factor', label: 'Smash', fmt: '_fmt2' },
        { key: 'attack_angle_deg', label: 'Attack', fmt: '_fmtDeg' },
        { key: 'club_path_deg', label: 'Club Path', fmt: '_fmtDeg' },
        { key: 'launch_direction_deg', label: 'Launch Dir', fmt: '_fmtDeg' },
        { key: 'spin_axis_deg', label: 'Spin Axis', fmt: '_fmtDeg' },
        { key: 'face_angle_deg', label: 'Face Ang', fmt: '_fmtDeg', trackman: true },
        { key: 'face_to_path_deg', label: 'F2P', fmt: '_fmtDeg', trackman: true },
        { key: 'dynamic_loft_deg', label: 'Dyn Loft', fmt: '_fmtDeg', trackman: true },
        { key: 'spin_loft_deg', label: 'Spin Loft', fmt: '_fmtDeg', trackman: true },
        { key: 'swing_plane_deg', label: 'Swing Pl', fmt: '_fmtDeg', trackman: true },
        { key: 'swing_direction_deg', label: 'Swing Dir', fmt: '_fmtDeg', trackman: true },
        { key: 'dynamic_lie_deg', label: 'Dyn Lie', fmt: '_fmtDeg', trackman: true },
        { key: 'impact_offset_in', label: 'Imp Offset', fmt: '_fmt', trackman: true },
        { key: 'impact_height_in', label: 'Imp Height', fmt: '_fmt', trackman: true },
        { key: 'low_point_distance_in', label: 'Low Point', fmt: '_fmt', trackman: true },
        { key: 'curve_yards', label: 'Curve', fmt: '_fmt', trackman: true },
        { key: 'hang_time_sec', label: 'Hang Time', fmt: '_fmt', trackman: true },
        { key: 'side_total_yards', label: 'Side Tot', fmt: '_fmtSigned', trackman: true },
        { key: 'smash_index', label: 'Smash Idx', fmt: '_fmt2', trackman: true },
        { key: 'ball_speed_diff_mph', label: 'Spd Diff', fmt: '_fmtSigned', trackman: true },
    ];

    const DEFAULT_VISIBLE = ['shot_number','carry_yards','total_yards','ball_speed_mph','club_speed_mph','launch_angle_deg','spin_rate_rpm','apex_yards','side_carry_yards','descent_angle_deg','smash_factor'];
    const COL_MAP = {};
    ALL_COLUMNS.forEach(c => { COL_MAP[c.key] = c; });

    function _loadColumnConfig() {
        try {
            const saved = localStorage.getItem('birdie_book_range_columns');
            if (saved) {
                const keys = JSON.parse(saved);
                // Validate all keys exist
                if (keys.every(k => COL_MAP[k])) return keys;
            }
        } catch (e) { /* ignore */ }
        return [...DEFAULT_VISIBLE];
    }

    function _saveColumnConfig() {
        localStorage.setItem('birdie_book_range_columns', JSON.stringify(rangeState.visibleColumns));
    }

    rangeState.visibleColumns = _loadColumnConfig();
    rangeState.editColumnsMode = false;
    rangeState.sortColumn = null;
    rangeState.sortDirection = null; // null, 'desc', 'asc'
    rangeState.expandedShotId = null;

    function _fmtCell(shot, colKey) {
        const col = COL_MAP[colKey];
        if (!col) return '\u2014';
        if (colKey === 'shot_number') return shot._rowNum || shot.shot_number;
        const val = shot[colKey];
        if (col.fmt && FORMATTERS[col.fmt]) return FORMATTERS[col.fmt](val);
        return val != null ? String(val) : '\u2014';
    }

    function _sortVal(shot, colKey) {
        // Return a numeric value for sorting. Null → -Infinity
        if (colKey === 'shot_number') return shot.shot_number;
        const val = shot[colKey];
        return val != null ? val : -Infinity;
    }

    function renderClubSections(shots) {
        const container = document.getElementById('range-club-sections');
        if (!container) return;

        // Group by club
        const groups = {};
        for (const s of shots) {
            const key = s.club_name || s.club_type_raw;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        }

        // Stats helpers
        const _avg = arr => {
            const clean = arr.filter(v => v != null);
            return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
        };
        const _stdDev = arr => {
            const clean = arr.filter(v => v != null);
            if (clean.length < 2) return null;
            const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
            const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (clean.length - 1);
            return Math.sqrt(variance);
        };

        const sorted = Object.entries(groups).sort((a, b) => clubBagOrder(a[0]) - clubBagOrder(b[0]));
        const cols = rangeState.visibleColumns;
        const editMode = rangeState.editColumnsMode;

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No shots to display.</p></div>';
            return;
        }

        // Available columns not currently shown (for add menu)
        const hiddenCols = ALL_COLUMNS.filter(c => !c.fixed && !cols.includes(c.key));

        container.innerHTML = sorted.map(([clubName, clubShots], i) => {
            const avgCarry = _avg(clubShots.map(s => s.carry_yards));
            const avgTotal = _avg(clubShots.map(s => s.total_yards));
            const color = getClubColor(clubName);
            const collapsed = i >= 2 ? ' collapsed' : '';

            // Sort data rows
            let sortedShots = [...clubShots];
            if (rangeState.sortColumn && rangeState.sortDirection) {
                const dir = rangeState.sortDirection === 'desc' ? -1 : 1;
                sortedShots.sort((a, b) => {
                    const va = _sortVal(a, rangeState.sortColumn);
                    const vb = _sortVal(b, rangeState.sortColumn);
                    return (va - vb) * dir;
                });
            }

            // Build header row
            const headerCells = cols.map((key, ci) => {
                const col = COL_MAP[key];
                if (!col) return '';
                const sortArrow = rangeState.sortColumn === key
                    ? (rangeState.sortDirection === 'desc' ? ' \u25BC' : ' \u25B2')
                    : '';
                const removeBtn = editMode && !col.fixed
                    ? `<span class="col-remove" onclick="event.stopPropagation(); window._removeColumn('${key}')">\u00d7</span>`
                    : '';
                const dragAttr = editMode && !col.fixed ? `draggable="true" data-col-idx="${ci}"` : '';
                const style = col.width ? `style="width:${col.width}"` : '';
                return `<th ${style} ${dragAttr} onclick="window._sortByColumn('${key}')" class="sortable${editMode ? ' edit-mode' : ''}">${col.label}${sortArrow}${removeBtn}</th>`;
            }).join('');

            const addBtn = editMode
                ? `<th class="col-add-cell"><span class="col-add" onclick="event.stopPropagation(); window._showAddColumn(this)">+</span></th>`
                : '<th></th>'; // action column

            // Build summary rows
            const avgCells = cols.map(key => {
                if (key === 'shot_number') return '<td><strong>Avg</strong></td>';
                const val = _avg(clubShots.map(s => s[key]));
                return `<td>${_fmtCell({[key]: val, shot_number: 0}, key)}</td>`;
            }).join('') + '<td></td>';

            const sdCells = cols.map(key => {
                if (key === 'shot_number') return '<td><strong>StdDev</strong></td>';
                const val = _stdDev(clubShots.map(s => s[key]));
                return `<td>${_fmtCell({[key]: val, shot_number: 0}, key)}</td>`;
            }).join('') + '<td></td>';

            // Build shot rows
            const isAllTime = rangeState.selectedSession === 'all';
            const shotRows = sortedShots.map((s, rowIdx) => {
                const isExpanded = rangeState.expandedShotId === s.id;
                const displayShot = isAllTime ? {...s, _rowNum: rowIdx + 1} : s;
                const dataCells = cols.map(key => `<td>${_fmtCell(displayShot, key)}</td>`).join('');
                const shotType = s.source === 'trackman' ? 'trackman' : 'range';
                const moveBtn = `<td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shotType}', ${s.raw_id})" style="font-size:0.8rem; padding:2px 6px;" title="Edit shot">&#9881;</button></td>`;
                let row = `<tr data-shot-id="${s.id}" onclick="window._toggleShotHighlight('${s.id}')" class="clickable${isExpanded ? ' detail-expanded' : ''}">${dataCells}${moveBtn}</tr>`;

                // Inline detail panel
                if (isExpanded) {
                    row += _buildDetailPanel(s, cols.length + 1);
                }
                return row;
            }).join('');

            return `
            <div class="club-section${collapsed}">
                <div class="club-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="club-color-dot" style="background:${color}"></span>
                    <span class="collapse-icon">\u25BC</span>
                    <strong>${clubName}</strong>
                    <span class="club-section-meta">
                        ${clubShots.length} shots \u00b7 Carry: ${avgCarry != null ? avgCarry.toFixed(1) : '\u2014'} \u00b7 Total: ${avgTotal != null ? avgTotal.toFixed(1) : '\u2014'}
                    </span>
                    <span class="col-edit-toggle" onclick="event.stopPropagation(); window._toggleEditColumns()" title="Edit columns">${editMode ? '\u2713' : '\u270E'}</span>
                </div>
                <div class="club-section-body">
                    <table>
                        <thead><tr>${headerCells}${addBtn}</tr></thead>
                        <tbody>
                            <tr class="summary-row summary-avg">${avgCells}</tr>
                            <tr class="summary-row summary-sd">${sdCells}</tr>
                            ${shotRows}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }).join('');

        // Attach drag handlers if in edit mode
        if (editMode) _attachDragHandlers();
    }

    function _buildDetailPanel(shot, colSpan) {
        const sections = [
            { title: 'Flight', fields: [
                ['Carry', _fmt(shot.carry_yards)], ['Total', _fmt(shot.total_yards)],
                ['Side', _fmtSigned(shot.side_carry_yards)], ['Side Tot', _fmtSigned(shot.side_total_yards)],
                ['Apex', _fmt(shot.apex_yards)], ['Curve', _fmt(shot.curve_yards)],
                ['Hang Time', shot.hang_time_sec != null ? shot.hang_time_sec.toFixed(1) + 's' : '\u2014'],
                ['Descent', _fmtDeg(shot.descent_angle_deg)],
            ]},
            { title: 'Club & Swing', fields: [
                ['Club Spd', _fmt(shot.club_speed_mph)], ['Ball Spd', _fmt(shot.ball_speed_mph)],
                ['Smash', _fmt2(shot.smash_factor)], ['Attack', _fmtDeg(shot.attack_angle_deg)],
                ['Club Path', _fmtDeg(shot.club_path_deg)], ['Face Ang', _fmtDeg(shot.face_angle_deg)],
                ['F2P', _fmtDeg(shot.face_to_path_deg)], ['Dyn Loft', _fmtDeg(shot.dynamic_loft_deg)],
                ['Spin Loft', _fmtDeg(shot.spin_loft_deg)], ['Swing Pl', _fmtDeg(shot.swing_plane_deg)],
                ['Swing Dir', _fmtDeg(shot.swing_direction_deg)], ['Dyn Lie', _fmtDeg(shot.dynamic_lie_deg)],
            ]},
            { title: 'Impact', fields: [
                ['Offset', _fmt(shot.impact_offset_in)], ['Height', _fmt(shot.impact_height_in)],
                ['Low Point', _fmt(shot.low_point_distance_in)],
            ]},
            { title: 'Spin', fields: [
                ['Rate', _fmtInt(shot.spin_rate_rpm)], ['Axis', _fmtDeg(shot.spin_axis_deg)],
                ['Launch', _fmtDeg(shot.launch_angle_deg)], ['Launch Dir', _fmtDeg(shot.launch_direction_deg)],
            ]},
        ];

        const html = sections.map(sec => `
            <div class="detail-section">
                <div class="detail-section-title">${sec.title}</div>
                <div class="detail-grid">
                    ${sec.fields.map(([label, val]) => `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${val}</span></div>`).join('')}
                </div>
            </div>
        `).join('');

        return `<tr class="detail-panel-row"><td colspan="${colSpan}"><div class="shot-detail-panel">${html}
            <div style="text-align:right; margin-top:8px;">
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shot.source === "trackman" ? "trackman" : "range"}', ${shot.raw_id})" style="font-size:0.8rem; padding:2px 6px;" title="Edit shot">&#9881;</button>
            </div>
        </div></td></tr>`;
    }

    // ── Column Edit, Sort, Detail handlers ──

    window._toggleEditColumns = function() {
        rangeState.editColumnsMode = !rangeState.editColumnsMode;
        renderRangeAnalytics();
    };

    window._removeColumn = function(key) {
        rangeState.visibleColumns = rangeState.visibleColumns.filter(k => k !== key);
        _saveColumnConfig();
        renderRangeAnalytics();
    };

    window._showAddColumn = function(el) {
        // Remove existing dropdown if any
        document.querySelectorAll('.col-add-dropdown').forEach(d => d.remove());

        const hidden = ALL_COLUMNS.filter(c => !c.fixed && !rangeState.visibleColumns.includes(c.key));
        if (hidden.length === 0) return;

        const dd = document.createElement('div');
        dd.className = 'col-add-dropdown';
        dd.innerHTML = hidden.map(c =>
            `<div class="col-add-option" onclick="window._addColumn('${c.key}')">${c.label}${c.trackman ? ' <span style="color:var(--text-dim); font-size:0.7rem;">(TM)</span>' : ''}</div>`
        ).join('');
        el.parentElement.appendChild(dd);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function handler(e) {
                if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', handler); }
            });
        }, 10);
    };

    window._addColumn = function(key) {
        rangeState.visibleColumns.push(key);
        _saveColumnConfig();
        document.querySelectorAll('.col-add-dropdown').forEach(d => d.remove());
        renderRangeAnalytics();
    };

    window._sortByColumn = function(key) {
        if (rangeState.editColumnsMode) return; // Don't sort in edit mode
        if (rangeState.sortColumn === key) {
            // Cycle: desc → asc → default
            if (rangeState.sortDirection === 'desc') rangeState.sortDirection = 'asc';
            else { rangeState.sortColumn = null; rangeState.sortDirection = null; }
        } else {
            rangeState.sortColumn = key;
            rangeState.sortDirection = 'desc';
        }
        renderRangeAnalytics();
    };

    // Shot detail toggle (integrated with highlight)
    const _origToggle = window._toggleShotHighlight;
    window._toggleShotHighlight = function(shotId) {
        // Toggle detail panel
        rangeState.expandedShotId = rangeState.expandedShotId === shotId ? null : shotId;
        // Also do highlighting
        if (_origToggle) _origToggle(shotId);
        else renderRangeAnalytics();
    };

    // Drag to reorder columns
    let _dragColIdx = null;
    function _attachDragHandlers() {
        document.querySelectorAll('.club-section-body th[draggable]').forEach(th => {
            th.addEventListener('dragstart', (e) => {
                _dragColIdx = parseInt(th.dataset.colIdx);
                th.classList.add('th-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            th.addEventListener('dragend', () => { th.classList.remove('th-dragging'); });
            th.addEventListener('dragover', (e) => { e.preventDefault(); th.classList.add('th-dragover'); });
            th.addEventListener('dragleave', () => { th.classList.remove('th-dragover'); });
            th.addEventListener('drop', (e) => {
                e.preventDefault();
                th.classList.remove('th-dragover');
                const toIdx = parseInt(th.dataset.colIdx);
                if (_dragColIdx !== null && _dragColIdx !== toIdx) {
                    const cols = rangeState.visibleColumns;
                    const [moved] = cols.splice(_dragColIdx, 1);
                    cols.splice(toIdx, 0, moved);
                    _saveColumnConfig();
                    renderRangeAnalytics();
                }
                _dragColIdx = null;
            });
        });
    }

    // ── Floating Shot Detail Panel ──

    let shotPanelPopout = null;
    rangeState.compareMode = false;
    rangeState.primaryShotId = null;
    rangeState.compareShotId = null;

    function _getPrimaryShot() {
        return rangeState.allShots.find(s => s.id === rangeState.primaryShotId) || null;
    }
    function _getCompareShot() {
        return rangeState.allShots.find(s => s.id === rangeState.compareShotId) || null;
    }

    function _delta(a, b) {
        if (a == null || b == null) return null;
        return a - b;
    }

    function _fmtDelta(d, dec = 1) {
        if (d == null) return '';
        const sign = d >= 0 ? '+' : '';
        const cls = d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : 'delta-zero';
        return `<span class="compare-delta ${cls}">${sign}${d.toFixed(dec)}</span>`;
    }

    function _shotLabel(shot) {
        const club = shot.club_name || shot.club_type_raw;
        return `Shot ${shot._rowNum || shot.shot_number} — ${club}`;
    }

    function _sourceLabel(shot) {
        return shot.source === 'trackman' ? 'Trackman' : shot.source === 'rapsodo_mlm2pro' ? 'MLM2PRO' : shot.source;
    }

    function _sessionDate(shot) {
        const session = rangeState.sessions.find(s => s.id === shot.session_id);
        return session ? new Date(session.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    }

    // Data field definitions for the panel: [label, key, unit, decimals]
    const PANEL_FIELDS = {
        source: [['Device', '_source', ''], ['Session', '_session', '']],
        flight: [
            ['Carry', 'carry_yards', 'yds', 1], ['Total', 'total_yards', 'yds', 1],
            ['Side', 'side_carry_yards', 'yds', 1], ['Side Tot', 'side_total_yards', 'yds', 1],
            ['Apex', 'apex_yards', 'yds', 1], ['Curve', 'curve_yards', 'yds', 1],
            ['Hang Time', 'hang_time_sec', 's', 1], ['Descent', 'descent_angle_deg', '\u00b0', 1],
        ],
        club: [
            ['Club Spd', 'club_speed_mph', 'mph', 1], ['Ball Spd', 'ball_speed_mph', 'mph', 1],
            ['Smash', 'smash_factor', '', 2], ['Attack', 'attack_angle_deg', '\u00b0', 1],
            ['Club Path', 'club_path_deg', '\u00b0', 1], ['Face Ang', 'face_angle_deg', '\u00b0', 1],
            ['F2P', 'face_to_path_deg', '\u00b0', 1], ['Dyn Loft', 'dynamic_loft_deg', '\u00b0', 1],
            ['Spin Loft', 'spin_loft_deg', '\u00b0', 1], ['Swing Pl', 'swing_plane_deg', '\u00b0', 1],
            ['Swing Dir', 'swing_direction_deg', '\u00b0', 1], ['Dyn Lie', 'dynamic_lie_deg', '\u00b0', 1],
        ],
        spin: [
            ['Rate', 'spin_rate_rpm', 'rpm', 0], ['Axis', 'spin_axis_deg', '\u00b0', 1],
            ['Launch', 'launch_angle_deg', '\u00b0', 1], ['Launch Dir', 'launch_direction_deg', '\u00b0', 1],
        ],
        impact: [
            ['Offset', 'impact_offset_in', 'in', 1], ['Height', 'impact_height_in', 'in', 1],
            ['Low Point', 'low_point_distance_in', 'in', 1],
        ],
    };

    function showShotPanel(shot, compareShot = null) {
        const panel = document.getElementById('shot-panel');
        if (!panel) return;
        panel.style.display = 'flex';

        // Title
        const titleEl = document.getElementById('shot-panel-title');
        if (compareShot) {
            titleEl.textContent = `Comparing Shots`;
        } else {
            titleEl.textContent = _shotLabel(shot);
        }

        // Toggle button states
        const compareBtn = document.getElementById('btn-panel-compare');
        const swapBtn = document.getElementById('btn-panel-swap');
        if (compareBtn) {
            compareBtn.classList.toggle('active', rangeState.compareMode);
            compareBtn.title = rangeState.compareMode ? 'Exit compare mode' : 'Compare with another shot';
        }
        if (swapBtn) swapBtn.style.display = compareShot ? '' : 'none';

        const data = document.getElementById('shot-panel-data');
        const isCompare = !!compareShot;

        function _fmtVal(v, dec = 1) {
            if (v == null) return '\u2014';
            return dec === 0 ? Math.round(v).toString() : v.toFixed(dec);
        }

        function _renderField([label, key, unit, dec]) {
            if (key === '_source') {
                if (isCompare) {
                    return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span>
                        <span class="shot-panel-item-value compare-vals">
                            <span class="compare-primary">${_sourceLabel(shot)}</span>
                            <span class="compare-secondary">${_sourceLabel(compareShot)}</span>
                        </span></div>`;
                }
                return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span><span class="shot-panel-item-value">${_sourceLabel(shot)}</span></div>`;
            }
            if (key === '_session') {
                if (isCompare) {
                    return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span>
                        <span class="shot-panel-item-value compare-vals">
                            <span class="compare-primary">${_sessionDate(shot)}</span>
                            <span class="compare-secondary">${_sessionDate(compareShot)}</span>
                        </span></div>`;
                }
                return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span><span class="shot-panel-item-value">${_sessionDate(shot)}</span></div>`;
            }

            const v1 = shot[key];
            const val1 = _fmtVal(v1, dec);
            const u = unit && val1 !== '\u2014' ? `<span style="color:var(--text-dim);font-size:0.7rem;">${unit}</span>` : '';

            if (!isCompare) {
                return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span><span class="shot-panel-item-value">${val1} ${u}</span></div>`;
            }

            const v2 = compareShot[key];
            const val2 = _fmtVal(v2, dec);
            const d = _delta(v1, v2);
            const deltaHtml = d != null ? _fmtDelta(d, dec) : '';

            return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span>
                <span class="shot-panel-item-value compare-vals">
                    <span class="compare-primary">${val1}</span>
                    <span class="compare-secondary">${val2}</span>
                    ${deltaHtml}
                </span></div>`;
        }

        // Section header with shot labels in compare mode
        const headerHtml = isCompare ? `
            <div class="compare-header">
                <span class="compare-primary-label">${_shotLabel(shot)}</span>
                <span class="compare-secondary-label">${_shotLabel(compareShot)}</span>
            </div>` : '';

        const sectionDefs = [
            ['Source', 'source'], ['Flight', 'flight'], ['Club & Swing', 'club'], ['Spin', 'spin'], ['Impact', 'impact'],
        ];

        data.innerHTML = headerHtml + sectionDefs.map(([title, key]) => `
            <div class="shot-panel-section">
                <div class="shot-panel-section-title">${title}</div>
                <div class="shot-panel-grid">
                    ${PANEL_FIELDS[key].map(_renderField).join('')}
                </div>
            </div>
        `).join('');

        // Update pop-out
        if (shotPanelPopout && !shotPanelPopout.closed) {
            const mainData = document.getElementById('shot-panel-data');
            shotPanelPopout.document.getElementById('shot-panel-data').innerHTML = mainData.innerHTML;
            shotPanelPopout.document.getElementById('popout-title').textContent = titleEl.textContent;
        }
    }

    function hideShotPanel() {
        const panel = document.getElementById('shot-panel');
        if (panel) panel.style.display = 'none';
        _coursePanelContext = null;
    }

    // ── Course Shot Detail Panel ──
    let _coursePanelContext = null; // null | 'course' — tracks if panel is showing course data
    let _courseSelectedShotId = null;

    const COURSE_PANEL_FIELDS = {
        info: [
            ['Club', '_club', ''],
            ['Shot Type', '_shot_type', ''],
            ['Lie', '_lie_transition', ''],
        ],
        distance: [
            ['GPS Distance', 'distance_yards', 'yds', 0],
            ['Useful Distance', 'fairway_progress_yards', 'yds', 0],
            ['Pin Remaining', 'pin_distance_yards', 'yds', 0],
        ],
        accuracy: [
            ['Side from FW', '_fairway_side_display', ''],
            ['Fairway Hit', '_fairway_hit', ''],
            ['Green Prox', 'green_distance_yards', 'yds', 0],
            ['On Green', '_on_green_display', ''],
        ],
        hazards: [
            ['Nearest Hazard', '_hazard_display', ''],
        ],
        sg: [
            ['SG vs PGA', '_sg_display', ''],
            ['SG vs Personal', '_sg_personal_display', ''],
        ],
    };

    function _buildCourseShotDisplay(shot) {
        // Build computed display fields from raw shot data
        const display = { ...shot };
        display._club = shot.club || '\u2014';
        display._shot_type = shot.shot_type || '\u2014';

        // Lie transition
        if (shot.start_lie && shot.end_lie) {
            display._lie_transition = `${shot.start_lie} \u2192 ${shot.end_lie}`;
        } else if (shot.end_lie) {
            display._lie_transition = shot.end_lie;
        } else {
            display._lie_transition = '\u2014';
        }

        // Fairway side display
        if (shot.fairway_side != null && shot.fairway_side_yards != null) {
            if (shot.fairway_side === 'CENTER') {
                display._fairway_side_display = 'CENTER';
            } else {
                display._fairway_side_display = `${Math.abs(shot.fairway_side_yards).toFixed(0)} ${shot.fairway_side}`;
            }
        } else {
            display._fairway_side_display = null;
        }

        // Fairway hit (within ~18 yards of centerline)
        if (shot.fairway_side_yards != null) {
            display._fairway_hit = Math.abs(shot.fairway_side_yards) < 18 ? '\u2713' : '\u2717';
        } else {
            display._fairway_hit = null;
        }

        // On green display
        if (shot.on_green != null) {
            display._on_green_display = shot.on_green ? '\u2713' : '\u2717';
        } else {
            display._on_green_display = null;
        }

        // Hazard display
        if (shot.nearest_hazard_type && shot.nearest_hazard_yards != null) {
            const name = shot.nearest_hazard_name || shot.nearest_hazard_type;
            display._hazard_display = `${name} \u2014 ${shot.nearest_hazard_yards.toFixed(0)} yds`;
        } else {
            display._hazard_display = null;
        }

        // Strokes gained display
        if (shot.sg_pga != null) {
            display._sg_display = `${shot.sg_pga >= 0 ? '+' : ''}${shot.sg_pga.toFixed(2)}`;
        } else {
            display._sg_display = null;
        }

        if (shot.sg_personal != null) {
            display._sg_personal_display = `${shot.sg_personal >= 0 ? '+' : ''}${shot.sg_personal.toFixed(2)}`;
        } else {
            display._sg_personal_display = null;
        }

        return display;
    }

    function _getGeometryHints(holeData) {
        // Determine which geometry is missing for hint messages
        const hints = {};
        if (!holeData) return hints;
        const hasFairway = holeData.fairway_path && (typeof holeData.fairway_path === 'string' ? JSON.parse(holeData.fairway_path).length >= 2 : holeData.fairway_path.length >= 2);
        const hasFlag = holeData.flag_lat && holeData.flag_lng;
        const hasGreen = holeData.green_boundary;

        if (!hasFairway) hints.accuracy = 'Draw a fairway path to see accuracy data';
        if (!hasFairway) hints.distance_useful = 'Draw a fairway path to see useful distance';
        if (!hasFlag) hints.distance_pin = 'Set flag position to see pin distance';
        if (!hasGreen) hints.green = 'Add green boundary to see green proximity';
        return hints;
    }

    function showCourseShotPanel(shot, holeData) {
        const panel = document.getElementById('shot-panel');
        if (!panel) return;
        _coursePanelContext = 'course';
        panel.style.display = 'flex';

        // Title
        const titleEl = document.getElementById('shot-panel-title');
        titleEl.textContent = `Shot ${shot.shot_number} \u2014 ${shot.club || 'Unknown'}`;

        // Hide range-specific buttons
        const compareBtn = document.getElementById('btn-panel-compare');
        const swapBtn = document.getElementById('btn-panel-swap');
        const popoutBtn = document.getElementById('btn-panel-popout');
        if (compareBtn) compareBtn.style.display = 'none';
        if (swapBtn) swapBtn.style.display = 'none';
        if (popoutBtn) popoutBtn.style.display = 'none';

        // Show recalc button for course panel
        const recalcBtn = document.getElementById('btn-panel-recalc');
        if (recalcBtn) recalcBtn.style.display = '';

        // Hide club head diagrams
        const diagrams = panel.querySelector('.shot-panel-diagrams');
        if (diagrams) diagrams.style.display = 'none';
        const footnote = panel.querySelector('.shot-panel-footnote');
        if (footnote) footnote.style.display = 'none';

        const data = document.getElementById('shot-panel-data');
        const display = _buildCourseShotDisplay(shot);
        const hints = _getGeometryHints(holeData);

        function _fmtVal(v, dec = 1) {
            if (v == null) return '\u2014';
            if (typeof v === 'string') return v;
            return dec === 0 ? Math.round(v).toString() : v.toFixed(dec);
        }

        function _renderCourseField([label, key, unit, dec]) {
            const v = display[key];
            const val = _fmtVal(v, dec);
            const u = unit && val !== '\u2014' ? `<span style="color:var(--text-dim);font-size:0.7rem;">${unit}</span>` : '';

            // SG coloring
            let valStyle = '';
            if (key === '_sg_display' && shot.sg_pga != null) {
                valStyle = shot.sg_pga > 0 ? 'color: var(--green, #4ade80);' : shot.sg_pga < 0 ? 'color: var(--red, #f87171);' : '';
            }
            if (key === '_sg_personal_display' && shot.sg_personal != null) {
                valStyle = shot.sg_personal > 0 ? 'color: var(--green, #4ade80);' : shot.sg_personal < 0 ? 'color: var(--red, #f87171);' : '';
            }
            // Fairway hit coloring
            if (key === '_fairway_hit' && val !== '\u2014') {
                valStyle = val === '\u2713' ? 'color: var(--green, #4ade80);' : 'color: var(--red, #f87171);';
            }
            if (key === '_on_green_display' && val !== '\u2014') {
                valStyle = val === '\u2713' ? 'color: var(--green, #4ade80);' : 'color: var(--red, #f87171);';
            }

            return `<div class="shot-panel-item"><span class="shot-panel-item-label">${label}</span><span class="shot-panel-item-value" style="${valStyle}">${val} ${u}</span></div>`;
        }

        const sectionDefs = [
            ['Shot Info', 'info', null],
            ['Distance', 'distance', null],
            ['Accuracy', 'accuracy', hints.accuracy],
            ['Hazards', 'hazards', null],
            ['Strokes Gained', 'sg', hints.distance_pin],
        ];

        data.innerHTML = sectionDefs.map(([title, key, hint]) => {
            const fields = COURSE_PANEL_FIELDS[key];
            const fieldsHtml = fields.map(_renderCourseField).join('');

            // Check if all field values are null (show hint instead)
            const allNull = fields.every(([, fkey]) => display[fkey] == null);
            const hintHtml = (allNull && hint) ? `<div class="panel-hint">${hint}</div>` : '';

            return `
                <div class="shot-panel-section">
                    <div class="shot-panel-section-title">${title}</div>
                    <div class="shot-panel-grid">
                        ${fieldsHtml}
                    </div>
                    ${hintHtml}
                </div>
            `;
        }).join('');
    }

    function _highlightCourseShot(shotId) {
        _courseSelectedShotId = shotId;

        // Highlight in shot list
        document.querySelectorAll('#hole-shot-list .shot-item').forEach(el => {
            el.classList.toggle('shot-item-active', el.dataset.shotId == shotId);
        });

        // Highlight on map
        if (holeShotLayers) {
            holeShotLayers.eachLayer(layer => {
                if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
                    const isSelected = layer.options._shotId === shotId;
                    layer.setStyle({
                        weight: isSelected ? 5 : 2,
                        opacity: isSelected ? 1 : 0.3,
                    });
                }
                if (layer instanceof L.CircleMarker) {
                    const isSelected = layer.options._shotId === shotId;
                    layer.setStyle({
                        fillOpacity: isSelected ? 1 : 0.2,
                        radius: isSelected ? 7 : 4,
                    });
                }
            });
        }
    }

    window._showCourseShotDetail = function(shotId) {
        if (!holeViewRoundDetail) return;
        const rh = holeViewRoundDetail.holes.find(h => h.hole_number === selectedHole);
        if (!rh) return;
        const shot = rh.shots.find(s => s.id === shotId);
        if (!shot) return;

        const courseHoles = getCourseTeeHoles();
        const holeData = courseHoles.find(h => h.hole_number === selectedHole);

        _highlightCourseShot(shotId);
        showCourseShotPanel(shot, holeData);
    };

    // Close button
    document.getElementById('btn-panel-close')?.addEventListener('click', () => {
        if (_coursePanelContext === 'course') {
            // Reset course panel state
            _courseSelectedShotId = null;
            _highlightCourseShot(null);
            // Restore range buttons visibility for next range use
            const compareBtn = document.getElementById('btn-panel-compare');
            const popoutBtn = document.getElementById('btn-panel-popout');
            if (compareBtn) compareBtn.style.display = '';
            if (popoutBtn) popoutBtn.style.display = '';
            const recalcBtn2 = document.getElementById('btn-panel-recalc');
            if (recalcBtn2) recalcBtn2.style.display = 'none';
            const diagrams = document.querySelector('.shot-panel-diagrams');
            if (diagrams) diagrams.style.display = '';
        } else {
            rangeState.compareMode = false;
            rangeState.primaryShotId = null;
            rangeState.compareShotId = null;
            clearHighlights();
        }
        hideShotPanel();
    });

    // Recalc button (course panel only)
    document.getElementById('btn-panel-recalc')?.addEventListener('click', async () => {
        if (!holeViewRoundDetail) return;
        const roundId = holeViewRoundDetail.id;
        const btn = document.getElementById('btn-panel-recalc');
        if (btn) { btn.disabled = true; btn.textContent = '…'; }
        try {
            await fetch(`/api/rounds/${roundId}/recalc`, { method: 'POST' });
            // Reload round data
            const resp = await fetch(`/api/rounds/${roundId}`);
            holeViewRoundDetail = await resp.json();
            // Re-render the panel with updated data
            if (_courseSelectedShotId) {
                window._showCourseShotDetail(_courseSelectedShotId);
            }
        } catch (e) {
            console.error('Recalc failed:', e);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '\u21bb'; }
        }
    });

    // Compare button
    document.getElementById('btn-panel-compare')?.addEventListener('click', () => {
        rangeState.compareMode = !rangeState.compareMode;
        if (!rangeState.compareMode) {
            // Exit compare mode — show primary shot only
            rangeState.compareShotId = null;
            const primary = _getPrimaryShot();
            if (primary) {
                highlightShots([rangeState.primaryShotId]);
                showShotPanel(primary);
            }
        } else {
            // Enter compare mode — update button state
            const primary = _getPrimaryShot();
            if (primary) showShotPanel(primary);
        }
    });

    // Swap button
    document.getElementById('btn-panel-swap')?.addEventListener('click', () => {
        if (!rangeState.primaryShotId || !rangeState.compareShotId) return;
        const tmp = rangeState.primaryShotId;
        rangeState.primaryShotId = rangeState.compareShotId;
        rangeState.compareShotId = tmp;
        _updateComparePanel();
    });

    function _updateComparePanel() {
        const primary = _getPrimaryShot();
        const compare = _getCompareShot();
        if (primary && compare) {
            highlightShots([rangeState.primaryShotId, rangeState.compareShotId]);
            showShotPanel(primary, compare);
        } else if (primary) {
            highlightShots([rangeState.primaryShotId]);
            showShotPanel(primary);
        }
        updateTableHighlights();
    }

    // Pop-out button
    document.getElementById('btn-panel-popout')?.addEventListener('click', () => {
        const panel = document.getElementById('shot-panel');
        if (!panel) return;

        shotPanelPopout = window.open('', 'ShotDetail', 'width=680,height=800,scrollbars=yes');
        if (!shotPanelPopout) return;

        const doc = shotPanelPopout.document;
        doc.title = 'Shot Detail — Birdie Book';
        doc.head.innerHTML = `<style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #111318; color: #e4e4e7; margin: 0; padding: 16px; }
            .shot-panel-diagrams { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
            .club-diagram-card { background: #e8e8e8; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            .club-diagram-card canvas { width: 100%; height: auto; }
            .shot-panel-footnote { font-size: 0.7rem; color: #71717a; text-align: center; margin-bottom: 10px; font-style: italic; }
            .shot-panel-section { margin-bottom: 14px; }
            .shot-panel-section-title { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; margin-bottom: 6px; font-weight: 600; }
            .shot-panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; }
            .shot-panel-item { display: flex; justify-content: space-between; font-size: 0.82rem; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
            .shot-panel-item-label { color: #a1a1aa; }
            .shot-panel-item-value { font-weight: 500; }
            h2 { font-size: 1rem; margin: 0 0 12px 0; }
        </style>`;
        doc.body.innerHTML = `<h2 id="popout-title">Shot Detail</h2>
            <div class="shot-panel-diagrams">
                <div class="club-diagram-card" id="club-side-card"><img id="club-side-img" src="" alt="Side view"><div class="diagram-overlay" id="club-side-overlay"></div></div>
                <div class="club-diagram-card" id="club-top-card"><img id="club-top-img" src="" alt="Top view"><div class="diagram-overlay" id="club-top-overlay"></div></div>
            </div>
            <div class="shot-panel-footnote" id="shot-panel-footnote" style="display:none;">* Partial data — some measurements unavailable</div>
            <div id="shot-panel-data"></div>`;

        // Render current shot into pop-out
        const currentShot = _getCurrentSelectedShot();
        if (currentShot) updatePopoutPanel(currentShot);

        // Hide inline panel
        panel.style.display = 'none';
    });

    function updatePopoutPanel(shot) {
        if (!shotPanelPopout || shotPanelPopout.closed) return;
        const doc = shotPanelPopout.document;
        const clubName = shot.club_name || shot.club_type_raw;
        doc.getElementById('popout-title').textContent = `Shot ${shot.shot_number} — ${clubName}`;

        // Update images and overlays in pop-out
        const cat = _getClubCategory(shot);
        const popSideImg = doc.getElementById('club-side-img');
        const popTopImg = doc.getElementById('club-top-img');
        if (popSideImg) popSideImg.src = `${window.location.origin}/static/images/clubheads/${cat}_side.png`;
        if (popTopImg) popTopImg.src = `${window.location.origin}/static/images/clubheads/${cat}_top.png`;
        const popSideOverlay = doc.getElementById('club-side-overlay');
        const popTopOverlay = doc.getElementById('club-top-overlay');
        if (popSideOverlay) popSideOverlay.innerHTML = _buildOverlayLabels(shot, 'side');
        if (popTopOverlay) popTopOverlay.innerHTML = _buildOverlayLabels(shot, 'top');

        // Data
        const hasFullData = shot.face_angle_deg != null && shot.dynamic_loft_deg != null;
        doc.getElementById('shot-panel-footnote').style.display = hasFullData ? 'none' : 'block';

        const mainPanel = document.getElementById('shot-panel');
        const dataEl = mainPanel?.querySelector('#shot-panel-data');
        if (dataEl) {
            doc.getElementById('shot-panel-data').innerHTML = dataEl.innerHTML;
        }
    }

    function _getCurrentSelectedShot() {
        if (rangeState.highlightedShotIds.size !== 1) return null;
        const id = [...rangeState.highlightedShotIds][0];
        return rangeState.allShots.find(s => s.id === id) || null;
    }

    // ── Club Head Diagrams ──

    function _getClubCategory(shot) {
        const name = (shot.club_name || shot.club_type_raw || '').toLowerCase();
        if (name === 'driver') return 'Driver';
        if (name.includes('wood')) return 'Wood';
        if (name.includes('hybrid')) return 'Hybrid';
        if (name.includes('wedge')) return 'Wedge';
        return 'Iron';
    }

    function _updateDiagramImages(shot) {
        const cat = _getClubCategory(shot);
        const sideImg = document.getElementById('club-side-img');
        const topImg = document.getElementById('club-top-img');
        if (sideImg) sideImg.src = `/static/images/clubheads/${cat}_side.png`;
        if (topImg) topImg.src = `/static/images/clubheads/${cat}_top.png`;
    }

    function _buildOverlayLabels(shot, view) {
        // Build positioned labels over the club head images
        // Side view: Dynamic Loft (top-left), Spin Rate (top-right), Attack Angle (bottom-left), Spin Loft (bottom-right)
        // Top view: Club Path (top-left), Face To Path (top-right), Face Angle (bottom-left), Spin Axis (bottom-right)
        if (view === 'side') {
            return `
                <div class="diagram-label" style="top:6px;left:8px;">
                    <div class="diagram-label-name">Dynamic Loft</div>
                    <div class="diagram-label-value">${shot.dynamic_loft_deg != null ? shot.dynamic_loft_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="top:6px;right:8px;text-align:right;">
                    <div class="diagram-label-name">Spin Rate</div>
                    <div class="diagram-label-value">${shot.spin_rate_rpm != null ? Math.round(shot.spin_rate_rpm) + ' rpm' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="bottom:6px;left:8px;">
                    <div class="diagram-label-name">Attack Angle</div>
                    <div class="diagram-label-value">${shot.attack_angle_deg != null ? shot.attack_angle_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="bottom:6px;right:8px;text-align:right;">
                    <div class="diagram-label-name">Spin Loft</div>
                    <div class="diagram-label-value">${shot.spin_loft_deg != null ? shot.spin_loft_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
            `;
        } else {
            return `
                <div class="diagram-label" style="top:6px;left:8px;">
                    <div class="diagram-label-name">Club Path</div>
                    <div class="diagram-label-value">${shot.club_path_deg != null ? shot.club_path_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="top:6px;right:8px;text-align:right;">
                    <div class="diagram-label-name">Face To Path</div>
                    <div class="diagram-label-value">${shot.face_to_path_deg != null ? shot.face_to_path_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="bottom:6px;left:8px;">
                    <div class="diagram-label-name">Face Angle</div>
                    <div class="diagram-label-value">${shot.face_angle_deg != null ? shot.face_angle_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
                <div class="diagram-label" style="bottom:6px;right:8px;text-align:right;">
                    <div class="diagram-label-name">Spin Axis</div>
                    <div class="diagram-label-value">${shot.spin_axis_deg != null ? shot.spin_axis_deg.toFixed(1) + '\u00b0' : '\u2014'}</div>
                </div>
            `;
        }
    }

    function drawClubSideView(shot, canvasOverride) {
        const canvas = canvasOverride || document.getElementById('club-side-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, W, H);

        const cx = W * 0.42, cy = H * 0.52;
        const isWood = _isDriver(shot);
        const dynLoft = shot.dynamic_loft_deg;
        const attackAngle = shot.attack_angle_deg;
        const spinLoft = shot.spin_loft_deg;

        // Ground line
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, cy + 30);
        ctx.lineTo(W - 20, cy + 30);
        ctx.stroke();

        // Draw shaft
        const shaftAngle = (dynLoft != null ? -dynLoft * 0.5 : -5) * Math.PI / 180;
        const shaftLen = 80;
        ctx.save();
        ctx.translate(cx, cy - 5);
        ctx.rotate(shaftAngle);
        ctx.fillStyle = '#555';
        ctx.fillRect(-2, -shaftLen, 4, shaftLen);
        // Grip ferrule
        ctx.fillStyle = '#333';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();

        // Draw club head
        ctx.save();
        ctx.translate(cx, cy);
        const headRotation = dynLoft != null ? -dynLoft * Math.PI / 180 * 0.3 : 0;
        ctx.rotate(headRotation);

        if (isWood) {
            // Driver/wood head — rounded shape
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.ellipse(8, 8, 28, 18, 0.15, 0, 2 * Math.PI);
            ctx.fill();
            // Face
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.ellipse(-18, 6, 5, 16, 0.1, 0, 2 * Math.PI);
            ctx.fill();
            // Model text
            const model = _getClubModel(shot);
            if (model) {
                ctx.fillStyle = '#888';
                ctx.font = '7px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(model, 10, 12);
            }
        } else {
            // Iron head — blade shape
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(-5, -12);
            ctx.lineTo(15, -8);
            ctx.lineTo(18, 20);
            ctx.lineTo(-5, 24);
            ctx.lineTo(-10, 0);
            ctx.closePath();
            ctx.fill();
            // Face edge
            ctx.fillStyle = '#666';
            ctx.fillRect(-10, -8, 5, 28);
            // Model text
            const model = _getClubModel(shot);
            if (model) {
                ctx.fillStyle = '#444';
                ctx.font = '6px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(model, 6, 10);
            }
        }
        ctx.restore();

        // Ball
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx + 65, cy + 20, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Angle lines
        const lineStartX = cx - 10;
        const lineStartY = cy + 10;

        // Attack angle line (blue)
        if (attackAngle != null) {
            const aRad = -attackAngle * Math.PI / 180;
            ctx.strokeStyle = '#1565C0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lineStartX - 40, lineStartY - Math.tan(aRad) * -40);
            ctx.lineTo(lineStartX + 50, lineStartY - Math.tan(aRad) * 50);
            ctx.stroke();
        }

        // Dynamic loft line (red) — shows face angle relative to vertical
        if (dynLoft != null) {
            const lRad = -dynLoft * Math.PI / 180;
            ctx.strokeStyle = '#d32f2f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 30);
            ctx.lineTo(cx - 5 + Math.sin(lRad) * 40, cy - 30 + Math.cos(lRad) * 40);
            ctx.stroke();
        }

        // Ball launch line (dashed gray)
        if (shot.launch_angle_deg != null) {
            const laRad = -shot.launch_angle_deg * Math.PI / 180;
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + 50, cy + 20);
            ctx.lineTo(cx + 50 + 80, cy + 20 + Math.tan(laRad) * 80);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Corner labels
        ctx.font = '10px system-ui';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'left';
        ctx.fillText('Dynamic Loft', 8, 16);
        ctx.fillStyle = '#e65100';
        ctx.fillText(dynLoft != null ? dynLoft.toFixed(1) + '\u00b0' : '\u2014', 8, 28);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'right';
        ctx.fillText('Spin Rate', W - 8, 16);
        ctx.fillStyle = '#e65100';
        ctx.fillText(shot.spin_rate_rpm != null ? Math.round(shot.spin_rate_rpm) + ' rpm' : '\u2014', W - 8, 28);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'left';
        ctx.fillText('Attack Angle', 8, H - 10);
        ctx.fillStyle = '#e65100';
        ctx.fillText(attackAngle != null ? attackAngle.toFixed(1) + '\u00b0' : '\u2014', 8, H - 0);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'right';
        ctx.fillText('Spin Loft', W - 8, H - 10);
        ctx.fillStyle = '#e65100';
        ctx.fillText(spinLoft != null ? spinLoft.toFixed(1) + '\u00b0' : '\u2014', W - 8, H - 0);
    }

    function drawClubTopView(shot, canvasOverride) {
        const canvas = canvasOverride || document.getElementById('club-top-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, W, H);

        const cx = W * 0.4, cy = H * 0.5;
        const isWood = _isDriver(shot);
        const clubPath = shot.club_path_deg;
        const faceAngle = shot.face_angle_deg;
        const f2p = shot.face_to_path_deg;
        const spinAxis = shot.spin_axis_deg;

        // Target line (horizontal blue)
        ctx.strokeStyle = '#1565C0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, cy);
        ctx.lineTo(W - 40, cy);
        ctx.stroke();

        // Draw shaft (vertical)
        ctx.fillStyle = '#555';
        ctx.fillRect(cx - 2, cy - 50, 4, 45);
        // Hosel
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(cx, cy - 5, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Draw club head from top
        ctx.save();
        ctx.translate(cx, cy);
        const headRot = faceAngle != null ? faceAngle * Math.PI / 180 * 0.5 : 0;
        ctx.rotate(headRot);

        if (isWood) {
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.ellipse(0, 12, 16, 24, 0, 0, 2 * Math.PI);
            ctx.fill();
            // Face line
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-14, -2);
            ctx.lineTo(14, -2);
            ctx.stroke();
            const model = _getClubModel(shot);
            if (model) {
                ctx.fillStyle = '#777';
                ctx.font = '6px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(model, 0, 18);
            }
        } else {
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(-18, -4);
            ctx.lineTo(18, -4);
            ctx.lineTo(16, 8);
            ctx.lineTo(-16, 8);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-18, -4);
            ctx.lineTo(18, -4);
            ctx.stroke();
            const model = _getClubModel(shot);
            if (model) {
                ctx.fillStyle = '#444';
                ctx.font = '5px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(model, 0, 5);
            }
        }
        ctx.restore();

        // Face angle line (red)
        if (faceAngle != null) {
            const faRad = faceAngle * Math.PI / 180;
            ctx.strokeStyle = '#d32f2f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy + 30);
            ctx.lineTo(cx + Math.sin(faRad) * 50, cy + 30 - Math.cos(faRad) * 50);
            ctx.stroke();
        }

        // Ball
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(W - 55, cy, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Ball launch line (dashed)
        if (shot.launch_direction_deg != null) {
            const ldRad = shot.launch_direction_deg * Math.PI / 180;
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(W - 55, cy);
            ctx.lineTo(W - 55 + 40, cy - Math.sin(ldRad) * 40);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Corner labels
        ctx.font = '10px system-ui';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'left';
        ctx.fillText('Club Path', 8, 16);
        ctx.fillStyle = '#e65100';
        ctx.fillText(clubPath != null ? clubPath.toFixed(1) + '\u00b0' : '\u2014', 8, 28);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'right';
        ctx.fillText('Face To Path', W - 8, 16);
        ctx.fillStyle = '#e65100';
        ctx.fillText(f2p != null ? f2p.toFixed(1) + '\u00b0' : '\u2014', W - 8, 28);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'left';
        ctx.fillText('Face Angle', 8, H - 10);
        ctx.fillStyle = '#e65100';
        ctx.fillText(faceAngle != null ? faceAngle.toFixed(1) + '\u00b0' : '\u2014', 8, H - 0);

        ctx.fillStyle = '#555';
        ctx.textAlign = 'right';
        ctx.fillText('Spin Axis', W - 8, H - 10);
        ctx.fillStyle = '#e65100';
        ctx.fillText(spinAxis != null ? spinAxis.toFixed(1) + '\u00b0' : '\u2014', W - 8, H - 0);
    }

    // Toggle shot highlight from table click
    window._toggleShotHighlight = function(shotId) {
        if (rangeState.compareMode && rangeState.primaryShotId) {
            // Compare mode: clicking sets the compare shot
            if (shotId === rangeState.primaryShotId) return; // Can't compare to self
            if (shotId === rangeState.compareShotId) {
                // Deselect compare shot
                rangeState.compareShotId = null;
                const primary = _getPrimaryShot();
                if (primary) {
                    highlightShots([rangeState.primaryShotId]);
                    showShotPanel(primary);
                }
                updateTableHighlights();
                return;
            }
            // Set new compare shot (replaces previous)
            rangeState.compareShotId = shotId;
            _updateComparePanel();
            return;
        }

        // Normal mode
        if (rangeState.primaryShotId === shotId) {
            // Deselect
            rangeState.primaryShotId = null;
            rangeState.compareShotId = null;
            clearHighlights();
            hideShotPanel();
        } else {
            // Select new primary
            rangeState.primaryShotId = shotId;
            rangeState.compareShotId = null;
            highlightShots([shotId]);
            const shot = rangeState.allShots.find(s => s.id === shotId);
            if (shot) showShotPanel(shot);
        }
    };

    // Chart.js handles its own responsive resize, no manual handler needed

    // ========== Club Detail (Equipment) ==========

    const clubDetailState = {
        club: null,
        allShots: [],
        sourceFilter: 'all',
        visibleColumns: null,
        editColumnsMode: false,
        sortColumn: null,
        sortDirection: null,
        expandedShotId: null,
    };

    const CD_ALL_COLUMNS = [
        { key: 'row_num', label: '#', fmt: null, width: '40px', fixed: true },
        { key: 'date', label: 'Date', fmt: null, width: '90px' },
        { key: 'source', label: 'Source', fmt: null, width: '70px' },
        { key: 'carry_yards', label: 'Carry', fmt: '_fmt' },
        { key: 'total_yards', label: 'Total', fmt: '_fmt' },
        { key: 'distance_yards', label: 'GPS Dist', fmt: '_fmt' },
        { key: 'ball_speed_mph', label: 'Ball Spd', fmt: '_fmt' },
        { key: 'club_speed_mph', label: 'Club Spd', fmt: '_fmt' },
        { key: 'spin_rate_rpm', label: 'Spin', fmt: '_fmtInt' },
        { key: 'launch_angle_deg', label: 'Launch', fmt: '_fmtDeg' },
        { key: 'apex_yards', label: 'Apex', fmt: '_fmt' },
        { key: 'side_carry_yards', label: 'Side', fmt: '_fmtSigned' },
        { key: 'smash_factor', label: 'Smash', fmt: '_fmt2' },
        { key: 'attack_angle_deg', label: 'Attack', fmt: '_fmtDeg' },
        { key: 'club_path_deg', label: 'Club Path', fmt: '_fmtDeg' },
        { key: 'descent_angle_deg', label: 'Descent', fmt: '_fmtDeg' },
        { key: 'face_angle_deg', label: 'Face Ang', fmt: '_fmtDeg' },
        { key: 'face_to_path_deg', label: 'F2P', fmt: '_fmtDeg' },
        { key: 'dynamic_loft_deg', label: 'Dyn Loft', fmt: '_fmtDeg' },
        { key: 'spin_loft_deg', label: 'Spin Loft', fmt: '_fmtDeg' },
        { key: 'swing_plane_deg', label: 'Swing Pl', fmt: '_fmtDeg' },
        { key: 'swing_direction_deg', label: 'Swing Dir', fmt: '_fmtDeg' },
        { key: 'dynamic_lie_deg', label: 'Dyn Lie', fmt: '_fmtDeg' },
        { key: 'impact_offset_in', label: 'Imp Offset', fmt: '_fmt' },
        { key: 'impact_height_in', label: 'Imp Height', fmt: '_fmt' },
        { key: 'low_point_distance_in', label: 'Low Point', fmt: '_fmt' },
        { key: 'curve_yards', label: 'Curve', fmt: '_fmt' },
        { key: 'hang_time_sec', label: 'Hang Time', fmt: '_fmt' },
        { key: 'side_total_yards', label: 'Side Tot', fmt: '_fmtSigned' },
        { key: 'shot_type', label: 'Type', fmt: null },
        { key: 'pin_distance_yards', label: 'Pin Dist', fmt: '_fmt' },
        { key: 'fairway_side_yards', label: 'FW Side', fmt: '_fmtSigned' },
        { key: 'sg_pga', label: 'SG PGA', fmt: '_fmtSigned' },
        { key: 'sg_personal', label: 'SG Pers', fmt: '_fmtSigned' },
    ];

    const CD_DEFAULT_VISIBLE = ['row_num', 'date', 'source', 'carry_yards', 'total_yards', 'distance_yards', 'ball_speed_mph', 'spin_rate_rpm'];
    const CD_COL_MAP = {};
    CD_ALL_COLUMNS.forEach(c => { CD_COL_MAP[c.key] = c; });

    function _loadCDColumnConfig() {
        try {
            const saved = localStorage.getItem('birdie_book_club_detail_columns');
            if (saved) {
                const keys = JSON.parse(saved);
                if (keys.every(k => CD_COL_MAP[k])) return keys;
            }
        } catch (e) { /* ignore */ }
        return [...CD_DEFAULT_VISIBLE];
    }

    function _saveCDColumnConfig() {
        localStorage.setItem('birdie_book_club_detail_columns', JSON.stringify(clubDetailState.visibleColumns));
    }

    clubDetailState.visibleColumns = _loadCDColumnConfig();

    function _cdFmtCell(shot, colKey) {
        if (colKey === 'row_num') return shot._rowNum || '';
        if (colKey === 'date') return shot.date || '\u2014';
        if (colKey === 'source') {
            const labels = { course: 'Course', rapsodo_mlm2pro: 'Range', trackman: 'TM' };
            const colors = { course: '#4CAF50', rapsodo_mlm2pro: '#2196F3', trackman: '#FF9800' };
            const src = shot.source || '';
            return `<span class="source-badge" style="background:${colors[src] || '#888'}; color:#fff; font-size:0.7rem; width:auto; padding:2px 6px;">${labels[src] || src}</span>`;
        }
        if (colKey === 'shot_type') return shot.shot_type || '\u2014';
        const col = CD_COL_MAP[colKey];
        if (!col) return '\u2014';
        const val = shot[colKey];
        if (col.fmt && FORMATTERS[col.fmt]) return FORMATTERS[col.fmt](val);
        return val != null ? val : '\u2014';
    }

    async function loadClubDetailShots(clubId) {
        try {
            const resp = await fetch(`/api/clubs/${clubId}/shots`);
            if (!resp.ok) throw new Error('Club not found');
            const data = await resp.json();

            clubDetailState.club = data.club;
            clubDetailState.allShots = data.shots;
            clubDetailState.sourceFilter = 'all';
            clubDetailState.expandedShotId = null;
            clubDetailState.sortColumn = null;
            clubDetailState.sortDirection = null;

            _renderCDHeader(data);
            _renderCDSourceToggles(data.source_counts);
            _renderCDShots();
        } catch (e) {
            console.error('Failed to load club detail:', e);
            document.getElementById('club-detail-stats').innerHTML = '<div class="empty-state" style="padding:24px;"><p>Failed to load club data.</p></div>';
        }
    }

    function _renderCDHeader(data) {
        const club = data.club;
        const s = club.stats;

        // Header info
        const headerEl = document.getElementById('club-detail-header-info');
        const clubColor = club.color || '#888';
        headerEl.innerHTML = `
            <span class="source-badge" style="background:${clubColor}; color:${_isLightColor(clubColor) ? '#000' : '#fff'}; font-size:0.85rem; width:auto; padding:2px 8px;">${club.club_type}</span>
            <h1 style="margin:0; font-size:1.3rem;">${club.club_type}${club.name ? ` "${club.name}"` : ''}${club.model ? ` <span style="color:var(--text-muted); font-weight:normal;">${club.model}</span>` : ''}</h1>
            <button class="btn btn-ghost btn-sm" onclick="window._editClub(${club.id})" title="Edit club">&#9998;</button>
        `;

        // Stats cards
        const statsEl = document.getElementById('club-detail-stats');
        const src = clubDetailState.sourceFilter;

        // Pick correct stats based on source
        let avgY, medY, maxY, stdY, p10Y, p90Y, countY;
        if (s) {
            if (src === 'course') {
                avgY = s.avg_yards; medY = s.median_yards; maxY = s.max_yards;
                stdY = s.std_dev; p10Y = s.p10; p90Y = s.p90; countY = s.sample_count;
            } else if (src === 'range' || src === 'trackman') {
                avgY = s.range_avg_yards; medY = s.range_median_yards; maxY = s.range_max_yards;
                stdY = s.range_std_dev; p10Y = s.range_p10; p90Y = s.range_p90; countY = s.range_sample_count;
            } else {
                avgY = s.combined_avg_yards; medY = s.combined_median_yards; maxY = s.combined_max_yards;
                stdY = s.combined_std_dev; p10Y = s.combined_p10; p90Y = s.combined_p90; countY = s.combined_sample_count;
            }
        }

        const statCard = (label, val, unit = '') =>
            `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${val != null ? val.toFixed(1) + unit : '\u2014'}</div></div>`;

        let speedAngleHtml = '';
        if (data.avg_ball_speed != null || data.avg_club_speed != null || data.avg_spin_rate != null) {
            speedAngleHtml = `
            <div class="stats-row" style="margin-top:8px;">
                ${statCard('Ball Spd', data.avg_ball_speed, ' mph')}
                ${statCard('Club Spd', data.avg_club_speed, ' mph')}
                ${statCard('Smash', data.avg_smash_factor ? data.avg_smash_factor : null, '')}
                ${statCard('Launch', data.avg_launch_angle, '\u00b0')}
                ${statCard('Attack', data.avg_attack_angle, '\u00b0')}
                ${statCard('Spin', data.avg_spin_rate ? Math.round(data.avg_spin_rate) : null, ' rpm')}
                ${statCard('Club Path', data.avg_club_path, '\u00b0')}
            </div>`;
        }

        // Club specs
        let specsHtml = '';
        const specs = [];
        if (club.loft_deg != null) specs.push(`Loft: ${club.loft_deg}\u00b0`);
        if (club.lie_deg != null) specs.push(`Lie: ${club.lie_deg}\u00b0`);
        if (club.flex) specs.push(`Flex: ${club.flex}`);
        if (club.shaft_length_in != null) specs.push(`Shaft: ${club.shaft_length_in}"`);
        if (specs.length) {
            specsHtml = `<div style="color:var(--text-muted); font-size:0.84rem; margin-top:4px;">${specs.join(' \u00b7 ')}</div>`;
        }

        statsEl.innerHTML = `
            ${statCard('Avg', avgY, ' yds')}
            ${statCard('Median', medY, ' yds')}
            ${statCard('Max', maxY, ' yds')}
            ${statCard('Spread', stdY, '')}
            ${statCard('P10\u2013P90', p10Y != null && p90Y != null ? null : null, '')}
            ${statCard('Shots', countY, '')}
        `;
        // Fix P10-P90 card
        const cards = statsEl.querySelectorAll('.stat-card');
        if (cards[4] && p10Y != null && p90Y != null) {
            cards[4].querySelector('.stat-value').textContent = `${p10Y.toFixed(0)}\u2013${p90Y.toFixed(0)} yds`;
        }

        // Append speed/angle and specs after the stats row
        statsEl.insertAdjacentHTML('afterend', '');
        const afterStats = document.createElement('div');
        afterStats.id = 'club-detail-extra-stats';
        afterStats.innerHTML = speedAngleHtml + specsHtml;
        // Remove old extra stats if any
        const oldExtra = document.getElementById('club-detail-extra-stats');
        if (oldExtra) oldExtra.remove();
        statsEl.parentElement.insertBefore(afterStats, statsEl.nextSibling);
    }

    function _renderCDSourceToggles(sourceCounts) {
        const container = document.getElementById('club-detail-source-toggles');
        if (!container) return;

        const total = (sourceCounts.course || 0) + (sourceCounts.range || 0) + (sourceCounts.trackman || 0);
        const sf = clubDetailState.sourceFilter;

        const sources = [
            { key: 'all', label: 'All', count: total, color: 'var(--accent)' },
            { key: 'course', label: 'Course', count: sourceCounts.course || 0, color: '#4CAF50' },
            { key: 'range', label: 'Range', count: sourceCounts.range || 0, color: '#2196F3' },
            { key: 'trackman', label: 'Trackman', count: sourceCounts.trackman || 0, color: '#FF9800' },
        ];

        container.innerHTML = sources
            .filter(s => s.key === 'all' || s.count > 0)
            .map(s =>
                `<span class="club-toggle${sf === s.key ? ' active' : ''}" data-source="${s.key}" style="--club-color:${s.color};">
                    <span class="club-color-dot" style="background:${s.color};"></span>${s.label} (${s.count})
                </span>`
            ).join('');

        container.querySelectorAll('.club-toggle').forEach(el => {
            el.addEventListener('click', () => {
                clubDetailState.sourceFilter = el.dataset.source;
                _renderCDSourceToggles(sourceCounts);
                _renderCDShots();
            });
        });
    }

    function _getCDFilteredShots() {
        const sf = clubDetailState.sourceFilter;
        if (sf === 'all') return clubDetailState.allShots;
        if (sf === 'range') return clubDetailState.allShots.filter(s => s.source === 'rapsodo_mlm2pro');
        return clubDetailState.allShots.filter(s => s.source === sf);
    }

    function _renderCDShots() {
        const tbody = document.getElementById('club-detail-shots-body');
        const thead = document.getElementById('club-detail-shots-head');
        if (!tbody || !thead) return;

        let shots = _getCDFilteredShots();
        const cols = clubDetailState.visibleColumns;
        const editMode = clubDetailState.editColumnsMode;

        // Update title
        const titleEl = document.getElementById('club-detail-table-title');
        if (titleEl) titleEl.textContent = `All Shots (${shots.length})`;

        if (shots.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No shots found.</td></tr>';
            return;
        }

        // Apply sorting
        let sortedShots = [...shots];
        if (clubDetailState.sortColumn && clubDetailState.sortDirection) {
            const dir = clubDetailState.sortDirection === 'desc' ? -1 : 1;
            sortedShots.sort((a, b) => {
                let va, vb;
                if (clubDetailState.sortColumn === 'date') {
                    va = a.date || ''; vb = b.date || '';
                    return va < vb ? -dir : va > vb ? dir : 0;
                }
                va = a[clubDetailState.sortColumn]; vb = b[clubDetailState.sortColumn];
                va = va != null ? va : -Infinity; vb = vb != null ? vb : -Infinity;
                return (va - vb) * dir;
            });
        }

        // Build header
        const headerCells = cols.map((key, ci) => {
            const col = CD_COL_MAP[key];
            if (!col) return '';
            const sortArrow = clubDetailState.sortColumn === key
                ? (clubDetailState.sortDirection === 'desc' ? ' \u25BC' : ' \u25B2')
                : '';
            const removeBtn = editMode && !col.fixed
                ? `<span class="col-remove" onclick="event.stopPropagation(); window._cdRemoveColumn('${key}')">\u00d7</span>`
                : '';
            const dragAttr = editMode && !col.fixed ? `draggable="true" data-cd-col-idx="${ci}"` : '';
            const style = col.width ? `style="width:${col.width}"` : '';
            return `<th ${style} ${dragAttr} onclick="window._cdSortByColumn('${key}')" class="sortable${editMode ? ' edit-mode' : ''}">${col.label}${sortArrow}${removeBtn}</th>`;
        }).join('');

        const addBtn = editMode
            ? `<th class="col-add-cell"><span class="col-add" onclick="event.stopPropagation(); window._cdShowAddColumn(this)">+</span></th>`
            : '<th></th>';

        thead.innerHTML = headerCells + addBtn;

        // Stats helpers
        const _avgArr = arr => { const c = arr.filter(v => v != null); return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null; };
        const _stdDevArr = arr => { const c = arr.filter(v => v != null); if (c.length < 2) return null; const m = c.reduce((a, b) => a + b, 0) / c.length; return Math.sqrt(c.reduce((s, v) => s + (v - m) ** 2, 0) / (c.length - 1)); };

        // Summary rows
        const avgCells = cols.map(key => {
            if (key === 'row_num') return '<td><strong>Avg</strong></td>';
            if (key === 'date' || key === 'source' || key === 'shot_type') return '<td></td>';
            const val = _avgArr(shots.map(s => s[key]));
            return `<td>${_cdFmtCell({[key]: val}, key)}</td>`;
        }).join('') + '<td></td>';

        const sdCells = cols.map(key => {
            if (key === 'row_num') return '<td><strong>StdDev</strong></td>';
            if (key === 'date' || key === 'source' || key === 'shot_type') return '<td></td>';
            const val = _stdDevArr(shots.map(s => s[key]));
            return `<td>${_cdFmtCell({[key]: val}, key)}</td>`;
        }).join('') + '<td></td>';

        // Shot rows
        const shotRows = sortedShots.map((s, i) => {
            const shot = { ...s, _rowNum: i + 1 };
            const isExpanded = clubDetailState.expandedShotId === s.id;
            const dataCells = cols.map(key => `<td>${_cdFmtCell(shot, key)}</td>`).join('');

            const shotType = s.source === 'trackman' ? 'trackman' : (s.source === 'course' ? 'course' : 'range');
            const moveBtn = `<td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shotType}', ${s.raw_id})" style="font-size:0.8rem; padding:2px 6px;" title="Edit shot">&#9881;</button></td>`;

            let row = `<tr data-shot-id="${s.id}" onclick="window._cdToggleShot('${s.id}')" class="clickable${isExpanded ? ' detail-expanded' : ''}">${dataCells}${moveBtn}</tr>`;

            if (isExpanded) {
                row += _buildCDDetailPanel(shot, cols.length + 1);
            }
            return row;
        }).join('');

        tbody.innerHTML = `
            <tr class="summary-row summary-avg">${avgCells}</tr>
            <tr class="summary-row summary-sd">${sdCells}</tr>
            ${shotRows}
        `;

        // Attach drag handlers if in edit mode
        if (editMode) _attachCDDragHandlers();
    }

    function _buildCDDetailPanel(shot, colSpan) {
        let sections;
        if (shot.source === 'course') {
            // Course-specific detail panel
            const lieTransition = (shot.start_lie && shot.end_lie) ? `${shot.start_lie} \u2192 ${shot.end_lie}` : (shot.start_lie || '\u2014');
            const fwHit = shot.fairway_side === 'CENTER' ? '\u2713 Hit' : (shot.fairway_side === 'L' ? '\u2190 Left' : (shot.fairway_side === 'R' ? '\u2192 Right' : '\u2014'));
            const sgFmt = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) : '\u2014';

            sections = [
                { title: 'Info', fields: [
                    ['Type', shot.shot_type || '\u2014'],
                    ['Lie', lieTransition],
                    ['Hole', shot.hole_number || '\u2014'],
                ]},
                { title: 'Distance', fields: [
                    ['GPS Distance', _fmt(shot.distance_yards) + ' yds'],
                    ['Useful Dist', _fmt(shot.fairway_progress_yards) + ' yds'],
                    ['Pin Remaining', _fmt(shot.pin_distance_yards) + ' yds'],
                ]},
                { title: 'Accuracy', fields: [
                    ['Side from FW', _fmtSigned(shot.fairway_side_yards) + ' yds'],
                    ['Fairway', fwHit],
                    ['Green Prox', _fmt(shot.green_distance_yards) + ' yds'],
                    ['On Green', shot.on_green != null ? (shot.on_green ? 'Yes' : 'No') : '\u2014'],
                ]},
                { title: 'Hazards', fields: [
                    ['Nearest', shot.nearest_hazard_name || shot.nearest_hazard_type || '\u2014'],
                    ['Distance', _fmt(shot.nearest_hazard_yards) + ' yds'],
                ]},
                { title: 'Strokes Gained', fields: [
                    ['SG vs PGA', sgFmt(shot.sg_pga)],
                    ['SG vs Personal', sgFmt(shot.sg_personal)],
                ]},
            ];
        } else {
            // Range/Trackman detail panel (reuse existing pattern)
            sections = [
                { title: 'Flight', fields: [
                    ['Carry', _fmt(shot.carry_yards)], ['Total', _fmt(shot.total_yards)],
                    ['Side', _fmtSigned(shot.side_carry_yards)], ['Side Tot', _fmtSigned(shot.side_total_yards)],
                    ['Apex', _fmt(shot.apex_yards)], ['Curve', _fmt(shot.curve_yards)],
                    ['Hang Time', shot.hang_time_sec != null ? shot.hang_time_sec.toFixed(1) + 's' : '\u2014'],
                    ['Descent', _fmtDeg(shot.descent_angle_deg || shot.landing_angle_deg)],
                ]},
                { title: 'Club & Swing', fields: [
                    ['Club Spd', _fmt(shot.club_speed_mph)], ['Ball Spd', _fmt(shot.ball_speed_mph)],
                    ['Smash', _fmt2(shot.smash_factor)], ['Attack', _fmtDeg(shot.attack_angle_deg)],
                    ['Club Path', _fmtDeg(shot.club_path_deg)], ['Face Ang', _fmtDeg(shot.face_angle_deg)],
                    ['F2P', _fmtDeg(shot.face_to_path_deg)], ['Dyn Loft', _fmtDeg(shot.dynamic_loft_deg)],
                    ['Spin Loft', _fmtDeg(shot.spin_loft_deg)], ['Swing Pl', _fmtDeg(shot.swing_plane_deg)],
                    ['Swing Dir', _fmtDeg(shot.swing_direction_deg)], ['Dyn Lie', _fmtDeg(shot.dynamic_lie_deg)],
                ]},
                { title: 'Impact', fields: [
                    ['Offset', _fmt(shot.impact_offset_in)], ['Height', _fmt(shot.impact_height_in)],
                    ['Low Point', _fmt(shot.low_point_distance_in)],
                ]},
                { title: 'Spin', fields: [
                    ['Rate', _fmtInt(shot.spin_rate_rpm)], ['Axis', _fmtDeg(shot.spin_axis_deg)],
                    ['Launch', _fmtDeg(shot.launch_angle_deg)], ['Launch Dir', _fmtDeg(shot.launch_direction_deg)],
                ]},
            ];
        }

        const html = sections.map(sec => `
            <div class="detail-section">
                <div class="detail-section-title">${sec.title}</div>
                <div class="detail-grid">
                    ${sec.fields.map(([label, val]) => `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${val}</span></div>`).join('')}
                </div>
            </div>
        `).join('');

        const shotType = shot.source === 'trackman' ? 'trackman' : (shot.source === 'course' ? 'course' : 'range');
        const viewRoundBtn = shot.source === 'course' && shot.round_id
            ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); location.hash='round/${shot.round_id}/hole/${shot.hole_number || 1}'" style="font-size:0.75rem;">View Hole</button>`
            : '';
        return `<tr class="detail-panel-row"><td colspan="${colSpan}"><div class="shot-detail-panel">${html}
            <div style="text-align:right; margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                ${viewRoundBtn}
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shotType}', ${shot.raw_id})" style="font-size:0.8rem; padding:2px 6px;" title="Edit shot">&#9881;</button>
            </div>
        </div></td></tr>`;
    }

    // ── Club Detail interaction handlers ──

    window._cdToggleShot = function(shotId) {
        clubDetailState.expandedShotId = clubDetailState.expandedShotId === shotId ? null : shotId;
        _renderCDShots();
    };

    window._cdSortByColumn = function(key) {
        if (clubDetailState.sortColumn === key) {
            clubDetailState.sortDirection = clubDetailState.sortDirection === 'desc' ? 'asc' : (clubDetailState.sortDirection === 'asc' ? null : 'desc');
            if (!clubDetailState.sortDirection) clubDetailState.sortColumn = null;
        } else {
            clubDetailState.sortColumn = key;
            clubDetailState.sortDirection = 'desc';
        }
        _renderCDShots();
    };

    window._toggleClubDetailEditColumns = function() {
        clubDetailState.editColumnsMode = !clubDetailState.editColumnsMode;
        _renderCDShots();
    };

    window._cdRemoveColumn = function(key) {
        clubDetailState.visibleColumns = clubDetailState.visibleColumns.filter(k => k !== key);
        _saveCDColumnConfig();
        _renderCDShots();
    };

    window._cdShowAddColumn = function(el) {
        document.querySelectorAll('.col-add-dropdown').forEach(d => d.remove());
        const hidden = CD_ALL_COLUMNS.filter(c => !c.fixed && !clubDetailState.visibleColumns.includes(c.key));
        if (hidden.length === 0) return;

        const dd = document.createElement('div');
        dd.className = 'col-add-dropdown';
        dd.innerHTML = hidden.map(c =>
            `<div class="col-add-option" onclick="window._cdAddColumn('${c.key}')">${c.label}</div>`
        ).join('');
        el.parentElement.appendChild(dd);
    };

    window._cdAddColumn = function(key) {
        if (!clubDetailState.visibleColumns.includes(key)) {
            clubDetailState.visibleColumns.push(key);
            _saveCDColumnConfig();
        }
        document.querySelectorAll('.col-add-dropdown').forEach(d => d.remove());
        _renderCDShots();
    };

    function _attachCDDragHandlers() {
        const headers = document.querySelectorAll('#club-detail-shots-head th[draggable]');
        headers.forEach(th => {
            th.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', th.dataset.cdColIdx);
                th.classList.add('dragging');
            });
            th.addEventListener('dragend', () => th.classList.remove('dragging'));
            th.addEventListener('dragover', e => { e.preventDefault(); th.classList.add('drag-over'); });
            th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
            th.addEventListener('drop', e => {
                e.preventDefault();
                th.classList.remove('drag-over');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const toIdx = parseInt(th.dataset.cdColIdx);
                if (fromIdx === toIdx) return;
                const cols = clubDetailState.visibleColumns;
                const [moved] = cols.splice(fromIdx, 1);
                cols.splice(toIdx, 0, moved);
                _saveCDColumnConfig();
                _renderCDShots();
            });
        });
    }

    // ========== Status Helpers ==========
    function autoDismiss(el, delay = 4000) {
        el.style.transition = 'opacity 0.4s ease';
        el.style.opacity = '1';
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 400);
        }, delay);
    }

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = `status status-${type}`;
        statusMsg.style.display = 'block';
        autoDismiss(statusMsg);
    }

    function hideStatus() {
        statusMsg.style.display = 'none';
    }

    // ========== API Usage Tracker ==========
    async function loadApiUsage() {
        try {
            const resp = await fetch('/api/usage');
            const data = await resp.json();
            const el = document.getElementById('api-usage');
            if (!el) return;

            const services = data.services || {};
            const lines = [];
            const labels = {
                golf_course_api: 'Golf API',
                google_places: 'Places',
                google_maps_static: 'Maps',
            };

            for (const [key, info] of Object.entries(services)) {
                const label = labels[key] || key;
                const pct = info.daily_limit > 0 ? (info.calls_today / info.daily_limit) * 100 : 0;
                let cls = '';
                if (pct >= 90) cls = ' usage-danger';
                else if (pct >= 70) cls = ' usage-warn';
                lines.push(`<div class="usage-line${cls}"><span>${label}</span><span>${info.calls_today}/${info.daily_limit}</span></div>`);
            }

            el.innerHTML = lines.join('');
        } catch (e) { /* ignore */ }
    }

    // ========== Settings: Clear Data ==========
    const btnClearData = document.getElementById('btn-clear-data');
    const clearDataStatus = document.getElementById('clear-data-status');

    if (btnClearData) {
        btnClearData.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete ALL data? This cannot be undone.')) return;
            if (!confirm('This will permanently erase all rounds, courses, clubs, range sessions, and shots. Continue?')) return;

            btnClearData.disabled = true;
            btnClearData.textContent = 'Clearing...';

            try {
                const resp = await fetch('/api/settings/clear-data', { method: 'POST' });
                if (!resp.ok) throw new Error('Failed to clear data');
                clearDataStatus.textContent = 'All data cleared successfully.';
                clearDataStatus.className = 'status status-success';
                clearDataStatus.style.display = 'block';
                autoDismiss(clearDataStatus, 4000);
                loadAllData();
            } catch (e) {
                clearDataStatus.textContent = 'Error: ' + e.message;
                clearDataStatus.className = 'status status-error';
                clearDataStatus.style.display = 'block';
            } finally {
                btnClearData.disabled = false;
                btnClearData.textContent = 'Clear All Data';
            }
        });
    }

    // ========== Settings: Default Tee Preference ==========
    const defaultTeeSelect = document.getElementById('settings-default-tee');
    if (defaultTeeSelect) {
        // Load saved preference
        defaultTeeSelect.value = localStorage.getItem('birdie_book_default_tee') || '';
        // Save on change
        defaultTeeSelect.addEventListener('change', () => {
            localStorage.setItem('birdie_book_default_tee', defaultTeeSelect.value);
        });
    }

    // ========== Settings: Rebuild Personal Baseline ==========
    const btnRebuildBaseline = document.getElementById('btn-rebuild-baseline');
    const rebuildBaselineStatus = document.getElementById('rebuild-baseline-status');

    if (btnRebuildBaseline) {
        btnRebuildBaseline.addEventListener('click', async () => {
            btnRebuildBaseline.disabled = true;
            btnRebuildBaseline.textContent = 'Rebuilding...';

            try {
                const resp = await fetch('/api/settings/rebuild-personal-baseline', { method: 'POST' });
                if (!resp.ok) throw new Error('Failed to rebuild baseline');
                const data = await resp.json();
                rebuildBaselineStatus.textContent = `Baseline rebuilt: ${data.shot_count} shots, ${data.bucket_count} buckets, ${data.shots_updated} shots updated.`;
                rebuildBaselineStatus.className = 'status status-success';
                rebuildBaselineStatus.style.display = 'block';
                autoDismiss(rebuildBaselineStatus, 5000);
            } catch (e) {
                rebuildBaselineStatus.textContent = 'Error: ' + e.message;
                rebuildBaselineStatus.className = 'status status-error';
                rebuildBaselineStatus.style.display = 'block';
            } finally {
                btnRebuildBaseline.disabled = false;
                btnRebuildBaseline.textContent = 'Rebuild Personal Baseline';
            }
        });
    }

    // ========== Strokes Gained ==========

    const SG_COLORS = {
        off_the_tee: '#3b82f6',   // blue
        approach: '#f59e0b',       // amber
        short_game: '#10b981',     // emerald
        putting: '#8b5cf6',        // violet
    };
    const SG_LABELS = {
        off_the_tee: 'Off the Tee',
        approach: 'Approach',
        short_game: 'Short Game',
        putting: 'Putting',
    };
    const SG_STAT_IDS = {
        off_the_tee: 'sg-stat-ott',
        approach: 'sg-stat-app',
        short_game: 'sg-stat-sg',
        putting: 'sg-stat-putt',
    };

    let sgTrendChart = null;
    let sgOverallCache = null;
    let sgTrendsCache = null;

    function _sgVal(v) {
        if (v == null) return '--';
        const s = v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
        return s;
    }

    function _sgColor(v) {
        if (v == null || v === 0) return 'var(--text-muted)';
        return v > 0 ? '#22c55e' : '#ef4444';
    }

    // Dashboard summary card
    async function loadSGSummary() {
        try {
            const resp = await fetch('/api/stats/strokes-gained');
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.round_count) return;

            const card = document.getElementById('sg-summary-card');
            const insightEl = document.getElementById('sg-summary-insight');
            const barsEl = document.getElementById('sg-summary-bars');
            if (!card) return;

            // Insight text
            const opp = data.biggest_opportunity_pga;
            if (opp && data.overall[opp]) {
                const val = data.overall[opp].sg_pga_per_round;
                const label = SG_LABELS[opp] || opp;
                insightEl.innerHTML = `Your biggest opportunity is <strong>${label}</strong>, costing <strong style="color:#ef4444">${Math.abs(val).toFixed(1)}</strong> strokes/round vs PGA`;
            }

            // Bars
            const cats = ['off_the_tee', 'approach', 'short_game', 'putting'];
            const maxAbs = Math.max(...cats.map(c => Math.abs(data.overall[c]?.sg_pga_per_round || 0)), 0.5);
            barsEl.innerHTML = cats.map(cat => {
                const v = data.overall[cat]?.sg_pga_per_round || 0;
                const pct = Math.min(Math.abs(v) / maxAbs * 100, 100);
                const color = v >= 0 ? '#22c55e' : '#ef4444';
                const sign = v >= 0 ? '+' : '';
                return `<div style="display:flex; align-items:center; margin-bottom:6px; gap:10px;">
                    <span style="width:90px; font-size:0.8rem; color:var(--text-muted); flex-shrink:0;">${SG_LABELS[cat]}</span>
                    <div style="flex:1; background:var(--bg-hover); border-radius:4px; height:18px; overflow:hidden;">
                        <div style="width:${pct}%; background:${color}; height:100%; border-radius:4px; transition:width 0.3s;"></div>
                    </div>
                    <span style="width:50px; text-align:right; font-size:0.82rem; font-weight:600; color:${color}; flex-shrink:0;">${sign}${v.toFixed(1)}</span>
                </div>`;
            }).join('');

            card.style.display = '';
            card.onclick = () => { window.location.hash = 'strokes-gained'; };
        } catch (e) {
            console.error('Failed to load SG summary:', e);
        }
    }

    // Full strokes gained page
    async function loadStrokesGained() {
        try {
            const [overallResp, trendsResp] = await Promise.all([
                fetch('/api/stats/strokes-gained'),
                fetch('/api/stats/strokes-gained/trends'),
            ]);
            sgOverallCache = await overallResp.json();
            sgTrendsCache = await trendsResp.json();

            renderSGCategoryCards();
            renderSGTrendsChart();
            renderSGRoundTable();
            loadSGClubBreakdown();
        } catch (e) {
            console.error('Failed to load strokes gained:', e);
        }
    }

    function renderSGCategoryCards() {
        if (!sgOverallCache?.overall) return;
        const baseline = document.getElementById('sg-baseline-select')?.value || 'pga';
        const field = baseline === 'pga' ? 'sg_pga_per_round' : 'sg_personal_per_round';

        for (const cat of ['off_the_tee', 'approach', 'short_game', 'putting']) {
            const el = document.getElementById(SG_STAT_IDS[cat]);
            if (!el) continue;
            const v = sgOverallCache.overall[cat]?.[field] ?? null;
            el.textContent = _sgVal(v);
            el.style.color = _sgColor(v);
        }
    }

    // Track which categories are hidden (persists across re-renders)
    const sgHiddenCats = new Set();

    function renderSGTrendsChart() {
        if (!sgTrendsCache || !sgTrendsCache.raw.length) {
            if (sgTrendChart) { sgTrendChart.destroy(); sgTrendChart = null; }
            return;
        }

        const canvas = document.getElementById('sg-trends-chart');
        if (!canvas) return;
        if (sgTrendChart) { sgTrendChart.destroy(); sgTrendChart = null; }

        const baseline = document.getElementById('sg-baseline-select')?.value || 'pga';
        const axisMode = document.getElementById('sg-trend-axis')?.value || 'date';
        const rangeMonths = document.getElementById('sg-trend-range')?.value || 'all';
        const roundRange = document.getElementById('sg-trend-round-range')?.value || 'all';
        const cats = ['off_the_tee', 'approach', 'short_game', 'putting'];
        const visibleCats = cats.filter(c => !sgHiddenCats.has(c));

        const allRaw = sgTrendsCache.raw;

        // Determine which data to show based on axis mode
        let raw;
        if (axisMode === 'rounds' && roundRange !== 'all') {
            raw = allRaw.slice(-parseInt(roundRange));
        } else {
            raw = allRaw;
        }

        // Date mode: determine x-axis bounds
        const now = new Date();
        let xMin = null;
        const xMax = now.toISOString().slice(0, 10);
        if (axisMode === 'date' && rangeMonths !== 'all') {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - parseInt(rangeMonths));
            xMin = cutoff.toISOString().slice(0, 10);
        }

        // Helpers: build points based on axis mode
        const key = (cat) => baseline === 'personal' ? cat + '_personal' : cat;

        function buildPoints(series, cat) {
            if (axisMode === 'rounds') {
                return series.map((p, i) => ({ x: i + 1, y: p[key(cat)] }));
            }
            const pts = series.map(p => ({ x: p.date, y: p[key(cat)] }));
            if (pts.length > 0 && pts[pts.length - 1].x < xMax) {
                pts.push({ x: xMax, y: pts[pts.length - 1].y });
            }
            return pts;
        }

        function buildCumulativeAvg(series, cat) {
            let sum = 0;
            const pts = series.map((p, i) => {
                sum += (p[key(cat)] || 0);
                const y = Math.round((sum / (i + 1)) * 100) / 100;
                return axisMode === 'rounds' ? { x: i + 1, y } : { x: p.date, y };
            });
            if (axisMode === 'date' && pts.length > 0 && pts[pts.length - 1].x < xMax) {
                pts.push({ x: xMax, y: pts[pts.length - 1].y });
            }
            return pts;
        }

        const datasets = [];

        // Solid lines = cumulative average
        for (const cat of visibleCats) {
            const pts = buildCumulativeAvg(raw, cat);
            const radii = pts.map((_, i) => i < raw.length ? 3 : 0);
            datasets.push({
                label: SG_LABELS[cat],
                data: pts,
                borderColor: SG_COLORS[cat],
                backgroundColor: SG_COLORS[cat] + '33',
                borderWidth: 2.5,
                pointRadius: radii,
                pointHoverRadius: 5,
                tension: 0.3,
                fill: false,
            });
        }

        // Dashed lines = per-round values, with best/worst highlights
        const bestRounds = sgTrendsCache.best_rounds || {};
        const worstRounds = sgTrendsCache.worst_rounds || {};
        for (const cat of visibleCats) {
            const pts = buildPoints(raw, cat);
            const bestId = bestRounds[cat]?.round_id;
            const worstId = worstRounds[cat]?.round_id;
            const radii = pts.map((_, i) => {
                if (i >= raw.length) return 0;
                const rid = raw[i]?.round_id;
                if (rid === bestId || rid === worstId) return 6;
                return 2;
            });
            const bgColors = pts.map((_, i) => {
                if (i >= raw.length) return 'transparent';
                const rid = raw[i]?.round_id;
                if (rid === bestId) return '#22c55e';
                if (rid === worstId) return '#ef4444';
                return SG_COLORS[cat] + '99';
            });
            const borderColors = pts.map((_, i) => {
                if (i >= raw.length) return 'transparent';
                const rid = raw[i]?.round_id;
                if (rid === bestId) return '#22c55e';
                if (rid === worstId) return '#ef4444';
                return SG_COLORS[cat] + '66';
            });
            datasets.push({
                label: `${SG_LABELS[cat]} (per round)`,
                data: pts,
                borderColor: SG_COLORS[cat] + '66',
                borderWidth: 1,
                borderDash: [4, 3],
                pointRadius: radii,
                pointHoverRadius: 6,
                pointBackgroundColor: bgColors,
                pointBorderColor: borderColors,
                pointBorderWidth: pts.map((_, i) => {
                    if (i >= raw.length) return 0;
                    const rid = raw[i]?.round_id;
                    return (rid === bestId || rid === worstId) ? 2 : 0;
                }),
                tension: 0.2,
                fill: false,
            });
        }

        // Render clickable custom legend
        const legendEl = document.getElementById('sg-trends-legend');
        if (legendEl) {
            let legendHtml = '';
            for (const cat of cats) {
                const hidden = sgHiddenCats.has(cat);
                const opacity = hidden ? '0.3' : '1';
                legendHtml += `<span class="sg-legend-item" data-cat="${cat}" style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; opacity:${opacity}; user-select:none;">
                    <span style="width:14px; height:3px; background:${SG_COLORS[cat]}; border-radius:2px; display:inline-block;"></span>
                    <span style="color:var(--text-muted);">${SG_LABELS[cat]}</span>
                </span>`;
            }
            legendHtml += `<span style="display:inline-flex; align-items:center; gap:6px; margin-left:8px; padding-left:12px; border-left:1px solid var(--border);">`;
            legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;">
                <span style="width:14px; height:3px; background:var(--text-muted); border-radius:2px; display:inline-block;"></span>
                <span style="color:var(--text-dim);">Cumulative avg</span>
            </span>`;
            legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;">
                <span style="width:14px; height:0; border-top:2px dashed var(--text-muted); display:inline-block;"></span>
                <span style="color:var(--text-dim);">Per round</span>
            </span>`;
            legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;">
                <span style="width:8px; height:8px; background:#22c55e; border-radius:50%; display:inline-block;"></span>
                <span style="color:var(--text-dim);">Best</span>
            </span>`;
            legendHtml += `<span style="display:inline-flex; align-items:center; gap:4px;">
                <span style="width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block;"></span>
                <span style="color:var(--text-dim);">Worst</span>
            </span>`;
            legendHtml += `</span>`;
            legendEl.innerHTML = legendHtml;

            // Attach click handlers to legend items
            legendEl.querySelectorAll('.sg-legend-item').forEach(el => {
                el.addEventListener('click', () => {
                    const cat = el.dataset.cat;
                    if (sgHiddenCats.has(cat)) sgHiddenCats.delete(cat);
                    else sgHiddenCats.add(cat);
                    renderSGTrendsChart();
                });
            });
        }

        // X-axis config
        let xAxisConfig;
        if (axisMode === 'rounds') {
            xAxisConfig = {
                type: 'linear',
                ticks: {
                    color: '#64748b',
                    font: { size: 11 },
                    stepSize: 1,
                    callback: v => `R${v}`,
                },
                title: { display: true, text: 'Round', color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
        } else {
            xAxisConfig = {
                type: 'time',
                time: {
                    unit: rangeMonths === '1' ? 'week' : 'month',
                    displayFormats: { week: 'MMM d', month: 'MMM yyyy' },
                    tooltipFormat: 'MMM d, yyyy',
                },
                ticks: { color: '#64748b', maxRotation: 45, font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
            if (xMin) xAxisConfig.min = xMin;
            xAxisConfig.max = xMax;
        }

        sgTrendChart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const el = elements[0];
                    const idx = el.index;
                    if (idx >= 0 && idx < raw.length) {
                        const roundId = raw[idx].round_id;
                        if (roundId) window.location.hash = `round/${roundId}`;
                    }
                },
                onHover: (evt, elements) => {
                    evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        callbacks: {
                            title: ctxs => {
                                if (axisMode === 'rounds' && ctxs[0]) {
                                    const i = ctxs[0].dataIndex;
                                    const pt = raw[i];
                                    return pt ? `Round ${ctxs[0].raw.x} — ${new Date(pt.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'2-digit'})}` : `Round ${ctxs[0].raw.x}`;
                                }
                                return undefined;  // default
                            },
                            label: ctx => {
                                const v = ctx.raw?.y;
                                if (v == null) return '';
                                const sign = v >= 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${sign}${v.toFixed(2)}`;
                            }
                        }
                    },
                },
                scales: {
                    x: xAxisConfig,
                    y: {
                        ticks: {
                            color: '#64748b',
                            callback: v => (v >= 0 ? '+' : '') + v.toFixed(1),
                            font: { size: 11 },
                        },
                        grid: { color: '#1e293b' },
                    },
                },
            },
        });
    }

    function renderSGRoundTable() {
        const container = document.getElementById('sg-round-table');
        if (!container || !sgOverallCache?.per_round?.length) {
            if (container) container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
            return;
        }

        const baseline = document.getElementById('sg-baseline-select')?.value || 'pga';
        const field = baseline === 'pga' ? 'sg_pga' : 'sg_personal';
        const rounds = [...sgOverallCache.per_round].reverse(); // most recent first

        const header = `<tr>
            <th>Date</th><th>Course</th>
            <th style="text-align:right">OTT</th><th style="text-align:right">APP</th>
            <th style="text-align:right">SG</th><th style="text-align:right">PUTT</th>
            <th style="text-align:right">Total</th>
        </tr>`;

        const rows = rounds.map(r => {
            const ott = r.off_the_tee?.[field] ?? null;
            const app = r.approach?.[field] ?? null;
            const sg = r.short_game?.[field] ?? null;
            const putt = r.putting?.[field] ?? null;
            const total = baseline === 'pga' ? r.total_sg_pga : r.total_sg_personal;
            const d = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            return `<tr onclick="location.hash='round/${r.round_id}'" style="cursor:pointer;">
                <td>${d}</td>
                <td>${r.course_name || ''}</td>
                <td style="text-align:right; color:${_sgColor(ott)}">${_sgVal(ott)}</td>
                <td style="text-align:right; color:${_sgColor(app)}">${_sgVal(app)}</td>
                <td style="text-align:right; color:${_sgColor(sg)}">${_sgVal(sg)}</td>
                <td style="text-align:right; color:${_sgColor(putt)}">${_sgVal(putt)}</td>
                <td style="text-align:right; font-weight:600; color:${_sgColor(total)}">${_sgVal(total)}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<table class="data-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    }

    async function loadSGClubBreakdown() {
        const catFilter = document.getElementById('sg-club-category-filter')?.value || '';
        const params = new URLSearchParams();
        if (catFilter) params.set('category', catFilter);

        const container = document.getElementById('sg-club-breakdown');
        if (!container) return;

        try {
            const resp = await fetch(`/api/stats/strokes-gained/by-club?${params}`);
            const data = await resp.json();

            const minShots = parseInt(document.getElementById('sg-club-min-shots')?.value || '0');
            data.clubs = data.clubs.filter(c => c.shot_count >= (minShots || 0));

            if (!data.clubs?.length) {
                container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
                return;
            }

            const baseline = document.getElementById('sg-baseline-select')?.value || 'pga';
            const clubs = [...data.clubs].sort((a, b) => {
                const av = baseline === 'pga' ? a.sg_pga_per_shot : a.sg_personal_per_shot;
                const bv = baseline === 'pga' ? b.sg_pga_per_shot : b.sg_personal_per_shot;
                if (av == null && bv == null) return 0;
                if (av == null) return 1;  // nulls to end
                if (bv == null) return -1;
                return av - bv;
            });
            const maxAbs = Math.max(...clubs.map(c => Math.abs(baseline === 'pga' ? c.sg_pga_per_shot : c.sg_personal_per_shot)), 0.1);

            container.innerHTML = `<div style="padding:0 20px 20px;">
                ${clubs.map(c => {
                    const v = baseline === 'pga' ? c.sg_pga_per_shot : c.sg_personal_per_shot;
                    if (v == null) {
                        return `<div style="display:flex; align-items:center; margin-bottom:6px; gap:10px;">
                            <span style="width:100px; font-size:0.82rem; color:var(--text); flex-shrink:0;">${c.club_name || 'Unknown'}</span>
                            <span style="width:70px; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${SG_LABELS[c.category] || c.category}</span>
                            <div style="flex:1; background:var(--bg-hover); border-radius:4px; height:16px; overflow:hidden;"></div>
                            <span style="width:55px; text-align:right; font-size:0.8rem; color:var(--text-dim); flex-shrink:0;">--</span>
                            <span style="width:50px; text-align:right; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${c.shot_count} shots</span>
                        </div>`;
                    }
                    const pct = Math.min(Math.abs(v) / maxAbs * 100, 100);
                    const color = v >= 0 ? '#22c55e' : '#ef4444';
                    const sign = v >= 0 ? '+' : '';
                    return `<div style="display:flex; align-items:center; margin-bottom:6px; gap:10px;">
                        <span style="width:100px; font-size:0.82rem; color:var(--text); flex-shrink:0;">${c.club_name || 'Unknown'}</span>
                        <span style="width:70px; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${SG_LABELS[c.category] || c.category}</span>
                        <div style="flex:1; background:var(--bg-hover); border-radius:4px; height:16px; overflow:hidden;">
                            <div style="width:${pct}%; background:${color}; height:100%; border-radius:4px;"></div>
                        </div>
                        <span style="width:55px; text-align:right; font-size:0.8rem; font-weight:600; color:${color}; flex-shrink:0;">${sign}${v.toFixed(3)}</span>
                        <span style="width:50px; text-align:right; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${c.shot_count} shots</span>
                    </div>`;
                }).join('')}
            </div>`;
        } catch (e) {
            console.error('Failed to load SG by club:', e);
            container.innerHTML = '<div class="empty-state"><p>Failed to load</p></div>';
        }
    }

    // SG event listeners
    document.getElementById('sg-baseline-select')?.addEventListener('change', () => {
        renderSGCategoryCards();
        renderSGTrendsChart();
        renderSGRoundTable();
        loadSGClubBreakdown();
    });
    document.getElementById('sg-club-category-filter')?.addEventListener('change', () => loadSGClubBreakdown());
    document.getElementById('sg-club-min-shots')?.addEventListener('change', () => loadSGClubBreakdown());
    document.getElementById('sg-trend-range')?.addEventListener('change', () => renderSGTrendsChart());
    document.getElementById('sg-trend-round-range')?.addEventListener('change', () => renderSGTrendsChart());
    document.getElementById('sg-trend-axis')?.addEventListener('change', () => {
        const mode = document.getElementById('sg-trend-axis')?.value;
        document.getElementById('sg-trend-range').style.display = mode === 'date' ? '' : 'none';
        document.getElementById('sg-trend-round-range').style.display = mode === 'rounds' ? '' : 'none';
        renderSGTrendsChart();
    });

    // ========== Scoring Stats ==========

    let scTrendChart = null;
    let scDataCache = null;

    async function loadScoringSummary() {
        try {
            const resp = await fetch('/api/stats/scoring');
            if (!resp.ok) return;
            const data = await resp.json();
            const card = document.getElementById('scoring-summary-card');
            if (!card) return;

            document.getElementById('dash-gir').textContent = data.gir_pct != null ? data.gir_pct + '%' : '--';
            document.getElementById('dash-fw').textContent = data.fairway_pct != null ? data.fairway_pct + '%' : '--';
            document.getElementById('dash-putts').textContent = data.avg_putts_per_hole != null ? data.avg_putts_per_hole.toFixed(2) : '--';
            document.getElementById('dash-scramble').textContent = data.scramble_pct != null ? data.scramble_pct + '%' : '--';
            document.getElementById('dash-3putt').textContent = data.three_putt_pct != null ? data.three_putt_pct + '%' : '--';
            card.style.display = '';
        } catch (e) {
            console.error('Failed to load scoring summary:', e);
        }
    }

    async function loadScoringStats() {
        try {
            const resp = await fetch('/api/stats/scoring');
            if (!resp.ok) return;
            scDataCache = await resp.json();

            // Stat cards
            document.getElementById('sc-gir').textContent = scDataCache.gir_pct != null ? scDataCache.gir_pct + '%' : '--';
            document.getElementById('sc-fw').textContent = scDataCache.fairway_pct != null ? scDataCache.fairway_pct + '%' : '--';
            document.getElementById('sc-putts').textContent = scDataCache.avg_putts_per_hole != null ? scDataCache.avg_putts_per_hole.toFixed(2) : '--';
            document.getElementById('sc-putts-gir').textContent = scDataCache.putts_per_gir != null ? scDataCache.putts_per_gir.toFixed(2) : '--';
            document.getElementById('sc-scramble').textContent = scDataCache.scramble_pct != null ? scDataCache.scramble_pct + '%' : '--';
            document.getElementById('sc-3putt').textContent = scDataCache.three_putt_pct != null ? scDataCache.three_putt_pct + '%' : '--';

            renderScTrendChart();
            renderScDistribution();
            renderScParBreakdown();
            renderScDistTrendChart();
            renderScRoundTable();
        } catch (e) {
            console.error('Failed to load scoring stats:', e);
        }
    }

    function renderScTrendChart() {
        const canvas = document.getElementById('sc-trend-chart');
        if (!canvas || !scDataCache?.per_round?.length) return;
        if (scTrendChart) { scTrendChart.destroy(); scTrendChart = null; }

        const axisMode = document.getElementById('sc-trend-axis')?.value || 'date';
        const rangeMonths = document.getElementById('sc-trend-range')?.value || 'all';
        const roundRange = document.getElementById('sc-trend-round-range')?.value || 'all';

        let allRounds = scDataCache.per_round;
        if (axisMode === 'rounds' && roundRange !== 'all') {
            allRounds = allRounds.slice(-parseInt(roundRange));
        }

        const now = new Date();
        const xMax = now.toISOString().slice(0, 10);
        let xMin = null;
        if (axisMode === 'date' && rangeMonths !== 'all') {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - parseInt(rangeMonths));
            xMin = cutoff.toISOString().slice(0, 10);
        }

        const pt = (r, i, val) => axisMode === 'rounds' ? { x: i + 1, y: val } : { x: r.date, y: val };

        // Cumulative average
        let sum = 0;
        const avgData = allRounds.map((r, i) => {
            sum += r.score_vs_par;
            return pt(r, i, Math.round((sum / (i + 1)) * 10) / 10);
        });

        const datasets = [
            {
                label: 'Cumulative Avg vs Par',
                data: avgData,
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f633',
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                fill: true,
            },
            {
                label: 'Score vs Par',
                data: allRounds.map((r, i) => pt(r, i, r.score_vs_par)),
                borderColor: '#8b8f9866',
                borderWidth: 1,
                borderDash: [4, 3],
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBackgroundColor: '#8b8f9899',
                tension: 0.2,
                fill: false,
            },
        ];

        let xAxisConfig;
        if (axisMode === 'rounds') {
            xAxisConfig = {
                type: 'linear',
                ticks: { color: '#64748b', font: { size: 11 }, stepSize: 1, callback: v => `R${v}` },
                title: { display: true, text: 'Round', color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
        } else {
            xAxisConfig = {
                type: 'time',
                time: { unit: rangeMonths === '1' ? 'week' : 'month', displayFormats: { week: 'MMM d', month: 'MMM yyyy' }, tooltipFormat: 'MMM d, yyyy' },
                ticks: { color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
            if (xMin) xAxisConfig.min = xMin;
            xAxisConfig.max = xMax;
        }

        scTrendChart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    if (idx >= 0 && idx < allRounds.length) {
                        window.location.hash = `round/${allRounds[idx].round_id}`;
                    }
                },
                onHover: (evt, elements) => {
                    evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle' },
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        callbacks: {
                            title: ctxs => {
                                if (axisMode === 'rounds' && ctxs[0]) {
                                    const i = ctxs[0].dataIndex;
                                    const r = allRounds[i];
                                    return r ? `Round ${ctxs[0].raw.x} — ${r.course_name}` : '';
                                }
                                return undefined;
                            },
                            label: ctx => {
                                const v = ctx.raw?.y;
                                if (v == null) return '';
                                const sign = v > 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${sign}${v}`;
                            }
                        }
                    },
                },
                scales: {
                    x: xAxisConfig,
                    y: {
                        ticks: {
                            color: '#64748b',
                            callback: v => (v > 0 ? '+' : '') + v,
                            font: { size: 11 },
                        },
                        grid: { color: '#1e293b' },
                        title: { display: true, text: 'vs Par', color: '#64748b', font: { size: 11 } },
                    },
                },
            },
        });
    }

    function renderScDistribution() {
        const container = document.getElementById('sc-distribution');
        if (!container || !scDataCache) return;

        const d = scDataCache.scoring_distribution;
        const items = [
            { label: 'Birdie+', count: d.birdie_or_better, color: '#22c55e' },
            { label: 'Par', count: d.par, color: '#3b82f6' },
            { label: 'Bogey', count: d.bogey, color: '#f59e0b' },
            { label: 'Double', count: d.double, color: '#ef4444' },
            { label: 'Triple+', count: d.triple_plus, color: '#dc2626' },
        ];
        const total = items.reduce((s, i) => s + i.count, 0);
        const maxCount = Math.max(...items.map(i => i.count), 1);

        container.innerHTML = items.map(i => {
            const pct = total ? (i.count / total * 100).toFixed(1) : '0';
            const barPct = Math.min(i.count / maxCount * 100, 100);
            return `<div style="display:flex; align-items:center; margin-bottom:8px; gap:10px;">
                <span style="width:60px; font-size:0.82rem; color:var(--text-muted); flex-shrink:0;">${i.label}</span>
                <div style="flex:1; background:var(--bg-hover); border-radius:4px; height:20px; overflow:hidden;">
                    <div style="width:${barPct}%; background:${i.color}; height:100%; border-radius:4px;"></div>
                </div>
                <span style="width:35px; text-align:right; font-size:0.8rem; font-weight:600; color:${i.color}; flex-shrink:0;">${i.count}</span>
                <span style="width:40px; text-align:right; font-size:0.75rem; color:var(--text-dim); flex-shrink:0;">${pct}%</span>
            </div>`;
        }).join('');
    }

    function renderScParBreakdown() {
        const container = document.getElementById('sc-par-breakdown');
        if (!container || !scDataCache?.par_breakdown?.length) return;

        container.innerHTML = scDataCache.par_breakdown.map(p => {
            const vsParStr = p.avg_vs_par > 0 ? `+${p.avg_vs_par.toFixed(2)}` : p.avg_vs_par.toFixed(2);
            const vsColor = p.avg_vs_par <= 0 ? '#22c55e' : p.avg_vs_par <= 1 ? '#f59e0b' : '#ef4444';
            return `<div style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                    <span style="font-size:0.95rem; font-weight:600;">Par ${p.par}</span>
                    <span style="font-size:0.82rem; color:var(--text-dim);">${p.count} holes</span>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:4px;">
                    <span style="font-size:0.85rem;">Avg: <strong>${p.avg_score.toFixed(1)}</strong></span>
                    <span style="font-size:0.85rem; color:${vsColor}">(${vsParStr})</span>
                </div>
                <div style="display:flex; gap:8px; font-size:0.75rem; color:var(--text-dim);">
                    <span style="color:#22c55e;">${p.birdie_pct}% birdie</span>
                    <span style="color:#3b82f6;">${p.par_pct}% par</span>
                    <span style="color:#f59e0b;">${p.bogey_pct}% bogey</span>
                    <span style="color:#ef4444;">${p.double_plus_pct}% double+</span>
                </div>
            </div>`;
        }).join('');
    }

    let scDistTrendChart = null;

    function renderScDistTrendChart() {
        const canvas = document.getElementById('sc-dist-trend-chart');
        if (!canvas || !scDataCache?.per_round?.length) return;
        if (scDistTrendChart) { scDistTrendChart.destroy(); scDistTrendChart = null; }

        const axisMode = document.getElementById('sc-dist-axis')?.value || 'date';
        const rangeMonths = document.getElementById('sc-dist-range')?.value || 'all';
        const roundRange = document.getElementById('sc-dist-round-range')?.value || 'all';

        let rounds = scDataCache.per_round;
        if (axisMode === 'rounds' && roundRange !== 'all') {
            rounds = rounds.slice(-parseInt(roundRange));
        }

        const now = new Date();
        const xMax = now.toISOString().slice(0, 10);
        let xMin = null;
        if (axisMode === 'date' && rangeMonths !== 'all') {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - parseInt(rangeMonths));
            xMin = cutoff.toISOString().slice(0, 10);
        }

        const cats = [
            { key: 'birdie_or_better', label: 'Birdie+', color: '#22c55e' },
            { key: 'pars', label: 'Par', color: '#3b82f6' },
            { key: 'bogeys', label: 'Bogey', color: '#f59e0b' },
            { key: 'doubles', label: 'Double', color: '#ef4444' },
            { key: 'triple_plus', label: 'Triple+', color: '#dc2626' },
        ];

        const datasets = cats.map(c => ({
            label: c.label,
            data: rounds.map((r, i) => {
                const total = r.birdie_or_better + r.pars + r.bogeys + r.doubles + r.triple_plus;
                const y = total ? Math.round(r[c.key] / total * 1000) / 10 : 0;
                return axisMode === 'rounds' ? { x: i + 1, y } : { x: r.date, y };
            }),
            backgroundColor: c.color + '99',
            borderColor: c.color,
            borderWidth: 1,
            fill: true,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.3,
        }));

        let xAxisConfig;
        if (axisMode === 'rounds') {
            xAxisConfig = {
                type: 'linear',
                ticks: { color: '#64748b', font: { size: 11 }, stepSize: 1, callback: v => `R${v}` },
                title: { display: true, text: 'Round', color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
        } else {
            xAxisConfig = {
                type: 'time',
                time: { unit: rangeMonths === '1' ? 'week' : 'month', displayFormats: { week: 'MMM d', month: 'MMM yyyy' }, tooltipFormat: 'MMM d, yyyy' },
                ticks: { color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
            if (xMin) xAxisConfig.min = xMin;
            xAxisConfig.max = xMax;
        }

        scDistTrendChart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    if (idx >= 0 && idx < rounds.length) {
                        window.location.hash = `round/${rounds[idx].round_id}`;
                    }
                },
                onHover: (evt, elements) => {
                    evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                scales: {
                    x: xAxisConfig,
                    y: {
                        stacked: true,
                        min: 0,
                        max: 100,
                        ticks: {
                            color: '#64748b',
                            callback: v => v + '%',
                            font: { size: 11 },
                        },
                        grid: { color: '#1e293b' },
                    },
                },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle' },
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        callbacks: {
                            title: ctxs => {
                                if (ctxs[0]) {
                                    const idx = ctxs[0].dataIndex;
                                    const r = rounds[idx];
                                    if (!r) return '';
                                    const d = new Date(r.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'2-digit'});
                                    return axisMode === 'rounds' ? `Round ${idx+1} — ${r.course_name} (${d})` : `${r.course_name}`;
                                }
                                return '';
                            },
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw?.y ?? ctx.raw}%`,
                        }
                    },
                },
            },
        });
    }

    function renderScRoundTable() {
        const container = document.getElementById('sc-round-table');
        if (!container || !scDataCache?.per_round?.length) return;

        const rounds = [...scDataCache.per_round].reverse();

        const header = `<tr>
            <th>Date</th><th>Course</th><th style="text-align:right">Holes</th>
            <th style="text-align:right">Score</th><th style="text-align:right">vs Par</th>
            <th style="text-align:right">GIR%</th><th style="text-align:right">FW%</th>
            <th style="text-align:right">Putts</th><th style="text-align:right">3-Putts</th>
        </tr>`;

        const rows = rounds.map(r => {
            const d = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            const vpColor = r.score_vs_par <= 0 ? '#22c55e' : '#ef4444';
            const vpStr = r.score_vs_par > 0 ? `+${r.score_vs_par}` : `${r.score_vs_par}`;
            return `<tr onclick="location.hash='round/${r.round_id}'" style="cursor:pointer;">
                <td>${d}</td>
                <td>${r.course_name}</td>
                <td style="text-align:right">${r.holes_played}</td>
                <td style="text-align:right">${r.score}</td>
                <td style="text-align:right; color:${vpColor}; font-weight:600;">${vpStr}</td>
                <td style="text-align:right">${r.gir_pct != null ? r.gir_pct + '%' : '--'}</td>
                <td style="text-align:right">${r.fw_pct != null ? r.fw_pct + '%' : '--'}</td>
                <td style="text-align:right">${r.putts != null ? r.putts : '--'}</td>
                <td style="text-align:right">${r.three_putts || '--'}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<table class="data-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    }

    // Scoring chart controls
    document.getElementById('sc-trend-range')?.addEventListener('change', () => renderScTrendChart());
    document.getElementById('sc-trend-round-range')?.addEventListener('change', () => renderScTrendChart());
    document.getElementById('sc-trend-axis')?.addEventListener('change', () => {
        const mode = document.getElementById('sc-trend-axis')?.value;
        document.getElementById('sc-trend-range').style.display = mode === 'date' ? '' : 'none';
        document.getElementById('sc-trend-round-range').style.display = mode === 'rounds' ? '' : 'none';
        renderScTrendChart();
    });
    document.getElementById('sc-dist-range')?.addEventListener('change', () => renderScDistTrendChart());
    document.getElementById('sc-dist-round-range')?.addEventListener('change', () => renderScDistTrendChart());
    document.getElementById('sc-dist-axis')?.addEventListener('change', () => {
        const mode = document.getElementById('sc-dist-axis')?.value;
        document.getElementById('sc-dist-range').style.display = mode === 'date' ? '' : 'none';
        document.getElementById('sc-dist-round-range').style.display = mode === 'rounds' ? '' : 'none';
        renderScDistTrendChart();
    });

    // ========== Handicap Tracking ==========

    let hcpTrendChart = null;
    let hcpDataCache = null;

    async function loadHandicapSummary() {
        try {
            const resp = await fetch('/api/stats/handicap');
            if (!resp.ok) return;
            const data = await resp.json();
            const el = document.getElementById('stat-handicap');
            if (el && data.handicap_index != null) {
                el.textContent = data.handicap_index.toFixed(1);
            }
        } catch (e) {
            console.error('Failed to load handicap summary:', e);
        }
    }

    async function loadHandicap() {
        try {
            const resp = await fetch('/api/stats/handicap');
            if (!resp.ok) return;
            const data = await resp.json();

            // Stat cards
            document.getElementById('hcp-current').textContent = data.handicap_index != null ? data.handicap_index.toFixed(1) : '--';
            document.getElementById('hcp-low').textContent = data.low_index != null ? data.low_index.toFixed(1) : '--';
            document.getElementById('hcp-used').textContent = data.differentials_used || '--';
            document.getElementById('hcp-available').textContent = data.differentials_available || '--';

            hcpDataCache = data;
            renderHcpTrendChart(data);
            renderHcpProjection(data);
            renderHcpDiffTable(data);
        } catch (e) {
            console.error('Failed to load handicap:', e);
        }
    }

    function renderHcpTrendChart(data) {
        const canvas = document.getElementById('hcp-trend-chart');
        if (!canvas) return;
        if (hcpTrendChart) { hcpTrendChart.destroy(); hcpTrendChart = null; }

        const axisMode = document.getElementById('hcp-trend-axis')?.value || 'date';
        const rangeMonths = document.getElementById('hcp-trend-range')?.value || 'all';
        const roundRange = document.getElementById('hcp-trend-round-range')?.value || 'all';

        let allTrend = data.trend;

        // Filter by round count in rounds mode
        if (axisMode === 'rounds' && roundRange !== 'all') {
            allTrend = allTrend.slice(-parseInt(roundRange));
        }

        const trend = allTrend.filter(t => t.handicap_index != null);
        if (!trend.length) return;

        // Date bounds
        const now = new Date();
        const xMax = now.toISOString().slice(0, 10);
        let xMin = null;
        if (axisMode === 'date' && rangeMonths !== 'all') {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - parseInt(rangeMonths));
            xMin = cutoff.toISOString().slice(0, 10);
        }

        // Build points based on axis mode
        const pt = (t, i, val) => axisMode === 'rounds' ? { x: i + 1, y: val } : { x: t.date, y: val };

        const datasets = [
            {
                label: 'Handicap Index',
                data: allTrend.map((t, i) => pt(t, i, t.handicap_index)),
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f633',
                borderWidth: 2.5,
                pointRadius: allTrend.map(t => t.handicap_index != null ? 3 : 0),
                pointHoverRadius: 5,
                tension: 0.3,
                fill: true,
                spanGaps: false,
            },
            {
                label: 'Differential',
                data: allTrend.map((t, i) => pt(t, i, t.differential)),
                borderColor: '#8b8f98',
                borderWidth: 1,
                borderDash: [4, 3],
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBackgroundColor: '#8b8f9899',
                tension: 0.2,
                fill: false,
            },
        ];

        // Low index line
        if (data.low_index != null) {
            const first = axisMode === 'rounds' ? { x: 1, y: data.low_index } : { x: allTrend[0].date, y: data.low_index };
            const last = axisMode === 'rounds' ? { x: allTrend.length, y: data.low_index } : { x: xMax, y: data.low_index };
            datasets.push({
                label: 'Low Index',
                data: [first, last],
                borderColor: '#22c55e',
                borderWidth: 1.5,
                borderDash: [8, 4],
                pointRadius: 0,
                fill: false,
            });
        }

        // X-axis config
        let xAxisConfig;
        if (axisMode === 'rounds') {
            xAxisConfig = {
                type: 'linear',
                ticks: { color: '#64748b', font: { size: 11 }, stepSize: 1, callback: v => `R${v}` },
                title: { display: true, text: 'Round', color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
        } else {
            xAxisConfig = {
                type: 'time',
                time: { unit: rangeMonths === '1' ? 'week' : 'month', displayFormats: { week: 'MMM d', month: 'MMM yyyy' }, tooltipFormat: 'MMM d, yyyy' },
                ticks: { color: '#64748b', font: { size: 11 } },
                grid: { color: '#1e293b' },
            };
            if (xMin) xAxisConfig.min = xMin;
            xAxisConfig.max = xMax;
        }

        hcpTrendChart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    if (idx >= 0 && idx < allTrend.length) {
                        // Find the differential for this index to get round_ids
                        const diff = data.differentials[idx];
                        if (diff && diff.round_ids.length === 1) {
                            window.location.hash = `round/${diff.round_ids[0]}`;
                        }
                    }
                },
                onHover: (evt, elements) => {
                    evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle' },
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        callbacks: {
                            title: ctxs => {
                                if (axisMode === 'rounds' && ctxs[0]) {
                                    const i = ctxs[0].dataIndex;
                                    const t = allTrend[i];
                                    return t ? `Round ${ctxs[0].raw.x} — ${new Date(t.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'2-digit'})}` : `Round ${ctxs[0].raw.x}`;
                                }
                                return undefined;
                            },
                            label: ctx => {
                                const v = ctx.raw?.y;
                                if (v == null) return '';
                                return `${ctx.dataset.label}: ${v.toFixed(1)}`;
                            }
                        }
                    },
                },
                scales: {
                    x: xAxisConfig,
                    y: {
                        reverse: true,
                        ticks: { color: '#64748b', font: { size: 11 } },
                        grid: { color: '#1e293b' },
                        title: { display: true, text: 'Index', color: '#64748b', font: { size: 11 } },
                    },
                },
            },
        });
    }

    function renderHcpProjection(data) {
        const container = document.getElementById('hcp-projection');
        const card = document.getElementById('hcp-projection-card');
        if (!container || !card) return;

        const rate = data.improvement_per_round;
        const projections = data.projections || [];

        if (rate == null || data.handicap_index == null) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';
        let html = '';

        // Improvement rate
        const rateColor = rate < 0 ? '#22c55e' : rate > 0 ? '#ef4444' : 'var(--text-muted)';
        const rateDir = rate < 0 ? 'improving' : rate > 0 ? 'increasing' : 'stable';
        const rateAbs = Math.abs(rate).toFixed(2);
        html += `<p style="font-size:0.9rem; margin-bottom:16px; color:var(--text-muted);">
            Your handicap is <strong style="color:${rateColor}">${rateDir}</strong> by
            <strong style="color:${rateColor}">${rateAbs}</strong> strokes per round.
        </p>`;

        if (projections.length > 0) {
            html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
            for (const p of projections) {
                html += `<div style="display:flex; align-items:center; gap:12px;">
                    <span style="width:120px; font-size:0.85rem; font-weight:600; color:var(--text);">${p.label}</span>
                    <span style="font-size:0.85rem; color:var(--text-muted);">~${p.rounds_away} rounds away</span>
                </div>`;
            }
            html += `</div>`;
        } else if (rate >= 0) {
            html += `<p style="font-size:0.85rem; color:var(--text-dim);">
                At the current trend, no improvement milestones are projected. Keep practicing!
            </p>`;
        }

        container.innerHTML = html;
    }

    function renderHcpDiffTable(data) {
        const container = document.getElementById('hcp-diff-table');
        if (!container) return;

        if (!data.differentials?.length) {
            container.innerHTML = '<div class="empty-state"><p>No differentials yet. Need at least 3 rounds.</p></div>';
            return;
        }

        const diffs = [...data.differentials].reverse();

        const header = `<tr>
            <th>Date</th><th>Course</th>
            <th style="text-align:right">Score</th><th style="text-align:right">Rating</th>
            <th style="text-align:right">Slope</th><th style="text-align:right">Diff</th>
            <th style="text-align:center">Used</th>
        </tr>`;

        const rows = diffs.map(d => {
            const dateStr = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            const usedMark = d.used ? '<span style="color:#22c55e;">*</span>' : '';
            const rowStyle = d.used ? 'background:rgba(34,197,94,0.06);' : '';
            const clickIds = d.round_ids.length === 1 ? `onclick="location.hash='round/${d.round_ids[0]}'" style="cursor:pointer; ${rowStyle}"` : `style="${rowStyle}"`;
            return `<tr ${clickIds}>
                <td>${dateStr}</td>
                <td>${d.course_name}${d.is_combined ? ' <span style="font-size:0.7rem; color:var(--text-dim);">(9+9)</span>' : ''}</td>
                <td style="text-align:right">${d.score}</td>
                <td style="text-align:right">${d.rating}</td>
                <td style="text-align:right">${d.slope}</td>
                <td style="text-align:right; font-weight:600;">${d.differential.toFixed(1)}</td>
                <td style="text-align:center">${usedMark}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `<table class="data-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
    }

    // Handicap chart controls
    document.getElementById('hcp-trend-range')?.addEventListener('change', () => { if (hcpDataCache) renderHcpTrendChart(hcpDataCache); });
    document.getElementById('hcp-trend-round-range')?.addEventListener('change', () => { if (hcpDataCache) renderHcpTrendChart(hcpDataCache); });
    document.getElementById('hcp-trend-axis')?.addEventListener('change', () => {
        const mode = document.getElementById('hcp-trend-axis')?.value;
        document.getElementById('hcp-trend-range').style.display = mode === 'date' ? '' : 'none';
        document.getElementById('hcp-trend-round-range').style.display = mode === 'rounds' ? '' : 'none';
        if (hcpDataCache) renderHcpTrendChart(hcpDataCache);
    });

    // ========== Course Editor ==========

    let editorMap = null;
    let editorCourse = null;
    let editorStrategy = null;
    let editorCurrentHole = 1;
    let editorTeeId = null;
    let editorLayerGroup = null;
    let editorTool = 'tee';
    let editorDrawPanelOpen = false; // global flag, set by float panel toggle
    let editorRounds = [];          // rounds at this course (from roundsCache)
    let editorRoundDetail = null;   // selected round's full detail
    let editorAllRoundDetails = []; // all round details for historic mode
    let editorViewMode = 'historic'; // 'historic' or round ID
    let editorTeePos = null;
    let editorTeePositions = {};
    let editorGreenPos = null;
    let editorFairwayPath = [];
    let editorFairwayBoundaries = [];  // Array of polygons: [{lat,lng}[], ...]
    let editorCurrentFwBoundary = [];  // In-progress polygon being drawn
    let editorGreenBoundary = [];
    let editorHazards = [];
    let editorCurrentHazard = [];
    let editorDirty = false;

    async function loadCourseEditor(courseId) {
        // Fetch course data and strategy in parallel
        const [courseResp, stratResp] = await Promise.all([
            fetch(`/api/courses/${courseId}`).then(r => r.json()),
            fetch(`/api/courses/${courseId}/strategy`).then(r => r.json()).catch(() => ({ player: {} })),
        ]);
        editorCourse = courseResp;
        editorStrategy = stratResp;

        // Set header
        // Back btn removed — browser back handles navigation

        // Init tee selector
        const teeSelect = document.getElementById('editor-tee-select');
        teeSelect.innerHTML = '';
        (editorCourse.tees || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.tee_name} (${t.total_yards || '?'}yd)`;
            teeSelect.appendChild(opt);
        });
        // Select default tee: match user preference by name, fall back to first
        const defaultTeeName = localStorage.getItem('birdie_book_default_tee') || '';
        const preferredTee = defaultTeeName
            ? (editorCourse.tees || []).find(t => t.tee_name && t.tee_name.toUpperCase().includes(defaultTeeName.toUpperCase()))
            : null;
        editorTeeId = preferredTee?.id || editorCourse.tees?.[0]?.id || null;
        teeSelect.value = editorTeeId;

        // Init map
        if (editorMap) { editorMap.remove(); editorMap = null; }
        editorMap = L.map('editor-leaflet-map', {
            maxZoom: 22,
            zoomControl: true,
            doubleClickZoom: false,
        });
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 22, maxNativeZoom: 19,
            attribution: 'Esri Satellite',
        }).addTo(editorMap);
        editorLayerGroup = L.layerGroup().addTo(editorMap);

        // Right-click / middle-click pan (works when normal drag is disabled by tools)
        (function setupAltPan() {
            const container = editorMap.getContainer();
            let altPanning = false, panStartX = 0, panStartY = 0;

            container.addEventListener('mousedown', (e) => {
                // Right-click (2) or middle-click (1)
                if (e.button === 2 || e.button === 1) {
                    altPanning = true;
                    panStartX = e.clientX;
                    panStartY = e.clientY;
                    e.preventDefault();
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (!altPanning) return;
                const dx = e.clientX - panStartX;
                const dy = e.clientY - panStartY;
                panStartX = e.clientX;
                panStartY = e.clientY;
                editorMap.panBy([-dx, -dy], { animate: false });
            });

            document.addEventListener('mouseup', (e) => {
                if (e.button === 2 || e.button === 1) {
                    altPanning = false;
                }
            });

            // Suppress context menu on the map so right-click drag works
            container.addEventListener('contextmenu', (e) => e.preventDefault());
        })();

        // Center map on club GPS or first hole with GPS
        let centerLat = editorCourse.lat, centerLng = editorCourse.lng;
        if (!centerLat) {
            // Try first hole with tee GPS
            for (const tee of (editorCourse.tees || [])) {
                for (const h of (tee.holes || [])) {
                    if (h.tee_lat) { centerLat = h.tee_lat; centerLng = h.tee_lng; break; }
                    if (h.flag_lat) { centerLat = h.flag_lat; centerLng = h.flag_lng; break; }
                }
                if (centerLat) break;
            }
        }
        if (centerLat) {
            editorMap.setView([centerLat, centerLng], 16);
        } else {
            editorMap.setView([42.5, -83.5], 14); // fallback
        }

        // Map click handler
        editorMap.on('click', onEditorMapClick);
        editorMap.on('dblclick', () => {
            if (editorTool === 'hazard' && editorCurrentHazard.length >= 3) {
                editorFinishHazard();
            }
            if (editorTool === 'fairway-boundary' && editorCurrentFwBoundary.length >= 3) {
                editorFairwayBoundaries.push([...editorCurrentFwBoundary]);
                editorCurrentFwBoundary = [];
                editorDirty = true;
                editorRedraw();
            }
        });

        // Build hole navigator
        editorBuildHoleNav();

        // Select hole 1
        editorCurrentHole = 1;
        editorSelectHole(1);

        // Ensure map fills full-screen layout
        requestAnimationFrame(() => editorMap.invalidateSize());

        // Load rounds for this course (from global roundsCache)
        editorRounds = (typeof roundsCache !== 'undefined' ? roundsCache : [])
            .filter(r => r.course_id === editorCourse.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        editorRoundDetail = null;
        editorAllRoundDetails = [];
        editorViewMode = 'historic';
        editorPopulateRoundSelect();
        editorPopulateScorecardTee();

        // Eagerly load all round details for this course (needed by scorecard + overview)
        if (editorRounds.length > 0) {
            (async () => {
                for (const r of editorRounds) {
                    try {
                        const resp = await fetch(`/api/rounds/${r.id}`);
                        editorAllRoundDetails.push(await resp.json());
                    } catch (e) { /* skip */ }
                }
                editorRenderScorecard();
                editorRenderHoleOverview();
            })();
        }

        // Auto-open Scorecard panel on load
        if (window._editorActivateTab) window._editorActivateTab('scorecard', true);
    }

    function editorBuildHoleNav() {
        const nav = document.getElementById('editor-hole-nav');
        const numHoles = editorCourse.holes || 18;
        nav.innerHTML = '';
        for (let i = 1; i <= numHoles; i++) {
            const btn = document.createElement('button');
            btn.className = 'editor-hole-btn';
            btn.textContent = i;
            btn.dataset.hole = i;
            // Completeness
            const comp = editorGetHoleCompleteness(i);
            btn.classList.add(comp);
            if (i === editorCurrentHole) btn.classList.add('active');
            btn.addEventListener('click', () => editorNavigateToHole(i));
            nav.appendChild(btn);
        }
    }

    function editorGetHoleCompleteness(holeNum) {
        const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        if (!tee) return 'empty';
        const hole = (tee.holes || []).find(h => h.hole_number === holeNum);
        if (!hole) return 'empty';
        let score = 0;
        if (hole.par) score++;
        if (hole.yardage) score++;
        if (hole.tee_lat) score++;
        if (hole.flag_lat) score++;
        if (hole.fairway_path) score++;
        if (hole.green_boundary) score++;
        if (score >= 5) return 'complete';
        if (score >= 2) return 'partial';
        return 'empty';
    }

    function editorGetCurrentHole() {
        const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        if (!tee) return null;
        return (tee.holes || []).find(h => h.hole_number === editorCurrentHole);
    }

    function editorSelectHole(holeNum) {
        editorCurrentHole = holeNum;
        const hole = editorGetCurrentHole();

        // Update titles
        document.getElementById('editor-hole-title').textContent = `Hole ${holeNum}`;
        const quickLabel = document.getElementById('editor-hole-quick-label');
        if (quickLabel) quickLabel.textContent = holeNum;

        // Load hole data into edit state
        if (hole) {
            document.getElementById('editor-par').value = hole.par || '';
            document.getElementById('editor-yardage').value = hole.yardage || '';
            document.getElementById('editor-handicap').value = hole.handicap || '';

            editorTeePos = (hole.tee_lat && hole.tee_lng) ? { lat: hole.tee_lat, lng: hole.tee_lng } : null;
            editorGreenPos = (hole.flag_lat && hole.flag_lng) ? { lat: hole.flag_lat, lng: hole.flag_lng } : null;
            editorFairwayPath = hole.fairway_path ? JSON.parse(hole.fairway_path).map(p => ({ lat: p[0], lng: p[1] })) : [];
            // Parse fairway_boundary — supports both single polygon [[lat,lng],...] and multi [[[lat,lng],...],...]
            editorFairwayBoundaries = [];
            if (hole.fairway_boundary) {
                const parsed = JSON.parse(hole.fairway_boundary);
                if (parsed.length > 0 && Array.isArray(parsed[0]) && Array.isArray(parsed[0][0])) {
                    // Multi-polygon: [[[lat,lng],...], [[lat,lng],...]]
                    editorFairwayBoundaries = parsed.map(poly => poly.map(p => ({ lat: p[0], lng: p[1] })));
                } else if (parsed.length > 0) {
                    // Single polygon: [[lat,lng],...] — wrap in array
                    editorFairwayBoundaries = [parsed.map(p => ({ lat: p[0], lng: p[1] }))];
                }
            }
            editorCurrentFwBoundary = [];
            editorGreenBoundary = hole.green_boundary ? JSON.parse(hole.green_boundary).map(p => ({ lat: p[0], lng: p[1] })) : [];

            // Data source badge
            const srcEl = document.getElementById('editor-data-source');
            if (hole.data_source) {
                const colors = { api: '#42a5f5', osm: '#4caf50', manual: '#9e9e9e', garmin: '#ff9800' };
                srcEl.innerHTML = `Source: <span style="color:${colors[hole.data_source] || '#9e9e9e'}">${hole.data_source}</span>`;
            } else {
                srcEl.textContent = '';
            }
        } else {
            document.getElementById('editor-par').value = '';
            document.getElementById('editor-yardage').value = '';
            document.getElementById('editor-handicap').value = '';
            editorTeePos = null;
            editorGreenPos = null;
            editorFairwayPath = [];
            editorFairwayBoundaries = [];
            editorCurrentFwBoundary = [];
            editorGreenBoundary = [];
            document.getElementById('editor-data-source').textContent = '';
        }

        // Load all tee positions
        editorTeePositions = {};
        for (const tee of (editorCourse.tees || [])) {
            const th = (tee.holes || []).find(h => h.hole_number === holeNum);
            if (th && th.tee_lat) {
                editorTeePositions[tee.tee_name] = { lat: th.tee_lat, lng: th.tee_lng };
            }
        }

        // Load hazards (club-level, shared across holes)
        editorHazards = (editorCourse.hazards || []).map(h => ({
            id: h.id,
            hazard_type: h.hazard_type,
            name: h.name,
            boundary: JSON.parse(h.boundary).map(p => ({ lat: p[0], lng: p[1] })),
        }));
        editorCurrentHazard = [];

        // Update completeness tags
        editorUpdateCompleteness();

        // Update nav active state
        document.querySelectorAll('.editor-hole-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.hole) === holeNum);
        });

        editorDirty = false;
        editorRedraw();
        editorUpdateStrategy();
    }

    function editorUpdateCompleteness() {
        const hole = editorGetCurrentHole();
        const el = document.getElementById('editor-completeness');
        const checks = [
            ['Par', !!document.getElementById('editor-par').value],
            ['Yardage', !!document.getElementById('editor-yardage').value],
            ['Tee GPS', !!editorTeePos],
            ['Green GPS', !!editorGreenPos],
            ['FW Path', editorFairwayPath.length >= 2],
            ['Green Bnd', editorGreenBoundary.length >= 3],
        ];
        el.innerHTML = checks.map(([label, present]) =>
            `<span class="completeness-tag ${present ? 'present' : 'missing'}">${label}</span>`
        ).join('');
    }

    // === Map Click Handler ===
    function onEditorMapClick(e) {
        // Ignore map clicks when draw panel is not open
        if (!editorDrawPanelOpen) return;

        const { lat, lng } = e.latlng;
        editorDirty = true;

        if (editorTool === 'tee') {
            editorTeePos = { lat, lng };
            const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
            if (tee) editorTeePositions[tee.tee_name] = editorTeePos;
        } else if (editorTool === 'green') {
            editorGreenPos = { lat, lng };
        } else if (editorTool === 'fairway') {
            // Smart insertion: find closest segment
            if (editorFairwayPath.length >= 2) {
                let bestIdx = editorFairwayPath.length;
                let bestDist = Infinity;
                const segments = [];
                // Include tee->first and last->green
                if (editorTeePos) segments.push([editorTeePos, editorFairwayPath[0], 0]);
                for (let i = 0; i < editorFairwayPath.length - 1; i++) {
                    segments.push([editorFairwayPath[i], editorFairwayPath[i + 1], i + 1]);
                }
                if (editorGreenPos) segments.push([editorFairwayPath[editorFairwayPath.length - 1], editorGreenPos, editorFairwayPath.length]);
                for (const [a, b, idx] of segments) {
                    const d = _pointToSegmentDist(lat, lng, a.lat, a.lng, b.lat, b.lng);
                    if (d < bestDist) { bestDist = d; bestIdx = idx; }
                }
                editorFairwayPath.splice(bestIdx, 0, { lat, lng });
            } else {
                editorFairwayPath.push({ lat, lng });
            }
        } else if (editorTool === 'fairway-boundary') {
            editorCurrentFwBoundary.push({ lat, lng });
        } else if (editorTool === 'green-boundary') {
            editorGreenBoundary.push({ lat, lng });
        } else if (editorTool === 'hazard') {
            editorCurrentHazard.push({ lat, lng });
        }

        editorRedraw();
        editorUpdateCompleteness();
        editorUpdateStrategy();
    }

    function _pointToSegmentDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    }

    let editorFairwayLine = null;  // Reference for live drag updates

    // === Redraw Map Overlays ===
    function editorRedraw() {
        if (!editorLayerGroup) return;
        editorLayerGroup.clearLayers();
        editorFairwayLine = null;

        // Markers only editable when Draw panel is open
        const drawOpen = editorDrawPanelOpen;

        const activeTee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        const activeTeeName = activeTee ? activeTee.tee_name : '';

        // Fairway centerline — draw if we have waypoints OR both tee and green (auto-connect)
        const hasFairwayData = editorFairwayPath.length >= 1 || (editorTeePos && editorGreenPos);
        if (hasFairwayData) {
            const pts = [];
            if (editorTeePos) pts.push([editorTeePos.lat, editorTeePos.lng]);
            editorFairwayPath.forEach(p => pts.push([p.lat, p.lng]));
            if (editorGreenPos) pts.push([editorGreenPos.lat, editorGreenPos.lng]);
            if (pts.length >= 2) {
                editorFairwayLine = L.polyline(pts, { color: '#FFD700', weight: 2, dashArray: '6,4', interactive: false }).addTo(editorLayerGroup);
            }

            // Waypoint markers + segment distances — only shown when Draw panel is open
            if (drawOpen) {
                editorFairwayPath.forEach((p, i) => {
                    // Segment distance label (yellow, between this point and previous)
                    if (i > 0 || editorTeePos) {
                        const prev = i === 0 ? editorTeePos : editorFairwayPath[i - 1];
                        if (prev) {
                            const segDist = Math.round(_haversineYards(prev.lat, prev.lng, p.lat, p.lng));
                            const midLat = (prev.lat + p.lat) / 2;
                            const midLng = (prev.lng + p.lng) / 2;
                            L.marker([midLat, midLng], {
                                icon: L.divIcon({
                                    className: 'leaflet-seg-label',
                                    html: `<div style="color:#FFD700;font-size:10px;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${segDist}y</div>`,
                                    iconSize: [0, 0], iconAnchor: [0, 6],
                                }),
                                interactive: false,
                            }).addTo(editorLayerGroup);
                        }
                    }

                    const m = L.marker([p.lat, p.lng], {
                        draggable: true,
                        icon: L.divIcon({ className: 'leaflet-fairway-wp', html: `<div style="width:12px;height:12px;border-radius:50%;background:#FFD700;border:2px solid #fff;margin:-6px 0 0 -6px;"></div>`, iconSize: [0, 0] }),
                    }).addTo(editorLayerGroup);

                    m.on('drag', (e) => {
                        editorFairwayPath[i] = { lat: e.latlng.lat, lng: e.latlng.lng };
                        editorDirty = true;
                        if (editorFairwayLine) {
                            const livePts = [];
                            if (editorTeePos) livePts.push([editorTeePos.lat, editorTeePos.lng]);
                            editorFairwayPath.forEach(fp => livePts.push([fp.lat, fp.lng]));
                            if (editorGreenPos) livePts.push([editorGreenPos.lat, editorGreenPos.lng]);
                            editorFairwayLine.setLatLngs(livePts);
                        }
                    });
                    m.on('dragend', () => editorRedraw());
                    m.on('contextmenu', () => { editorFairwayPath.splice(i, 1); editorDirty = true; editorRedraw(); editorUpdateCompleteness(); });
                });

                // Last segment: last waypoint to green
                if (editorGreenPos && editorFairwayPath.length > 0) {
                    const last = editorFairwayPath[editorFairwayPath.length - 1];
                    const segDist = Math.round(_haversineYards(last.lat, last.lng, editorGreenPos.lat, editorGreenPos.lng));
                    const midLat = (last.lat + editorGreenPos.lat) / 2;
                    const midLng = (last.lng + editorGreenPos.lng) / 2;
                    L.marker([midLat, midLng], {
                        icon: L.divIcon({
                            className: 'leaflet-seg-label',
                            html: `<div style="color:#FFD700;font-size:10px;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${segDist}y</div>`,
                            iconSize: [0, 0], iconAnchor: [0, 6],
                        }),
                        interactive: false,
                    }).addTo(editorLayerGroup);
                }
            }

        }

        // Fairway boundary polygons (multiple supported for split fairways)
        editorFairwayBoundaries.forEach((poly, polyIdx) => {
            if (poly.length >= 3) {
                const p = L.polygon(poly.map(pt => [pt.lat, pt.lng]), {
                    color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.15, interactive: drawOpen,
                }).addTo(editorLayerGroup);
                p.on('contextmenu', () => {
                    if (!drawOpen) return;
                    editorFairwayBoundaries.splice(polyIdx, 1);
                    editorDirty = true;
                    editorRedraw();
                });
            }
            // Corner markers (draggable only when draw panel open)
            poly.forEach((pt, i) => {
                if (!drawOpen) return; // hide corner markers entirely when not editing
                const m = L.marker([pt.lat, pt.lng], {
                    draggable: true,
                    icon: L.divIcon({ className: 'leaflet-fairway-wp', html: `<div style="width:10px;height:10px;border-radius:50%;background:#4CAF50;border:2px solid #fff;margin:-5px 0 0 -5px;"></div>`, iconSize: [0, 0] }),
                }).addTo(editorLayerGroup);
                m.on('drag', (e) => { editorFairwayBoundaries[polyIdx][i] = { lat: e.latlng.lat, lng: e.latlng.lng }; editorDirty = true; });
                m.on('dragend', () => editorRedraw());
                m.on('contextmenu', () => { editorFairwayBoundaries[polyIdx].splice(i, 1); if (editorFairwayBoundaries[polyIdx].length === 0) editorFairwayBoundaries.splice(polyIdx, 1); editorDirty = true; editorRedraw(); });
            });
        });

        // In-progress fairway boundary being drawn
        if (editorCurrentFwBoundary.length >= 1) {
            if (editorCurrentFwBoundary.length >= 3) {
                L.polygon(editorCurrentFwBoundary.map(p => [p.lat, p.lng]), {
                    color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.1, dashArray: '4,4', interactive: false,
                }).addTo(editorLayerGroup);
            } else if (editorCurrentFwBoundary.length === 2) {
                L.polyline(editorCurrentFwBoundary.map(p => [p.lat, p.lng]), {
                    color: '#4CAF50', weight: 2, dashArray: '4,4', interactive: false,
                }).addTo(editorLayerGroup);
            }
            editorCurrentFwBoundary.forEach(p => {
                L.circleMarker([p.lat, p.lng], { radius: 5, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 1, interactive: false }).addTo(editorLayerGroup);
            });
        }

        // Tee markers (all tees, only active draggable)
        const TEE_COLORS = { Blue: '#2196F3', White: '#fff', Red: '#f44336', Gold: '#FFD700', Black: '#333', Green: '#4CAF50' };
        for (const [name, pos] of Object.entries(editorTeePositions)) {
            const isActive = name === activeTeeName;
            const color = TEE_COLORS[name.split(' ')[0]] || '#999';
            const size = isActive ? 24 : 18;
            const m = L.marker([pos.lat, pos.lng], {
                draggable: isActive && drawOpen,
                interactive: isActive && drawOpen,
                icon: L.divIcon({
                    className: 'leaflet-edit-tee',
                    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${color === '#fff' ? '#333' : '#fff'};opacity:${isActive ? 1 : 0.6};margin:-${size/2}px 0 0 -${size/2}px;">T</div>`,
                    iconSize: [0, 0],
                }),
                zIndexOffset: isActive ? 1000 : 500,
            }).addTo(editorLayerGroup);
            if (isActive) {
                m.on('dragend', (e) => {
                    editorTeePos = { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng };
                    editorTeePositions[activeTeeName] = editorTeePos;
                    editorDirty = true;
                    editorRedraw();
                    editorUpdateStrategy();
                });
            }
        }

        // Green/flag marker
        if (editorGreenPos) {
            const flagSvg = `<svg width="20" height="24" viewBox="0 0 20 24"><line x1="4" y1="2" x2="4" y2="22" stroke="#fff" stroke-width="2"/><polygon points="5,2 18,7 5,12" fill="#ef5350"/><circle cx="4" cy="22" r="2.5" fill="#fff" stroke="#333"/></svg>`;
            const m = L.marker([editorGreenPos.lat, editorGreenPos.lng], {
                draggable: drawOpen,
                interactive: drawOpen,
                icon: L.divIcon({ className: 'leaflet-edit-flag', html: flagSvg, iconSize: [20, 24], iconAnchor: [4, 22] }),
                zIndexOffset: 900,
            }).addTo(editorLayerGroup);
            m.on('dragend', (e) => {
                editorGreenPos = { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng };
                editorDirty = true;
                editorRedraw();
                editorUpdateStrategy();
            });
        }

        // Green boundary polygon
        if (editorGreenBoundary.length >= 1) {
            if (editorGreenBoundary.length >= 3) {
                L.polygon(editorGreenBoundary.map(p => [p.lat, p.lng]), {
                    color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.25, interactive: false,
                }).addTo(editorLayerGroup);
            } else if (editorGreenBoundary.length === 2) {
                L.polyline(editorGreenBoundary.map(p => [p.lat, p.lng]), {
                    color: '#4CAF50', weight: 2, dashArray: '4,4', interactive: false,
                }).addTo(editorLayerGroup);
            }
            editorGreenBoundary.forEach((p, i) => {
                if (!drawOpen) return; // hide corner markers when not editing
                const m = L.marker([p.lat, p.lng], {
                    draggable: true,
                    icon: L.divIcon({ className: 'leaflet-fairway-wp', html: `<div style="width:8px;height:8px;border-radius:50%;background:#4CAF50;border:1px solid #fff;margin:-4px 0 0 -4px;"></div>`, iconSize: [0, 0] }),
                }).addTo(editorLayerGroup);
                m.on('drag', (e) => { editorGreenBoundary[i] = { lat: e.latlng.lat, lng: e.latlng.lng }; editorDirty = true; });
                m.on('dragend', () => editorRedraw());
                m.on('contextmenu', () => { editorGreenBoundary.splice(i, 1); editorDirty = true; editorRedraw(); });
            });
        }

        // Hazards
        editorHazards.forEach((h, idx) => {
            if (h.boundary.length < 3) return;
            const colors = { bunker: ['#EDC967', '#C4A34D'], water: ['#2196F3', '#1565C0'], out_of_bounds: ['#f44336', '#c62828'], trees: ['#2E7D32', '#1B5E20'], waste_area: ['#8D6E63', '#5D4037'] };
            const [fill, stroke] = colors[h.hazard_type] || ['#999', '#666'];
            const poly = L.polygon(h.boundary.map(p => [p.lat, p.lng]), {
                color: stroke, weight: 1.5, fillColor: fill, fillOpacity: 0.3, interactive: drawOpen,
            }).addTo(editorLayerGroup);
            if (h.name) poly.bindTooltip(h.name, { permanent: false });
            poly.on('contextmenu', () => {
                if (!drawOpen) return;
                if (h.id) h._deleted = true;
                editorHazards.splice(idx, 1);
                editorDirty = true;
                editorRedraw();
            });
        });

        // Current hazard being drawn (polygon, color-matched to type)
        if (editorCurrentHazard.length >= 1) {
            const hazardType = document.getElementById('editor-hazard-type')?.value || 'bunker';
            const hazardDrawColors = { bunker: '#EDC967', water: '#2196F3', out_of_bounds: '#f44336', trees: '#2E7D32', waste_area: '#8D6E63' };
            const hColor = hazardDrawColors[hazardType] || '#ffa726';
            if (editorCurrentHazard.length >= 3) {
                L.polygon(editorCurrentHazard.map(p => [p.lat, p.lng]), {
                    color: hColor, weight: 2, fillColor: hColor, fillOpacity: 0.15, dashArray: '4,4', interactive: false,
                }).addTo(editorLayerGroup);
            } else if (editorCurrentHazard.length === 2) {
                L.polyline(editorCurrentHazard.map(p => [p.lat, p.lng]), {
                    color: hColor, weight: 2, dashArray: '4,4', interactive: false,
                }).addTo(editorLayerGroup);
            }
            editorCurrentHazard.forEach(p => {
                L.circleMarker([p.lat, p.lng], { radius: 5, color: hColor, fillColor: hColor, fillOpacity: 1, interactive: false }).addTo(editorLayerGroup);
            });
        }

        // Auto-calculate yardage from tee to green if both placed
        if (editorTeePos && editorGreenPos) {
            const yardInput = document.getElementById('editor-yardage');
            if (!yardInput.value) {
                yardInput.value = Math.round(_haversineYards(editorTeePos.lat, editorTeePos.lng, editorGreenPos.lat, editorGreenPos.lng));
            }
        }

        // Update hazard list in draw sub-panel
        editorRenderObjectList();
    }

    function editorFinishHazard() {
        if (editorCurrentHazard.length >= 3) {
            const type = document.getElementById('editor-hazard-type').value;
            editorHazards.push({
                hazard_type: type,
                name: '',
                boundary: [...editorCurrentHazard],
                _new: true,
            });
            editorDirty = true;
        }
        editorCurrentHazard = [];
        editorRedraw();
    }

    // === Context-sensitive Object List ===
    function editorRenderObjectList() {
        const container = document.getElementById('editor-object-list');
        const titleEl = document.getElementById('editor-object-list-title');
        const section = document.getElementById('editor-object-list-section');
        if (!container || !section) return;

        const hazardColors = { bunker: '#EDC967', water: '#2196F3', out_of_bounds: '#f44336', trees: '#2E7D32', waste_area: '#8D6E63' };
        const hazardLabels = { bunker: 'Bunker', water: 'Water', out_of_bounds: 'OB', trees: 'Trees', waste_area: 'Waste' };
        let items = [];

        if (editorTool === 'hazard') {
            // Filter hazards by currently selected type
            const selectedType = document.getElementById('editor-hazard-type')?.value;
            titleEl.textContent = hazardLabels[selectedType] || 'Hazards';
            const filtered = editorHazards
                .map((h, i) => ({ ...h, _idx: i }))
                .filter(h => h.hazard_type === selectedType);
            items = filtered.map(h => `
                <div class="hazard-list-item">
                    <div class="hazard-info">
                        <span class="hazard-color-dot" style="background:${hazardColors[h.hazard_type] || '#999'}"></span>
                        <span>${hazardLabels[h.hazard_type] || h.hazard_type}${h.name ? ' — ' + h.name : ''}</span>
                    </div>
                    <button class="hazard-delete" data-action="delete-hazard" data-idx="${h._idx}" title="Delete">&times;</button>
                </div>`);
        } else if (editorTool === 'fairway-boundary') {
            titleEl.textContent = 'Fairway Boundaries';
            items = editorFairwayBoundaries.map((b, i) => `
                <div class="hazard-list-item">
                    <div class="hazard-info">
                        <span class="hazard-color-dot" style="background:#66BB6A"></span>
                        <span>FW Boundary ${i + 1} (${b.length} pts)</span>
                    </div>
                    <button class="hazard-delete" data-action="delete-fw-boundary" data-idx="${i}" title="Delete">&times;</button>
                </div>`);
        } else if (editorTool === 'green-boundary') {
            titleEl.textContent = 'Green Boundary';
            if (editorGreenBoundary && editorGreenBoundary.length > 0) {
                items = [`
                    <div class="hazard-list-item">
                        <div class="hazard-info">
                            <span class="hazard-color-dot" style="background:#4CAF50"></span>
                            <span>Green Boundary (${editorGreenBoundary.length} pts)</span>
                        </div>
                        <button class="hazard-delete" data-action="delete-green-boundary" title="Delete">&times;</button>
                    </div>`];
            }
        } else {
            // No tool or tee/green/fairway tool — hide the section
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        if (items.length === 0) {
            container.innerHTML = '<div class="strategy-empty">None drawn</div>';
        } else {
            container.innerHTML = items.join('');
        }

        // Attach delete handlers
        container.querySelectorAll('.hazard-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const idx = parseInt(btn.dataset.idx);
                if (action === 'delete-hazard') {
                    const h = editorHazards[idx];
                    if (h && h.id) h._deleted = true;
                    editorHazards.splice(idx, 1);
                } else if (action === 'delete-fw-boundary') {
                    editorFairwayBoundaries.splice(idx, 1);
                } else if (action === 'delete-green-boundary') {
                    editorGreenBoundary = [];
                }
                editorDirty = true;
                editorRedraw();
            });
        });
    }

    // === Strategy Insights ===
    function editorUpdateStrategy() {
        const content = document.getElementById('editor-strategy-content');
        const player = editorStrategy?.player;
        if (!player || !player.clubs || player.clubs.length === 0) {
            content.innerHTML = '<div class="strategy-empty">No player data available</div>';
            return;
        }

        const par = parseInt(document.getElementById('editor-par').value) || 4;
        const yardage = parseInt(document.getElementById('editor-yardage').value) || 0;
        if (!yardage) {
            content.innerHTML = '<div class="strategy-empty">Add yardage to see insights</div>';
            return;
        }

        const items = [];

        // Suggested tee club
        let targetDist;
        if (par === 3) {
            targetDist = yardage;
        } else if (par === 4) {
            targetDist = yardage - 140; // leave ~140 approach
        } else {
            targetDist = Math.min(yardage * 0.55, 280); // max out around 280 for par 5s
        }

        const clubs = player.clubs.sort((a, b) => (b.avg_yards || 0) - (a.avg_yards || 0));
        let bestClub = clubs[0];
        let bestDiff = Infinity;
        for (const c of clubs) {
            const diff = Math.abs((c.avg_yards || 0) - targetDist);
            if (diff < bestDiff) { bestDiff = diff; bestClub = c; }
        }

        if (bestClub) {
            const remaining = yardage - (bestClub.avg_yards || 0);
            items.push({
                label: par === 3 ? 'Club to green' : 'Club off tee',
                value: `${bestClub.club_type} (${Math.round(bestClub.avg_yards)}y avg)`,
                cls: 'good',
            });
            if (par !== 3 && remaining > 0) {
                // Find approach club
                let approachClub = clubs[clubs.length - 1];
                let aDiff = Infinity;
                for (const c of clubs) {
                    const d = Math.abs((c.avg_yards || 0) - remaining);
                    if (d < aDiff) { aDiff = d; approachClub = c; }
                }
                items.push({
                    label: 'Approach club',
                    value: `${approachClub.club_type} (${Math.round(remaining)}y to green)`,
                    cls: '',
                });
            }
        }

        // Expected scoring
        const parKey = `par${par}_avg`;
        const parAvg = player.scoring?.[parKey];
        if (parAvg) {
            const diff = parAvg - par;
            items.push({
                label: `Your avg on par ${par}s`,
                value: `${parAvg} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`,
                cls: diff <= 0 ? 'good' : diff <= 1 ? 'warning' : 'danger',
            });
        }

        // Miss tendency for suggested club
        if (bestClub && player.miss_tendencies) {
            const miss = player.miss_tendencies[bestClub.club_type];
            if (miss && miss.total_shots >= 5) {
                const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right';
                const pct = Math.max(miss.left_pct, miss.right_pct);
                if (pct > 55) {
                    items.push({
                        label: `${bestClub.club_type} miss tendency`,
                        value: `${pct}% ${dominant} (${miss.total_shots} shots)`,
                        cls: pct > 70 ? 'danger' : 'warning',
                    });
                }
            }
        }

        // Dispersion
        if (bestClub && bestClub.std_dev) {
            items.push({
                label: `${bestClub.club_type} spread`,
                value: `${Math.round(bestClub.std_dev * 2)}yd (2 StdDev)`,
                cls: '',
            });
        }

        // Carry to hazards (if tee GPS exists)
        if (editorTeePos && editorHazards.length > 0) {
            for (const h of editorHazards) {
                if (h.boundary.length < 3) continue;
                // Find closest point of hazard to tee
                let minDist = Infinity;
                for (const p of h.boundary) {
                    const d = _haversineYards(editorTeePos.lat, editorTeePos.lng, p.lat, p.lng);
                    if (d < minDist) minDist = d;
                }
                // Only show if hazard is within play range (50-350 yards)
                if (minDist > 50 && minDist < 350) {
                    const carryYd = Math.round(minDist);
                    let cls = '';
                    if (bestClub && bestClub.p10) {
                        cls = bestClub.p10 > carryYd ? 'good' : 'danger';
                    }
                    items.push({
                        label: `${h.hazard_type}${h.name ? ' (' + h.name + ')' : ''} carry`,
                        value: `${carryYd}yd${bestClub?.p10 ? ` (your p10: ${Math.round(bestClub.p10)}y)` : ''}`,
                        cls,
                    });
                }
            }
        }

        if (items.length === 0) {
            content.innerHTML = '<div class="strategy-empty">Add more data for insights</div>';
            return;
        }

        content.innerHTML = items.map(it =>
            `<div class="strategy-item"><span class="strategy-label">${it.label}</span><span class="strategy-value ${it.cls}">${it.value}</span></div>`
        ).join('');
    }

    // === Sequential Hole Navigation ===
    async function editorNavigateToHole(targetHole) {
        // Auto-save if dirty
        if (editorDirty) {
            await editorSaveCurrentHole();
        }

        const prevHole = editorGetCurrentHole();
        editorCurrentHole = targetHole;
        editorSelectHole(targetHole);

        // Map transition — fly to the new hole's area
        const newHole = editorGetCurrentHole();
        let flyLat, flyLng;

        if (newHole && newHole.tee_lat) {
            flyLat = newHole.tee_lat;
            flyLng = newHole.tee_lng;
        } else if (prevHole && prevHole.flag_lat) {
            // Previous hole's green — next tee should be nearby
            flyLat = prevHole.flag_lat;
            flyLng = prevHole.flag_lng;
        }
        // If neither has GPS, stay where we are — don't jump to course center

        if (flyLat && editorMap) {
            editorMap.flyTo([flyLat, flyLng], editorMap.getZoom(), { duration: 0.5 });
        }
    }

    // === Save ===
    async function editorSaveCurrentHole() {
        const hole = editorGetCurrentHole();
        if (!hole) return;

        const par = parseInt(document.getElementById('editor-par').value) || hole.par;
        const yardage = parseInt(document.getElementById('editor-yardage').value) || null;
        const handicap = parseInt(document.getElementById('editor-handicap').value) || null;

        // Save for each tee that shares this hole number
        for (const tee of (editorCourse.tees || [])) {
            const teeHole = (tee.holes || []).find(h => h.hole_number === editorCurrentHole);
            if (!teeHole) continue;

            const body = { par, yardage, handicap };

            // GPS data: shared green, per-tee tee position
            if (editorGreenPos) {
                body.flag_lat = editorGreenPos.lat;
                body.flag_lng = editorGreenPos.lng;
            }
            if (tee.id === editorTeeId && editorTeePos) {
                body.tee_lat = editorTeePos.lat;
                body.tee_lng = editorTeePos.lng;
            } else if (editorTeePositions[tee.tee_name]) {
                body.tee_lat = editorTeePositions[tee.tee_name].lat;
                body.tee_lng = editorTeePositions[tee.tee_name].lng;
            }

            // Fairway/green data (shared across tees) — send empty string to clear
            body.fairway_path = editorFairwayPath.length >= 2
                ? JSON.stringify(editorFairwayPath.map(p => [p.lat, p.lng]))
                : '';
            const validBoundaries = editorFairwayBoundaries.filter(poly => poly.length >= 3);
            body.fairway_boundary = validBoundaries.length > 0
                ? JSON.stringify(validBoundaries.map(poly => poly.map(p => [p.lat, p.lng])))
                : '';
            body.green_boundary = editorGreenBoundary.length >= 3
                ? JSON.stringify(editorGreenBoundary.map(p => [p.lat, p.lng]))
                : '';

            await fetch(`/api/courses/${editorCourse.id}/holes/${teeHole.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        }

        // Handle hazard changes (new/deleted)
        const clubId = editorCourse.golf_club_id;
        for (const h of editorHazards) {
            if (h._deleted && h.id) {
                await fetch(`/api/courses/${editorCourse.id}/hazards/${h.id}`, { method: 'DELETE' });
            }
            if (h._new) {
                await fetch(`/api/courses/${editorCourse.id}/hazards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hazard_type: h.hazard_type,
                        name: h.name || '',
                        boundary: JSON.stringify(h.boundary.map(p => [p.lat, p.lng])),
                    }),
                });
            }
        }

        // Reload course data to get updated IDs
        const updated = await fetch(`/api/courses/${editorCourse.id}`).then(r => r.json());
        editorCourse = updated;

        editorDirty = false;
        editorBuildHoleNav();
    }

    // === Tool Selection ===
    document.querySelectorAll('[data-editor-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            editorTool = btn.dataset.editorTool;
            document.querySelectorAll('[data-editor-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide tool-specific sections
            document.getElementById('editor-hazard-section').style.display = editorTool === 'hazard' ? '' : 'none';
            document.getElementById('editor-fw-boundary-section').style.display = editorTool === 'fairway-boundary' ? '' : 'none';

            // Auto-switch to Draw tab (forceOpen=true to prevent toggle-close)
            if (window._editorActivateTab) window._editorActivateTab('draw', true);

            // Finish in-progress drawing if switching away
            if (editorTool !== 'hazard' && editorCurrentHazard.length >= 3) {
                editorFinishHazard();
            }
            if (editorTool !== 'fairway-boundary' && editorCurrentFwBoundary.length >= 3) {
                editorFairwayBoundaries.push([...editorCurrentFwBoundary]);
                editorCurrentFwBoundary = [];
                editorDirty = true;
                editorRedraw();
            }

            // Refresh context-sensitive object list for the new tool
            editorRenderObjectList();
        });
    });

    // Hazard type dropdown change → re-render filtered list
    document.getElementById('editor-hazard-type')?.addEventListener('change', () => {
        editorRenderObjectList();
    });

    // Clear buttons
    document.getElementById('editor-clear-fairway')?.addEventListener('click', () => {
        editorFairwayPath = []; editorDirty = true; editorRedraw(); editorUpdateCompleteness();
    });
    // FW Boundary finish/discard
    document.getElementById('editor-finish-fw-boundary')?.addEventListener('click', () => {
        if (editorCurrentFwBoundary.length >= 3) {
            editorFairwayBoundaries.push([...editorCurrentFwBoundary]);
            editorDirty = true;
        }
        editorCurrentFwBoundary = [];
        editorRedraw();
    });
    document.getElementById('editor-discard-fw-boundary')?.addEventListener('click', () => {
        editorCurrentFwBoundary = [];
        editorRedraw();
    });
    document.getElementById('editor-clear-green-boundary')?.addEventListener('click', () => {
        editorGreenBoundary = []; editorDirty = true; editorRedraw(); editorUpdateCompleteness();
    });

    // Hazard buttons
    document.getElementById('editor-finish-hazard')?.addEventListener('click', () => editorFinishHazard());
    document.getElementById('editor-discard-hazard')?.addEventListener('click', () => {
        editorCurrentHazard = []; editorRedraw();
    });

    // Nav buttons
    document.getElementById('editor-prev-hole')?.addEventListener('click', () => {
        if (editorCurrentHole > 1) editorNavigateToHole(editorCurrentHole - 1);
    });
    document.getElementById('editor-next-hole')?.addEventListener('click', () => {
        const max = editorCourse?.holes || 18;
        if (editorCurrentHole < max) editorNavigateToHole(editorCurrentHole + 1);
    });
    document.getElementById('editor-save-hole')?.addEventListener('click', async () => {
        await editorSaveCurrentHole();
        editorSelectHole(editorCurrentHole); // refresh
    });

    // Tee selector change
    document.getElementById('editor-tee-select')?.addEventListener('change', (e) => {
        editorTeeId = parseInt(e.target.value);
        editorSelectHole(editorCurrentHole);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only when editor is visible
        if (document.getElementById('section-course-editor')?.classList.contains('active') === false) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') { e.preventDefault(); document.getElementById('editor-prev-hole')?.click(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); document.getElementById('editor-next-hole')?.click(); }
        else if (e.key === 't') editorSetTool('tee');
        else if (e.key === 'g') editorSetTool('green');
        else if (e.key === 'f') editorSetTool('fairway');
        else if (e.key === 'b') editorSetTool('fairway-boundary');
        else if (e.key === 'h') editorSetTool('hazard');
        else if (e.key === 's' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); document.getElementById('editor-save-hole')?.click(); }
        else if (e.key === 'Escape') {
            editorTool = null;
            document.querySelectorAll('[data-editor-tool]').forEach(b => b.classList.remove('active'));
            document.getElementById('editor-hazard-section').style.display = 'none';
            document.getElementById('editor-fw-boundary-section').style.display = 'none';
        }
    });

    function editorSetTool(tool) {
        const btn = document.querySelector(`[data-editor-tool="${tool}"]`);
        if (btn) btn.click();
    }

    // Sync buttons
    document.getElementById('editor-sync-api')?.addEventListener('click', async () => {
        if (!editorCourse) return;
        const btn = document.getElementById('editor-sync-api');
        btn.textContent = 'Syncing...';
        btn.disabled = true;
        try {
            const res = await fetch(`/api/courses/club/${editorCourse.golf_club_id}/sync`, { method: 'POST' });
            const data = await res.json();
            // Reload course data
            editorCourse = await fetch(`/api/courses/${editorCourse.id}`).then(r => r.json());
            editorBuildHoleNav();
            editorSelectHole(editorCurrentHole);
            btn.textContent = `Synced (${data.status})`;
        } catch (e) {
            btn.textContent = 'Sync failed';
        }
        setTimeout(() => { btn.textContent = 'Sync Tees (Golf API)'; btn.disabled = false; }, 2000);
    });

    document.getElementById('editor-import-osm')?.addEventListener('click', async () => {
        if (!editorCourse) return;
        const btn = document.getElementById('editor-import-osm');
        btn.textContent = 'Detecting...';
        btn.disabled = true;
        try {
            // Step 1: Detect features
            const detectRes = await fetch(`/api/courses/${editorCourse.id}/detect-features`, { method: 'POST' });
            const detected = await detectRes.json();
            const total = detected.summary?.total || 0;

            if (total === 0) {
                btn.textContent = 'No OSM data found';
                setTimeout(() => { btn.textContent = 'Import OSM Features'; btn.disabled = false; }, 2000);
                return;
            }

            // Step 2: Import all detected features
            btn.textContent = `Importing ${total} features...`;
            const importRes = await fetch(`/api/courses/${editorCourse.id}/import-features`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bunkers: detected.bunkers || [],
                    water: detected.water || [],
                    greens: detected.greens || [],
                    holes: detected.holes || [],
                }),
            });
            const imported = await importRes.json();

            // Reload course data
            editorCourse = await fetch(`/api/courses/${editorCourse.id}`).then(r => r.json());
            editorBuildHoleNav();
            editorSelectHole(editorCurrentHole);
            btn.textContent = `Imported! (${imported.bunkers || 0}B, ${imported.water || 0}W, ${imported.holes_enriched || 0}H)`;
        } catch (e) {
            btn.textContent = 'Import failed';
        }
        setTimeout(() => { btn.textContent = 'Import OSM Features'; btn.disabled = false; }, 3000);
    });

    // ========== Editor Scorecard ==========

    function editorPopulateRoundSelect() {
        const sel = document.getElementById('editor-round-select');
        if (!sel) return;
        const teeRounds = editorRounds.filter(r => r.tee_id === editorTeeId);
        sel.innerHTML = `<option value="historic">Historic (${teeRounds.length} round${teeRounds.length !== 1 ? 's' : ''})</option>`;
        teeRounds.forEach(r => {
            const d = new Date(r.date);
            const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${r.total_strokes}(${r.score_vs_par >= 0 ? '+' : ''}${r.score_vs_par})`;
            sel.innerHTML += `<option value="${r.id}">${label}</option>`;
        });
        sel.value = editorViewMode === 'historic' ? 'historic' : editorViewMode;
    }

    function editorPopulateScorecardTee() {
        const sel = document.getElementById('scorecard-tee-select');
        if (!sel || !editorCourse) return;
        sel.innerHTML = '';
        (editorCourse.tees || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.tee_name} (${t.total_yards || '?'}yd)`;
            sel.appendChild(opt);
        });
        sel.value = editorTeeId;
    }

    // Tee sync: scorecard → hole info
    document.getElementById('scorecard-tee-select')?.addEventListener('change', (e) => {
        editorTeeId = parseInt(e.target.value);
        const holeInfoTee = document.getElementById('editor-tee-select');
        if (holeInfoTee) holeInfoTee.value = editorTeeId;
        editorViewMode = 'historic';
        editorRoundDetail = null;
        editorPopulateRoundSelect();
        editorSelectHole(editorCurrentHole);
        editorRenderScorecard();
    });

    // Tee sync: hole info → scorecard (extend existing handler)
    const _origTeeChange = document.getElementById('editor-tee-select');
    if (_origTeeChange) {
        _origTeeChange.addEventListener('change', () => {
            const scTee = document.getElementById('scorecard-tee-select');
            if (scTee) scTee.value = editorTeeId;
            editorViewMode = 'historic';
            editorRoundDetail = null;
            editorPopulateRoundSelect();
            editorRenderScorecard();
        });
    }

    // Round selector change
    document.getElementById('editor-round-select')?.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val === 'historic') {
            editorViewMode = 'historic';
            editorRoundDetail = null;
            // Lazy-load all round details for historic
            if (editorAllRoundDetails.length === 0 && editorRounds.length > 0) {
                const sel = document.getElementById('editor-round-select');
                const origText = sel.options[0].textContent;
                sel.options[0].textContent = 'Loading...';
                for (const r of editorRounds) {
                    try {
                        const resp = await fetch(`/api/rounds/${r.id}`);
                        editorAllRoundDetails.push(await resp.json());
                    } catch (e) { /* skip failed */ }
                }
                sel.options[0].textContent = origText;
            }
        } else {
            const roundId = parseInt(val);
            editorViewMode = roundId;
            // Check cache first
            editorRoundDetail = editorAllRoundDetails.find(r => r.id === roundId);
            if (!editorRoundDetail) {
                try {
                    const resp = await fetch(`/api/rounds/${roundId}`);
                    editorRoundDetail = await resp.json();
                    editorAllRoundDetails.push(editorRoundDetail);
                } catch (e) { editorRoundDetail = null; }
            }
        }
        editorRenderScorecard();
        editorRenderHoleOverview();
    });

    function editorComputeHistoricScores() {
        const scores = {};
        if (!editorAllRoundDetails || editorAllRoundDetails.length === 0) return scores;
        const numHoles = editorCourse?.holes || 18;
        const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        const courseHoles = tee?.holes || [];
        // Filter rounds to only those played on the selected tee
        const teeRounds = editorAllRoundDetails.filter(r => r.tee_id === editorTeeId);
        for (let h = 1; h <= numHoles; h++) {
            const holeScores = teeRounds
                .flatMap(r => r.holes || [])
                .filter(rh => rh.hole_number === h && rh.strokes > 0)
                .map(rh => rh.strokes);
            if (holeScores.length > 0) {
                const ch = courseHoles.find(c => c.hole_number === h);
                scores[h] = {
                    best: Math.min(...holeScores),
                    avg: holeScores.reduce((a, b) => a + b, 0) / holeScores.length,
                    rounds: holeScores.length,
                    par: ch?.par || 0,
                };
            }
        }
        return scores;
    }

    function editorGetGoals() {
        if (!editorCourse) return {};
        try {
            return JSON.parse(localStorage.getItem(`birdie_book_goals_${editorCourse.id}`) || '{}');
        } catch { return {}; }
    }

    function editorSaveGoal(holeNum, value) {
        if (!editorCourse) return;
        const goals = editorGetGoals();
        if (value) goals[holeNum] = parseInt(value);
        else delete goals[holeNum];
        localStorage.setItem(`birdie_book_goals_${editorCourse.id}`, JSON.stringify(goals));
    }

    function editorRenderScorecard() {
        const container = document.getElementById('editor-scorecard-container');
        if (!container || !editorCourse) return;

        const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        const courseHoles = tee?.holes || [];
        const numHoles = courseHoles.length || editorCourse.holes || 9;
        const is18 = numHoles > 9;

        // Score data
        let scoreData = {};
        if (editorViewMode === 'historic') {
            scoreData = editorComputeHistoricScores();
        } else if (editorRoundDetail) {
            (editorRoundDetail.holes || []).forEach(h => { scoreData[h.hole_number] = h; });
        }

        const goals = editorGetGoals();
        let html = '<table class="scorecard-table"><tbody>';

        // Hole row
        html += '<tr class="scorecard-header"><td class="scorecard-label">Hole</td>';
        for (let i = 1; i <= numHoles; i++) {
            if (is18 && i === 10) html += '<td class="scorecard-total">OUT</td>';
            const active = i === editorCurrentHole ? ' active' : '';
            html += `<td class="scorecard-cell${active}" data-hole="${i}">${i}</td>`;
        }
        html += `<td class="scorecard-total">${is18 ? 'IN' : 'OUT'}</td>`;
        if (is18) html += '<td class="scorecard-total">TOT</td>';
        html += '</tr>';

        // Yds row
        html += '<tr class="scorecard-yardage"><td class="scorecard-label">Yds</td>';
        let fy = 0, by = 0;
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            const yds = ch?.yardage || '';
            if (i <= 9) fy += (ch?.yardage || 0); else by += (ch?.yardage || 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${fy || ''}</td>`;
            html += `<td class="scorecard-cell">${yds}</td>`;
        }
        html += `<td class="scorecard-total">${is18 ? (by || '') : (fy || '')}</td>`;
        if (is18) html += `<td class="scorecard-total">${fy + by || ''}</td>`;
        html += '</tr>';

        // Par row
        html += '<tr class="scorecard-par"><td class="scorecard-label">Par</td>';
        let fp = 0, bp = 0;
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            const par = ch?.par || '';
            if (i <= 9) fp += (ch?.par || 0); else bp += (ch?.par || 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${fp || ''}</td>`;
            html += `<td class="scorecard-cell">${par}</td>`;
        }
        html += `<td class="scorecard-total">${is18 ? (bp || '') : (fp || '')}</td>`;
        if (is18) html += `<td class="scorecard-total">${fp + bp || ''}</td>`;
        html += '</tr>';

        // HCP row
        html += '<tr class="scorecard-hcp"><td class="scorecard-label">HCP</td>';
        for (let i = 1; i <= numHoles; i++) {
            const ch = courseHoles.find(h => h.hole_number === i);
            if (is18 && i === 10) html += '<td class="scorecard-total"></td>';
            html += `<td class="scorecard-cell">${ch?.handicap || ''}</td>`;
        }
        html += '<td class="scorecard-total"></td>';
        if (is18) html += '<td class="scorecard-total"></td>';
        html += '</tr>';

        // Goal row
        html += '<tr class="scorecard-goal"><td class="scorecard-label">Goal</td>';
        let fg = 0, bg = 0, hasGoals = false;
        for (let i = 1; i <= numHoles; i++) {
            const g = goals[i] || '';
            const ch = courseHoles.find(h => h.hole_number === i);
            const par = ch?.par || 0;
            let gcls = '';
            if (g && par) {
                const diff = g - par;
                if (diff <= -2) gcls = ' score-eagle';
                else if (diff === -1) gcls = ' score-birdie';
                else if (diff === 0) gcls = ' score-par';
                else if (diff === 1) gcls = ' score-bogey';
                else if (diff >= 2) gcls = ' score-double';
            }
            if (g) { hasGoals = true; if (i <= 9) fg += g; else bg += g; }
            if (is18 && i === 10) html += `<td class="scorecard-total">${hasGoals ? fg || '' : ''}</td>`;
            html += `<td class="scorecard-cell scorecard-goal-cell${gcls}" data-hole="${i}" title="Click to set goal">${g}</td>`;
        }
        html += `<td class="scorecard-total">${hasGoals ? (is18 ? bg : fg) || '' : ''}</td>`;
        if (is18) html += `<td class="scorecard-total">${hasGoals ? (fg + bg) || '' : ''}</td>`;
        html += '</tr>';

        // Score row
        const scoreLabel = editorViewMode === 'historic' ? 'Best' : 'Score';
        html += `<tr class="scorecard-score"><td class="scorecard-label">${scoreLabel}</td>`;
        let fs = 0, bs = 0, hasScores = false;
        for (let i = 1; i <= numHoles; i++) {
            const sd = scoreData[i];
            const ch = courseHoles.find(h => h.hole_number === i);
            const par = ch?.par || 0;
            let strokes = '';
            let cls = '';
            if (editorViewMode === 'historic' && sd) { strokes = sd.best; hasScores = true; }
            else if (sd && sd.strokes) { strokes = sd.strokes; hasScores = true; }
            if (strokes && par) {
                const diff = strokes - par;
                if (diff <= -2) cls = ' score-eagle';
                else if (diff === -1) cls = ' score-birdie';
                else if (diff === 0) cls = ' score-par';
                else if (diff === 1) cls = ' score-bogey';
                else cls = ' score-double';
            }
            if (i <= 9) fs += (typeof strokes === 'number' ? strokes : 0);
            else bs += (typeof strokes === 'number' ? strokes : 0);
            if (is18 && i === 10) html += `<td class="scorecard-total">${hasScores ? fs : ''}</td>`;
            const active = i === editorCurrentHole ? ' active' : '';
            html += `<td class="scorecard-cell${cls}${active}" data-hole="${i}">${strokes}</td>`;
        }
        html += `<td class="scorecard-total">${hasScores ? (is18 ? bs : fs) : ''}</td>`;
        if (is18) html += `<td class="scorecard-total">${hasScores ? fs + bs : ''}</td>`;
        html += '</tr>';

        // Avg row (historic only)
        if (editorViewMode === 'historic' && Object.keys(scoreData).length > 0) {
            html += '<tr class="scorecard-avg"><td class="scorecard-label">Avg</td>';
            let fa = 0, ba = 0;
            for (let i = 1; i <= numHoles; i++) {
                const sd = scoreData[i];
                const avg = sd?.avg ? sd.avg.toFixed(1) : '';
                if (i <= 9) fa += (sd?.avg || 0); else ba += (sd?.avg || 0);
                if (is18 && i === 10) html += `<td class="scorecard-total">${fa ? fa.toFixed(1) : ''}</td>`;
                html += `<td class="scorecard-cell">${avg}</td>`;
            }
            html += `<td class="scorecard-total">${(is18 ? ba : fa) ? (is18 ? ba : fa).toFixed(1) : ''}</td>`;
            if (is18) html += `<td class="scorecard-total">${(fa + ba).toFixed(1)}</td>`;
            html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

        // Click handlers: hole navigation
        container.querySelectorAll('.scorecard-header .scorecard-cell[data-hole], .scorecard-score .scorecard-cell[data-hole]').forEach(cell => {
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => {
                const hole = parseInt(cell.dataset.hole);
                editorCurrentHole = hole;
                const quickLabel = document.getElementById('editor-hole-quick-label');
                if (quickLabel) quickLabel.textContent = hole;
                editorSelectHole(hole);
                editorRenderScorecard();
            });
        });

        // Click handlers: goal editing
        container.querySelectorAll('.scorecard-goal-cell').forEach(cell => {
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => {
                const hole = parseInt(cell.dataset.hole);
                const current = goals[hole] || '';
                const input = document.createElement('input');
                input.type = 'number';
                input.min = 1;
                input.max = 12;
                input.value = current;
                input.className = 'edit-input';
                input.style.cssText = 'width:100%;height:100%;text-align:center;font-size:0.75rem;padding:0;border:none;background:var(--accent-dim);';
                cell.textContent = '';
                cell.appendChild(input);
                input.focus();
                input.select();
                const finish = () => {
                    editorSaveGoal(hole, input.value);
                    editorRenderScorecard();
                };
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') { input.value = current; input.blur(); }
                });
            });
        });
    }

    // Re-render scorecard when hole changes
    const _origEditorSelectHole = editorSelectHole;
    editorSelectHole = function(holeNum) {
        _origEditorSelectHole(holeNum);
        editorRenderScorecard();
        editorRenderHoleOverview();
    };

    // Render scorecard when panel opens (lazy-load historic data)
    const scorecardPanel = document.querySelector('.editor-float-panel[data-float-panel="scorecard"]');
    if (scorecardPanel) {
        const observer = new MutationObserver(async () => {
            if (scorecardPanel.style.display !== 'none') {
                editorPopulateScorecardTee();
                // Lazy-load all round details for historic mode on first open
                if (editorViewMode === 'historic' && editorAllRoundDetails.length === 0 && editorRounds.length > 0) {
                    for (const r of editorRounds) {
                        try {
                            const resp = await fetch(`/api/rounds/${r.id}`);
                            editorAllRoundDetails.push(await resp.json());
                        } catch (e) { /* skip */ }
                    }
                }
                editorRenderScorecard();
            }
        });
        observer.observe(scorecardPanel, { attributes: true, attributeFilter: ['style'] });
    }

    // ========== Hole Overview ==========

    function editorRenderHoleOverview() {
        const container = document.getElementById('editor-hole-overview');
        if (!container || !editorCourse) return;

        const tee = (editorCourse.tees || []).find(t => t.id === editorTeeId);
        const courseHoles = tee?.holes || [];
        const ch = courseHoles.find(h => h.hole_number === editorCurrentHole);
        const par = ch?.par || 0;
        const holeNum = editorCurrentHole;

        // Filter round details by tee
        const teeRounds = editorAllRoundDetails.filter(r => r.tee_id === editorTeeId);

        if (editorViewMode === 'historic') {
            // === HISTORIC MODE ===
            if (teeRounds.length === 0) {
                container.innerHTML = `<div style="font-size:0.82rem; font-weight:600; margin-bottom:8px;">Hole ${holeNum} — Par ${par}</div>
                    <div class="strategy-empty">No rounds on this tee</div>`;
                return;
            }

            // Scores
            const hs = editorComputeHistoricScores()[holeNum];

            // Putts
            const allPutts = teeRounds
                .map(r => (r.holes || []).find(h => h.hole_number === holeNum)?.putts)
                .filter(p => p != null);
            const avgPutts = allPutts.length > 0 ? (allPutts.reduce((a, b) => a + b, 0) / allPutts.length).toFixed(1) : '—';

            // Fairway
            const allFairways = teeRounds
                .map(r => (r.holes || []).find(h => h.hole_number === holeNum)?.fairway)
                .filter(f => f != null);
            const fwHits = allFairways.filter(f => f === 'HIT').length;
            const fwLeft = allFairways.filter(f => f === 'LEFT').length;
            const fwRight = allFairways.filter(f => f === 'RIGHT').length;
            const fwTotal = allFairways.length;
            const fwPct = fwTotal > 0 ? Math.round(fwHits / fwTotal * 100) : null;

            // Top tee club
            const teeShots = teeRounds
                .flatMap(r => (r.holes || []).find(h => h.hole_number === holeNum)?.shots || [])
                .filter(s => s.shot_number === 1 && s.club);
            const clubCounts = {};
            teeShots.forEach(s => { clubCounts[s.club] = (clubCounts[s.club] || 0) + 1; });
            const topClub = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0];

            // Avg drive
            const driveYards = teeShots.filter(s => s.distance_yards).map(s => s.distance_yards);
            const avgDrive = driveYards.length > 0 ? Math.round(driveYards.reduce((a, b) => a + b, 0) / driveYards.length) : null;

            // Miss tendency
            let missHtml = '';
            if (fwTotal >= 3) {
                const leftPct = Math.round(fwLeft / fwTotal * 100);
                const rightPct = Math.round(fwRight / fwTotal * 100);
                if (leftPct >= 50) missHtml = `<span style="color:var(--warning);">${leftPct}% left</span>`;
                else if (rightPct >= 50) missHtml = `<span style="color:var(--warning);">${rightPct}% right</span>`;
            }

            // GIR rate
            const allGir = teeRounds
                .map(r => (r.holes || []).find(h => h.hole_number === holeNum)?.gir)
                .filter(g => g != null);
            const girHits = allGir.filter(g => g === true).length;
            const girTotal = allGir.length;
            const girPct = girTotal > 0 ? Math.round(girHits / girTotal * 100) : null;

            // Scoring distribution
            const allScores = teeRounds
                .map(r => (r.holes || []).find(h => h.hole_number === holeNum))
                .filter(rh => rh && rh.strokes > 0);
            let distHtml = '';
            if (allScores.length > 0 && par > 0) {
                const buckets = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
                allScores.forEach(rh => {
                    const d = rh.strokes - par;
                    if (d <= -2) buckets.eagle++;
                    else if (d === -1) buckets.birdie++;
                    else if (d === 0) buckets.par++;
                    else if (d === 1) buckets.bogey++;
                    else buckets.double++;
                });
                const total = allScores.length;
                const parts = [];
                if (buckets.eagle) parts.push(`<span class="score-eagle">${buckets.eagle} eagle</span>`);
                if (buckets.birdie) parts.push(`<span class="score-birdie">${buckets.birdie} birdie</span>`);
                if (buckets.par) parts.push(`<span class="score-par">${buckets.par} par</span>`);
                if (buckets.bogey) parts.push(`<span class="score-bogey">${buckets.bogey} bogey</span>`);
                if (buckets.double) parts.push(`<span class="score-double">${buckets.double} double+</span>`);
                distHtml = parts.join(' · ');
            }

            // Avg SG per category (historic)
            const allShots = teeRounds
                .flatMap(r => (r.holes || []).find(h => h.hole_number === holeNum)?.shots || []);
            const sgByTypHist = {};
            const catLabelsHist = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' };
            let totalSgShots = 0;
            for (const s of allShots) {
                if (s.sg_pga != null) {
                    const cat = classifySgCategory(s, par);
                    if (cat) {
                        if (!sgByTypHist[cat]) sgByTypHist[cat] = { total: 0, count: 0 };
                        sgByTypHist[cat].total += s.sg_pga;
                        sgByTypHist[cat].count++;
                        totalSgShots++;
                    }
                }
            }
            let sgHistHtml = '';
            if (totalSgShots > 0) {
                sgHistHtml = Object.entries(sgByTypHist)
                    .map(([cat, d]) => {
                        const avg = d.total / teeRounds.length;
                        const c = avg >= 0 ? 'var(--accent)' : 'var(--danger)';
                        return `<span style="color:${c};">${catLabelsHist[cat]}: ${avg.toFixed(2)}</span>`;
                    }).join(' · ');
            }

            // Difficulty rank among all holes
            const allHoleScores = editorComputeHistoricScores();
            let difficultyRank = '';
            if (Object.keys(allHoleScores).length > 1 && hs) {
                const ranked = Object.entries(allHoleScores)
                    .map(([h, data]) => ({ hole: parseInt(h), vspar: data.avg - data.par }))
                    .sort((a, b) => b.vspar - a.vspar); // hardest first
                const pos = ranked.findIndex(r => r.hole === holeNum) + 1;
                const total = ranked.length;
                if (pos === 1) difficultyRank = 'Hardest hole';
                else if (pos === total) difficultyRank = 'Easiest hole';
                else if (pos <= 3) difficultyRank = `${pos}${pos === 2 ? 'nd' : 'rd'} hardest`;
                else if (pos >= total - 2) difficultyRank = `${total - pos + 1}${total - pos + 1 === 2 ? 'nd' : 'rd'} easiest`;
                else difficultyRank = `#${pos}/${total} difficulty`;
            }

            // Best/avg score formatting
            let bestHtml = '—', avgHtml = '—';
            if (hs) {
                const bestDiff = hs.best - par;
                const bestCls = bestDiff <= -2 ? 'score-eagle' : bestDiff === -1 ? 'score-birdie' : bestDiff === 0 ? 'score-par' : bestDiff === 1 ? 'score-bogey' : 'score-double';
                bestHtml = `<span class="${bestCls}">${hs.best} (${bestDiff >= 0 ? '+' : ''}${bestDiff})</span>`;
                const avgDiff = hs.avg - par;
                const avgCls = avgDiff < -0.5 ? 'color:var(--accent)' : avgDiff > 0.5 ? 'color:var(--danger)' : 'color:var(--text)';
                avgHtml = `<span style="${avgCls}">${hs.avg.toFixed(1)} (${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)})</span>`;
            }

            container.innerHTML = `
                <div style="font-size:0.82rem; font-weight:600; margin-bottom:2px;">Hole ${holeNum} — Par ${par}${difficultyRank ? ` · <span style="font-size:0.72rem; color:var(--text-muted); font-weight:400;">${difficultyRank}</span>` : ''}</div>
                <div style="font-size:0.7rem; color:var(--text-dim); margin-bottom:10px;">${teeRounds.length} round${teeRounds.length !== 1 ? 's' : ''}</div>
                <div class="hole-stats-grid">
                    <div class="hole-stat"><span class="hole-stat-label">Best</span><span class="hole-stat-value">${bestHtml}</span></div>
                    <div class="hole-stat"><span class="hole-stat-label">Average</span><span class="hole-stat-value">${avgHtml}</span></div>
                    <div class="hole-stat"><span class="hole-stat-label">Avg Putts</span><span class="hole-stat-value">${avgPutts}</span></div>
                    ${girPct !== null ? `<div class="hole-stat"><span class="hole-stat-label">GIR</span><span class="hole-stat-value" style="color:${girPct >= 50 ? 'var(--accent)' : girPct > 0 ? 'var(--warning)' : 'var(--danger)'};">${girPct}% (${girHits}/${girTotal})</span></div>` : ''}
                    ${fwPct !== null ? `<div class="hole-stat"><span class="hole-stat-label">Fairway</span><span class="hole-stat-value">${fwPct}% (${fwHits}/${fwTotal})</span></div>` : ''}
                    ${missHtml ? `<div class="hole-stat"><span class="hole-stat-label">Miss Tendency</span><span class="hole-stat-value">${missHtml}</span></div>` : ''}
                    ${topClub ? `<div class="hole-stat"><span class="hole-stat-label">Tee Club</span><span class="hole-stat-value">${topClub[0]} (${topClub[1]}x)</span></div>` : ''}
                    ${avgDrive ? `<div class="hole-stat"><span class="hole-stat-label">Avg Drive</span><span class="hole-stat-value">${avgDrive}y</span></div>` : ''}
                </div>
                ${distHtml ? `<div style="font-size:0.72rem; margin-top:8px; padding-top:6px; border-top:1px solid var(--border);">${distHtml}</div>` : ''}
                ${sgHistHtml ? `<div style="font-size:0.72rem; margin-top:6px; padding-top:6px; border-top:1px solid var(--border);">Avg SG: ${sgHistHtml}</div>` : ''}
                ${(() => {
                    const hints = [];
                    if (!ch?.tee_lat) hints.push('Add tee GPS position in Drawing Tools for richer analysis');
                    if (!ch?.flag_lat) hints.push('Add green GPS position in Drawing Tools for SG data');
                    if (!ch?.fairway_path) hints.push('Add a fairway path in Drawing Tools for distance markers');
                    if (teeRounds.length < 3) hints.push('Play more rounds for better historic accuracy');
                    return hints.length > 0 ? '<div style="margin-top:8px; padding-top:6px; border-top:1px solid var(--border);">' +
                        hints.map(h => '<div style="font-size:0.68rem; color:var(--text-dim); font-style:italic; margin-bottom:2px;">* ' + h + '</div>').join('') + '</div>' : '';
                })()}`;
        } else {
            // === ROUND MODE ===
            if (!editorRoundDetail) {
                container.innerHTML = '<div class="strategy-empty">No round selected</div>';
                return;
            }

            const rh = (editorRoundDetail.holes || []).find(h => h.hole_number === holeNum);
            if (!rh) {
                container.innerHTML = `<div style="font-size:0.82rem; font-weight:600; margin-bottom:8px;">Hole ${holeNum} — Par ${par}</div>
                    <div class="strategy-empty">No data for this hole in selected round</div>`;
                return;
            }

            // Score color + comparison to avg
            const scoreDiff = (rh.strokes || 0) - par;
            const scoreCls = scoreDiff <= -2 ? 'score-eagle' : scoreDiff === -1 ? 'score-birdie' : scoreDiff === 0 ? 'score-par' : scoreDiff === 1 ? 'score-bogey' : 'score-double';
            const scoreStr = `${rh.strokes} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`;

            // Historic comparison
            const hs = editorComputeHistoricScores()[holeNum];
            let scoreVsAvg = '', verdictHtml = '';
            let avgComp = '', bestComp = '';
            if (hs) {
                const vsAvg = rh.strokes - hs.avg;
                const vsAvgStr = `${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)} vs avg`;
                const vsAvgColor = vsAvg <= -0.5 ? 'var(--accent)' : vsAvg >= 0.5 ? 'var(--danger)' : 'var(--text-muted)';
                scoreVsAvg = `<span style="color:${vsAvgColor}; font-size:0.72rem; margin-left:4px;">(${vsAvgStr})</span>`;
                // Verdict badge
                if (vsAvg <= -1) verdictHtml = ' <span style="background:#22c55e1a;color:#22c55e;padding:2px 8px;border-radius:4px;font-size:0.72rem;">Great hole</span>';
                else if (vsAvg <= -0.3) verdictHtml = ' <span style="background:#22c55e1a;color:#22c55e;padding:2px 8px;border-radius:4px;font-size:0.72rem;">Above average</span>';
                else if (vsAvg >= 1) verdictHtml = ' <span style="background:#ef44441a;color:#ef4444;padding:2px 8px;border-radius:4px;font-size:0.72rem;">Below average</span>';
                else verdictHtml = ' <span style="background:#3b82f61a;color:#3b82f6;padding:2px 8px;border-radius:4px;font-size:0.72rem;">Average</span>';
                avgComp = `<div class="hole-stat"><span class="hole-stat-label">Hole Avg</span><span class="hole-stat-value">${hs.avg.toFixed(1)}</span></div>`;
                bestComp = `<div class="hole-stat"><span class="hole-stat-label">Hole Best</span><span class="hole-stat-value">${hs.best}</span></div>`;
            }

            // Putts comparison to avg
            const teeRoundsForAvg = editorAllRoundDetails.filter(r => r.tee_id === editorTeeId);
            const allPuttsAvg = teeRoundsForAvg
                .map(r => (r.holes || []).find(h => h.hole_number === holeNum)?.putts)
                .filter(p => p != null);
            let puttsComp = '';
            if (allPuttsAvg.length > 0) {
                const pAvg = allPuttsAvg.reduce((a, b) => a + b, 0) / allPuttsAvg.length;
                const pDiff = (rh.putts || 0) - pAvg;
                const pColor = pDiff <= -0.3 ? 'var(--accent)' : pDiff >= 0.3 ? 'var(--danger)' : 'var(--text-muted)';
                puttsComp = `<span style="color:${pColor}; font-size:0.72rem;"> (${pDiff >= 0 ? '+' : ''}${pDiff.toFixed(1)} avg)</span>`;
            }

            // GIR
            const girHtml = rh.gir != null ? `<div class="hole-stat"><span class="hole-stat-label">GIR</span><span class="hole-stat-value" style="color:${rh.gir ? 'var(--accent)' : 'var(--danger)'};">${rh.gir ? 'Yes' : 'No'}</span></div>` : '';

            // SG
            let sgPga = 0, sgPersonal = 0, sgCount = 0;
            const sgByType = {};
            const catLabels = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' };
            for (const s of (rh.shots || [])) {
                if (s.sg_pga != null) {
                    sgPga += s.sg_pga;
                    sgCount++;
                    const cat = classifySgCategory(s, par);
                    if (cat) {
                        if (!sgByType[cat]) sgByType[cat] = 0;
                        sgByType[cat] += s.sg_pga;
                    }
                }
                if (s.sg_personal != null) sgPersonal += s.sg_personal;
            }

            const sgPgaStr = sgCount > 0 ? sgPga.toFixed(2) : '—';
            const sgPersStr = sgCount > 0 ? sgPersonal.toFixed(2) : '—';
            const sgPgaColor = sgPga >= 0 ? 'var(--accent)' : 'var(--danger)';
            const sgPersColor = sgPersonal >= 0 ? 'var(--accent)' : 'var(--danger)';

            // SG breakdown line
            let sgBreakdown = '';
            if (sgCount > 0) {
                sgBreakdown = Object.entries(sgByType)
                    .map(([cat, v]) => {
                        const c = v >= 0 ? 'var(--accent)' : 'var(--danger)';
                        return `<span style="color:${c};">${catLabels[cat] || cat}: ${v.toFixed(2)}</span>`;
                    }).join(' · ');
            }

            // Round date
            const roundDate = editorRoundDetail.date ? new Date(editorRoundDetail.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

            container.innerHTML = `
                <div style="font-size:0.82rem; font-weight:600; margin-bottom:4px;">Hole ${holeNum} — Par ${par}</div>
                <div style="font-size:0.72rem; color:var(--text-dim); margin-bottom:10px;">${roundDate} · ${editorRoundDetail.total_strokes}(${editorRoundDetail.score_vs_par >= 0 ? '+' : ''}${editorRoundDetail.score_vs_par})</div>
                <div class="hole-stats-grid">
                    <div class="hole-stat"><span class="hole-stat-label">Score</span><span class="hole-stat-value ${scoreCls}">${scoreStr}${scoreVsAvg}${verdictHtml}</span></div>
                    <div class="hole-stat"><span class="hole-stat-label">Putts</span><span class="hole-stat-value">${rh.putts ?? '—'}${puttsComp}</span></div>
                    <div class="hole-stat"><span class="hole-stat-label">Fairway</span><span class="hole-stat-value">${rh.fairway || '—'}</span></div>
                    ${girHtml}
                    ${rh.penalty_strokes ? `<div class="hole-stat"><span class="hole-stat-label">Penalties</span><span class="hole-stat-value" style="color:var(--danger);">${rh.penalty_strokes}</span></div>` : ''}
                    ${sgCount > 0 ? `<div class="hole-stat"><span class="hole-stat-label">SG vs PGA</span><span class="hole-stat-value" style="color:${sgPgaColor};">${sgPgaStr}</span></div>` : ''}
                    ${sgCount > 0 ? `<div class="hole-stat"><span class="hole-stat-label">SG vs Personal</span><span class="hole-stat-value" style="color:${sgPersColor};">${sgPersStr}</span></div>` : ''}
                    ${avgComp}${bestComp}
                </div>
                ${sgBreakdown ? `<div style="font-size:0.72rem; margin-top:8px; padding-top:6px; border-top:1px solid var(--border);">${sgBreakdown}</div>` : ''}
                ${(() => {
                    const hints = [];
                    if (sgCount === 0) {
                        if (!ch?.tee_lat) hints.push('Add tee GPS position for strokes gained data');
                        else if (!ch?.flag_lat) hints.push('Add green GPS position for strokes gained data');
                        else hints.push('Recalculate shots to generate strokes gained data');
                    }
                    if (!rh.fairway && par >= 4) hints.push('No fairway data — Garmin may not have tracked this hole');
                    if (!rh.gir) hints.push('No GIR data available');
                    return hints.length > 0 ? '<div style="margin-top:8px; padding-top:6px; border-top:1px solid var(--border);">' +
                        hints.map(h => '<div style="font-size:0.68rem; color:var(--text-dim); font-style:italic; margin-bottom:2px;">* ' + h + '</div>').join('') + '</div>' : '';
                })()}`;
        }
    }

    // Re-render overview when panel opens (lazy-load historic data if needed)
    const overviewPanel = document.querySelector('.editor-float-panel[data-float-panel="overview"]');
    if (overviewPanel) {
        const observer = new MutationObserver(async () => {
            if (overviewPanel.style.display !== 'none') {
                if (editorViewMode === 'historic' && editorAllRoundDetails.length === 0 && editorRounds.length > 0) {
                    for (const r of editorRounds) {
                        try {
                            const resp = await fetch(`/api/rounds/${r.id}`);
                            editorAllRoundDetails.push(await resp.json());
                        } catch (e) { /* skip */ }
                    }
                }
                editorRenderHoleOverview();
            }
        });
        observer.observe(overviewPanel, { attributes: true, attributeFilter: ['style'] });
    }

    // ========== Strategy Tools ==========

    (function initStrategyTools() {
        const clubSelect = document.getElementById('strategy-club-select');
        const instructions = document.getElementById('strategy-instructions');
        const resultsSection = document.getElementById('strategy-results');
        const resultsContent = document.getElementById('strategy-results-content');
        const toolButtons = document.querySelectorAll('[data-strategy-tool]');
        if (!clubSelect) return;

        let activeStratTool = 'cone';
        let strategyLayers = L.layerGroup();
        let strategyAdded = false;
        let stratDragging = false;
        let stratOrigin = null;
        let ballPos = null; // custom ball position (null = use tee)
        let ballMarker = null;

        const ballPosEl = document.getElementById('strategy-ball-pos');
        const ballLabel = document.getElementById('strategy-ball-label');
        const ballReset = document.getElementById('strategy-ball-reset');

        const toolInstructions = {
            ruler: 'Click & drag to measure distance',
            cone: 'Click & drag from a spot to aim your shot',
            landing: 'Click a spot to see where the ball lands',
            carry: 'Click a point to check carry distances',
            recommend: 'Click a target to get club recommendations',
            placeball: 'Click to place ball position (used by Carry & Club Rec)',
        };

        function getShotOrigin() {
            return ballPos || editorTeePos || null;
        }

        function updateBallDisplay() {
            if (ballPos) {
                ballPosEl.style.display = '';
                ballLabel.textContent = 'Custom';
            } else {
                ballPosEl.style.display = '';
                ballLabel.textContent = 'Tee';
            }
        }

        ballReset?.addEventListener('click', () => {
            ballPos = null;
            if (ballMarker) { strategyLayers.removeLayer(ballMarker); ballMarker = null; }
            updateBallDisplay();
        });

        // --- Populate club dropdown from strategy data ---
        function populateClubs() {
            const clubs = editorStrategy?.player?.clubs || [];
            clubSelect.innerHTML = '';
            clubs.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.club_type;
                opt.textContent = `${c.club_type} (${Math.round(c.avg_yards)}y)`;
                opt.style.color = c.color || '';
                clubSelect.appendChild(opt);
            });
        }

        // --- Get club data ---
        function getClubData(clubType) {
            const club = (editorStrategy?.player?.clubs || []).find(c => c.club_type === clubType);
            if (!club) return null;
            const lateral = editorStrategy?.player?.lateral_dispersion?.[clubType];
            const miss = editorStrategy?.player?.miss_tendencies?.[clubType];
            return {
                type: clubType,
                color: club.color || '#4CAF50',
                avg: club.avg_yards,
                std: club.std_dev || club.avg_yards * 0.08,
                p10: club.p10 || club.avg_yards * 0.88,
                p90: club.p90 || club.avg_yards * 1.12,
                lateralStd: Math.min(lateral?.lateral_std_dev || (club.std_dev ? club.std_dev * 0.15 : 8), club.avg_yards * 0.12),
                lateralMean: lateral?.lateral_mean || 0,
                missLeft: miss?.left_pct || 33,
                missRight: miss?.right_pct || 33,
                missCenter: miss?.center_pct || 34,
                samples: club.sample_count || 0,
            };
        }

        // --- Ensure layer group is on map ---
        function ensureLayers() {
            if (!strategyAdded && typeof editorMap !== 'undefined' && editorMap) {
                strategyLayers.addTo(editorMap);
                strategyAdded = true;
            }
        }

        // --- Calculate destination point given origin, bearing (radians), distance (yards) ---
        function destPoint(lat, lng, bearingRad, distYards) {
            const R = 6371000; // earth radius meters
            const distM = distYards / 1.09361;
            const lat1 = lat * Math.PI / 180;
            const lng1 = lng * Math.PI / 180;
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distM / R) + Math.cos(lat1) * Math.sin(distM / R) * Math.cos(bearingRad));
            const lng2 = lng1 + Math.atan2(Math.sin(bearingRad) * Math.sin(distM / R) * Math.cos(lat1), Math.cos(distM / R) - Math.sin(lat1) * Math.sin(lat2));
            return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
        }

        // --- Calculate bearing from point A to point B ---
        function bearing(lat1, lng1, lat2, lng2) {
            const toRad = d => d * Math.PI / 180;
            const dLng = toRad(lng2 - lng1);
            const y = Math.sin(dLng) * Math.cos(toRad(lat2));
            const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
            return Math.atan2(y, x);
        }

        // --- Normal CDF approximation ---
        function normalCDF(x) {
            const t = 1 / (1 + 0.2316419 * Math.abs(x));
            const d = 0.3989422804 * Math.exp(-x * x / 2);
            const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
            return x > 0 ? 1 - p : p;
        }

        // --- Tool selection ---
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                activeStratTool = btn.dataset.strategyTool;
                toolButtons.forEach(b => b.classList.toggle('active', b === btn));
                instructions.textContent = toolInstructions[activeStratTool] || '';
                resultsSection.style.display = 'none';
                // Don't clear ball marker when switching tools
                strategyLayers.eachLayer(l => { if (l !== ballMarker) strategyLayers.removeLayer(l); });

                // Deactivate standalone measure tool if active
                const standaloneBtn = document.getElementById('btn-measure-tool');
                if (standaloneBtn?.classList.contains('active')) standaloneBtn.click();

                // Set cursor
                if (editorMap) {
                    editorMap.getContainer().style.cursor =
                        (activeStratTool === 'ruler' || activeStratTool === 'cone') ? 'crosshair' : 'pointer';
                }
            });
        });

        // ===== DISPERSION CONE =====
        function drawCone(originLat, originLng, aimBearing, club) {
            strategyLayers.clearLayers();
            ensureLayers();

            const cc = club.color;
            const spreadAngleInner = Math.atan2(club.lateralStd, club.avg);       // ±1σ
            const spreadAngleOuter = Math.atan2(club.lateralStd * 2, club.avg);   // ±2σ

            // Bias shifts the CONE away from aim line based on miss tendency
            const biasAngle = ((club.missRight - club.missLeft) / 100) * spreadAngleOuter * 0.5;
            const coneBearing = aimBearing + biasAngle;

            const steps = 20;

            // Outer cone (±2σ, p90 distance)
            const outerPts = [[originLat, originLng]];
            for (let i = 0; i <= steps; i++) {
                const frac = i / steps;
                const angle = coneBearing - spreadAngleOuter + frac * spreadAngleOuter * 2;
                const pt = destPoint(originLat, originLng, angle, club.p90);
                outerPts.push([pt.lat, pt.lng]);
            }
            L.polygon(outerPts, {
                color: cc, weight: 1, fillColor: cc, fillOpacity: 0.1, interactive: false,
            }).addTo(strategyLayers);

            // Inner cone (±1σ, avg distance)
            const innerPts = [[originLat, originLng]];
            for (let i = 0; i <= steps; i++) {
                const frac = i / steps;
                const angle = coneBearing - spreadAngleInner + frac * spreadAngleInner * 2;
                const pt = destPoint(originLat, originLng, angle, club.avg);
                innerPts.push([pt.lat, pt.lng]);
            }
            L.polygon(innerPts, {
                color: cc, weight: 1, fillColor: cc, fillOpacity: 0.18, interactive: false,
            }).addTo(strategyLayers);

            // TRUE AIM LINE — where you're actually pointing (no bias)
            const aimPt = destPoint(originLat, originLng, aimBearing, club.avg);
            L.polyline([[originLat, originLng], [aimPt.lat, aimPt.lng]], {
                color: '#fff', weight: 1.5, dashArray: '6,4', interactive: false, opacity: 0.7,
            }).addTo(strategyLayers);

            // Label
            const coneCenterPt = destPoint(originLat, originLng, coneBearing, club.avg);
            L.marker([coneCenterPt.lat, coneCenterPt.lng], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="display:inline-block;background:rgba(0,0,0,0.8);color:${cc};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${club.type} ${Math.round(club.avg)}y</div>`,
                    iconSize: [0, 0],
                }),
                interactive: false,
            }).addTo(strategyLayers);

            // Origin dot
            L.circleMarker([originLat, originLng], {
                radius: 4, color: cc, fillColor: cc, fillOpacity: 1, interactive: false,
            }).addTo(strategyLayers);
        }

        // ===== LANDING ZONE =====
        // ===== LANDING ZONE (180° Distance Arc) =====
        function drawLandingZone(clickLat, clickLng, club) {
            strategyLayers.eachLayer(l => { if (l !== ballMarker) strategyLayers.removeLayer(l); });
            ensureLayers();

            const cc = club.color;

            // Aim toward green, fall back to north
            let aimBear = 0;
            if (editorGreenPos) {
                aimBear = bearing(clickLat, clickLng, editorGreenPos.lat, editorGreenPos.lng);
            } else if (editorTeePos) {
                aimBear = bearing(editorTeePos.lat, editorTeePos.lng, clickLat, clickLng);
            }

            const steps = 24;

            // Helper: build a 180° arc of points at a given distance
            function arcPoints(dist) {
                const pts = [];
                for (let i = 0; i <= steps; i++) {
                    const frac = i / steps;
                    const angle = aimBear - Math.PI / 2 + frac * Math.PI; // -90° to +90° from aim
                    const pt = destPoint(clickLat, clickLng, angle, dist);
                    pts.push([pt.lat, pt.lng]);
                }
                return pts;
            }

            // Outer band: p10 to p90 (full reachable range)
            const outerArc = arcPoints(club.p90);
            const innerArcReverse = arcPoints(club.p10).reverse();
            const outerBand = [...outerArc, ...innerArcReverse];
            L.polygon(outerBand, {
                color: cc, weight: 1, fillColor: cc, fillOpacity: 0.08, interactive: false,
            }).addTo(strategyLayers);

            // Inner band: avg ± 0.5*std (most likely landing)
            const innerNear = arcPoints(Math.max(club.avg - club.std * 0.5, club.p10));
            const innerFar = arcPoints(club.avg + club.std * 0.5);
            const innerFarReverse = innerFar.slice().reverse(); // clone before reversing
            const innerBand = [...innerFarReverse, ...innerNear];
            L.polygon(innerBand, {
                color: cc, weight: 1, fillColor: cc, fillOpacity: 0.15, interactive: false,
            }).addTo(strategyLayers);

            // Avg distance arc line (dashed)
            const avgArc = arcPoints(club.avg);
            L.polyline(avgArc, {
                color: cc, weight: 2, dashArray: '6,4', interactive: false,
            }).addTo(strategyLayers);

            // p10 and p90 arc lines (thin)
            L.polyline(arcPoints(club.p10), {
                color: cc, weight: 1, opacity: 0.4, interactive: false,
            }).addTo(strategyLayers);
            L.polyline(outerArc, {
                color: cc, weight: 1, opacity: 0.4, interactive: false,
            }).addTo(strategyLayers);

            // Label at avg distance along aim direction
            const labelPt = destPoint(clickLat, clickLng, aimBear, club.avg);
            L.marker([labelPt.lat, labelPt.lng], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="display:inline-block;background:rgba(0,0,0,0.8);color:${cc};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${club.type} ${Math.round(club.p10)}-${Math.round(club.p90)}y</div>`,
                    iconSize: [0, 0],
                }),
                interactive: false,
            }).addTo(strategyLayers);

            // Origin marker
            L.circleMarker([clickLat, clickLng], {
                radius: 4, color: '#fff', fillColor: cc, fillOpacity: 1, weight: 2, interactive: false,
            }).addTo(strategyLayers);
        }

        // ===== CARRY CHECK =====
        function doCarryCheck(clickLat, clickLng) {
            strategyLayers.clearLayers();
            ensureLayers();

            // Distance from tee to clicked point
            const from = getShotOrigin();
            const fromLat = from?.lat || clickLat;
            const fromLng = from?.lng || clickLng;
            const targetDist = Math.round(_haversineYards(fromLat, fromLng, clickLat, clickLng));

            // Marker at clicked point
            L.circleMarker([clickLat, clickLng], {
                radius: 6, color: '#f44336', fillColor: '#f44336', fillOpacity: 0.5, weight: 2, interactive: false,
            }).addTo(strategyLayers);

            // Line from tee to point
            if (editorTeePos) {
                L.polyline([[fromLat, fromLng], [clickLat, clickLng]], {
                    color: '#f44336', weight: 1.5, dashArray: '4,4', interactive: false,
                }).addTo(strategyLayers);
            }

            // Calculate carry probability for each club
            const clubs = editorStrategy?.player?.clubs || [];
            let html = `<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:6px;">Distance: <strong style="color:var(--text);">${targetDist}y</strong></div>`;
            const rows = [];
            for (const c of clubs) {
                const std = c.std_dev || c.avg_yards * 0.08;
                if (std === 0) continue;
                const zScore = (targetDist - c.avg_yards) / std;
                const carryPct = Math.round((1 - normalCDF(zScore)) * 100);
                if (carryPct < 1 || carryPct > 99) continue;
                rows.push({ type: c.club_type, avg: c.avg_yards, pct: carryPct });
            }
            rows.sort((a, b) => b.pct - a.pct);

            if (rows.length === 0) {
                html += '<div class="strategy-empty">No clubs with enough data</div>';
            } else {
                for (const r of rows.slice(0, 8)) {
                    const color = r.pct >= 80 ? 'var(--accent)' : r.pct >= 50 ? 'var(--warning)' : 'var(--danger)';
                    html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;">
                        <span>${r.type} (${Math.round(r.avg)}y)</span>
                        <span style="color:${color};font-weight:700;">${r.pct}%</span>
                    </div>`;
                }
            }

            resultsContent.innerHTML = html;
            resultsSection.style.display = '';
        }

        // ===== CLUB RECOMMENDATION =====
        function doClubRecommend(clickLat, clickLng) {
            strategyLayers.clearLayers();
            ensureLayers();

            const from = getShotOrigin();
            const fromLat = from?.lat || clickLat;
            const fromLng = from?.lng || clickLng;
            const targetDist = Math.round(_haversineYards(fromLat, fromLng, clickLat, clickLng));

            // Marker at target
            L.circleMarker([clickLat, clickLng], {
                radius: 6, color: '#2196F3', fillColor: '#2196F3', fillOpacity: 0.5, weight: 2, interactive: false,
            }).addTo(strategyLayers);

            if (editorTeePos) {
                L.polyline([[fromLat, fromLng], [clickLat, clickLng]], {
                    color: '#2196F3', weight: 1.5, dashArray: '4,4', interactive: false,
                }).addTo(strategyLayers);
            }

            // Label at target
            L.marker([clickLat, clickLng], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="display:inline-block;background:rgba(33,150,243,0.9);color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;white-space:nowrap;">${targetDist}y</div>`,
                    iconSize: [0, 0], iconAnchor: [0, -10],
                }),
                interactive: false,
            }).addTo(strategyLayers);

            // Rank clubs by distance match
            const clubs = editorStrategy?.player?.clubs || [];
            let html = `<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:6px;">Target: <strong style="color:var(--text);">${targetDist}y</strong></div>`;
            const ranked = clubs
                .filter(c => c.avg_yards)
                .map(c => {
                    const diff = Math.abs(c.avg_yards - targetDist);
                    const std = c.std_dev || c.avg_yards * 0.08;
                    const matchPct = Math.max(0, Math.round(100 - (diff / std) * 25));
                    return { type: c.club_type, avg: c.avg_yards, diff, matchPct, std };
                })
                .sort((a, b) => a.diff - b.diff);

            if (ranked.length === 0) {
                html += '<div class="strategy-empty">No clubs with data</div>';
            } else {
                for (const r of ranked.slice(0, 5)) {
                    const sign = r.avg > targetDist ? '+' : '';
                    const diffStr = `${sign}${Math.round(r.avg - targetDist)}y`;
                    const color = r.matchPct >= 75 ? 'var(--accent)' : r.matchPct >= 40 ? 'var(--warning)' : 'var(--text-dim)';
                    html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;">
                        <span>${r.type} (${Math.round(r.avg)}y)</span>
                        <span style="color:${color};font-weight:600;">${diffStr}</span>
                    </div>`;
                }
            }

            resultsContent.innerHTML = html;
            resultsSection.style.display = '';
        }

        // ===== RULER (integrated) =====
        let rulerLine = null, rulerLabel = null, rulerOriginMarker = null, rulerCursorMarker = null;

        const targetSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF5722" stroke-width="2">
            <circle cx="12" cy="12" r="8" stroke-dasharray="4,2"/>
            <circle cx="12" cy="12" r="2" fill="#FF5722"/>
            <line x1="12" y1="0" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="24"/>
            <line x1="0" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="24" y2="12"/>
        </svg>`;

        // ===== MAP EVENT HANDLERS =====
        function onStratMouseDown(e) {
            if (e.originalEvent && e.originalEvent.button !== 0) return;
            // Don't interfere with drawing tools
            if (editorDrawPanelOpen && editorTool) return;
            ensureLayers();

            if (activeStratTool === 'ruler') {
                stratDragging = true;
                stratOrigin = { lat: e.latlng.lat, lng: e.latlng.lng };
                // Clear old ruler elements but keep ball marker
                if (rulerLine) strategyLayers.removeLayer(rulerLine);
                if (rulerLabel) strategyLayers.removeLayer(rulerLabel);
                if (rulerOriginMarker) strategyLayers.removeLayer(rulerOriginMarker);
                if (rulerCursorMarker) strategyLayers.removeLayer(rulerCursorMarker);

                rulerOriginMarker = L.circleMarker([stratOrigin.lat, stratOrigin.lng], {
                    radius: 5, color: '#FF5722', fillColor: '#FF5722', fillOpacity: 1, interactive: false,
                }).addTo(strategyLayers);
                rulerCursorMarker = L.marker([stratOrigin.lat, stratOrigin.lng], {
                    icon: L.divIcon({ className: 'measure-target', html: targetSvg, iconSize: [24, 24], iconAnchor: [12, 12] }),
                    interactive: false,
                }).addTo(strategyLayers);
                rulerLine = L.polyline([[stratOrigin.lat, stratOrigin.lng], [stratOrigin.lat, stratOrigin.lng]], {
                    color: '#FF5722', weight: 2.5, interactive: false,
                }).addTo(strategyLayers);
                rulerLabel = L.marker([stratOrigin.lat, stratOrigin.lng], {
                    icon: L.divIcon({ className: '', html: `<div style="display:inline-block;background:rgba(255,87,34,0.92);color:#fff;padding:5px 12px;border-radius:5px;font-size:14px;font-weight:700;white-space:nowrap;line-height:1;margin-left:16px;margin-top:-28px;">0y</div>`, iconSize: [0, 0] }),
                    interactive: false,
                }).addTo(strategyLayers);

                editorMap.dragging.disable();
                return;
            }

            if (activeStratTool === 'cone') {
                const club = getClubData(clubSelect.value);
                if (!club) return;
                stratDragging = true;
                stratOrigin = { lat: e.latlng.lat, lng: e.latlng.lng };
                // Clear non-ball layers
                strategyLayers.eachLayer(l => { if (l !== ballMarker) strategyLayers.removeLayer(l); });
                editorMap.dragging.disable();
            }
        }

        function onStratMouseMove(e) {
            if (!stratDragging || !stratOrigin) return;

            if (activeStratTool === 'ruler') {
                const cur = e.latlng;
                const dist = Math.round(_haversineYards(stratOrigin.lat, stratOrigin.lng, cur.lat, cur.lng));
                rulerLine.setLatLngs([[stratOrigin.lat, stratOrigin.lng], [cur.lat, cur.lng]]);
                if (rulerCursorMarker) rulerCursorMarker.setLatLng([cur.lat, cur.lng]);
                rulerLabel.setLatLng([cur.lat, cur.lng]);
                rulerLabel.setIcon(L.divIcon({
                    className: '',
                    html: `<div style="display:inline-block;background:rgba(255,87,34,0.92);color:#fff;padding:5px 12px;border-radius:5px;font-size:14px;font-weight:700;white-space:nowrap;line-height:1;margin-left:16px;margin-top:-28px;">${dist}y</div>`,
                    iconSize: [0, 0],
                }));
                return;
            }

            if (activeStratTool === 'cone') {
                const club = getClubData(clubSelect.value);
                if (!club) return;
                const aimBear = bearing(stratOrigin.lat, stratOrigin.lng, e.latlng.lat, e.latlng.lng);
                drawCone(stratOrigin.lat, stratOrigin.lng, aimBear, club);
            }
        }

        function onStratMouseUp(e) {
            if (!stratDragging) return;
            stratDragging = false;
            editorMap.dragging.enable();

            if (activeStratTool === 'ruler') {
                // Clear ruler on release
                if (rulerLine) { strategyLayers.removeLayer(rulerLine); rulerLine = null; }
                if (rulerLabel) { strategyLayers.removeLayer(rulerLabel); rulerLabel = null; }
                if (rulerOriginMarker) { strategyLayers.removeLayer(rulerOriginMarker); rulerOriginMarker = null; }
                if (rulerCursorMarker) { strategyLayers.removeLayer(rulerCursorMarker); rulerCursorMarker = null; }
            }
            // Cone persists
        }

        function onStratClick(e) {
            if (e.originalEvent && e.originalEvent.button !== 0) return;
            if (editorDrawPanelOpen && editorTool) return;
            ensureLayers();

            if (activeStratTool === 'placeball') {
                ballPos = { lat: e.latlng.lat, lng: e.latlng.lng };
                if (ballMarker) strategyLayers.removeLayer(ballMarker);
                ballMarker = L.circleMarker([ballPos.lat, ballPos.lng], {
                    radius: 7, color: '#fff', fillColor: '#FFD700', fillOpacity: 1, weight: 2, interactive: false,
                }).addTo(strategyLayers);
                updateBallDisplay();
                return;
            }

            const club = getClubData(clubSelect.value);
            const origin = getShotOrigin();

            if (activeStratTool === 'landing' && club) {
                drawLandingZone(e.latlng.lat, e.latlng.lng, club);
            } else if (activeStratTool === 'carry') {
                doCarryCheck(e.latlng.lat, e.latlng.lng);
            } else if (activeStratTool === 'recommend') {
                doClubRecommend(e.latlng.lat, e.latlng.lng);
            }
        }

        // ===== PANEL OPEN/CLOSE → ATTACH/DETACH MAP EVENTS =====
        // Watch for strategy panel visibility changes
        const stratPanel = document.querySelector('.editor-float-panel[data-float-panel="strategy"]');
        if (stratPanel) {
            const observer = new MutationObserver(() => {
                const isOpen = stratPanel.style.display !== 'none';
                if (isOpen && typeof editorMap !== 'undefined' && editorMap) {
                    populateClubs();
                    updateBallDisplay();
                    ensureLayers();
                    editorMap.getContainer().style.cursor =
                        (activeStratTool === 'ruler' || activeStratTool === 'cone') ? 'crosshair' : 'pointer';
                    editorMap.on('mousedown', onStratMouseDown);
                    editorMap.on('mousemove', onStratMouseMove);
                    editorMap.on('mouseup', onStratMouseUp);
                    editorMap.on('click', onStratClick);
                } else if (typeof editorMap !== 'undefined' && editorMap) {
                    editorMap.off('mousedown', onStratMouseDown);
                    editorMap.off('mousemove', onStratMouseMove);
                    editorMap.off('mouseup', onStratMouseUp);
                    editorMap.off('click', onStratClick);
                    strategyLayers.clearLayers();
                    ballMarker = null;
                    ballPos = null;
                    stratDragging = false;
                    editorMap.dragging.enable();
                    editorMap.getContainer().style.cursor = '';
                    resultsSection.style.display = 'none';
                }
            });
            observer.observe(stratPanel, { attributes: true, attributeFilter: ['style'] });
        }
    })();

    // ========== Editor Panel: Toolbar, Drag, Independent Float Panels ==========

    (function initEditorPanel() {
        const toolbar = document.getElementById('editor-panel');
        const toolbarHeader = document.getElementById('editor-panel-header');
        if (!toolbar || !toolbarHeader) return;

        const layout = toolbar.parentElement; // .course-editor-layout
        const floatPanels = document.querySelectorAll('.editor-float-panel');
        const panelOrder = ['scorecard', 'overview', 'insights', 'strategy', 'hole', 'draw', 'data'];

        // --- Get float panel by id ---
        function getFloatPanel(id) {
            return document.querySelector(`.editor-float-panel[data-float-panel="${id}"]`);
        }

        function isPanelOpen(id) {
            const fp = getFloatPanel(id);
            return fp && fp.style.display !== 'none';
        }

        // --- Toggle a panel (independent of others) ---
        function activateTab(panelId, forceOpen) {
            const fp = getFloatPanel(panelId);
            if (!fp) return;
            const icon = toolbar.querySelector(`.toolbar-icon[data-panel="${panelId}"]`);

            if (isPanelOpen(panelId) && !forceOpen) {
                // Toggle off
                fp.style.display = 'none';
                fp._manuallyPositioned = false;
                if (icon) icon.classList.remove('active');
                if (panelId === 'draw') { editorDrawPanelOpen = false; editorRedraw(); }
                return;
            }
            if (isPanelOpen(panelId)) return; // already open

            fp.style.display = '';
            if (icon) icon.classList.add('active');

            // Position if not manually dragged yet
            if (!fp._manuallyPositioned) {
                positionFloatPanel(fp, panelId);
            }

            // Mutual exclusion: draw and strategy can't be open simultaneously
            if (panelId === 'draw') {
                editorDrawPanelOpen = true;
                editorRedraw();
                // Close strategy panel if open
                const stratFp = getFloatPanel('strategy');
                if (stratFp && stratFp.style.display !== 'none') {
                    stratFp.style.display = 'none';
                    const stratIcon = toolbar.querySelector('.toolbar-icon[data-panel="strategy"]');
                    if (stratIcon) stratIcon.classList.remove('active');
                }
            }
            if (panelId === 'strategy') {
                // Close draw panel if open
                const drawFp = getFloatPanel('draw');
                if (drawFp && drawFp.style.display !== 'none') {
                    drawFp.style.display = 'none';
                    const drawIcon = toolbar.querySelector('.toolbar-icon[data-panel="draw"]');
                    if (drawIcon) drawIcon.classList.remove('active');
                    editorDrawPanelOpen = false;
                    editorRedraw();
                }
            }
        }

        // --- Smart initial positioning: stack below existing open panels ---
        function positionFloatPanel(fp, panelId) {
            const parentRect = layout.getBoundingClientRect();
            const tbRect = toolbar.getBoundingClientRect();
            const relLeft = tbRect.left - parentRect.left;
            const relTop = tbRect.top - parentRect.top;
            const tbCenterX = relLeft + toolbar.offsetWidth / 2;
            const parentCenterX = parentRect.width / 2;
            const gap = 8;
            const panelWidth = fp.offsetWidth || 280;

            // Determine X position (right or left of toolbar)
            let baseX;
            if (tbCenterX < parentCenterX) {
                baseX = relLeft + toolbar.offsetWidth + gap;
            } else {
                baseX = Math.max(0, relLeft - panelWidth - gap);
            }

            // Collect bounding boxes of all currently open, non-manually-positioned panels in same column
            const openRects = [];
            floatPanels.forEach(other => {
                if (other === fp) return;
                if (other.style.display === 'none') return;
                const otherLeft = parseFloat(other.style.left) || 0;
                // Only consider panels in the same horizontal column (within panelWidth proximity)
                if (Math.abs(otherLeft - baseX) < panelWidth) {
                    const otherTop = parseFloat(other.style.top) || 0;
                    openRects.push({ top: otherTop, bottom: otherTop + other.offsetHeight });
                }
            });

            // Sort by top position
            openRects.sort((a, b) => a.top - b.top);

            // Find the first available vertical slot
            let targetTop = relTop; // start at toolbar top
            for (const rect of openRects) {
                // If our target overlaps this panel, push below it
                if (targetTop < rect.bottom && targetTop + 50 > rect.top) {
                    targetTop = rect.bottom + gap;
                }
            }

            // If we'd go off the bottom, try placing in a second column
            if (targetTop + 150 > parentRect.height) {
                // Shift horizontally: place next to the existing column
                if (tbCenterX < parentCenterX) {
                    baseX += panelWidth + gap;
                } else {
                    baseX -= panelWidth + gap;
                }
                baseX = Math.max(0, Math.min(baseX, parentRect.width - panelWidth));
                targetTop = relTop; // reset to top
            }

            fp.style.top = Math.max(0, targetTop) + 'px';
            fp.style.left = baseX + 'px';
        }

        // --- Toolbar icon clicks ---
        toolbar.querySelectorAll('.toolbar-icon').forEach(btn => {
            btn.addEventListener('click', () => activateTab(btn.dataset.panel));
        });

        // --- Close buttons on each float panel ---
        floatPanels.forEach(fp => {
            const closeBtn = fp.querySelector('.editor-float-close');
            closeBtn?.addEventListener('click', () => {
                const panelId = fp.dataset.floatPanel;
                fp.style.display = 'none';
                fp._manuallyPositioned = false;
                const icon = toolbar.querySelector(`.toolbar-icon[data-panel="${panelId}"]`);
                if (icon) icon.classList.remove('active');
                if (panelId === 'draw') { editorDrawPanelOpen = false; editorRedraw(); }
            });
        });

        // --- Drag for each float panel ---
        let dragTarget = null, dragOffX = 0, dragOffY = 0;

        floatPanels.forEach(fp => {
            const hdr = fp.querySelector('.editor-float-header');
            if (!hdr) return;
            hdr.addEventListener('mousedown', (e) => {
                if (e.target.closest('.shot-panel-btn')) return;
                dragTarget = fp;
                fp._manuallyPositioned = true;
                const rect = fp.getBoundingClientRect();
                const parentRect = layout.getBoundingClientRect();
                dragOffX = e.clientX - rect.left + parentRect.left;
                dragOffY = e.clientY - rect.top + parentRect.top;
                e.preventDefault();
            });
        });

        // --- Drag for toolbar ---
        let tbDragging = false, tbOffX = 0, tbOffY = 0;

        toolbarHeader.addEventListener('mousedown', (e) => {
            if (e.target.closest('.shot-panel-btn')) return;
            tbDragging = true;
            const rect = toolbar.getBoundingClientRect();
            const parentRect = layout.getBoundingClientRect();
            tbOffX = e.clientX - rect.left + parentRect.left;
            tbOffY = e.clientY - rect.top + parentRect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            const parentRect = layout.getBoundingClientRect();

            // Float panel drag
            if (dragTarget) {
                let x = e.clientX - dragOffX;
                let y = e.clientY - dragOffY;
                x = Math.max(0, Math.min(x, parentRect.width - dragTarget.offsetWidth));
                y = Math.max(0, Math.min(y, parentRect.height - dragTarget.offsetHeight));
                dragTarget.style.left = x + 'px';
                dragTarget.style.top = y + 'px';
            }

            // Toolbar drag
            if (tbDragging) {
                let x = e.clientX - tbOffX;
                let y = e.clientY - tbOffY;
                x = Math.max(0, Math.min(x, parentRect.width - toolbar.offsetWidth));
                y = Math.max(0, Math.min(y, parentRect.height - toolbar.offsetHeight));
                toolbar.style.left = x + 'px';
                toolbar.style.top = y + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            dragTarget = null;
            tbDragging = false;
        });

        // --- Per-panel Popout ---
        floatPanels.forEach(fp => {
            const popoutBtn = fp.querySelector('.editor-float-popout');
            if (!popoutBtn) return;
            popoutBtn.addEventListener('click', () => {
                const panelId = fp.dataset.floatPanel;
                const title = fp.querySelector('.editor-float-title')?.textContent || 'Birdie Book';
                const body = fp.querySelector('.editor-float-body');
                if (!body) return;

                const popout = window.open('', `BB_${panelId}`, 'width=500,height=700,scrollbars=yes');
                if (!popout) return;

                const doc = popout.document;
                doc.title = `${title} — Birdie Book`;

                const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                    .map(el => el.outerHTML).join('\n');
                doc.head.innerHTML = styles + `<style>
                    body { background: var(--bg-card); color: var(--text); font-family: var(--font); margin: 0; padding: 0; }
                    .editor-float-body { overflow: visible; padding: 8px; }
                    .editor-section { padding: 8px 12px; border-bottom: 1px solid var(--border); }
                    .editor-hole-nav { padding: 8px 12px; border-bottom: 1px solid var(--border); }
                    .editor-hole-info { padding: 10px 12px; border-bottom: 1px solid var(--border); }
                    .scorecard-table { font-size: 0.85rem; }
                </style>`;

                // Move body content to popout
                doc.body.innerHTML = '';
                doc.body.appendChild(body);
                fp.style.display = 'none';
                const icon = toolbar.querySelector(`.toolbar-icon[data-panel="${panelId}"]`);
                if (icon) icon.classList.remove('active');

                // When popout closes, restore content
                const checkClosed = setInterval(() => {
                    if (popout.closed) {
                        clearInterval(checkClosed);
                        fp.appendChild(body);
                        if (typeof editorMap !== 'undefined' && editorMap) editorMap.invalidateSize();
                    }
                }, 500);
            });
        });

        // --- Expose for external use ---
        window._editorActivateTab = activateTab;
    })();

    // ========== Add Course Search & Create ==========

    document.getElementById('btn-add-course')?.addEventListener('click', () => {
        const panel = document.getElementById('add-course-panel');
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
        document.getElementById('add-course-name').focus();
    });

    document.getElementById('add-course-search')?.addEventListener('click', addCourseSearch);
    document.getElementById('add-course-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addCourseSearch();
    });

    async function addCourseSearch() {
        const name = document.getElementById('add-course-name').value.trim();
        if (!name) return;

        const status = document.getElementById('add-course-status');
        const result = document.getElementById('add-course-result');
        status.style.display = '';
        status.innerHTML = '<span style="color:var(--text-muted);">Searching and creating course...</span>';
        result.style.display = 'none';

        try {
            const res = await fetch('/api/courses/search-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();

            status.style.display = 'none';
            result.style.display = '';

            if (data.status === 'existing') {
                result.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${data.photo_url ? `<img src="${data.photo_url}" style="width:80px; height:50px; object-fit:cover; border-radius:6px;">` : ''}
                        <div>
                            <div style="font-weight:600;">${data.club_name}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">Already exists (${data.courses?.length || 0} course${data.courses?.length !== 1 ? 's' : ''})</div>
                        </div>
                        <a href="#course/${data.course_id}/edit" class="btn btn-sm" style="margin-left:auto;">Open Editor</a>
                    </div>`;
            } else {
                result.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${data.photo_url ? `<img src="${data.photo_url}" style="width:80px; height:50px; object-fit:cover; border-radius:6px;">` : ''}
                        <div>
                            <div style="font-weight:600;">${data.club_name}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${data.address || ''}</div>
                            <div style="font-size:0.75rem; color:var(--accent);">
                                ${data.tees_synced || 0} tees, ${data.holes_populated || 0} holes synced
                                ${data.courses?.length > 1 ? ` (${data.courses.length} courses)` : ''}
                            </div>
                        </div>
                        <a href="#course/${data.course_id}/edit" class="btn btn-sm" style="margin-left:auto;">Open Editor</a>
                    </div>`;
                // Reload clubs list
                loadClubs();
            }
        } catch (e) {
            status.innerHTML = `<span style="color:var(--danger);">Error: ${e.message}</span>`;
            result.style.display = 'none';
        }
    }

    // ========== Initial Load ==========
    loadAllData();
    loadApiUsage();
    // Refresh usage every 30s
    setInterval(loadApiUsage, 30000);
});
