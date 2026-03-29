// ============================================
// AgendaKu — App Logic (Google Sign-In + Neon)
// ============================================

(function () {
    'use strict';

    // =============================================
    // ⬇️ PASTE YOUR GOOGLE CLIENT ID HERE ⬇️
    // =============================================
    const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
    // =============================================

    const $ = (sel) => document.querySelector(sel);
    const API_BASE = '/api/tasks';
    const CACHE_KEY = 'agendaku_cache';
    const AUTH_KEY = 'agendaku_auth';

    // --- Auth State ---
    let currentUser = null; // { id, name, email, picture }

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
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${date.getDate()} ${months[date.getMonth()]}`;
    }
    function isToday(date) { return getDateKey(date) === getDateKey(new Date()); }
    function isPast(date) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        return d < today;
    }
    function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
    function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    // --- Cache ---
    function getCacheKey() { return CACHE_KEY + '_' + (currentUser ? currentUser.id : 'anon'); }
    function getCache() { try { return JSON.parse(localStorage.getItem(getCacheKey()) || '{}'); } catch (e) { return {}; } }
    function setCache(data) { localStorage.setItem(getCacheKey(), JSON.stringify(data)); }

    // --- API ---
    let allData = {};

    async function apiFetch(url, opts = {}) {
        try {
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
            return await res.json();
        } catch (err) { console.warn('API error:', err); return null; }
    }

    async function loadAllFromAPI() {
        showLoading(true);
        const uid = currentUser ? currentUser.id : '';
        const result = await apiFetch(`${API_BASE}?user_id=${encodeURIComponent(uid)}`);
        if (result && result.dates) { allData = result.dates; setCache(allData); }
        else { allData = getCache(); }
        showLoading(false);
    }

    function getDayTasks(dateKey) { return allData[dateKey] || []; }

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
    }

    // --- Auth: Google Sign-In ---
    function decodeJwt(token) {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    }

    function handleGoogleLogin(response) {
        const payload = decodeJwt(response.credential);
        currentUser = {
            id: payload.sub,
            name: payload.name,
            email: payload.email,
            picture: payload.picture
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
        showApp();
    }

    function tryAutoLogin() {
        const saved = localStorage.getItem(AUTH_KEY);
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
                showApp();
                return true;
            } catch (e) { localStorage.removeItem(AUTH_KEY); }
        }
        return false;
    }

    function logout() {
        currentUser = null;
        localStorage.removeItem(AUTH_KEY);
        $('#loginScreen').classList.remove('hidden');
        $('#appWrapper').style.display = 'none';
        google.accounts.id.disableAutoSelect();
    }

    async function showApp() {
        $('#loginScreen').classList.add('hidden');
        $('#appWrapper').style.display = 'block';

        // Update user UI
        if (currentUser) {
            $('#userAvatar').src = currentUser.picture || '';
            $('#userAvatar').title = currentUser.name || currentUser.email;
        }

        await loadAllFromAPI();
        await processCarryOver(getDateKey(new Date()));
        render();
    }

    // --- State ---
    let currentDate = new Date();
    let openDetailId = null;

    // --- Render ---
    function render() {
        const dateKey = getDateKey(currentDate);
        const tasks = getDayTasks(dateKey);
        renderDateNav(); renderTasks(tasks, dateKey); renderProgress(tasks);
        renderSummary(tasks); renderStreak(); renderHistory(); updateAddTaskVisibility();
    }

    function renderDateNav() {
        $('#dateLabel').textContent = isToday(currentDate) ? 'Hari Ini' : (isPast(currentDate) ? 'Lampau' : 'Akan Datang');
        $('#dateFull').textContent = formatDateFull(currentDate);
        const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
        $('#nextDay').disabled = currentDate >= tmr;
    }

    function renderTasks(tasks, dateKey) {
        const carryTasks = tasks.filter(t => t.carryOver), todayTasks = tasks.filter(t => !t.carryOver);
        const $cg = $('#carryOverGroup'), $cl = $('#carryOverList'), $tg = $('#todayGroup'), $tl = $('#todayList');
        $cl.innerHTML = '';
        $cg.style.display = carryTasks.length > 0 ? 'block' : 'none';
        carryTasks.forEach(t => $cl.appendChild(createTaskElement(t, dateKey)));
        $tl.innerHTML = '';
        $tg.style.display = (todayTasks.length > 0 || carryTasks.length === 0) ? 'block' : 'none';
        todayTasks.forEach(t => $tl.appendChild(createTaskElement(t, dateKey)));
        $('#emptyState').classList.toggle('visible', tasks.length === 0);
    }

    function createTaskElement(task, dateKey) {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '') + (task.carryOver ? ' carry-over' : '');
        const pl = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
        const hasExtra = (task.notes && task.notes.trim()) || (task.link && task.link.trim());
        const isOpen = openDetailId === task.id;

        li.innerHTML = `
            <label class="task-checkbox" title="Tandai selesai"><input type="checkbox" ${task.done ? 'checked' : ''}><span class="checkmark"></span></label>
            <span class="task-text">${escapeHtml(task.text)}</span>
            ${hasExtra ? '<span class="task-has-notes" title="Ada catatan/link">📎</span>' : ''}
            ${task.carryOver ? '<span class="task-pr-badge">PR</span>' : ''}
            <span class="task-priority ${task.priority}">${pl[task.priority] || 'Sedang'}</span>
            <div class="task-actions">
                <button class="task-action-btn btn-edit" title="Edit tugas"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="task-action-btn btn-delete" title="Hapus tugas"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
            <div class="task-detail ${isOpen ? 'open' : ''}">
                <textarea class="task-notes" placeholder="Catatan..." rows="2">${escapeHtml(task.notes || '')}</textarea>
                <div class="task-link-row">
                    <input type="url" class="task-link-input" placeholder="Link (https://...)" value="${escapeHtml(task.link || '')}">
                    <button class="task-link-open" title="Buka link" ${!(task.link && task.link.trim()) ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>
                </div>
            </div>`;

        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => { e.stopPropagation(); toggleTask(dateKey, task.id); });
        li.querySelector('.task-checkbox').addEventListener('click', (e) => e.stopPropagation());
        li.addEventListener('click', (e) => {
            if (e.target.closest('.task-detail') || e.target.closest('.task-actions')) return;
            openDetailId = openDetailId === task.id ? null : task.id; render();
        });
        li.querySelector('.btn-edit').addEventListener('click', (e) => { e.stopPropagation(); startInlineEdit(li, task, dateKey); });
        li.querySelector('.btn-delete').addEventListener('click', (e) => { e.stopPropagation(); li.classList.add('removing'); setTimeout(() => deleteTask(dateKey, task.id), 300); });

        const notesEl = li.querySelector('.task-notes');
        notesEl.addEventListener('blur', () => updateTaskField(dateKey, task.id, 'notes', notesEl.value));
        notesEl.addEventListener('click', (e) => e.stopPropagation());

        const linkInput = li.querySelector('.task-link-input'), linkOpen = li.querySelector('.task-link-open');
        linkInput.addEventListener('blur', () => { updateTaskField(dateKey, task.id, 'link', linkInput.value); linkOpen.disabled = !linkInput.value.trim(); });
        linkInput.addEventListener('click', (e) => e.stopPropagation());
        linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); linkInput.blur(); } });
        linkOpen.addEventListener('click', (e) => { e.stopPropagation(); const u = linkInput.value.trim(); if (u) window.open(u.match(/^https?:\/\//) ? u : 'https://' + u, '_blank'); });

        return li;
    }

    function startInlineEdit(li, task, dateKey) {
        const textSpan = li.querySelector('.task-text'), oldText = task.text;
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'task-text-edit'; input.value = oldText;
        textSpan.replaceWith(input); input.focus(); input.select();
        function finish() { const t = input.value.trim(); if (t && t !== oldText) updateTaskField(dateKey, task.id, 'text', t); render(); }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { input.value = oldText; input.blur(); } });
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    // --- Actions ---
    async function addTask(text, priority) {
        const dateKey = getDateKey(currentDate);
        const task = { id: generateId(), user_id: currentUser ? currentUser.id : '', date: dateKey, text: text.trim(), priority, notes: '', link: '', done: false, carryOver: false, originalId: '', fromDate: '', createdAt: Date.now() };
        if (!allData[dateKey]) allData[dateKey] = [];
        allData[dateKey].push(task); setCache(allData); render();
        await apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(task) });
    }

    async function toggleTask(dateKey, taskId) {
        const task = (allData[dateKey] || []).find(t => t.id === taskId);
        if (!task) return;
        task.done = !task.done; setCache(allData); render();
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
        task[field] = value; setCache(allData);
        const body = { id: taskId }; body[field] = value;
        await apiFetch(API_BASE, { method: 'PUT', body: JSON.stringify(body) });
    }

    // --- Carry-Over ---
    async function processCarryOver(todayKey) {
        const dates = Object.keys(allData).filter(d => d < todayKey).sort().reverse();
        if (dates.length === 0) return;
        const lastTasks = allData[dates[0]] || [];
        const todayTasks = allData[todayKey] || [];
        const existingIds = todayTasks.filter(t => t.carryOver).map(t => t.originalId || t.id);
        const toCarry = lastTasks.filter(t => !t.done && !existingIds.includes(t.id));
        if (toCarry.length === 0) return;
        for (const t of toCarry) {
            const newTask = { id: generateId(), user_id: currentUser ? currentUser.id : '', date: todayKey, text: t.text, priority: t.priority, notes: t.notes || '', link: t.link || '', done: false, carryOver: true, originalId: t.id, fromDate: dates[0], createdAt: Date.now() };
            if (!allData[todayKey]) allData[todayKey] = [];
            allData[todayKey].push(newTask);
            await apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(newTask) });
        }
        setCache(allData);
    }

    // --- Stats ---
    function calculateStreak() {
        let streak = 0, checkDate = new Date();
        const todayKey = getDateKey(checkDate);
        if (!allData[todayKey] || allData[todayKey].length === 0) checkDate.setDate(checkDate.getDate() - 1);
        for (let i = 0; i < 365; i++) {
            const tasks = allData[getDateKey(checkDate)];
            if (!tasks || tasks.length === 0 || !tasks.every(t => t.done)) break;
            streak++; checkDate.setDate(checkDate.getDate() - 1);
        }
        return streak;
    }

    function renderProgress(tasks) {
        const total = tasks.length, done = tasks.filter(t => t.done).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        $('#progressText').textContent = `${done} dari ${total} tugas selesai`;
        $('#progressPercent').textContent = `${pct}%`;
        $('#progressFill').style.width = `${pct}%`;
        $('#progressFill').style.background = pct === 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : pct >= 50 ? 'linear-gradient(90deg,#4f6ef7,#818cf8)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)';
    }

    function renderSummary(tasks) {
        const $s = $('#summarySection');
        if (tasks.length === 0) { $s.style.display = 'none'; return; }
        $s.style.display = 'block';
        const total = tasks.length, done = tasks.filter(t => t.done).length, pct = Math.round((done / total) * 100);
        $('#statTotal').textContent = total; $('#statDone').textContent = done; $('#statPending').textContent = total - done;
        const $m = $('#summaryMessage');
        if (pct === 100) { $m.className = 'summary-message excellent'; $m.textContent = '🎉 Luar biasa! Semua tugas tercapai!'; }
        else if (pct >= 75) { $m.className = 'summary-message good'; $m.textContent = '💪 Hebat! Hampir semua selesai!'; }
        else if (pct >= 50) { $m.className = 'summary-message okay'; $m.textContent = '⚡ Lumayan, tapi masih ada yang perlu diselesaikan.'; }
        else { $m.className = 'summary-message low'; $m.textContent = '📌 Masih banyak PR, semangat besok ya!'; }
    }

    function renderStreak() { $('#streakCount').textContent = calculateStreak(); }

    function renderHistory() {
        const $list = $('#historyList'), $empty = $('#historyEmpty');
        $list.innerHTML = '';
        const hd = Object.keys(allData).filter(d => allData[d].length > 0).sort().reverse();
        if (hd.length === 0) { $empty.style.display = 'block'; return; }
        $empty.style.display = 'none';
        hd.slice(0, 14).forEach(dk => {
            const tasks = allData[dk], done = tasks.filter(t => t.done).length, pct = Math.round((done / tasks.length) * 100);
            const d = new Date(dk + 'T00:00:00');
            const c = pct === 100 ? '#10b981' : pct >= 50 ? '#4f6ef7' : '#f59e0b';
            const li = document.createElement('li'); li.className = 'history-item';
            li.innerHTML = `<span class="history-date">${formatDateShort(d)}</span><div class="history-score"><div class="history-bar"><div class="history-bar-fill" style="width:${pct}%;background:${c}"></div></div><span class="history-percent" style="color:${c}">${pct}%</span></div>`;
            li.addEventListener('click', () => { currentDate = new Date(dk + 'T00:00:00'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
            $list.appendChild(li);
        });
    }

    function updateAddTaskVisibility() {
        $('#addTaskSection').style.display = (isPast(currentDate) && !isToday(currentDate)) ? 'none' : 'block';
    }

    // --- Init ---
    function init() {
        // Try auto-login from saved session
        const autoLoggedIn = tryAutoLogin();

        // Initialize Google Sign-In button
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleLogin,
                auto_select: true
            });
            google.accounts.id.renderButton($('#googleBtnContainer'), {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'pill',
                width: 280
            });
        }

        // Event listeners (always set up)
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
        $('#btnLogout').addEventListener('click', logout);

        // If not auto-logged in, show login screen
        if (!autoLoggedIn) {
            $('#loginScreen').classList.remove('hidden');
            $('#appWrapper').style.display = 'none';
        }
    }

    // Wait for both DOM and Google library
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
