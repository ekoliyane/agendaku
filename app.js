// ============================================
// AgendaKu — App Logic (Online via Neon + Vercel)
// ============================================

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const API_BASE = '/api/tasks';
    const CACHE_KEY = 'agendaku_cache';

    // --- Helpers ---
    function getDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateFull(date) {
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    function formatDateShort(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
            'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${date.getDate()} ${months[date.getMonth()]}`;
    }

    function isToday(date) { return getDateKey(date) === getDateKey(new Date()); }

    function isPast(date) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        return d < today;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Cache ---
    function getCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
    }
    function setCache(data) { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }

    // --- API ---
    let allData = {};

    async function apiFetch(url, opts = {}) {
        try {
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...opts
            });
            return await res.json();
        } catch (err) {
            console.warn('API error:', err);
            return null;
        }
    }

    async function loadAllFromAPI() {
        showLoading(true);
        const result = await apiFetch(API_BASE);
        if (result && result.dates) {
            allData = result.dates;
            setCache(allData);
        } else {
            allData = getCache();
        }
        showLoading(false);
    }

    function getDayTasks(dateKey) { return allData[dateKey] || []; }

    // --- Loading ---
    function showLoading(show) {
        let el = $('#loadingIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'loadingIndicator';
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#4f6ef7,#818cf8);z-index:9999;transition:opacity 0.3s;overflow:hidden;';
            el.innerHTML = '<div style="height:100%;width:30%;background:rgba(255,255,255,0.3);animation:loadSlide 1s ease infinite;"></div>';
            const s = document.createElement('style');
            s.textContent = '@keyframes loadSlide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}';
            document.head.appendChild(s);
            document.body.appendChild(el);
        }
        el.style.opacity = show ? '1' : '0';
        el.style.pointerEvents = show ? 'auto' : 'none';
    }

    // --- State ---
    let currentDate = new Date();
    let openDetailId = null;

    // --- Render ---
    function render() {
        const dateKey = getDateKey(currentDate);
        const tasks = getDayTasks(dateKey);
        renderDateNav();
        renderTasks(tasks, dateKey);
        renderProgress(tasks);
        renderSummary(tasks);
        renderStreak();
        renderHistory();
        updateAddTaskVisibility();
    }

    function renderDateNav() {
        $('#dateLabel').textContent = isToday(currentDate) ? 'Hari Ini' : (isPast(currentDate) ? 'Lampau' : 'Akan Datang');
        $('#dateFull').textContent = formatDateFull(currentDate);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        $('#nextDay').disabled = currentDate >= tomorrow;
    }

    function renderTasks(tasks, dateKey) {
        const carryTasks = tasks.filter(t => t.carryOver);
        const todayTasks = tasks.filter(t => !t.carryOver);

        const $carryGroup = $('#carryOverGroup'), $carryList = $('#carryOverList');
        const $todayGroup = $('#todayGroup'), $todayList = $('#todayList');

        $carryList.innerHTML = '';
        $carryGroup.style.display = carryTasks.length > 0 ? 'block' : 'none';
        carryTasks.forEach(t => $carryList.appendChild(createTaskElement(t, dateKey)));

        $todayList.innerHTML = '';
        $todayGroup.style.display = (todayTasks.length > 0 || carryTasks.length === 0) ? 'block' : 'none';
        todayTasks.forEach(t => $todayList.appendChild(createTaskElement(t, dateKey)));

        $('#emptyState').classList.toggle('visible', tasks.length === 0);
    }

    function createTaskElement(task, dateKey) {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '') + (task.carryOver ? ' carry-over' : '');
        li.dataset.id = task.id;

        const priorityLabels = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
        const hasExtra = (task.notes && task.notes.trim()) || (task.link && task.link.trim());
        const isOpen = openDetailId === task.id;

        li.innerHTML = `
            <label class="task-checkbox" title="Tandai selesai">
                <input type="checkbox" ${task.done ? 'checked' : ''}>
                <span class="checkmark"></span>
            </label>
            <span class="task-text">${escapeHtml(task.text)}</span>
            ${hasExtra ? '<span class="task-has-notes" title="Ada catatan/link">📎</span>' : ''}
            ${task.carryOver ? '<span class="task-pr-badge">PR</span>' : ''}
            <span class="task-priority ${task.priority}">${priorityLabels[task.priority] || 'Sedang'}</span>
            <div class="task-actions">
                <button class="task-action-btn btn-edit" title="Edit tugas">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="task-action-btn btn-delete" title="Hapus tugas">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="task-detail ${isOpen ? 'open' : ''}" data-detail="${task.id}">
                <textarea class="task-notes" placeholder="Catatan..." rows="2">${escapeHtml(task.notes || '')}</textarea>
                <div class="task-link-row">
                    <input type="url" class="task-link-input" placeholder="Link (https://...)" value="${escapeHtml(task.link || '')}">
                    <button class="task-link-open" title="Buka link" ${!(task.link && task.link.trim()) ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Checkbox
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            e.stopPropagation(); toggleTask(dateKey, task.id);
        });
        li.querySelector('.task-checkbox').addEventListener('click', (e) => e.stopPropagation());

        // Expand/collapse
        li.addEventListener('click', (e) => {
            if (e.target.closest('.task-detail') || e.target.closest('.task-actions')) return;
            openDetailId = openDetailId === task.id ? null : task.id;
            render();
        });

        // Edit
        li.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation(); startInlineEdit(li, task, dateKey);
        });

        // Delete
        li.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            li.classList.add('removing');
            setTimeout(() => deleteTask(dateKey, task.id), 300);
        });

        // Notes
        const notesEl = li.querySelector('.task-notes');
        notesEl.addEventListener('blur', () => updateTaskField(dateKey, task.id, 'notes', notesEl.value));
        notesEl.addEventListener('click', (e) => e.stopPropagation());

        // Link
        const linkInput = li.querySelector('.task-link-input');
        const linkOpen = li.querySelector('.task-link-open');
        linkInput.addEventListener('blur', () => {
            updateTaskField(dateKey, task.id, 'link', linkInput.value);
            linkOpen.disabled = !linkInput.value.trim();
        });
        linkInput.addEventListener('click', (e) => e.stopPropagation());
        linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); linkInput.blur(); } });
        linkOpen.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = linkInput.value.trim();
            if (url) window.open(url.match(/^https?:\/\//) ? url : 'https://' + url, '_blank');
        });

        return li;
    }

    function startInlineEdit(li, task, dateKey) {
        const textSpan = li.querySelector('.task-text');
        const oldText = task.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-text-edit';
        input.value = oldText;
        textSpan.replaceWith(input);
        input.focus(); input.select();

        function finishEdit() {
            const newText = input.value.trim();
            if (newText && newText !== oldText) updateTaskField(dateKey, task.id, 'text', newText);
            render();
        }
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = oldText; input.blur(); }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    // --- Actions ---
    async function addTask(text, priority) {
        const dateKey = getDateKey(currentDate);
        const task = {
            id: generateId(), date: dateKey, text: text.trim(), priority,
            notes: '', link: '', done: false, carryOver: false,
            originalId: '', fromDate: '', createdAt: Date.now()
        };
        if (!allData[dateKey]) allData[dateKey] = [];
        allData[dateKey].push(task);
        setCache(allData); render();
        await apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(task) });
    }

    async function toggleTask(dateKey, taskId) {
        const tasks = allData[dateKey] || [];
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        task.done = !task.done;
        setCache(allData); render();
        await apiFetch(API_BASE, { method: 'PUT', body: JSON.stringify({ id: taskId, done: task.done }) });
    }

    async function deleteTask(dateKey, taskId) {
        allData[dateKey] = (allData[dateKey] || []).filter(t => t.id !== taskId);
        if (openDetailId === taskId) openDetailId = null;
        setCache(allData); render();
        await apiFetch(`${API_BASE}?id=${taskId}`, { method: 'DELETE' });
    }

    async function updateTaskField(dateKey, taskId, field, value) {
        const task = (allData[dateKey] || []).find(t => t.id === taskId);
        if (!task) return;
        task[field] = value;
        setCache(allData);
        const body = { id: taskId }; body[field] = value;
        await apiFetch(API_BASE, { method: 'PUT', body: JSON.stringify(body) });
    }

    // --- Carry-Over ---
    async function processCarryOver(todayKey) {
        const dates = Object.keys(allData).filter(d => d < todayKey).sort().reverse();
        if (dates.length === 0) return;
        const lastDate = dates[0];
        const lastTasks = allData[lastDate] || [];
        const todayTasks = allData[todayKey] || [];
        const existingCarryIds = todayTasks.filter(t => t.carryOver).map(t => t.originalId || t.id);
        const toCarry = lastTasks.filter(t => !t.done && !existingCarryIds.includes(t.id));
        if (toCarry.length === 0) return;

        for (const t of toCarry) {
            const newTask = {
                id: generateId(), date: todayKey, text: t.text, priority: t.priority,
                notes: t.notes || '', link: t.link || '', done: false, carryOver: true,
                originalId: t.id, fromDate: lastDate, createdAt: Date.now()
            };
            if (!allData[todayKey]) allData[todayKey] = [];
            allData[todayKey].push(newTask);
            await apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(newTask) });
        }
        setCache(allData);
    }

    // --- Stats ---
    function calculateStreak() {
        let streak = 0;
        const today = new Date();
        let checkDate = new Date(today);
        const todayKey = getDateKey(today);
        if (!allData[todayKey] || allData[todayKey].length === 0) checkDate.setDate(checkDate.getDate() - 1);
        for (let i = 0; i < 365; i++) {
            const key = getDateKey(checkDate);
            const tasks = allData[key];
            if (!tasks || tasks.length === 0) break;
            if (!tasks.every(t => t.done)) break;
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        }
        return streak;
    }

    function renderProgress(tasks) {
        const total = tasks.length, done = tasks.filter(t => t.done).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        $('#progressText').textContent = `${done} dari ${total} tugas selesai`;
        $('#progressPercent').textContent = `${percent}%`;
        $('#progressFill').style.width = `${percent}%`;
        const fill = $('#progressFill');
        fill.style.background = percent === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' :
            percent >= 50 ? 'linear-gradient(90deg, #4f6ef7, #818cf8)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    }

    function renderSummary(tasks) {
        const $s = $('#summarySection');
        if (tasks.length === 0) { $s.style.display = 'none'; return; }
        $s.style.display = 'block';
        const total = tasks.length, done = tasks.filter(t => t.done).length;
        const percent = Math.round((done / total) * 100);
        $('#statTotal').textContent = total;
        $('#statDone').textContent = done;
        $('#statPending').textContent = total - done;
        const $m = $('#summaryMessage');
        if (percent === 100) { $m.className = 'summary-message excellent'; $m.textContent = '🎉 Luar biasa! Semua tugas tercapai!'; }
        else if (percent >= 75) { $m.className = 'summary-message good'; $m.textContent = '💪 Hebat! Hampir semua selesai!'; }
        else if (percent >= 50) { $m.className = 'summary-message okay'; $m.textContent = '⚡ Lumayan, tapi masih ada yang perlu diselesaikan.'; }
        else { $m.className = 'summary-message low'; $m.textContent = '📌 Masih banyak PR, semangat besok ya!'; }
    }

    function renderStreak() { $('#streakCount').textContent = calculateStreak(); }

    function renderHistory() {
        const todayKey = getDateKey(new Date());
        const $list = $('#historyList'), $empty = $('#historyEmpty');
        $list.innerHTML = '';
        const historyDates = Object.keys(allData).filter(d => d !== todayKey && allData[d].length > 0).sort().reverse();
        if (historyDates.length === 0) { $empty.style.display = 'block'; return; }
        $empty.style.display = 'none';
        historyDates.slice(0, 14).forEach(dk => {
            const tasks = allData[dk], done = tasks.filter(t => t.done).length;
            const percent = Math.round((done / tasks.length) * 100);
            const d = new Date(dk + 'T00:00:00');
            const barColor = percent === 100 ? '#10b981' : percent >= 50 ? '#4f6ef7' : '#f59e0b';
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `<span class="history-date">${formatDateShort(d)}</span>
                <div class="history-score"><div class="history-bar"><div class="history-bar-fill" style="width:${percent}%;background:${barColor}"></div></div>
                <span class="history-percent" style="color:${barColor}">${percent}%</span></div>`;
            li.addEventListener('click', () => { currentDate = new Date(dk + 'T00:00:00'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
            $list.appendChild(li);
        });
    }

    function updateAddTaskVisibility() {
        $('#addTaskSection').style.display = (isPast(currentDate) && !isToday(currentDate)) ? 'none' : 'block';
    }

    // --- Init ---
    async function init() {
        await loadAllFromAPI();
        await processCarryOver(getDateKey(new Date()));
        $('#addTaskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('#taskInput'), text = input.value.trim();
            if (!text) return;
            addTask(text, $('#prioritySelect').value);
            input.value = ''; input.focus();
        });
        $('#prevDay').addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 1); openDetailId = null; render(); });
        $('#nextDay').addEventListener('click', () => {
            const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
            if (currentDate < tmr) { currentDate.setDate(currentDate.getDate() + 1); openDetailId = null; render(); }
        });
        $('#historyToggle').addEventListener('click', () => {
            const $c = $('#historyContent'), $t = $('#historyToggle'), open = $c.style.display !== 'none';
            $c.style.display = open ? 'none' : 'block'; $t.classList.toggle('open', !open);
        });
        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
