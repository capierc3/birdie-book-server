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

        // Re-render box plot when clubs section becomes visible (fixes zero-width canvas)
        if (sectionId === 'section-clubs' && _lastBoxPlotClubs) {
            requestAnimationFrame(() => renderClubBoxPlot(_lastBoxPlotClubs));
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

    // ── Leaflet Hole Map ──

    let holeLeafletMap = null;
    let holeShotLayers = null;  // L.LayerGroup for shot polylines
    let holeMarkerLayers = null;  // L.LayerGroup for tee/flag/fairway

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
            }).addTo(holeShotLayers);

            // End dot (landing position)
            L.circleMarker(end, {
                radius: isHistoric ? 3 : 5,
                color: color,
                fillColor: color,
                fillOpacity: isHistoric ? 0.5 : 0.8,
                weight: 1,
            }).addTo(holeShotLayers);

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

        // Note: rotation disabled — leaflet-rotate plugin had click-shift bugs
        // TODO: revisit with Mapbox GL JS or a fixed rotate plugin
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
        document.getElementById('edit-par').value = editPar || '';
        document.getElementById('edit-yardage').value = editYardage || '';
        document.getElementById('edit-handicap').value = editHandicap || '';

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

    function exitEditMode() {
        holeEditMode = false;
        document.getElementById('hole-edit-toolbar').style.display = 'none';

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

            return `<tr>
                <td style="width:28px;"><span class="source-badge" style="background:${clubColor}; color:${textColor}; cursor:pointer;" title="Click to change color" onclick="event.stopPropagation(); window._pickClubColor(${c.id})">${srcLabel}</span></td>
                <td class="clickable" onclick="window._editClub(${c.id})"><strong>${c.club_type}</strong>${c.name ? ` <span style="color:var(--accent); font-size:0.8rem;">"${c.name}"</span>` : ''}${c.model ? ` <span style="color:var(--text-muted); font-size:0.84rem;">${c.model}</span>` : ''}</td>
                <td>${avg}</td>
                <td>${maxD}</td>
                <td>${median}</td>
                <td>${stdDev}</td>
                <td>${shots}${wShots}</td>
                <td style="width:60px;"><button class="btn btn-ghost btn-sm" onclick="window._mergeClub(${c.id})" title="Merge another club into this one" style="font-size:0.75rem;">Merge</button></td>
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
                const moveBtn = `<td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shotType}', ${s.raw_id})" style="font-size:0.7rem;">Move</button></td>`;
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
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window._reassignShot('${shot.source === "trackman" ? "trackman" : "range"}', ${shot.raw_id})" style="font-size:0.75rem;">Move Shot</button>
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
    }

    // Close button
    document.getElementById('btn-panel-close')?.addEventListener('click', () => {
        rangeState.compareMode = false;
        rangeState.primaryShotId = null;
        rangeState.compareShotId = null;
        hideShotPanel();
        clearHighlights();
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
