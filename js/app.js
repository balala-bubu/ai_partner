import { CONFIG } from './config.js';
import { createStore, logAction } from './store.js';
import { parseLocal, ymd } from './parser.js';
import { ICON, mascot } from './ui.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WEEK = '日一二三四五六';
const TYPE_LABEL = { task: '任務', event: '行程', life: '生活', idea: '想法' };

let store;
const S = {
  tab: 'today',
  tasks: [], logs: [], inbox: [], activity: [],
  taskFilter: 'open', q: '',
};

/* ---------------- 日期工具 ---------------- */
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };
function fmtDate(s) {
  if (!s) return '';
  const t = todayStr();
  if (s === t) return '今天';
  if (s === addDays(t, 1)) return '明天';
  if (s === addDays(t, 2)) return '後天';
  if (s === addDays(t, -1)) return '昨天';
  const d = new Date(s + 'T00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
}
function greet() {
  const h = new Date().getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '下午好' : '晚安';
}

/* ---------------- 資料 ---------------- */
async function loadAll() {
  const [tasks, logs, inbox, activity] = await Promise.all([
    store.list('tasks'), store.list('life_logs'), store.list('inbox_items'), store.list('activity_logs'),
  ]);
  Object.assign(S, { tasks, logs, inbox, activity });
}
const pendingInbox = () => S.inbox.filter((i) => i.status === 'pending');
const isOpen = (t) => t.status !== 'done' && t.status !== 'cancelled';
const isLate = (t) => isOpen(t) && t.date && t.date < todayStr() && t.date_role === 'due';

function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    const ka = (a.date || '9999') + (a.time || '99'), kb = (b.date || '9999') + (b.time || '99');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/* ---------------- 畫面：外框 ---------------- */
function shell() {
  const n = pendingInbox().length;
  const tab = (id, label, icon) =>
    `<button class="tab" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${ICON[icon]}<span>${label}</span>${id === 'inbox' && n ? `<b class="dot">${n}</b>` : ''}</button>`;
  return `
    <header class="top">
      <div>
        <h1 id="title"></h1>
        <div class="sub" id="subtitle"></div>
      </div>
      <button class="avatar" data-act="settings" aria-label="設定與操作紀錄">${ICON.user}</button>
    </header>
    <main class="view enter" id="view"></main>
    <nav class="nav" aria-label="主要分頁">
      ${tab('today', '今天', 'sun')}
      ${tab('inbox', '收件匣', 'tray')}
      <button class="fab" data-act="capture" aria-label="丟一句話">${ICON.plus}</button>
      ${tab('tasks', '任務', 'check')}
      ${tab('logs', '紀錄', 'book')}
    </nav>`;
}

function render(animate = false) {
  const root = $('#root');
  if (!$('#view')) root.innerHTML = shell();
  else {
    // 只更新導覽狀態，避免整頁重畫打斷動畫
    root.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const n = pendingInbox().length;
    const inboxTab = root.querySelector('[data-tab="inbox"]');
    let dot = inboxTab.querySelector('.dot');
    if (n && !dot) { dot = document.createElement('b'); dot.className = 'dot'; inboxTab.append(dot); }
    if (dot) n ? (dot.textContent = n) : dot.remove();
  }
  const view = $('#view');
  const views = { today: viewToday, inbox: viewInbox, tasks: viewTasks, logs: viewLogs };
  const { title, sub, html } = views[S.tab]();
  $('#title').textContent = title;
  $('#subtitle').textContent = sub;
  view.innerHTML = html;
  if (animate) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
}

/* ---------------- 共用列 ---------------- */
function taskRow(t) {
  const done = t.status === 'done';
  const chips = [];
  if (t.kind === 'event') chips.push(`<span class="chip event">行程</span>`);
  if (t.date) chips.push(`<span class="chip ${isLate(t) ? 'late' : ''}">${t.date_role === 'due' ? '截止 ' : ''}${fmtDate(t.date)}${t.time ? ' ' + t.time : ''}</span>`);
  if (t.status === 'doing') chips.push(`<span class="chip task">進行中</span>`);
  if (t.status === 'waiting') chips.push(`<span class="chip">等待中</span>`);
  if (t.project) chips.push(`<span class="chip">@${esc(t.project)}</span>`);
  (t.tags || []).forEach((g) => chips.push(`<span class="chip">#${esc(g)}</span>`));
  return `
    <div class="row ${done ? 'done' : ''}" data-open-task="${t.id}">
      <button class="check" role="checkbox" aria-checked="${done}" aria-label="標記完成：${esc(t.title)}" data-toggle="${t.id}">${ICON.tick}</button>
      <div class="body"><div class="title">${esc(t.title)}</div>${chips.length ? `<div class="meta">${chips.join('')}</div>` : ''}</div>
    </div>`;
}
function empty(text, mood = 'happy') {
  return `<div class="empty">${mascot(mood)}<p>${text}</p></div>`;
}

/* ---------------- 今天 ---------------- */
function viewToday() {
  const t = todayStr();
  const todays = sortTasks(S.tasks.filter((x) => x.date === t && x.status !== 'cancelled'));
  const done = todays.filter((x) => x.status === 'done').length;
  const soon = sortTasks(S.tasks.filter((x) => isOpen(x) && x.date && x.date !== t && x.date <= addDays(t, 3) && (x.date_role === 'due' || x.date < t)));
  const undated = S.tasks.filter((x) => isOpen(x) && !x.date).length;
  const n = pendingInbox().length;
  const d = new Date();

  let html = '';
  if (todays.length) {
    html += `<div class="card soft">
      <div class="section-h" style="margin:0"><h2>今天完成 ${done} / ${todays.length}</h2><span class="count">${done === todays.length ? '全部完成' : `還有 ${todays.length - done} 件`}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${todays.length}" aria-valuenow="${done}"><span style="width:${(done / todays.length) * 100}%"></span></div>
    </div>`;
  }
  if (n) html += `<div class="section"><button class="inbox-nudge" data-tab="inbox">${ICON.tray}<span style="flex:1">收件匣有 ${n} 則還沒確認</span>${ICON.chevron}</button></div>`;

  html += `<section class="section"><div class="section-h"><h2>今天</h2></div>`;
  html += todays.length ? `<div class="list">${todays.map(taskRow).join('')}</div>` : empty('今天還空空的。按下面的 ＋，把想到的事丟進來。');
  html += `</section>`;

  if (soon.length) html += `<section class="section"><div class="section-h"><h2>快到期</h2><span class="count">${soon.length}</span></div><div class="list">${soon.map(taskRow).join('')}</div></section>`;
  if (undated) html += `<section class="section"><button class="link" data-filter-go="nodate">另有 ${undated} 件任務還沒排日期</button></section>`;

  return { title: greet(), sub: `${d.getMonth() + 1} 月 ${d.getDate()} 日 週${WEEK[d.getDay()]}`, html };
}

/* ---------------- 收件匣 ---------------- */
function viewInbox() {
  const items = pendingInbox();
  const html = items.length
    ? `<p class="sub" style="color:var(--ink-2);font-weight:600;margin:4px 2px 14px">這裡的內容還沒存成正式資料。點一則確認或修改。</p>
       <div class="list">${items.map((i) => {
         const p = i.parsed || {};
         const k = p.type && TYPE_LABEL[p.type] ? `<span class="chip ${p.type}">${TYPE_LABEL[p.type]}</span>` : `<span class="chip warn">未分類</span>`;
         const u = (p.uncertain || []).length ? `<span class="chip warn">${p.uncertain.length} 項待確認</span>` : '';
         return `<div class="row" data-open-inbox="${i.id}"><div class="body"><div class="title">${esc(i.raw)}</div><div class="meta">${k}${u}<span class="chip">${fmtDate(i.created_at.slice(0, 10)) || ''}</span></div></div>${ICON.chevron}</div>`;
       }).join('')}</div>`
    : empty('收件匣是空的，想到什麼都可以先丟進來。', 'sleep');
  return { title: '收件匣', sub: items.length ? `${items.length} 則待確認` : '全部處理完了', html };
}

/* ---------------- 任務 ---------------- */
const FILTERS = [
  ['open', '未完成'], ['today', '今天'], ['late', '逾期'], ['nodate', '未排日期'], ['done', '已完成'], ['all', '全部'],
];
function viewTasks() {
  const t = todayStr();
  const q = S.q.trim().toLowerCase();
  let list = S.tasks.filter((x) => x.status !== 'cancelled' || S.taskFilter === 'all');
  const f = {
    open: (x) => isOpen(x), today: (x) => x.date === t, late: isLate, nodate: (x) => isOpen(x) && !x.date,
    done: (x) => x.status === 'done', all: () => true,
  }[S.taskFilter];
  list = list.filter(f);
  if (q) list = list.filter((x) => [x.title, x.notes, x.project, ...(x.tags || [])].join(' ').toLowerCase().includes(q));
  list = sortTasks(list);
  if (S.taskFilter === 'done') list.reverse();

  const html = `
    <div class="search-wrap">${ICON.search}<input class="search" type="search" placeholder="搜尋任務、#標籤、@專案" value="${esc(S.q)}" id="q" aria-label="搜尋任務"></div>
    <div class="filters" role="toolbar" aria-label="篩選">${FILTERS.map(([k, l]) => `<button class="filter" data-filter="${k}" aria-pressed="${S.taskFilter === k}">${l}</button>`).join('')}</div>
    <div class="section" id="task-list">${list.length ? `<div class="list">${list.map(taskRow).join('')}</div>` : empty(q ? '找不到符合的任務。' : '這裡沒有任務。')}</div>`;
  return { title: '任務', sub: `${S.tasks.filter(isOpen).length} 件未完成`, html };
}

/* ---------------- 紀錄 ---------------- */
function viewLogs() {
  const groups = {};
  for (const l of S.logs) (groups[l.occurred_on || l.created_at.slice(0, 10)] ||= []).push(l);
  const days = Object.keys(groups).sort().reverse();
  const html = days.length
    ? days.map((d) => `<div class="day-h">${fmtDate(d)}${fmtDate(d).length <= 2 ? `　${d.slice(5).replace('-', '/')}` : ''}</div><div class="list">${groups[d].map((l) => `
        <div class="log ${l.kind}" data-open-log="${l.id}"><div class="log-text">${esc(l.text)}</div>
          <div class="meta"><span class="chip ${l.kind}">${TYPE_LABEL[l.kind]}</span>${l.project ? `<span class="chip">@${esc(l.project)}</span>` : ''}${(l.tags || []).map((g) => `<span class="chip">#${esc(g)}</span>`).join('')}</div>
        </div>`).join('')}</div>`).join('')
    : empty('生活紀錄和想法會放在這裡，不會變成待辦。', 'happy');
  return { title: '紀錄', sub: `${S.logs.length} 則`, html };
}

/* ---------------- 底部面板 ---------------- */
let sheetEl, scrimEl, lastFocus;
function openSheet(html, { onClose } = {}) {
  closeSheet(true);
  lastFocus = document.activeElement;
  scrimEl = document.createElement('div'); scrimEl.className = 'scrim';
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.innerHTML = `<div class="grab"></div><div class="sheet-body">${html}</div>`;
  sheetEl._onClose = onClose;
  document.body.append(scrimEl, sheetEl);
  scrimEl.addEventListener('click', () => closeSheet());
  requestAnimationFrame(() => { scrimEl.classList.add('on'); sheetEl.classList.add('on'); });
  setTimeout(() => sheetEl?.querySelector('[autofocus]')?.focus(), 330);
  return sheetEl;
}
function setSheet(html) {
  if (!sheetEl) return openSheet(html);
  const b = sheetEl.querySelector('.sheet-body');
  b.innerHTML = `<div class="step">${html}</div>`;
  sheetEl.scrollTop = 0;
  return sheetEl;
}
function closeSheet(instant = false) {
  if (!sheetEl) return;
  const s = sheetEl, c = scrimEl;
  sheetEl = scrimEl = null;
  s._onClose?.();
  if (instant) { s.remove(); c.remove(); return; }
  s.classList.add('closing'); s.classList.remove('on'); c.classList.remove('on');
  setTimeout(() => { s.remove(); c.remove(); }, 220);
  lastFocus?.focus?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------------- 提示（含復原） ---------------- */
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">復原</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = async () => { el.classList.remove('on'); await undo(); };
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 6000 : 2600);
}

/* ---------------- 輸入 → 預覽 → 確認 ---------------- */
const EXAMPLES = ['週五前交統計作業', '明天下午三點系學會開會', '今天跑了五公里，覺得很舒服', '想到迎新可以辦密室逃脫'];

function openCapture(prefill = '') {
  openSheet(`
    <h3>丟一句話</h3>
    <p class="hint">不用先分類，我會整理好給你確認。用 #標籤、@專案 也可以。</p>
    <textarea class="capture" id="cap" autofocus placeholder="想到什麼就寫什麼…" aria-label="輸入內容">${esc(prefill)}</textarea>
    <div class="examples" aria-label="範例">${EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="actions"><button class="btn block" id="go" ${prefill ? '' : 'disabled'}>整理</button></div>`);
  const ta = $('#cap', sheetEl), go = $('#go', sheetEl);
  ta.addEventListener('input', () => { go.disabled = !ta.value.trim(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ta.value.trim()) go.click(); });
  sheetEl.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { ta.value = b.dataset.ex; go.disabled = false; ta.focus(); }));
  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = '整理中…';
    try {
      const raw = ta.value.trim();
      const parsed = await parse(raw);
      const item = await store.insert('inbox_items', { raw, parsed, status: 'pending' });
      await logAction(store, { action: '收進收件匣', level: 1, actor: 'system', target_table: 'inbox_items', target_id: item.id, detail: { parser: parsed.parser } });
      S.inbox.unshift(item);
      render();
      showPreview(item);
    } catch (e) {
      go.disabled = false; go.textContent = '整理';
      toast('沒有存到，請檢查網路後再試一次');
      console.error(e);
    }
  });
}

async function parse(raw) {
  const local = parseLocal(raw);
  if (!(CONFIG.AI_PARSE && store.mode === 'cloud')) return local;
  try {
    const r = await store.invoke('parse', { text: raw, today: todayStr(), weekday: new Date().getDay() });
    if (!r || !r.type) return local;
    const ai = { ...local, ...r, raw, tags: r.tags || local.tags, uncertain: r.uncertain || [], parser: 'ai' };
    await logAction(store, { action: 'AI 解析輸入', level: 0, actor: 'ai', detail: { model: r.model, usage: r.usage } });
    return ai;
  } catch (e) {
    console.warn('AI 解析失敗，改用規則解析', e);
    return { ...local, uncertain: [...local.uncertain, { field: 'type', note: 'AI 解析暫時無法使用，這次用規則整理' }] };
  }
}

function previewHTML(p) {
  const unsureFields = new Set((p.uncertain || []).map((u) => u.field));
  const isTaskish = p.type === 'task' || p.type === 'event';
  const typeBtns = Object.entries(TYPE_LABEL).map(([k, l]) => `<button type="button" class="type" data-t="${k}" role="radio" aria-checked="${p.type === k}">${l}</button>`).join('');
  const notes = (p.uncertain || []).filter((u) => !(u.field === 'type' && TYPE_LABEL[p.type] && p._typeTouched));
  return `
    <h3>${p.type === 'unsorted' ? '這是哪一種？' : '看看對不對'}</h3>
    <p class="hint">確認後才會存成正式資料，也可以先放著。</p>
    <div class="preview">
      ${notes.length ? `<div class="unsure-box">待確認<ul>${notes.map((u) => `<li>${esc(u.note)}</li>`).join('')}</ul></div>` : ''}
      <div class="types ${p.type === 'unsorted' ? 'need' : ''}" role="radiogroup" aria-label="類型">${typeBtns}</div>
      ${isTaskish ? `
        <label class="field"><span>標題</span><input id="f-title" value="${esc(p.title)}"></label>
        <div class="grid2">
          <label class="field ${unsureFields.has('date') ? 'unsure' : ''}"><span>日期</span><input type="date" id="f-date" value="${p.date || ''}"></label>
          <label class="field ${unsureFields.has('time') ? 'unsure' : ''}"><span>時間</span><input type="time" id="f-time" value="${p.time || ''}"></label>
        </div>
        ${p.type === 'task' ? `<div class="field"><span>這個日期是</span><div class="seg" id="f-role">
            <button type="button" data-role="scheduled" aria-pressed="${p.date_role !== 'due'}">預定做</button>
            <button type="button" data-role="due" aria-pressed="${p.date_role === 'due'}">截止日</button></div></div>` : ''}
      ` : p.type === 'unsorted' ? '' : `
        <label class="field"><span>內容</span><textarea id="f-text">${esc(p.text ?? p.raw)}</textarea></label>
        <label class="field ${unsureFields.has('date') ? 'unsure' : ''}"><span>日期</span><input type="date" id="f-date" value="${p.date || todayStr()}"></label>
      `}
      ${p.type === 'unsorted' ? '' : `<div class="grid2">
        <label class="field"><span>專案</span><input id="f-project" value="${esc(p.project || '')}" placeholder="無"></label>
        <label class="field"><span>標籤</span><input id="f-tags" value="${esc((p.tags || []).join(' '))}" placeholder="用空白分隔"></label>
      </div>`}
      <div class="raw">原文：${esc(p.raw)}${p.parser === 'ai' ? '　（AI 整理）' : '　（規則整理）'}</div>
    </div>
    <div class="actions">
      <button class="btn block" id="ok" ${p.type === 'unsorted' ? 'disabled' : ''}>確認存入</button>
      <div class="actions two" style="margin:0">
        <button class="btn ghost" id="later">先放著</button>
        <button class="btn ghost" id="drop">捨棄</button>
      </div>
    </div>`;
}

function readForm(p) {
  const v = (id) => sheetEl.querySelector(id)?.value?.trim();
  const out = { ...p };
  if (sheetEl.querySelector('#f-title')) out.title = v('#f-title');
  if (sheetEl.querySelector('#f-text')) out.text = v('#f-text');
  if (sheetEl.querySelector('#f-date')) out.date = v('#f-date') || null;
  if (sheetEl.querySelector('#f-time')) out.time = v('#f-time') || null;
  if (sheetEl.querySelector('#f-project')) out.project = v('#f-project')?.replace(/^@/, '') || null;
  if (sheetEl.querySelector('#f-tags')) out.tags = (v('#f-tags') || '').split(/[\s,，]+/).map((x) => x.replace(/^#/, '')).filter(Boolean);
  const role = sheetEl.querySelector('#f-role [aria-pressed="true"]');
  if (role) out.date_role = role.dataset.role;
  return out;
}

function showPreview(item) {
  const original = item.parsed || parseLocal(item.raw);
  let p = { ...original, raw: item.raw };
  const draw = () => {
    setSheet(previewHTML(p));
    sheetEl.querySelectorAll('.type').forEach((b) => b.addEventListener('click', () => {
      p = readForm(p);
      p.type = b.dataset.t; p._typeTouched = true;
      if ((p.type === 'life' || p.type === 'idea') && !p.text) p.text = p.raw;
      if (p.type === 'event') p.date_role = 'scheduled';
      draw();
    }));
    sheetEl.querySelectorAll('#f-role button').forEach((b) => b.addEventListener('click', () => {
      sheetEl.querySelectorAll('#f-role button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    $('#ok', sheetEl).onclick = () => confirmItem(item, original, readForm(p));
    $('#later', sheetEl).onclick = () => { closeSheet(); toast('先放在收件匣'); };
    $('#drop', sheetEl).onclick = () => discardItem(item);
  };
  if (!sheetEl) openSheet('');
  draw();
}

function changedFields(orig, final) {
  const keys = ['type', 'title', 'date', 'time', 'date_role', 'project'];
  const c = keys.filter((k) => (orig[k] ?? null) !== (final[k] ?? null) && !(k === 'title' && !['task', 'event'].includes(final.type)));
  if ((orig.tags || []).join() !== (final.tags || []).join()) c.push('tags');
  return c;
}

async function confirmItem(item, original, p) {
  const btn = $('#ok', sheetEl); btn.disabled = true;
  try {
    let table, row;
    if (p.type === 'task' || p.type === 'event') {
      if (!p.title) { btn.disabled = false; return toast('標題不能空白'); }
      table = 'tasks';
      row = await store.insert('tasks', {
        title: p.title, kind: p.type, status: 'todo', date: p.date, time: p.time,
        date_role: p.type === 'task' ? p.date_role || 'scheduled' : 'scheduled',
        project: p.project, tags: p.tags, notes: '', raw: item.raw, source_inbox_id: item.id,
      });
      S.tasks.unshift(row);
    } else {
      if (!p.text) { btn.disabled = false; return toast('內容不能空白'); }
      table = 'life_logs';
      row = await store.insert('life_logs', {
        kind: p.type, text: p.text, occurred_on: p.date || todayStr(), project: p.project, tags: p.tags, raw: item.raw, source_inbox_id: item.id,
      });
      S.logs.unshift(row);
    }
    const upd = await store.update('inbox_items', item.id, { status: 'confirmed', target_table: table, target_id: row.id, resolved_at: new Date().toISOString() });
    Object.assign(item, upd);
    const changed = changedFields(original, p);
    const log = await logAction(store, { action: `確認存入${TYPE_LABEL[p.type]}`, level: 2, target_table: table, target_id: row.id, detail: { parser: original.parser, changed } });
    if (log) S.activity.unshift(log);
    closeSheet();
    render();
    toast(`已存入${TYPE_LABEL[p.type]}`, async () => {
      await store.remove(table, row.id);
      const back = await store.update('inbox_items', item.id, { status: 'pending', target_table: null, target_id: null, resolved_at: null });
      Object.assign(item, back);
      if (table === 'tasks') S.tasks = S.tasks.filter((x) => x.id !== row.id); else S.logs = S.logs.filter((x) => x.id !== row.id);
      const l = await logAction(store, { action: '復原存入，退回收件匣', level: 1, target_table: table, target_id: row.id });
      if (l) S.activity.unshift(l);
      render();
      toast('已退回收件匣');
    });
  } catch (e) {
    btn.disabled = false; console.error(e); toast('沒有存到，請再試一次');
  }
}

async function discardItem(item) {
  await store.update('inbox_items', item.id, { status: 'discarded', resolved_at: new Date().toISOString() });
  item.status = 'discarded';
  const l = await logAction(store, { action: '捨棄收件匣項目', level: 1, target_table: 'inbox_items', target_id: item.id });
  if (l) S.activity.unshift(l);
  closeSheet(); render();
  toast('已捨棄', async () => {
    await store.update('inbox_items', item.id, { status: 'pending', resolved_at: null });
    item.status = 'pending'; render(); toast('已放回收件匣');
  });
}

/* ---------------- 完成任務（唯一的慶祝動畫） ---------------- */
async function toggleTask(id, btn) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  const done = t.status !== 'done';
  btn.setAttribute('aria-checked', done);
  if (done) {
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    const b = document.createElement('span'); b.className = 'burst';
    const colors = ['var(--life)', 'var(--event)', 'var(--idea)', 'var(--primary)'];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8, r = 26 + Math.random() * 8;
      const dot = document.createElement('i');
      dot.style.cssText = `background:${colors[i % 4]};--x:${Math.cos(a) * r - 3}px;--y:${Math.sin(a) * r - 3}px`;
      b.append(dot);
    }
    btn.append(b); setTimeout(() => b.remove(), 600);
  }
  try {
    const upd = await store.update('tasks', id, { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null });
    Object.assign(t, upd);
    const l = await logAction(store, { action: done ? '標記完成' : '取消完成', level: 2, target_table: 'tasks', target_id: id, detail: { title: t.title } });
    if (l) S.activity.unshift(l);
    setTimeout(() => render(), done ? 520 : 0);
  } catch (e) {
    btn.setAttribute('aria-checked', !done); toast('沒有更新到，請再試一次');
  }
}

/* ---------------- 任務詳情 ---------------- */
function openTask(id) {
  const t = S.tasks.find((x) => x.id === id); if (!t) return;
  const st = [['todo', '待做'], ['doing', '進行中'], ['waiting', '等待中'], ['done', '完成'], ['cancelled', '取消']];
  openSheet(`
    <h3>編輯${t.kind === 'event' ? '行程' : '任務'}</h3>
    <p class="hint">建立於 ${new Date(t.created_at).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <label class="field"><span>標題</span><input id="e-title" value="${esc(t.title)}"></label>
    <div class="grid2">
      <label class="field"><span>日期</span><input type="date" id="e-date" value="${t.date || ''}"></label>
      <label class="field"><span>時間</span><input type="time" id="e-time" value="${t.time || ''}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>類型</span><select id="e-kind"><option value="task" ${t.kind === 'task' ? 'selected' : ''}>任務</option><option value="event" ${t.kind === 'event' ? 'selected' : ''}>行程</option></select></label>
      <label class="field"><span>日期是</span><select id="e-role"><option value="scheduled" ${t.date_role !== 'due' ? 'selected' : ''}>預定做</option><option value="due" ${t.date_role === 'due' ? 'selected' : ''}>截止日</option></select></label>
    </div>
    <label class="field"><span>狀態</span><select id="e-status">${st.map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field"><span>專案</span><input id="e-project" value="${esc(t.project || '')}"></label>
      <label class="field"><span>標籤</span><input id="e-tags" value="${esc((t.tags || []).join(' '))}"></label>
    </div>
    <label class="field"><span>備註</span><textarea id="e-notes">${esc(t.notes || '')}</textarea></label>
    ${t.raw ? `<div class="raw">原文：${esc(t.raw)}</div>` : ''}
    <div class="actions"><button class="btn block" id="save">儲存修改</button><button class="link" id="del" style="color:var(--danger)">刪除這${t.kind === 'event' ? '個行程' : '件任務'}</button></div>`);
  const v = (s) => $(s, sheetEl).value.trim();
  $('#save', sheetEl).onclick = async () => {
    if (!v('#e-title')) return toast('標題不能空白');
    const before = { ...t };
    const patch = {
      title: v('#e-title'), date: v('#e-date') || null, time: v('#e-time') || null, kind: v('#e-kind'), date_role: v('#e-role'),
      status: v('#e-status'), project: v('#e-project').replace(/^@/, '') || null,
      tags: v('#e-tags').split(/[\s,，]+/).map((x) => x.replace(/^#/, '')).filter(Boolean), notes: v('#e-notes'),
      completed_at: v('#e-status') === 'done' ? t.completed_at || new Date().toISOString() : null,
    };
    try {
      Object.assign(t, await store.update('tasks', id, patch));
      const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(patch[k] ?? null));
      const l = await logAction(store, { action: '修改任務', level: 2, target_table: 'tasks', target_id: id, detail: { changed } });
      if (l) S.activity.unshift(l);
      closeSheet(); render(); toast('已儲存');
    } catch { toast('沒有存到，請再試一次'); }
  };
  $('#del', sheetEl).onclick = () => confirmDelete('tasks', t, t.title);
}

/* ---------------- 紀錄詳情 ---------------- */
function openLog(id) {
  const l = S.logs.find((x) => x.id === id); if (!l) return;
  openSheet(`
    <h3>編輯${TYPE_LABEL[l.kind]}</h3>
    <label class="field"><span>內容</span><textarea id="l-text">${esc(l.text)}</textarea></label>
    <div class="grid2">
      <label class="field"><span>日期</span><input type="date" id="l-date" value="${l.occurred_on || ''}"></label>
      <label class="field"><span>類型</span><select id="l-kind"><option value="life" ${l.kind === 'life' ? 'selected' : ''}>生活</option><option value="idea" ${l.kind === 'idea' ? 'selected' : ''}>想法</option></select></label>
    </div>
    <label class="field"><span>標籤</span><input id="l-tags" value="${esc((l.tags || []).join(' '))}"></label>
    <div class="actions"><button class="btn block" id="save">儲存修改</button><button class="link" id="del" style="color:var(--danger)">刪除這則紀錄</button></div>`);
  const v = (s) => $(s, sheetEl).value.trim();
  $('#save', sheetEl).onclick = async () => {
    if (!v('#l-text')) return toast('內容不能空白');
    try {
      Object.assign(l, await store.update('life_logs', id, { text: v('#l-text'), occurred_on: v('#l-date') || l.occurred_on, kind: v('#l-kind'), tags: v('#l-tags').split(/[\s,，]+/).map((x) => x.replace(/^#/, '')).filter(Boolean) }));
      const a = await logAction(store, { action: '修改紀錄', level: 2, target_table: 'life_logs', target_id: id });
      if (a) S.activity.unshift(a);
      closeSheet(); render(); toast('已儲存');
    } catch { toast('沒有存到，請再試一次'); }
  };
  $('#del', sheetEl).onclick = () => confirmDelete('life_logs', l, l.text.slice(0, 20));
}

/* 刪除＝第 3 級：每次單獨確認 */
function confirmDelete(table, rec, name) {
  setSheet(`
    <div style="text-align:center">${mascot('worry')}</div>
    <h3 style="text-align:center">確定要刪除嗎？</h3>
    <p class="hint" style="text-align:center">「${esc(name)}」刪除後無法復原。</p>
    <div class="actions two"><button class="btn ghost" id="no">保留</button><button class="btn danger" id="yes">刪除</button></div>`);
  $('#no', sheetEl).onclick = () => closeSheet();
  $('#yes', sheetEl).onclick = async () => {
    try {
      await store.remove(table, rec.id);
      if (table === 'tasks') S.tasks = S.tasks.filter((x) => x.id !== rec.id); else S.logs = S.logs.filter((x) => x.id !== rec.id);
      const l = await logAction(store, { action: '刪除', level: 3, target_table: table, target_id: rec.id, detail: { snapshot: rec } });
      if (l) S.activity.unshift(l);
      closeSheet(); render(); toast('已刪除');
    } catch { toast('沒有刪除，請再試一次'); }
  };
}

/* ---------------- 設定與操作紀錄 ---------------- */
function openSettings() {
  const confirms = S.activity.filter((a) => a.action?.startsWith('確認存入'));
  const edited = confirms.filter((a) => (a.detail?.changed || []).length).length;
  const acts = S.activity.slice(0, 80);
  openSheet(`
    <h3>${store.mode === 'cloud' ? esc(store.user?.email) : '本機模式'}</h3>
    <p class="hint">${store.mode === 'cloud' ? '資料已同步到雲端，電腦和手機看到同一份。' : '資料只存在這台裝置。填好 Supabase 設定後即可登入同步。'}</p>
    <div class="stat">
      <div><b>${confirms.length}</b><span>次確認存入</span></div>
      <div><b>${confirms.length ? Math.round((edited / confirms.length) * 100) : 0}%</b><span>需要你修改</span></div>
    </div>
    <p class="hint" style="margin-top:8px">「需要你修改」用來檢查自動整理準不準，試用兩週後一起看。</p>
    <div class="section-h" style="margin-top:20px"><h2>操作紀錄</h2><span class="count">最近 ${acts.length} 筆</span></div>
    <div>${acts.length ? acts.map((a) => `
      <div class="act"><span class="lv l${a.level}" title="風險等級">L${a.level}</span>
        <div><b>${esc(a.action)}</b>${a.actor === 'ai' ? '（AI）' : a.actor === 'system' ? '（系統）' : ''}
        ${a.detail?.changed?.length ? `<br><span style="color:var(--ink-2)">你改了：${a.detail.changed.map((k) => ({ type: '類型', title: '標題', date: '日期', time: '時間', date_role: '日期意義', project: '專案', tags: '標籤', status: '狀態', notes: '備註', kind: '類型', completed_at: '完成時間' })[k] || k).join('、')}</span>` : ''}
        <time>${new Date(a.created_at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}</time></div></div>`).join('') : '<p class="hint">還沒有紀錄。</p>'}</div>
    <div class="actions">
      <button class="btn ghost block" id="export">匯出全部資料（JSON）</button>
      ${store.mode === 'cloud' ? '<button class="btn ghost block" id="out">登出</button>' : ''}
    </div>`);
  $('#export', sheetEl).onclick = async () => {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `secretary-${todayStr()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const out = $('#out', sheetEl);
  if (out) out.onclick = async () => { await store.signOut(); closeSheet(true); boot(); };
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-tab],[data-act],[data-toggle],[data-open-task],[data-open-inbox],[data-open-log],[data-filter],[data-filter-go]');
  if (!el || !$('#view')) return;
  if (el.dataset.toggle) { e.stopPropagation(); return toggleTask(el.dataset.toggle, el); }
  if (el.dataset.tab) { if (S.tab !== el.dataset.tab) { S.tab = el.dataset.tab; render(true); window.scrollTo({ top: 0 }); } return; }
  if (el.dataset.act === 'capture') return openCapture();
  if (el.dataset.act === 'settings') return openSettings();
  if (el.dataset.openTask) return openTask(el.dataset.openTask);
  if (el.dataset.openLog) return openLog(el.dataset.openLog);
  if (el.dataset.openInbox) { const it = S.inbox.find((x) => x.id === el.dataset.openInbox); return it && showPreview(it); }
  if (el.dataset.filter) { S.taskFilter = el.dataset.filter; return render(); }
  if (el.dataset.filterGo) { S.tab = 'tasks'; S.taskFilter = el.dataset.filterGo; return render(true); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    S.q = e.target.value;
    const { html } = viewTasks();
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    $('#task-list').replaceWith(tmp.querySelector('#task-list'));
  }
});

// 回到 App 時重新抓資料，讓電腦和手機保持同步
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && store?.user && !sheetEl) {
    try { await loadAll(); render(); } catch { /* 離線時沿用畫面上的資料 */ }
  }
});

/* ---------------- 登入（雲端模式） ---------------- */
function loginView(step = 'email', email = '') {
  $('#root').innerHTML = `
    <div class="login">
      <div>${mascot('happy', true)}</div>
      <h1>${step === 'email' ? '嗨，我是小秘書' : '輸入驗證碼'}</h1>
      <p>${step === 'email' ? '用 Email 登入，電腦和手機會看到同一份資料。' : `六位數驗證碼已寄到 ${esc(email)}`}</p>
      <form id="lf">
        ${step === 'email'
          ? '<input type="email" id="em" required autocomplete="email" placeholder="you@example.com" aria-label="Email">'
          : '<input class="code" id="cd" required inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="······" aria-label="驗證碼">'}
        <div class="err" id="err" role="alert"></div>
        <button class="btn block">${step === 'email' ? '寄驗證碼給我' : '登入'}</button>
        ${step === 'code' ? '<button type="button" class="link" id="back">換一個 Email</button>' : ''}
      </form>
    </div>`;
  $(step === 'email' ? '#em' : '#cd').focus();
  $('#back')?.addEventListener('click', () => loginView('email'));
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn'); btn.disabled = true;
    try {
      if (step === 'email') { const em = $('#em').value.trim(); await store.sendCode(em); loginView('code', em); }
      else { await store.verifyCode(email, $('#cd').value.trim()); await logAction(store, { action: '登入', level: 0 }); boot(); }
    } catch (err) {
      btn.disabled = false;
      $('#err').textContent = step === 'email' ? '寄不出去，請確認 Email 是否正確' : '驗證碼不對或已過期，請再試一次';
    }
  });
}

/* ---------------- 啟動 ---------------- */
async function boot() {
  store ||= await createStore();
  const user = await store.session();
  if (!user) return loginView();
  try { await loadAll(); } catch (e) { console.error(e); toast('讀取資料失敗，請檢查網路'); }
  $('#root').innerHTML = '';
  render(true);
  // iOS 分享捷徑可用 ?q=文字 直接開啟輸入面板
  const q = new URLSearchParams(location.search).get('q');
  if (q) { history.replaceState(null, '', location.pathname); openCapture(q); }
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
