document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('fit-file');
    const previewPanel = document.getElementById('preview-panel');
    const statusMsg = document.getElementById('status-msg');
    const btnImport = document.getElementById('btn-import');
    const btnCancel = document.getElementById('btn-cancel');

    let currentFile = null;

    // --- JSON bulk import ---
    const jsonUploadZone = document.getElementById('json-upload-zone');
    const jsonFileInput = document.getElementById('json-files');
    const jsonFileList = document.getElementById('json-file-list');
    const jsonFileNames = document.getElementById('json-file-names');
    const btnJsonImport = document.getElementById('btn-json-import');
    const btnJsonCancel = document.getElementById('btn-json-cancel');
    const jsonStatusMsg = document.getElementById('json-status-msg');

    let jsonFiles = null;

    // File name → form field name mapping
    const JSON_FILE_MAP = {
        'golf-club_types': 'club_types',
        'golf-club': 'clubs',
        'golf-course': 'courses',
        'golf-scorecard': 'scorecards',
        'golf-shot': 'shots',
    };

    function matchJsonField(filename) {
        const lower = filename.toLowerCase().replace('.json', '');
        // Check longest match first to avoid "golf-club" matching before "golf-club_types"
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
            li.textContent = `${f.name} → ${field || 'unrecognized'}`;
            if (!field) li.style.color = 'var(--warning)';
            jsonFileNames.appendChild(li);
            if (field) matched++;
        }
        jsonFileList.style.display = matched > 0 ? 'block' : 'none';
        jsonStatusMsg.style.display = 'none';
    }

    btnJsonImport.addEventListener('click', async () => {
        if (!jsonFiles) return;
        btnJsonImport.disabled = true;
        btnJsonImport.textContent = 'Importing...';

        const formData = new FormData();
        for (const f of jsonFiles) {
            const field = matchJsonField(f.name);
            if (field) formData.append(field, f);
        }

        try {
            const resp = await fetch('/api/import/garmin-json', { method: 'POST', body: formData });
            const data = await resp.json();
            if (resp.ok) {
                const r = data.results;
                const s = data.summary;
                jsonStatusMsg.textContent = `Imported: ${s.scorecards_processed} rounds (${r.scorecards?.created || 0} new, ${r.scorecards?.updated || 0} updated), `
                    + `${s.courses_processed} courses, ${s.clubs_processed} clubs, ${s.shots_processed} shots`;
                jsonStatusMsg.className = 'status status-success';
                jsonStatusMsg.style.display = 'block';
                jsonFileList.style.display = 'none';
                jsonFiles = null;
                jsonFileInput.value = '';
                loadRounds();
                loadCourses();
            } else {
                jsonStatusMsg.textContent = data.detail || 'Import failed';
                jsonStatusMsg.className = 'status status-error';
                jsonStatusMsg.style.display = 'block';
            }
        } catch (e) {
            jsonStatusMsg.textContent = 'Import error: ' + e.message;
            jsonStatusMsg.className = 'status status-error';
            jsonStatusMsg.style.display = 'block';
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

    // --- FIT Upload zone ---
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

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

    // --- Preview FIT file ---
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

            // Build scorecard
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

    // --- Import ---
    btnImport.addEventListener('click', async () => {
        if (!currentFile) return;

        btnImport.disabled = true;
        btnImport.textContent = 'Importing...';

        const formData = new FormData();
        formData.append('file', currentFile);

        try {
            const resp = await fetch('/api/import/fit', { method: 'POST', body: formData });
            const data = await resp.json();

            if (resp.ok) {
                showStatus(`Imported: ${data.course} — ${data.date} — ${data.strokes} strokes (${data.shots_tracked} shots tracked)`, 'success');
                previewPanel.classList.remove('visible');
                currentFile = null;
                fileInput.value = '';
                loadRounds();
                loadCourses();
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

    // --- Load rounds ---
    async function loadRounds() {
        try {
            const resp = await fetch('/api/rounds/');
            const rounds = await resp.json();
            const tbody = document.getElementById('rounds-body');

            if (rounds.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No rounds yet. Import a FIT file above.</td></tr>';
                return;
            }

            tbody.innerHTML = rounds.map(r => {
                const vsPar = r.score_vs_par;
                const vsParStr = vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
                const cls = vsPar < 0 ? 'score-birdie' : vsPar === 0 ? 'score-par' : 'score-bogey';
                return `<tr style="cursor:pointer" onclick="location.hash='round/${r.id}'">
                    <td>${r.date}</td>
                    <td>${r.course_name || '—'}</td>
                    <td>${r.total_strokes || '—'}</td>
                    <td class="${cls}">${vsParStr}</td>
                    <td>${r.holes_completed || '—'}</td>
                    <td>${r.shots_tracked || '—'}</td>
                    <td>${r.source || '—'}</td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('Failed to load rounds:', e);
        }
    }

    // --- Load courses ---
    async function loadCourses() {
        try {
            const resp = await fetch('/api/courses/');
            const courses = await resp.json();
            const tbody = document.getElementById('courses-body');

            if (courses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No courses yet.</td></tr>';
                return;
            }

            tbody.innerHTML = courses.map(c => `<tr>
                <td>${c.name}</td>
                <td>${c.holes || '—'}</td>
                <td>${c.par || '—'}</td>
                <td>${c.course_rating?.toFixed(1) || '—'}</td>
                <td>${c.slope_rating || '—'}</td>
                <td><a href="#course/${c.id}" style="color:var(--accent);">View</a></td>
            </tr>`).join('');
        } catch (e) {
            console.error('Failed to load courses:', e);
        }
    }

    // --- Status messages ---
    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = `status status-${type}`;
        statusMsg.style.display = 'block';
    }

    function hideStatus() {
        statusMsg.style.display = 'none';
    }

    // --- Nav highlighting ---
    document.querySelectorAll('nav a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const target = a.getAttribute('href').replace('#', 'section-');
            const el = document.getElementById(target);
            if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Initial load
    loadRounds();
    loadCourses();
});
