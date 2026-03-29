// ============================================
// AgendaKu — App Logic (Online via Google Sheets)
// ============================================

(function () {
    'use strict';

    // =============================================
    // ⬇️ PASTE YOUR APPS SCRIPT WEB APP URL HERE ⬇️
    // =============================================
    const API_URL = '';
    // =============================================

    const $ = (sel) => document.querySelector(sel);
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

    function isToday(date) {
        return getDateKey(date) === getDateKey(new Date());
    }

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

    // --- Cache Layer (localStorage as offline cache) ---
    function getCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function setCache(data) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
    function getCachedTasks(dateKey) {
        return getCache()[dateKey] || [];
    }
    function setCachedTasks(dateKey, tasks) {
        const cache = getCache();
        cache[dateKey] = tasks;
        setCache(cache);
    }

    // --- API Layer ---
    let allData = {}; // in-memory store for all dates

    async function apiCall(action, params = {}, body = null) {
        if (!API_URL) return null; // fallback to cache-only
        const url = new URL(API_URL);
        url.searchParams.set('action', action);
        Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));

        try {
            const opts = { redirect: 'follow' };
            if (body) {
                opts.method = 'POST';
                opts.headers = { 'Content-Type': 'text/plain' };
                opts.body = JSON.stringify(body);
            }
            const res = await fetch(url.toString(), opts);
            return await res.json();
        } catch (err) {
            console.warn('API error, using cache:', err);
            return null;
        }
    }

    async function loadAllFromAPI() {
        showLoading(true);
        const result = await apiCall('getAllTasks');
        if (result && result.dates) {
            allData = result.dates;
            setCache(allData);
        } else {
            allData = getCache();
        }
        showLoading(false);
    }

    function getDayTasks(dateKey) {
        return allData[dateKey] || [];
    }

    // --- Loading indicator ---
    function showLoading(show) {
        let el = $('#loadingIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'loadingIndicator';
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#4f6ef7,#818cf8);z-index:9999;transition:opacity 0.3s;';
            el.innerHTML = '<div style="height:100%;width:30%;background:rgba(255,255,255,0.3);animation:loadSlide 1s ease infinite;"></div>';
            const styleEl = document.createElement('style');
            styleEl.textContent = '@keyframes loadSlide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}';
            document.head.appendChild(styleEl);
            document.body.appendChild(el);
        }
        el.style.opacity = show ? '1' : '0';
        el.style.pointerEvents = show ? 'auto' : 'none';
    }

    // --- App State ---
    let currentDate = new Date();
    let openDetailId = null;

    // --- UI Rendering ---
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
        const $label = $('#dateLabel');
        const $full = $('#dateFull');
        const $next = $('#nextDay');

        $label.textContent = isToday(currentDate) ? 'Hari Ini' : (isPast(currentDate) ? 'Lampau' : 'Akan Datang');
        $full.textContent = formatDateFull(currentDate);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        $next.disabled = currentDate >= tomorrow;
    }

    function renderTasks(tasks, dateKey) {
        const carryTasks = tasks.filter(t => t.carryOver);
        const todayTasks = tasks.filter(t => !t.carryOver);

        const $carryGroup = $('#carryOverGroup');
        const $carryList = $('#carryOverList');
        const $todayGroup = $('#todayGroup');
        const $todayList = $('#todayList');
        const $empty = $('#emptyState');

        $carryList.innerHTML = '';
        if (carryTasks.length > 0) {
            $carryGroup.style.display = 'block';
            carryTasks.forEach(task => $carryList.appendChild(createTaskElement(task, dateKey)));
        } else {
            $carryGroup.style.display = 'none';
        }

        $todayList.innerHTML = '';
        if (todayTasks.length > 0) {
            $todayGroup.style.display = 'block';
            todayTasks.forEach(task => $todayList.appendChild(createTaskElement(task, dateKey)));
        } else {
            $todayGroup.style.display = carryTasks.length > 0 ? 'none' : 'block';
        }

        $empty.classList.toggle('visible', tasks.length === 0);
    }

    function createTaskElement(task, dateKey) {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '') + (task.carryOver ? ' carry-over' : '');
        li.dataset.id = task.id;

        const priorityLabels = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
        const hasNotes = task.notes && task.notes.trim();
        const hasLink = task.link && task.link.trim();
        const hasExtra = hasNotes || hasLink;
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
                    <button class="task-link-open" title="Buka link" ${!hasLink ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Toggle checkbox
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            e.stopPropagation();
            toggleTask(dateKey, task.id);
        });
        li.querySelector('.task-checkbox').addEventListener('click', (e) => e.stopPropagation());

        // Click row to expand/collapse
        li.addEventListener('click', (e) => {
            if (e.target.closest('.task-detail') || e.target.closest('.task-actions')) return;
            openDetailId = openDetailId === task.id ? null : task.id;
            render();
        });

        // Edit button
        li.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            startInlineEdit(li, task, dateKey);
        });

        // Delete button
        li.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            li.classList.add('removing');
            setTimeout(() => deleteTask(dateKey, task.id), 300);
        });

        // Notes auto-save
        const notesEl = li.querySelector('.task-notes');
        notesEl.addEventListener('blur', () => {
            updateTaskField(dateKey, task.id, 'notes', notesEl.value);
        });
        notesEl.addEventListener('click', (e) => e.stopPropagation());

        // Link auto-save
        const linkInput = li.querySelector('.task-link-input');
        const linkOpen = li.querySelector('.task-link-open');
        linkInput.addEventListener('blur', () => {
            updateTaskField(dateKey, task.id, 'link', linkInput.value);
            linkOpen.disabled = !linkInput.value.trim();
        });
        linkInput.addEventListener('click', (e) => e.stopPropagation());
        linkInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); linkInput.blur(); }
        });
        linkOpen.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = linkInput.value.trim();
            if (url) {
                window.open(url.match(/^https?:\/\//) ? url : 'https://' + url, '_blank');
            }
        });

        return li;
    }

    // --- Inline Edit ---
    function startInlineEdit(li, task, dateKey) {
        const textSpan = li.querySelector('.task-text');
        const oldText = task.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-text-edit';
        input.value = oldText;
        textSpan.replaceWith(input);
        input.focus();
        input.select();

        function finishEdit() {
            const newText = input.value.trim();
            if (newText && newText !== oldText) {
                updateTaskField(dateKey, task.id, 'text', newText);
            }
            render();
        }
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = oldText; input.blur(); }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    // --- Actions (with API sync) ---
    async function addTask(text, priority) {
        const dateKey = getDateKey(currentDate);
        const task = {
            id: generateId(),
            date: dateKey,
            text: text.trim(),
            priority,
            notes: '',
            link: '',
            done: false,
            carryOver: false,
            originalId: '',
            fromDate: '',
            createdAt: Date.now()
        };

        // Update local immediately
        if (!allData[dateKey]) allData[dateKey] = [];
        allData[dateKey].push(task);
        setCachedTasks(dateKey, allData[dateKey]);
        render();

        // Sync to API
        await apiCall('addTask', {}, task);
    }

    async function toggleTask(dateKey, taskId) {
        const tasks = allData[dateKey] || [];
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        task.done = !task.done;
        setCachedTasks(dateKey, tasks);
        render();
        await apiCall('updateTask', {}, { id: taskId, done: task.done });
    }

    async function deleteTask(dateKey, taskId) {
        allData[dateKey] = (allData[dateKey] || []).filter(t => t.id !== taskId);
        if (openDetailId === taskId) openDetailId = null;
        setCachedTasks(dateKey, allData[dateKey]);
        render();
        await apiCall('deleteTask', { id: taskId });
    }

    async function updateTaskField(dateKey, taskId, field, value) {
        const tasks = allData[dateKey] || [];
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        task[field] = value;
        setCachedTasks(dateKey, tasks);
        const update = { id: taskId };
        update[field] = value;
        await apiCall('updateTask', {}, update);
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
                id: generateId(),
                date: todayKey,
                text: t.text,
                priority: t.priority,
                notes: t.notes || '',
                link: t.link || '',
                done: false,
                carryOver: true,
                originalId: t.id,
                fromDate: lastDate,
                createdAt: Date.now()
            };
            if (!allData[todayKey]) allData[todayKey] = [];
            allData[todayKey].push(newTask);
            await apiCall('addTask', {}, newTask);
        }
        setCachedTasks(todayKey, allData[todayKey]);
    }

    // --- Streak ---
    function calculateStreak() {
        let streak = 0;
        const today = new Date();
        const todayKey = getDateKey(today);
        let checkDate = new Date(today);

        if (!allData[todayKey] || allData[todayKey].length === 0) {
            checkDate.setDate(checkDate.getDate() - 1);
        }

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

    // --- Progress ---
    function renderProgress(tasks) {
        const total = tasks.length;
        const done = tasks.filter(t => t.done).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;

        $('#progressText').textContent = `${done} dari ${total} tugas selesai`;
        $('#progressPercent').textContent = `${percent}%`;
        $('#progressFill').style.width = `${percent}%`;

        const fill = $('#progressFill');
        if (percent === 100) fill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        else if (percent >= 50) fill.style.background = 'linear-gradient(90deg, #4f6ef7, #818cf8)';
        else fill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    }

    function renderSummary(tasks) {
        const $section = $('#summarySection');
        if (tasks.length === 0) { $section.style.display = 'none'; return; }

        $section.style.display = 'block';
        const total = tasks.length;
        const done = tasks.filter(t => t.done).length;
        const percent = Math.round((done / total) * 100);

        $('#statTotal').textContent = total;
        $('#statDone').textContent = done;
        $('#statPending').textContent = total - done;

        const $msg = $('#summaryMessage');
        if (percent === 100) { $msg.className = 'summary-message excellent'; $msg.textContent = '🎉 Luar biasa! Semua tugas tercapai!'; }
        else if (percent >= 75) { $msg.className = 'summary-message good'; $msg.textContent = '💪 Hebat! Hampir semua selesai!'; }
        else if (percent >= 50) { $msg.className = 'summary-message okay'; $msg.textContent = '⚡ Lumayan, tapi masih ada yang perlu diselesaikan.'; }
        else { $msg.className = 'summary-message low'; $msg.textContent = '📌 Masih banyak PR, semangat besok ya!'; }
    }

    function renderStreak() {
        $('#streakCount').textContent = calculateStreak();
    }

    function renderHistory() {
        const todayKey = getDateKey(new Date());
        const $list = $('#historyList');
        const $empty = $('#historyEmpty');
        $list.innerHTML = '';

        const historyDates = Object.keys(allData).filter(d => d !== todayKey && allData[d].length > 0).sort().reverse();
        if (historyDates.length === 0) { $empty.style.display = 'block'; return; }
        $empty.style.display = 'none';

        historyDates.slice(0, 14).forEach(dateKey => {
            const tasks = allData[dateKey];
            const done = tasks.filter(t => t.done).length;
            const percent = Math.round((done / tasks.length) * 100);
            const d = new Date(dateKey + 'T00:00:00');
            let barColor = percent === 100 ? '#10b981' : percent >= 50 ? '#4f6ef7' : '#f59e0b';

            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <span class="history-date">${formatDateShort(d)}</span>
                <div class="history-score">
                    <div class="history-bar">
                        <div class="history-bar-fill" style="width:${percent}%;background:${barColor}"></div>
                    </div>
                    <span class="history-percent" style="color:${barColor}">${percent}%</span>
                </div>
            `;
            li.addEventListener('click', () => {
                currentDate = new Date(dateKey + 'T00:00:00');
                render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            $list.appendChild(li);
        });
    }

    function updateAddTaskVisibility() {
        $('#addTaskSection').style.display = (isPast(currentDate) && !isToday(currentDate)) ? 'none' : 'block';
    }

    // --- Init ---
    async function init() {
        // Load from API (or cache)
        await loadAllFromAPI();

        // Process carry-over
        await processCarryOver(getDateKey(new Date()));

        // Form submit
        $('#addTaskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('#taskInput');
            const text = input.value.trim();
            if (!text) return;
            addTask(text, $('#prioritySelect').value);
            input.value = '';
            input.focus();
        });

        // Date navigation
        $('#prevDay').addEventListener('click', () => {
            currentDate.setDate(currentDate.getDate() - 1);
            openDetailId = null;
            render();
        });

        $('#nextDay').addEventListener('click', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (currentDate < tomorrow) {
                currentDate.setDate(currentDate.getDate() + 1);
                openDetailId = null;
                render();
            }
        });

        // History toggle
        $('#historyToggle').addEventListener('click', () => {
            const $content = $('#historyContent');
            const $toggle = $('#historyToggle');
            const isOpen = $content.style.display !== 'none';
            $content.style.display = isOpen ? 'none' : 'block';
            $toggle.classList.toggle('open', !isOpen);
        });

        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
