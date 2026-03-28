document.addEventListener('DOMContentLoaded', () => {

    // ========== SPA Navigation ==========
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuToggle = document.getElementById('menu-toggle');
    const sections = document.querySelectorAll('.content-section');
    const navItems = document.querySelectorAll('.nav-item[data-section]');

    function navigateTo(sectionId) {
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

        // Round detail route: round/123
        const roundMatch = hash.match(/^round\/(\d+)$/);
        if (roundMatch) {
            const roundId = parseInt(roundMatch[1]);
            const round = roundsCache.find(r => r.id === roundId);
            if (round && round.course_id) {
                navigateTo('section-hole-view');
                loadHoleView(round.course_id, roundId);
            } else {
                // Round not in cache yet — fetch it
                fetch(`/api/rounds/${roundId}`).then(r => r.json()).then(data => {
                    if (data.course_id) {
                        navigateTo('section-hole-view');
                        loadHoleView(data.course_id, roundId);
                    }
                });
            }
            return;
        }

        // Course holes route: course/123/holes
        const holesMatch = hash.match(/^course\/(\d+)\/holes$/);
        if (holesMatch) {
            navigateTo('section-hole-view');
            loadHoleView(parseInt(holesMatch[1]));
            return;
        }

        // Course detail route: course/123
        const courseMatch = hash.match(/^course\/(\d+)$/);
        if (courseMatch) {
            navigateTo('section-course-detail');
            loadCourseDetail(parseInt(courseMatch[1]));
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

    function renderRoundsTable() {
        const tbody = document.getElementById('rounds-body');
        if (roundsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No rounds yet. Import data to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = roundsCache.map(r => {
            const vsPar = r.score_vs_par;
            const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
            const cls = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
            return `<tr class="clickable" onclick="location.hash='round/${r.id}'">
                <td>${r.date}</td>
                <td>${r.course_name || '\u2014'}</td>
                <td>${r.total_strokes || '\u2014'}</td>
                <td class="${cls}">${vsParStr}</td>
                <td>${r.holes_completed || '\u2014'}</td>
                <td>${r.shots_tracked || '\u2014'}</td>
                <td>${r.source || '\u2014'}</td>
            </tr>`;
        }).join('');
    }

    async function loadCourses() {
        try {
            const resp = await fetch('/api/courses/');
            coursesCache = await resp.json();
            renderCoursesTable();
        } catch (e) {
            console.error('Failed to load courses:', e);
        }
    }

    function renderCoursesTable() {
        const tbody = document.getElementById('courses-body');
        if (coursesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No courses yet.</td></tr>';
            return;
        }

        tbody.innerHTML = coursesCache.map(c => {
            let slopeStr = '\u2014';
            if (c.slope_min != null && c.slope_max != null) {
                slopeStr = c.slope_min === c.slope_max
                    ? `${c.slope_min}`
                    : `${c.slope_min}\u2013${c.slope_max}`;
            }

            return `<tr class="clickable" onclick="location.hash='course/${c.id}'">
                <td>${c.display_name}</td>
                <td>${c.holes || '\u2014'}</td>
                <td>${c.par || '\u2014'}</td>
                <td>${c.tee_count || '\u2014'}</td>
                <td>${slopeStr}</td>
            </tr>`;
        }).join('');
    }

    // ========== Course Detail ==========

    let currentCourseDetail = null;

    async function loadCourseDetail(courseId) {
        try {
            const resp = await fetch(`/api/courses/${courseId}`);
            if (!resp.ok) throw new Error('Course not found');
            currentCourseDetail = await resp.json();
            renderCourseDetail();
        } catch (e) {
            console.error('Failed to load course detail:', e);
            document.getElementById('course-detail-name').textContent = 'Course not found';
        }
    }

    function renderCourseDetail() {
        const c = currentCourseDetail;
        if (!c) return;

        // Hero banner — course-specific photo overrides the CSS default image
        const hero = document.getElementById('course-hero');
        if (c.photo_url) {
            hero.style.backgroundImage = `url(${c.photo_url})`;
        } else {
            hero.style.backgroundImage = '';  // falls back to CSS default-course.jpg
        }

        document.getElementById('course-detail-name').textContent = c.club_name || c.display_name;
        const subtitle = [c.course_name, c.address].filter(Boolean).join(' \u2014 ') || `${c.holes || 18} holes`;
        document.getElementById('course-detail-subtitle').textContent = subtitle;

        // Stats cards
        const statsRow = document.getElementById('course-detail-stats');
        const hasTees = c.tees && c.tees.length > 0;
        statsRow.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Holes</div>
                <div class="stat-value">${c.holes || 18}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Par</div>
                <div class="stat-value">${c.par || (hasTees ? c.tees[0].par_total : '\u2014')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tees</div>
                <div class="stat-value">${c.tee_count || 0}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Slope Range</div>
                <div class="stat-value">${c.slope_min != null && c.slope_max != null
                    ? (c.slope_min === c.slope_max ? c.slope_min : `${c.slope_min}\u2013${c.slope_max}`)
                    : '\u2014'}</div>
            </div>
        `;

        // Tees table
        const teesContainer = document.getElementById('course-detail-tees');
        if (hasTees) {
            teesContainer.innerHTML = `
                <table class="tees-table">
                    <thead>
                        <tr>
                            <th>Tee</th>
                            <th>Par</th>
                            <th>Yards</th>
                            <th>Rating</th>
                            <th>Slope</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${c.tees.map(t => `<tr>
                            <td><strong>${t.tee_name}</strong></td>
                            <td>${t.par_total || '\u2014'}</td>
                            <td>${t.total_yards ? t.total_yards.toLocaleString() : '\u2014'}</td>
                            <td>${t.course_rating?.toFixed(1) || '\u2014'}</td>
                            <td>${t.slope_rating || '\u2014'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            `;
        } else {
            teesContainer.innerHTML = `
                <div class="empty-state" style="padding:24px;">
                    <p style="color:var(--text-muted);">No tee data available.</p>
                    <p style="color:var(--text-dim); font-size:0.84rem;">Click "Sync Course Data" to fetch from the golf course database.</p>
                </div>
            `;
        }

        // Rounds played at this course
        const courseRounds = roundsCache.filter(r => r.course_id === c.id);
        const roundsContainer = document.getElementById('course-detail-rounds');
        document.getElementById('course-rounds-count').textContent = courseRounds.length;

        if (courseRounds.length === 0) {
            roundsContainer.innerHTML = `
                <div class="empty-state" style="padding:24px;">
                    <p style="color:var(--text-muted);">No rounds recorded at this course.</p>
                </div>
            `;
        } else {
            roundsContainer.innerHTML = courseRounds.map(r => {
                const vsPar = r.score_vs_par || 0;
                const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
                const scoreClass = vsPar < 0 ? 'under' : vsPar === 0 ? 'even' : 'over';
                const colorClass = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
                return `<div class="recent-round" onclick="location.hash='round/${r.id}'">
                    <div class="round-score ${scoreClass}">${r.total_strokes || '\u2014'}</div>
                    <div class="round-info">
                        <div class="round-course">${r.date}</div>
                        <div class="round-meta">${r.holes_completed || 18} holes \u00b7 ${r.shots_tracked || 0} shots \u00b7 ${r.source || 'unknown'}</div>
                    </div>
                    <div class="round-detail">
                        <div class="round-vs-par ${colorClass}">${vsParStr}</div>
                    </div>
                </div>`;
            }).join('');
        }
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

    async function loadHoleView(courseId, roundId = null) {
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

        // Set back button
        if (roundId) {
            backBtn.href = `#course/${courseId}`;
        } else {
            backBtn.href = `#course/${courseId}`;
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
        selectedHole = 1;
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
                scores[h] = {
                    best: Math.min(...holeScores),
                    avg: holeScores.reduce((a, b) => a + b, 0) / holeScores.length,
                    rounds: holeScores.length,
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
        if (value === 'historic' && holeViewAllRoundDetails.length === 0 && holeViewRounds.length > 0) {
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
    function gpsToPixel(lat, lng, centerLat, centerLng, zoom, imgW, imgH) {
        const scale = Math.pow(2, zoom) * 256;
        const toX = (ln) => (ln + 180) / 360 * scale;
        const toY = (lt) => {
            const s = Math.sin(lt * Math.PI / 180);
            return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
        };
        return {
            x: toX(lng) - toX(centerLng) + imgW / 2,
            y: toY(lat) - toY(centerLat) + imgH / 2,
        };
    }

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

    function drawShotOverlay(canvas, shots, imageData, isHistoric, holeData) {
        const ctx = canvas.getContext('2d');
        const { center_lat, center_lng, zoom_level, width_px, height_px } = imageData;
        // Canvas uses full scale=2 dimensions for crisp rendering
        const canvasW = width_px || 1280;
        const canvasH = height_px || 960;
        canvas.width = canvasW;
        canvas.height = canvasH;
        ctx.clearRect(0, 0, canvasW, canvasH);

        // GPS conversion uses base viewport (half of scale=2 pixels)
        // because zoom level is calculated for the base viewport
        const viewW = canvasW / 2;
        const viewH = canvasH / 2;

        // Shot offset for alignment correction (from "Place Tee" anchoring)
        const offX = holeData?.shot_offset_x || 0;
        const offY = holeData?.shot_offset_y || 0;

        shots.forEach((shot, idx) => {
            if (!shot.start_lat || !shot.end_lat) return;
            // Convert GPS to base viewport pixels, then scale up 2x for canvas, then apply offset
            const startBase = gpsToPixel(shot.start_lat, shot.start_lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const endBase = gpsToPixel(shot.end_lat, shot.end_lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const start = { x: startBase.x * 2 + offX, y: startBase.y * 2 + offY };
            const end = { x: endBase.x * 2 + offX, y: endBase.y * 2 + offY };

            const color = getClubColor(shot.club);
            ctx.strokeStyle = color;
            ctx.lineWidth = isHistoric ? 2 : 3;
            ctx.globalAlpha = isHistoric ? 0.5 : 0.9;

            // Draw line
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            // Draw arrowhead at end
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headLen = isHistoric ? 8 : 12;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x - headLen * Math.cos(angle - 0.4), end.y - headLen * Math.sin(angle - 0.4));
            ctx.lineTo(end.x - headLen * Math.cos(angle + 0.4), end.y - headLen * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fill();

            // In round mode, draw shot number at start
            if (!isHistoric) {
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(start.x, start.y, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(start.x, start.y, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(idx + 1, start.x, start.y);
            }

            // Draw start dot
            ctx.globalAlpha = isHistoric ? 0.6 : 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(start.x, start.y, isHistoric ? 4 : 5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw flag/pin at the last shot's end position (green location)
        if (shots.length > 0 && !isHistoric) {
            const lastShot = shots[shots.length - 1];
            if (lastShot.end_lat && lastShot.end_lng) {
                const flagBase = gpsToPixel(lastShot.end_lat, lastShot.end_lng, center_lat, center_lng, zoom_level, viewW, viewH);
                const flag = { x: flagBase.x * 2 + offX, y: flagBase.y * 2 + offY };
                ctx.globalAlpha = 1;
                // Flag pole
                ctx.strokeStyle = '#ff1744';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(flag.x, flag.y);
                ctx.lineTo(flag.x, flag.y - 30);
                ctx.stroke();
                // Flag triangle
                ctx.fillStyle = '#ff1744';
                ctx.beginPath();
                ctx.moveTo(flag.x, flag.y - 30);
                ctx.lineTo(flag.x + 16, flag.y - 24);
                ctx.lineTo(flag.x, flag.y - 18);
                ctx.closePath();
                ctx.fill();
                // Base circle
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(flag.x, flag.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }

    async function renderHoleMap(holeNumber) {
        const mapContainer = document.getElementById('hole-map');
        const emptyContainer = document.getElementById('hole-map-empty');
        const msgEl = document.getElementById('hole-map-message');
        const mapImg = document.getElementById('hole-map-img');
        const mapCanvas = document.getElementById('hole-map-canvas');

        if (!mapContainer || !holeViewCourse) return;

        // Find the CourseHole with image data
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === holeNumber);

        if (ch && ch.image) {
            // Image exists — show it
            const imgUrl = `/static/images/holes/${ch.image.filename}?t=${Date.now()}`;

            // Apply saved rotation
            const rotation = ch.rotation_deg || 0;
            applyHoleRotation(rotation);

            mapImg.src = imgUrl;
            mapImg.onload = () => {
                mapContainer.style.display = 'block';
                emptyContainer.style.display = 'none';

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

                drawShotOverlay(mapCanvas, shots, ch.image, isHistoric, ch);
            };
        } else {
            // No image — check if we have shots to generate one
            mapContainer.style.display = 'none';
            emptyContainer.style.display = 'flex';

            if (!ch) {
                msgEl.textContent = 'No hole data available';
                return;
            }

            // Check if any round has shots for this hole
            const hasShots = holeViewAllRoundDetails.some(r =>
                (r.holes || []).some(h => h.hole_number === holeNumber && h.shots && h.shots.length > 0)
            ) || (holeViewRoundDetail?.holes || []).some(h => h.hole_number === holeNumber && h.shots && h.shots.length > 0);

            if (!hasShots) {
                msgEl.textContent = 'No shot data for this hole — play a round with shot tracking';
                return;
            }

            if (!ch.id) {
                msgEl.textContent = 'Sync course data to enable hole maps';
                return;
            }

            // Try to fetch the image
            emptyContainer.innerHTML = '<div class="spinner"></div><p>Fetching satellite image\u2026</p>';
            try {
                const resp = await fetch(`/api/courses/${holeViewCourse.id}/holes/${ch.id}/fetch-image`, { method: 'POST' });
                const data = await resp.json();
                if (data.status === 'ok') {
                    // Reload course detail to get updated image metadata
                    const courseResp = await fetch(`/api/courses/${holeViewCourse.id}`);
                    holeViewCourse = await courseResp.json();
                    // Retry rendering with the new image
                    renderHoleMap(holeNumber);
                } else {
                    emptyContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg><p>${data.reason || 'Could not load map'}</p>`;
                }
            } catch (e) {
                emptyContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg><p>Error loading map</p>`;
            }
        }
    }

    function renderHoleDetail() {
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

                statsEl.innerHTML = `
                    <div class="hole-stats-grid">
                        <div class="hole-stat"><span class="hole-stat-label">Best</span><span class="hole-stat-value">${hs.best} (${bestStr})</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Average</span><span class="hole-stat-value ${avgClass}">${hs.avg.toFixed(1)} (${avgStr})</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Avg Putts</span><span class="hole-stat-value">${avgPutts}</span></div>
                        ${fairwayRate ? `<div class="hole-stat"><span class="hole-stat-label">Fairway Hit</span><span class="hole-stat-value">${fairwayRate}</span></div>` : ''}
                        ${topClub ? `<div class="hole-stat"><span class="hole-stat-label">Tee Club</span><span class="hole-stat-value">${topClub[0]}</span></div>` : ''}
                        ${avgDrive ? `<div class="hole-stat"><span class="hole-stat-label">Avg Drive</span><span class="hole-stat-value">${avgDrive} yds</span></div>` : ''}
                        <div class="hole-stat"><span class="hole-stat-label">Rounds</span><span class="hole-stat-value">${hs.rounds} ${trend}</span></div>
                    </div>
                `;
            } else {
                statsEl.innerHTML = '<p style="color:var(--text-muted);">No round data for this hole.</p>';
            }
            shotListEl.innerHTML = '';
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

                statsEl.innerHTML = `
                    <div class="hole-stats-grid">
                        <div class="hole-stat"><span class="hole-stat-label">Score</span><span class="hole-stat-value ${diffClass}">${rh.strokes} (${diffStr}) ${scoreComp}</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Putts</span><span class="hole-stat-value">${rh.putts ?? '\u2014'} ${puttsComp}</span></div>
                        <div class="hole-stat"><span class="hole-stat-label">Fairway</span><span class="hole-stat-value">${rh.fairway || '\u2014'}</span></div>
                        ${rh.penalty_strokes ? `<div class="hole-stat"><span class="hole-stat-label">Penalties</span><span class="hole-stat-value">${rh.penalty_strokes}</span></div>` : ''}
                        ${hs ? `<div class="hole-stat"><span class="hole-stat-label">Hole Avg</span><span class="hole-stat-value">${hs.avg.toFixed(1)}</span></div>` : ''}
                        ${hs ? `<div class="hole-stat"><span class="hole-stat-label">Hole Best</span><span class="hole-stat-value">${hs.best}</span></div>` : ''}
                    </div>
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

                                return `<div class="shot-item">
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
    let editTool = 'tee';  // 'tee', 'green', 'fairway'
    let editTeePos = null;   // {lat, lng}
    let editGreenPos = null; // {lat, lng}
    let editFairwayPath = []; // [{lat, lng}, ...]
    let editPar = null;
    let editYardage = null;
    let editHandicap = null;
    let editRotation = 0;
    let editZoom = null;  // null = auto
    let editShotOffsetX = 0;
    let editShotOffsetY = 0;

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

    function pixelToGps(px, py, centerLat, centerLng, zoom, imgW, imgH) {
        const scale = Math.pow(2, zoom) * 256;
        const toMercX = (ln) => (ln + 180) / 360 * scale;
        const toMercY = (lt) => {
            const s = Math.sin(lt * Math.PI / 180);
            return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
        };
        const cx = toMercX(centerLng);
        const cy = toMercY(centerLat);
        const mercX = (px - imgW / 2) + cx;
        const mercY = (py - imgH / 2) + cy;
        const lng = mercX / scale * 360 - 180;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY / scale))) * 180 / Math.PI;
        return { lat, lng };
    }

    // Show/hide edit button when a hole is selected
    function updateEditButton() {
        const btn = document.getElementById('btn-edit-hole');
        if (btn) btn.style.display = selectedHole ? 'inline-flex' : 'none';
    }

    // Enter edit mode
    document.getElementById('btn-edit-hole')?.addEventListener('click', () => {
        holeEditMode = true;
        editTool = 'tee';
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);

        // Load existing values
        editTeePos = (ch?.tee_lat && ch?.tee_lng) ? { lat: ch.tee_lat, lng: ch.tee_lng } : null;
        editGreenPos = (ch?.flag_lat && ch?.flag_lng) ? { lat: ch.flag_lat, lng: ch.flag_lng } : null;
        editFairwayPath = [];
        if (ch?.fairway_path) {
            try {
                const pts = JSON.parse(ch.fairway_path);
                editFairwayPath = pts.map(p => ({ lat: p[0], lng: p[1] }));
            } catch (e) {}
        }
        editPar = ch?.par || null;
        editYardage = ch?.yardage || null;
        editHandicap = ch?.handicap || null;
        editRotation = ch?.rotation_deg || 0;
        editZoom = ch?.custom_zoom || null;
        editCustomBounds = null;
        editShotOffsetX = ch?.shot_offset_x || 0;
        editShotOffsetY = ch?.shot_offset_y || 0;
        cropStartPx = null;
        cropEndPx = null;

        // Show toolbar
        const toolbar = document.getElementById('hole-edit-toolbar');
        toolbar.style.display = 'flex';
        document.getElementById('edit-par').value = editPar || '';
        document.getElementById('edit-yardage').value = editYardage || '';
        document.getElementById('edit-handicap').value = editHandicap || '';
        document.getElementById('edit-rotation-label').textContent = `${editRotation}\u00b0`;

        // Make canvas interactive
        const holeMap = document.getElementById('hole-map');
        if (holeMap) holeMap.classList.add('editing');

        // Set active tool
        document.querySelectorAll('.edit-tool[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'tee');
        });

        // Redraw with edit markers
        redrawEditOverlay();
    });

    // Tool selection
    document.querySelectorAll('.edit-tool[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            editTool = btn.dataset.tool;
            document.querySelectorAll('.edit-tool[data-tool]').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === editTool);
            });
            const holeMap = document.getElementById('hole-map');
            if (holeMap) holeMap.classList.toggle('crop-mode', editTool === 'crop');
        });
    });

    // Clear fairway
    document.getElementById('tool-clear-fairway')?.addEventListener('click', () => {
        editFairwayPath = [];
        redrawEditOverlay();
    });

    // Reset image — clears crop bounds and re-fetches original
    document.getElementById('tool-reset-image')?.addEventListener('click', async () => {
        if (!currentCourseDetail || !selectedHole) return;
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch || !ch.id) return;

        // Clear custom bounds and shot offset on server
        const resp = await fetch(`/api/courses/${currentCourseDetail.id}/holes/${ch.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ custom_bounds: '', custom_zoom: 0, shot_offset_x: 0, shot_offset_y: 0 }),
        });
        if (!resp.ok) return;

        // Re-fetch fresh image (force=true via query param would be ideal, but just POST)
        await fetch(`/api/courses/${currentCourseDetail.id}/holes/${ch.id}/fetch-image`, {
            method: 'POST',
        });

        // Reset local state and exit edit mode
        editCustomBounds = null;
        editShotOffsetX = 0;
        editShotOffsetY = 0;
        cropStartPx = null;
        cropEndPx = null;
        holeEditMode = false;
        document.getElementById('hole-edit-toolbar').style.display = 'none';
        document.getElementById('btn-edit-hole').style.display = '';
        const holeMap = document.getElementById('hole-map');
        if (holeMap) {
            holeMap.classList.remove('editing', 'crop-mode');
        }

        // Reload course data with fresh image metadata
        await loadCourseDetail(currentCourseDetail.id);
        // Update holeViewCourse to match refreshed data
        holeViewCourse = currentCourseDetail;
        renderHoleDetail(selectedHole);
    });

    // Crop selection state
    let cropStartPx = null;  // {x, y} in canvas coords
    let cropEndPx = null;
    let cropDragging = false;
    let editCustomBounds = null;  // {min_lat, max_lat, min_lng, max_lng}

    // Handle crop drag on canvas
    const mapCanvas = document.getElementById('hole-map-canvas');
    if (mapCanvas) {
        // Prevent browser image/element drag
        mapCanvas.addEventListener('dragstart', (e) => e.preventDefault());
        document.getElementById('hole-map-img')?.addEventListener('dragstart', (e) => e.preventDefault());

        mapCanvas.addEventListener('mousedown', (e) => {
            if (!holeEditMode || editTool !== 'crop') return;
            const rect = mapCanvas.getBoundingClientRect();
            const scaleX = mapCanvas.width / rect.width;
            const scaleY = mapCanvas.height / rect.height;
            cropStartPx = {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
            };
            cropEndPx = null;
            cropDragging = true;
            e.preventDefault();
        });

        mapCanvas.addEventListener('mousemove', (e) => {
            if (!cropDragging) return;
            const rect = mapCanvas.getBoundingClientRect();
            const scaleX = mapCanvas.width / rect.width;
            const scaleY = mapCanvas.height / rect.height;
            cropEndPx = {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
            };
            redrawEditOverlay();
            // Draw crop rectangle
            const ctx = mapCanvas.getContext('2d');
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            const x = Math.min(cropStartPx.x, cropEndPx.x);
            const y = Math.min(cropStartPx.y, cropEndPx.y);
            const w = Math.abs(cropEndPx.x - cropStartPx.x);
            const h = Math.abs(cropEndPx.y - cropStartPx.y);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            // Dim area outside crop
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, mapCanvas.width, y); // top
            ctx.fillRect(0, y + h, mapCanvas.width, mapCanvas.height - y - h); // bottom
            ctx.fillRect(0, y, x, h); // left
            ctx.fillRect(x + w, y, mapCanvas.width - x - w, h); // right
        });

        mapCanvas.addEventListener('mouseup', (e) => {
            if (!cropDragging || !cropStartPx || !cropEndPx) {
                cropDragging = false;
                return;
            }
            cropDragging = false;

            // Send crop as pixel ratios (0.0-1.0) relative to the canvas/image
            // This avoids all GPS conversion issues — backend crops by pixel ratio
            const canvasW = mapCanvas.width;
            const canvasH = mapCanvas.height;

            editCustomBounds = {
                left: Math.min(cropStartPx.x, cropEndPx.x) / canvasW,
                top: Math.min(cropStartPx.y, cropEndPx.y) / canvasH,
                right: Math.max(cropStartPx.x, cropEndPx.x) / canvasW,
                bottom: Math.max(cropStartPx.y, cropEndPx.y) / canvasH,
            };

            // Visual confirmation
            redrawEditOverlay();
        });
    }

    // Rotate controls
    document.getElementById('tool-rotate-cw')?.addEventListener('click', () => {
        editRotation = (editRotation + 15) % 360;
        document.getElementById('edit-rotation-label').textContent = `${editRotation}\u00b0`;
        applyHoleRotation(editRotation);
    });

    document.getElementById('tool-rotate-ccw')?.addEventListener('click', () => {
        editRotation = (editRotation - 15 + 360) % 360;
        document.getElementById('edit-rotation-label').textContent = `${editRotation}\u00b0`;
        applyHoleRotation(editRotation);
    });

    function applyHoleRotation(deg) {
        const mapEl = document.getElementById('hole-map');
        if (!mapEl) return;
        if (deg === 0) {
            mapEl.style.transform = '';
            mapEl.style.transformOrigin = '';
        } else {
            // Scale down slightly to prevent clipping at corners
            const scale = deg % 90 === 0 ? 1 : 0.85;
            mapEl.style.transform = `rotate(${deg}deg) scale(${scale})`;
            mapEl.style.transformOrigin = 'center center';
        }
    }

    // Canvas click handler for edit mode (tee, green, fairway — not crop)
    document.getElementById('hole-map-canvas')?.addEventListener('click', (e) => {
        if (!holeEditMode || editTool === 'crop') return;

        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // Get image metadata
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch?.image) return;

        const { center_lat, center_lng, zoom_level, width_px, height_px } = ch.image;
        const viewW = (width_px || 1280) / 2;
        const viewH = (height_px || 960) / 2;

        // Canvas coords are at scale=2, convert to base viewport
        const baseX = canvasX / 2;
        const baseY = canvasY / 2;

        const gps = pixelToGps(baseX, baseY, center_lat, center_lng, zoom_level, viewW, viewH);

        if (editTool === 'tee') {
            editTeePos = gps;
            // Compute shot offset: delta between where user clicked and where first shot renders
            const firstShot = getFirstShotForHole(selectedHole);
            if (firstShot) {
                const firstShotPx = gpsToPixel(
                    firstShot.start_lat, firstShot.start_lng,
                    center_lat, center_lng, zoom_level, viewW, viewH
                );
                // Offset in canvas pixels (scale=2)
                editShotOffsetX = canvasX - (firstShotPx.x * 2);
                editShotOffsetY = canvasY - (firstShotPx.y * 2);
            }
        } else if (editTool === 'green') {
            editGreenPos = gps;
        } else if (editTool === 'fairway') {
            editFairwayPath.push(gps);
        }

        redrawEditOverlay();
    });

    function redrawEditOverlay() {
        const canvas = document.getElementById('hole-map-canvas');
        if (!canvas) return;

        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch?.image) return;

        const { center_lat, center_lng, zoom_level, width_px, height_px } = ch.image;
        const canvasW = width_px || 1280;
        const canvasH = height_px || 960;
        canvas.width = canvasW;
        canvas.height = canvasH;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasW, canvasH);

        const viewW = canvasW / 2;
        const viewH = canvasH / 2;

        // Draw existing shots dimmed
        let shots = [];
        if (holeViewMode === 'historic') {
            shots = (holeViewAllRoundDetails || []).flatMap(rd =>
                (rd.holes.find(h => h.hole_number === selectedHole)?.shots || [])
            );
        } else if (holeViewRoundDetail) {
            const rh = holeViewRoundDetail.holes.find(h => h.hole_number === selectedHole);
            shots = rh?.shots || [];
        }

        // Apply shot offset (from "Place Tee" alignment)
        const offX = editShotOffsetX || 0;
        const offY = editShotOffsetY || 0;

        ctx.globalAlpha = 0.7;
        for (const s of shots) {
            if (!s.start_lat || !s.end_lat) continue;
            const startB = gpsToPixel(s.start_lat, s.start_lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const endB = gpsToPixel(s.end_lat, s.end_lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const start = { x: startB.x * 2 + offX, y: startB.y * 2 + offY };
            const end = { x: endB.x * 2 + offX, y: endB.y * 2 + offY };
            ctx.strokeStyle = getClubColor(s.club);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            // Draw shot dots
            ctx.fillStyle = getClubColor(s.club);
            ctx.beginPath();
            ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
            ctx.fill();
        }
        // Draw flag for last shot end point
        if (shots.length > 0) {
            const lastShot = shots[shots.length - 1];
            if (lastShot.end_lat) {
                const endB = gpsToPixel(lastShot.end_lat, lastShot.end_lng, center_lat, center_lng, zoom_level, viewW, viewH);
                const ep = { x: endB.x * 2 + offX, y: endB.y * 2 + offY };
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ep.x, ep.y);
                ctx.lineTo(ep.x, ep.y - 20);
                ctx.stroke();
                ctx.fillStyle = '#ef5350';
                ctx.beginPath();
                ctx.moveTo(ep.x, ep.y - 20);
                ctx.lineTo(ep.x + 12, ep.y - 15);
                ctx.lineTo(ep.x, ep.y - 10);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(ep.x, ep.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1.0;

        // Draw fairway path
        if (editFairwayPath.length > 1) {
            ctx.strokeStyle = '#ffeb3b';
            ctx.lineWidth = 4;
            ctx.setLineDash([12, 8]);
            ctx.beginPath();
            for (let i = 0; i < editFairwayPath.length; i++) {
                const p = gpsToPixel(editFairwayPath[i].lat, editFairwayPath[i].lng, center_lat, center_lng, zoom_level, viewW, viewH);
                const px = p.x * 2, py = p.y * 2;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw waypoint dots
            for (const wp of editFairwayPath) {
                const p = gpsToPixel(wp.lat, wp.lng, center_lat, center_lng, zoom_level, viewW, viewH);
                ctx.fillStyle = '#ffeb3b';
                ctx.beginPath();
                ctx.arc(p.x * 2, p.y * 2, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw tee marker
        if (editTeePos) {
            const p = gpsToPixel(editTeePos.lat, editTeePos.lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const px = p.x * 2, py = p.y * 2;
            ctx.fillStyle = '#4caf50';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('T', px, py);
        }

        // Draw green/flag marker
        if (editGreenPos) {
            const p = gpsToPixel(editGreenPos.lat, editGreenPos.lng, center_lat, center_lng, zoom_level, viewW, viewH);
            const px = p.x * 2, py = p.y * 2;
            // Flag pole
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px, py - 30);
            ctx.stroke();
            // Flag
            ctx.fillStyle = '#ef5350';
            ctx.beginPath();
            ctx.moveTo(px, py - 30);
            ctx.lineTo(px + 18, py - 24);
            ctx.lineTo(px, py - 18);
            ctx.fill();
            // Base circle
            ctx.fillStyle = '#ef5350';
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw persistent crop rectangle if set
        if (cropStartPx && cropEndPx && !cropDragging) {
            const x = Math.min(cropStartPx.x, cropEndPx.x);
            const y = Math.min(cropStartPx.y, cropEndPx.y);
            const w = Math.abs(cropEndPx.x - cropStartPx.x);
            const h = Math.abs(cropEndPx.y - cropStartPx.y);
            // Dim outside
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(0, 0, canvas.width, y);
            ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
            ctx.fillRect(0, y, x, h);
            ctx.fillRect(x + w, y, canvas.width - x - w, h);
            // Border
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            // Label
            ctx.fillStyle = '#00e5ff';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('Crop area — drag to adjust', x + 6, y + 6);
        }
    }

    // Save edits
    document.getElementById('btn-save-hole')?.addEventListener('click', async () => {
        const courseHoles = getCourseTeeHoles();
        const ch = courseHoles.find(h => h.hole_number === selectedHole);
        if (!ch || !holeViewCourse) return;

        const body = {};
        const parVal = parseInt(document.getElementById('edit-par').value);
        const ydsVal = parseInt(document.getElementById('edit-yardage').value);
        const hcpVal = parseInt(document.getElementById('edit-handicap').value);

        if (!isNaN(parVal)) body.par = parVal;
        if (!isNaN(ydsVal)) body.yardage = ydsVal;
        if (!isNaN(hcpVal)) body.handicap = hcpVal;
        if (editTeePos) { body.tee_lat = editTeePos.lat; body.tee_lng = editTeePos.lng; }
        if (editGreenPos) { body.flag_lat = editGreenPos.lat; body.flag_lng = editGreenPos.lng; }
        if (editFairwayPath.length > 0) {
            body.fairway_path = JSON.stringify(editFairwayPath.map(p => [p.lat, p.lng]));
        }
        if (editRotation !== null) body.rotation_deg = editRotation;
        if (editZoom !== null) body.custom_zoom = editZoom;
        if (editCustomBounds) body.custom_bounds = JSON.stringify(editCustomBounds);
        if (editShotOffsetX !== 0 || editShotOffsetY !== 0) {
            body.shot_offset_x = editShotOffsetX;
            body.shot_offset_y = editShotOffsetY;
        }

        try {
            const resp = await fetch(`/api/courses/${holeViewCourse.id}/holes/${ch.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await resp.json();

            if (resp.ok) {
                // If positions changed, re-fetch the image with new bounds
                if (data.positions_changed) {
                    await fetch(`/api/courses/${holeViewCourse.id}/holes/${ch.id}/fetch-image`, { method: 'POST' });
                }

                // Reload course data to get updated hole info + new image metadata
                const courseResp = await fetch(`/api/courses/${holeViewCourse.id}`);
                holeViewCourse = await courseResp.json();

                exitEditMode();

                // Force cache-bust on the hole map image
                const mapImg = document.getElementById('hole-map-img');
                if (mapImg) mapImg.src = '';

                renderScorecard();
                renderHoleDetail();
            }
        } catch (e) {
            console.error('Failed to save hole:', e);
        }
    });

    // Cancel edits
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
        exitEditMode();
        renderHoleDetail();
    });

    function exitEditMode() {
        holeEditMode = false;
        document.getElementById('hole-edit-toolbar').style.display = 'none';
        const holeMap = document.getElementById('hole-map');
        if (holeMap) {
            holeMap.classList.remove('editing');
            // Reset rotation — renderHoleDetail will re-apply saved rotation
            holeMap.style.transform = '';
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
            btnCourseSync.textContent = 'Sync Course Data';
        }
    }

    if (btnCourseSync) {
        btnCourseSync.addEventListener('click', async () => {
            if (!currentCourseDetail) return;
            btnCourseSync.disabled = true;
            btnCourseSync.textContent = 'Searching\u2026';
            courseSyncStatus.style.display = 'none';

            try {
                const resp = await fetch(`/api/courses/${currentCourseDetail.id}/search-matches`, { method: 'POST' });
                const data = await resp.json();

                if (!resp.ok) {
                    courseSyncStatus.textContent = data.detail || 'Search failed';
                    courseSyncStatus.className = 'status status-error';
                    courseSyncStatus.style.display = 'block';
                    autoDismiss(courseSyncStatus, 5000);
                    return;
                }

                const candidates = data.candidates || [];

                if (candidates.length === 0) {
                    const errorMsg = data.error || 'No matching courses found in the database.';
                    showCourseStatus(errorMsg, 'error');

                    // Try fetching a photo anyway
                    if (!currentCourseDetail.photo_url) {
                        try { await fetch(`/api/courses/${currentCourseDetail.id}/fetch-photo`, { method: 'POST' }); } catch (e) {}
                        await loadCourseDetail(currentCourseDetail.id);
                    }
                    return;
                }

                // Show modal with candidates
                const placesName = data.places_name;
                modalSearchInfo.textContent = placesName
                    ? `Google Places identified this as "${placesName}". Select the correct course:`
                    : `Select the correct course for "${currentCourseDetail.display_name}":`;

                // Build candidate list — optionally with a "Sync All" option at top
                let html = '';
                if (data.club_sync_available) {
                    const clubName = data.golf_club_name || currentCourseDetail.club_name;
                    const count = data.nearby_course_count || 0;
                    const comboNote = data.has_combo_courses ? ' (includes combo 9-hole splits)' : '';
                    html += `<div class="candidate-card best" data-club-sync="${data.golf_club_id}">
                        <div class="candidate-info">
                            <div class="candidate-name">Sync All ${clubName} Courses</div>
                            <div class="candidate-address">${count} courses found${comboNote}</div>
                        </div>
                        <div class="candidate-meta">
                            <span class="candidate-badge">Recommended</span>
                        </div>
                    </div>
                    <div style="border-top:1px solid var(--border); margin:8px 0; padding-top:4px;">
                        <span style="font-size:0.78rem; color:var(--text-dim);">Or pick a single course:</span>
                    </div>`;
                }

                html += candidates.map((c, i) => {
                    const distStr = c.distance_miles != null ? `${c.distance_miles} mi` : '';
                    const bestClass = !data.club_sync_available && i === 0 ? ' best' : '';
                    const bestBadge = !data.club_sync_available && i === 0 ? '<span class="candidate-badge">Best Match</span>' : '';
                    return `<div class="candidate-card${bestClass}" data-api-id="${c.api_id}">
                        <div class="candidate-info">
                            <div class="candidate-name">${c.club_name}${c.course_name && c.course_name !== c.club_name ? ' \u2014 ' + c.course_name : ''}</div>
                            <div class="candidate-address">${c.address || [c.city, c.state].filter(Boolean).join(', ') || 'No address'}</div>
                        </div>
                        <div class="candidate-meta">
                            ${distStr ? `<div class="candidate-distance">${distStr}</div>` : ''}
                            ${bestBadge}
                        </div>
                    </div>`;
                }).join('');

                modalCandidates.innerHTML = html;

                // Club sync option handler
                const clubSyncCard = modalCandidates.querySelector('[data-club-sync]');
                if (clubSyncCard) {
                    clubSyncCard.addEventListener('click', async () => {
                        closeModal();
                        const clubId = parseInt(clubSyncCard.dataset.clubSync);
                        btnCourseSync.disabled = true;
                        btnCourseSync.textContent = 'Syncing\u2026';
                        showCourseStatus('Syncing all courses\u2026 This may take a moment.', 'progress');
                        try {
                            const resp = await fetch(`/api/courses/club/${clubId}/sync`, { method: 'POST' });
                            const result = await resp.json();
                            if (resp.ok && result.status === 'ok') {
                                const details = result.details || [];
                                const synced = details.filter(d => d.status && d.status.includes('synced')).length;
                                showCourseStatus(`Synced ${synced} course(s). Found ${result.api_courses_found} in API.`, 'success');
                                await loadAllData();
                                loadCourseDetail(currentCourseDetail.id);
                            } else {
                                showCourseStatus(result.reason || 'Sync failed', 'error');
                            }
                        } catch (e) {
                            showCourseStatus('Error: ' + e.message, 'error');
                        } finally {
                            btnCourseSync.disabled = false;
                            btnCourseSync.textContent = 'Sync Course Data';
                        }
                    });
                }

                // Individual course candidate handlers
                modalCandidates.querySelectorAll('.candidate-card[data-api-id]').forEach(card => {
                    card.addEventListener('click', () => {
                        const apiId = parseInt(card.dataset.apiId);
                        applyCandidate(apiId);
                    });
                });

                matchModal.style.display = 'flex';
            } catch (e) {
                courseSyncStatus.textContent = 'Error: ' + e.message;
                courseSyncStatus.className = 'status status-error';
                courseSyncStatus.style.display = 'block';
                autoDismiss(courseSyncStatus, 5000);
            } finally {
                btnCourseSync.disabled = false;
                btnCourseSync.textContent = 'Sync Course Data';
            }
        });
    }

    // ========== Club Window Selector ==========
    let clubWindow = '';
    let clubSource = 'course';
    const clubWindowSelect = document.getElementById('club-window-select');
    const clubSourceSelect = document.getElementById('club-source-select');

    if (clubWindowSelect) {
        clubWindowSelect.addEventListener('change', () => {
            clubWindow = clubWindowSelect.value;
            loadClubs();
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
            if (clubWindow) {
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
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No clubs yet. Import data or add a club to get started.</td></tr>';
            return;
        }

        const hasWindow = clubWindow !== '';

        // Sort by bag order
        const sorted = [...clubsCache].sort((a, b) => clubBagOrder(a.club_type) - clubBagOrder(b.club_type));

        tbody.innerHTML = sorted.map(c => {
            const s = c.stats;
            const w = c.windowed_stats;

            // Pick the right stats based on source toggle
            let avgVal, medianVal, maxVal, shotCount;
            if (clubSource === 'range') {
                avgVal = s?.range_avg_yards;
                medianVal = s?.range_median_yards;
                maxVal = s?.range_max_yards;
                shotCount = s?.range_sample_count;
            } else if (clubSource === 'combined') {
                avgVal = s?.combined_avg_yards;
                medianVal = s?.combined_median_yards;
                maxVal = s?.combined_max_yards;
                shotCount = s?.combined_sample_count;
            } else {
                avgVal = s?.avg_yards;
                medianVal = s?.median_yards;
                maxVal = s?.max_yards;
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

            const shots = shotCount ?? '\u2014';
            const wShots = hasWindow && w ? ` <span style="color:var(--text-muted); font-size:0.8rem;">(${w.sample_count})</span>` : '';

            const srcLabel = { garmin: 'G', rapsodo_mlm2pro: 'R', trackman: 'T', manual: 'M' }[c.source] || 'M';
            const clubColor = c.color || getClubColor(c.club_type);
            // Determine text color based on background brightness
            const textColor = _isLightColor(clubColor) ? '#000' : '#fff';

            return `<tr>
                <td style="width:28px;"><span class="source-badge" style="background:${clubColor}; color:${textColor}; cursor:pointer;" title="Click to change color" onclick="event.stopPropagation(); window._pickClubColor(${c.id})">${srcLabel}</span></td>
                <td class="clickable" onclick="window._editClub(${c.id})"><strong>${c.club_type}</strong>${c.name ? ` <span style="color:var(--accent); font-size:0.8rem;">"${c.name}"</span>` : ''}${c.model ? ` <span style="color:var(--text-muted); font-size:0.84rem;">${c.model}</span>` : ''}</td>
                <td>${avg}</td>
                <td>${maxD}</td>
                <td>${median}</td>
                <td>${shots}${wShots}</td>
                <td style="width:60px;"><button class="btn btn-ghost btn-sm" onclick="window._mergeClub(${c.id})" title="Merge another club into this one" style="font-size:0.75rem;">Merge</button></td>
            </tr>`;
        }).join('');
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

    function updateDashboard() {
        // Stats
        document.getElementById('stat-rounds').textContent = roundsCache.length || '0';
        document.getElementById('stat-courses').textContent = coursesCache.length || '0';

        if (roundsCache.length > 0) {
            const scores = roundsCache.filter(r => r.total_strokes).map(r => r.total_strokes);
            const best = Math.min(...scores);
            document.getElementById('stat-best').textContent = best;

            const vpScores = roundsCache.filter(r => r.score_vs_par != null).map(r => r.score_vs_par);
            if (vpScores.length > 0) {
                const avg = vpScores.reduce((a, b) => a + b, 0) / vpScores.length;
                const avgStr = avg > 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1);
                document.getElementById('stat-avg').textContent = avgStr;
            }
        }

        // Recent rounds (top 5)
        const container = document.getElementById('dash-recent-rounds');
        const recent = roundsCache.slice(0, 5);

        if (recent.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>No rounds yet</p>
                <p><a href="#import" class="nav-link" data-section="section-import" style="color:var(--accent);">Import your Garmin data</a> to get started</p>
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
        const coursesContainer = document.getElementById('dash-courses');
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

        coursesContainer.innerHTML = coursesCache.slice(0, 5).map(c => `
            <div class="recent-round" onclick="location.hash='course/${c.id}'">
                <div class="round-score even" style="font-size:0.85rem;">${c.holes || 18}</div>
                <div class="round-info">
                    <div class="round-course">${c.display_name}</div>
                    <div class="round-meta">Par ${c.par || '\u2014'} \u00b7 Rating ${c.course_rating?.toFixed(1) || '\u2014'} \u00b7 Slope ${c.slope_rating || '\u2014'}</div>
                </div>
            </div>
        `).join('');
    }

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

    function renderRangeAnalytics() {
        const shots = getFilteredShots();

        // Clear highlights on re-render
        rangeState.highlightedShotIds.clear();

        // Update view toggle
        document.getElementById('btn-view-total')?.classList.toggle('active', rangeState.viewMode === 'total');
        document.getElementById('btn-view-carry')?.classList.toggle('active', rangeState.viewMode === 'carry');

        drawScatterChart(shots);
        drawTrajectoryChart(shots);
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
        document.querySelectorAll('#range-club-sections tr[data-shot-id]').forEach(tr => {
            const id = parseInt(tr.dataset.shotId);
            if (!hasHighlight) {
                tr.classList.remove('shot-highlighted', 'shot-dimmed');
            } else if (hl.has(id)) {
                tr.classList.add('shot-highlighted');
                tr.classList.remove('shot-dimmed');
            } else {
                tr.classList.add('shot-dimmed');
                tr.classList.remove('shot-highlighted');
            }
        });
    }

    // ── Scatter Chart (Top-Down Dispersion) ──

    function drawScatterChart(shots) {
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
                                const shotId = ds._shotIds?.[ctx.dataIndex];
                                const shot = validShots.find(s => s.id === shotId);
                                if (!shot) return '';
                                const distLabel = rangeState.viewMode === 'carry' ? 'Carry' : 'Total';
                                return `${ds.label}: ${distLabel} ${ctx.parsed.y?.toFixed(1)} yds, Side ${ctx.parsed.x?.toFixed(1)} yds`;
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
            legendEl.innerHTML = clubNames.map(name =>
                `<span class="range-legend-item"><span class="club-color-dot" style="background:${getClubColor(name)}"></span>${name}</span>`
            ).join('');
        }
    }

    // ── Trajectory Chart (Ball Flight Side View) ──

    function drawTrajectoryChart(shots) {
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

        const maxCarry = validShots.length > 0 ? Math.max(...validShots.map(s => s.carry_yards)) : 100;
        const maxApex = validShots.length > 0 ? Math.max(...validShots.map(s => s.apex_yards)) : 30;

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
            legendEl.innerHTML = [...clubsSeen].map(name =>
                `<span class="range-legend-item"><span class="club-color-dot" style="background:${getClubColor(name)}"></span>${name}</span>`
            ).join('');
        }
    }

    // ── Collapsible Club Sections ──

    function _fmt(v, dec = 1) { return v != null ? v.toFixed(dec) : '\u2014'; }
    function _fmtDeg(v) { return v != null ? v.toFixed(1) + '\u00b0' : '\u2014'; }
    function _fmtInt(v) { return v != null ? Math.round(v).toString() : '\u2014'; }
    function _fmtSigned(v) { return v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) : '\u2014'; }

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

        // Sort by bag order
        const sorted = Object.entries(groups).sort((a, b) => clubBagOrder(a[0]) - clubBagOrder(b[0]));

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No shots to display.</p></div>';
            return;
        }

        container.innerHTML = sorted.map(([clubName, clubShots], i) => {
            const avgCarry = _avg(clubShots.map(s => s.carry_yards));
            const avgTotal = _avg(clubShots.map(s => s.total_yards));
            const color = getClubColor(clubName);
            const collapsed = i >= 2 ? ' collapsed' : '';

            // Compute averages for summary row
            const avgBallSpd = _avg(clubShots.map(s => s.ball_speed_mph));
            const avgClubSpd = _avg(clubShots.map(s => s.club_speed_mph));
            const avgLaunch = _avg(clubShots.map(s => s.launch_angle_deg));
            const avgSpin = _avg(clubShots.map(s => s.spin_rate_rpm));
            const avgApex = _avg(clubShots.map(s => s.apex_yards));
            const avgSide = _avg(clubShots.map(s => s.side_carry_yards));
            const avgDescent = _avg(clubShots.map(s => s.descent_angle_deg));
            const avgSmash = _avg(clubShots.map(s => s.smash_factor));

            // Compute std dev for consistency row
            const sdCarry = _stdDev(clubShots.map(s => s.carry_yards));
            const sdTotal = _stdDev(clubShots.map(s => s.total_yards));
            const sdBallSpd = _stdDev(clubShots.map(s => s.ball_speed_mph));
            const sdClubSpd = _stdDev(clubShots.map(s => s.club_speed_mph));
            const sdLaunch = _stdDev(clubShots.map(s => s.launch_angle_deg));
            const sdSpin = _stdDev(clubShots.map(s => s.spin_rate_rpm));
            const sdApex = _stdDev(clubShots.map(s => s.apex_yards));
            const sdSide = _stdDev(clubShots.map(s => s.side_carry_yards));
            const sdDescent = _stdDev(clubShots.map(s => s.descent_angle_deg));
            const sdSmash = _stdDev(clubShots.map(s => s.smash_factor));

            return `
            <div class="club-section${collapsed}">
                <div class="club-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="club-color-dot" style="background:${color}"></span>
                    <span class="collapse-icon">\u25BC</span>
                    <strong>${clubName}</strong>
                    <span class="club-section-meta">
                        ${clubShots.length} shots \u00b7 Carry: ${avgCarry != null ? avgCarry.toFixed(1) : '\u2014'} \u00b7 Total: ${avgTotal != null ? avgTotal.toFixed(1) : '\u2014'}
                    </span>
                </div>
                <div class="club-section-body">
                    <table>
                        <thead><tr>
                            <th>#</th><th>Carry</th><th>Total</th><th>Ball Spd</th><th>Club Spd</th>
                            <th>Launch</th><th>Spin</th><th>Apex</th><th>Side</th><th>Descent</th><th>Smash</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr class="summary-row summary-avg">
                                <td><strong>Avg</strong></td>
                                <td>${_fmt(avgCarry)}</td>
                                <td>${_fmt(avgTotal)}</td>
                                <td>${_fmt(avgBallSpd)}</td>
                                <td>${_fmt(avgClubSpd)}</td>
                                <td>${_fmtDeg(avgLaunch)}</td>
                                <td>${_fmtInt(avgSpin)}</td>
                                <td>${_fmt(avgApex)}</td>
                                <td>${_fmtSigned(avgSide)}</td>
                                <td>${_fmtDeg(avgDescent)}</td>
                                <td>${_fmt(avgSmash, 2)}</td>
                                <td></td>
                            </tr>
                            <tr class="summary-row summary-sd">
                                <td><strong>StdDev</strong></td>
                                <td>${_fmt(sdCarry)}</td>
                                <td>${_fmt(sdTotal)}</td>
                                <td>${_fmt(sdBallSpd)}</td>
                                <td>${_fmt(sdClubSpd)}</td>
                                <td>${_fmtDeg(sdLaunch)}</td>
                                <td>${_fmtInt(sdSpin)}</td>
                                <td>${_fmt(sdApex)}</td>
                                <td>${_fmt(sdSide)}</td>
                                <td>${_fmtDeg(sdDescent)}</td>
                                <td>${_fmt(sdSmash, 2)}</td>
                                <td></td>
                            </tr>
                            ${clubShots.map(s => `<tr data-shot-id="${s.id}" onclick="window._toggleShotHighlight(${s.id})" class="clickable">
                                <td>${s.shot_number}</td>
                                <td>${_fmt(s.carry_yards)}</td>
                                <td>${_fmt(s.total_yards)}</td>
                                <td>${_fmt(s.ball_speed_mph)}</td>
                                <td>${_fmt(s.club_speed_mph)}</td>
                                <td>${_fmtDeg(s.launch_angle_deg)}</td>
                                <td>${_fmtInt(s.spin_rate_rpm)}</td>
                                <td>${_fmt(s.apex_yards)}</td>
                                <td>${_fmtSigned(s.side_carry_yards)}</td>
                                <td>${_fmtDeg(s.descent_angle_deg)}</td>
                                <td>${_fmt(s.smash_factor, 2)}</td>
                                <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${s.source === "trackman" ? "trackman" : "range"}', ${s.id})" style="font-size:0.7rem;">Move</button></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }).join('');
    }

    // Toggle shot highlight from table click
    window._toggleShotHighlight = function(shotId) {
        const hl = rangeState.highlightedShotIds;
        if (hl.size === 1 && hl.has(shotId)) {
            clearHighlights();
        } else {
            highlightShots([shotId]);
        }
    };

    // Chart.js handles its own responsive resize, no manual handler needed

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

    // ========== Initial Load ==========
    loadAllData();
    loadApiUsage();
    // Refresh usage every 30s
    setInterval(loadApiUsage, 30000);
});
