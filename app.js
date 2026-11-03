'use strict';

/* ---- Temporary layout diagnostics (round 4). Records viewport numbers from script start onward. ---- */
const DBG = [];
function dbgSnap(tag) {
  const q = (s) => document.querySelector(s);
  const m = q('#main'), nav = q('nav.tabs');
  const vv = window.visualViewport;
  const row = {
    t: Math.round(performance.now()), tag,
    iH: window.innerHeight, vv: vv ? Math.round(vv.height * 10) / 10 : null, sH: screen.height,
    cH: document.documentElement.clientHeight,
    mSH: m ? m.scrollHeight : null, mCH: m ? m.clientHeight : null,
    nav: nav ? Math.round(nav.getBoundingClientRect().bottom * 10) / 10 : null,
    app: q('#app') ? Math.round(q('#app').getBoundingClientRect().bottom * 10) / 10 : null,
    fix: document.documentElement.hasAttribute('data-vfix') ? 1 : 0
  };
  DBG.push(row);
  if (DBG.length > 60) DBG.shift();
  try { console.log('[bt-dbg]', JSON.stringify(row)); } catch (e) {}
}
/* iOS standalone viewport fix.
   Measured on the phone (round 4): at launch innerHeight was 894 while screen.height was 956. The page is laid out
   62pt (the status-bar height) shorter than the screen it draws on, so fixed bars float above the bottom edge.
   When that exact situation is detected we size the shell to screen.height. It is a no-op everywhere else,
   and it can be switched off from Settings (localStorage bt_vfix = off). */
function fixViewport() {
  const root = document.documentElement;
  let on = true;
  try { on = localStorage.getItem('bt_vfix') !== 'off'; } catch (e) {}
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const gap = screen.height - window.innerHeight;
  if (on && standalone && window.innerHeight > window.innerWidth && gap > 20 && gap <= 120) {
    root.style.setProperty('--app-h', screen.height + 'px');
    root.setAttribute('data-vfix', '1');
  } else {
    root.style.removeProperty('--app-h');
    root.removeAttribute('data-vfix');
  }
}
const vf = (tag) => () => { fixViewport(); dbgSnap(tag); };
fixViewport();
dbgSnap('script start');
document.addEventListener('DOMContentLoaded', vf('DOMContentLoaded'));
window.addEventListener('load', () => { vf('load')(); setTimeout(vf('load+300ms'), 300); setTimeout(vf('load+1s'), 1000); });
window.addEventListener('resize', vf('resize'));
window.addEventListener('pageshow', vf('pageshow'));
window.addEventListener('focus', vf('focus'));
window.addEventListener('orientationchange', () => setTimeout(vf('orientationchange'), 200));
document.addEventListener('visibilitychange', vf('visibility'));
if (window.visualViewport) window.visualViewport.addEventListener('resize', vf('vv resize'));
[50, 150, 600].forEach((ms) => setTimeout(fixViewport, ms));

/* ============================================================
   Config
   ============================================================ */
const CONFIG = {
  SUPABASE_URL: 'https://qpfmfsghckzwnivacggr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_vB51S9fZBm_Bm-WS2U5lWw_tZkyMywx' // publishable key, safe in the browser with RLS on
};

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* ============================================================
   Helpers
   ============================================================ */
const MIN = 60000, HR = 3600000, DAY = 86400000;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const pad2 = (n) => String(n).padStart(2, '0');
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayKey = (d) => { d = new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const dateVal = (d) => dayKey(d);
const timeVal = (d) => { d = new Date(d); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d) => new Date(d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const fmtShort = (d) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
const fmtDateTime = (d) => fmtShort(d) + ', ' + fmtTime(d);
const fmtOz = (n) => (Math.round(n * 10) / 10).toString();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// "2h 14m" style, minutes padded (live timers)
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const m = Math.floor(ms / MIN), h = Math.floor(m / 60), r = m % 60;
  if (h > 0) return h + 'h ' + pad2(r) + 'm';
  return m + 'm';
}
// "16m", "1h 20m", "2h" (totals, charts, summaries)
function fmtHM(ms) {
  const m = Math.round(Math.max(0, ms) / MIN), h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return m + 'm';
  return r === 0 ? h + 'h' : h + 'h ' + r + 'm';
}
function fmtCountdown(ms) {
  const a = Math.abs(ms);
  let t;
  if (a >= 48 * HR) t = Math.floor(a / DAY) + 'd ' + Math.floor((a % DAY) / HR) + 'h';
  else t = fmtDur(a);
  return ms >= 0 ? 'in ' + t : t + ' overdue';
}

/* date + time fields. Two separate inputs avoid the native datetime-local pill that overflows on iOS. */
function dtHtml(id, d) {
  return '<div class="dt" id="' + id + '-dt"><input type="date" id="' + id + '-d" aria-label="Date" value="' + (d ? dateVal(d) : '') + '"><input type="time" id="' + id + '-t" aria-label="Time" value="' + (d ? timeVal(d) : '') + '"></div>';
}
function dtVal(el, id) {
  const dv = $('#' + id + '-d', el).value, tv = $('#' + id + '-t', el).value;
  if (!dv) return null;
  const [y, m, d] = dv.split('-').map(Number);
  const [hh, mm] = (tv || '00:00').split(':').map(Number);
  const out = new Date(y, m - 1, d, hh || 0, mm || 0);
  return isNaN(out) ? null : out;
}

/* ============================================================
   State
   ============================================================ */
const S = {
  user: null,
  events: [],
  tasks: [],
  settings: {},
  tab: 'home',
  tlDay: startOfDay(new Date()),
  sumRange: '24h',
  channel: null,
  rt: 'idle',
  rtSince: Date.now(),
  started: false
};

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

// Display names live in the settings table as name:<user id>, so both phones see the same names.
const myNameKey = () => 'name:' + (S.user ? S.user.id : '');
function displayName() {
  const n = (S.settings[myNameKey()] || ls.get('bt_name', '') || '').trim();
  if (n) return n;
  return S.user && S.user.email ? S.user.email.split('@')[0] : '';
}
// Names are resolved at display time from the settings table, so no entry is rewritten.
// A creator with no name set shows as "Partner" instead of an email prefix.
const who = (e) => {
  if (!e.created_by) return e.created_by_name || '';
  const n = S.settings['name:' + e.created_by];
  if (n) return n;
  if (S.user && e.created_by === S.user.id) return displayName();
  return 'Partner';
};
const babyName = () => S.settings.baby_name || 'Baby';
const isCozy = () => document.documentElement.dataset.theme !== 'night-shift';

function dayOfLife() {
  const b = S.settings.birth_datetime;
  if (!b) return null;
  const bd = new Date(b);
  if (isNaN(bd)) return null;
  return Math.max(1, Math.round((startOfDay(new Date()) - startOfDay(bd)) / DAY) + 1);
}

const sortEvents = () => S.events.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
const latest = (type) => S.events.find((e) => e.type === type);
const openOf = (type) => S.events.find((e) => e.type === type && !e.ended_at);

/* ============================================================
   Theme
   ============================================================ */
// Night Shift tone: Dad Blue by day, Deep Night (warm, dim) from 10 PM to 6 AM. Per device.
function currentTone() {
  const pref = ls.get('bt_tone', 'auto');
  if (pref === 'blue') return 'blue';
  if (pref === 'deep') return 'deep';
  const h = new Date().getHours();
  return (h >= 22 || h < 6) ? 'deep' : 'blue';
}
function applyTheme() {
  const root = document.documentElement;
  let t = ls.get('bt_theme', 'night-shift');
  if (t === 'cozy-auto') { const h = new Date().getHours(); t = (h >= 20 || h < 6) ? 'cozy-night' : 'cozy'; }
  const tone = currentTone();
  if (root.dataset.theme !== t || root.dataset.tone !== tone) {
    if (root.dataset.tone) { root.classList.add('tx'); clearTimeout(applyTheme.tt); applyTheme.tt = setTimeout(() => root.classList.remove('tx'), 400); }
    root.dataset.theme = t; root.dataset.tone = tone;
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (m && bg) m.setAttribute('content', bg);
}
const THEMES = [
  ['night-shift', 'Night shift', 'Dark and dense'],
  ['cozy', 'Cozy', 'Soft and light'],
  ['cozy-night', 'Cozy night', 'Soft and dusky'],
  ['cozy-auto', 'Cozy, auto', 'Dusky from 8 pm to 6 am']
];

/* ============================================================
   Icons
   ============================================================ */
const ICONS = {
  feed: '<path d="M10 3h4M10.5 3v2.5h3V3M9 7.5h6a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2zM7 12.5h3M7 16.5h3"/>',
  diaper: '<path d="M12 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 9 7 12 3z"/>',
  wet: '<path d="M12 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 9 7 12 3z"/>',
  dirty: '<path d="M5 20.5c-1.4 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3h14c1.3 0 2.3 1 2.3 2.3s-.9 2.3-2.3 2.3z"/><path d="M7.2 15.9c-.9-.2-1.5-1-1.5-1.9 0-1.1.9-2 2-2h8.6c1.1 0 2 .9 2 2 0 .9-.6 1.7-1.5 1.9"/><path d="M9.2 12c-.6-.3-1-.9-1-1.6 0-.9.7-1.7 1.7-1.7h4.2c1 0 1.7.8 1.7 1.7 0 .7-.4 1.3-1 1.6"/><path d="M12 8.7c0-2 .8-3.6 2.6-4.7"/>',
  both: '<path d="M8 3c2.2 3 4 5.2 4 7.6a4 4 0 0 1-8 0C4 8.2 5.8 6 8 3z"/><path d="M12.5 21.5h7.2c1 0 1.8-.8 1.8-1.8s-.8-1.8-1.8-1.8h-7.2c-1 0-1.8.8-1.8 1.8s.8 1.8 1.8 1.8z"/><path d="M13.8 17.9c-.7-.2-1.1-.7-1.1-1.4 0-.8.6-1.4 1.4-1.4h4.8c.8 0 1.4.6 1.4 1.4 0 .7-.4 1.2-1.1 1.4M16.5 15c0-1.3.6-2.3 1.8-3"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  tummy: '<path d="M9 3.5c-1.4 0-2 1.8-2 3.8s.6 3 1.6 3.2M15 3.5c1.4 0 2 1.8 2 3.8s-.6 3-1.6 3.2"/><circle cx="12" cy="15" r="5.5"/><path d="M10 14.5h.01M14 14.5h.01"/>',
  med: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 14.5l5-5"/>',
  measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  timeline: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  tasks: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  trends: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
};
const ic = (n, s = 24) => '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

const SUN = '<svg class="sleep-art" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="9" fill="#F7C948"/><g stroke="#F7C948" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M36.7 11.3l-3.5 3.5M14.8 33.2l-3.5 3.5"/></g></svg>';
const MOON = '<svg class="sleep-art" viewBox="0 0 48 48" aria-hidden="true"><path d="M33 31a14 14 0 0 1-17-18 14 14 0 1 0 17 18z" fill="#FFF3C4"/><g fill="none" stroke="#6C5A8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M33 8h5l-5 5h5M40 17h3.5l-3.5 3.5h3.5"/></g></svg>';

/* ============================================================
   Toast
   ============================================================ */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================================================
   Data layer: optimistic writes, offline queue, realtime
   ============================================================ */
const qLoad = () => { try { return JSON.parse(ls.get('bt_q', '[]')); } catch (e) { return []; } };
const qSave = (q) => ls.set('bt_q', JSON.stringify(q));
let flushing = false;

function isNetError(err) {
  if (!err) return false;
  if (!navigator.onLine) return true;
  return err.status === 0 || err.code === 'TIMEOUT' || /fetch|network|load failed|timeout/i.test(err.message || '');
}

async function runOp(op) {
  const t = sb.from(op.table);
  if (op.op === 'insert') return t.insert(op.row);
  if (op.op === 'upsert') return t.upsert(op.row);
  if (op.op === 'update') return t.update(op.patch).eq('id', op.id);
  if (op.op === 'delete') return t.delete().eq('id', op.id);
  return { error: null };
}
// A hung request must not wedge the queue forever.
const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res({ error: { code: 'TIMEOUT', message: 'timeout' } }), ms))]);

async function flush() {
  if (flushing || !S.user) return;
  flushing = true;
  try {
    let q = qLoad();
    while (q.length) {
      let res;
      try { res = await withTimeout(runOp(q[0]), 12000); } catch (e) { break; }
      if (res && res.error) {
        if (isNetError(res.error)) break;
        if (res.error.code !== '23505') toast('Could not save one change: ' + res.error.message);
      }
      q = qLoad(); q.shift(); qSave(q);
    }
  } finally {
    flushing = false;
    updateSyncUI();
  }
}

function enqueue(op) {
  op.ts = Date.now();
  const q = qLoad(); q.push(op); qSave(q);
  cacheSave();
  flush();
  updateSyncUI();
}

let cacheTimer;
function cacheSave() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    ls.set('bt_cache', JSON.stringify({ events: S.events.slice(0, 1500), tasks: S.tasks, settings: S.settings }));
  }, 300);
}

/* Sync badge. Hidden when healthy. Shows only for a real offline state, a stuck queue,
   or a realtime connection that has been down a while. "Synced" flashes 2s after a stuck queue clears. */
let pillWasShown = false, syncedTimer = null, syncedUntil = 0;
function syncState() {
  const q = qLoad();
  const online = navigator.onLine;
  const oldest = q.length ? Date.now() - (q[0].ts || 0) : 0;
  if (q.length && (!online || oldest > 4000)) return { text: (online ? '' : 'Offline, ') + q.length + ' waiting to sync', ok: false };
  if (!online) return { text: 'Offline', ok: false };
  if (S.started && S.rt !== 'SUBSCRIBED' && S.rt !== 'idle' && Date.now() - S.rtSince > 8000) return { text: 'Reconnecting', ok: false };
  if (Date.now() < syncedUntil) return { text: 'Synced', ok: true };
  return null;
}
function updateSyncUI() {
  const el = $('#sync-pill');
  const st = syncState();
  if (pillWasShown && !st) {
    // went from showing a problem to healthy: flash Synced for 2s
    const was = el && el.dataset.bad === '1';
    if (was) { syncedUntil = Date.now() + 2000; clearTimeout(syncedTimer); syncedTimer = setTimeout(updateSyncUI, 2100); return updateSyncUI(); }
  }
  pillWasShown = !!(st && !st.ok);
  if (!el) return;
  if (!st) { el.hidden = true; el.dataset.bad = '0'; return; }
  el.hidden = false;
  el.textContent = st.text;
  el.classList.toggle('ok', st.ok);
  el.dataset.bad = st.ok ? '0' : '1';
}

function addEvent(row) {
  row = Object.assign({ id: uid(), started_at: new Date().toISOString(), created_by_name: displayName() }, row);
  S.events.push(row); sortEvents();
  enqueue({ op: 'insert', table: 'events', row });
  render();
  return row;
}
function patchEvent(id, patch) {
  const e = S.events.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch); sortEvents();
  enqueue({ op: 'update', table: 'events', id, patch });
  render();
}
function removeEvent(id) {
  S.events = S.events.filter((x) => x.id !== id);
  enqueue({ op: 'delete', table: 'events', id });
  render();
}
function addTask(row) {
  row = Object.assign({ id: uid(), recurrence: 'none', created_by_name: displayName() }, row);
  S.tasks.push(row);
  enqueue({ op: 'insert', table: 'tasks', row });
  render();
  return row;
}
function patchTask(id, patch) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  enqueue({ op: 'update', table: 'tasks', id, patch });
  render();
}
function setSetting(key, value) {
  value = String(value);
  S.settings[key] = value;
  enqueue({ op: 'upsert', table: 'settings', row: { key, value } });
}

async function loadAll() {
  try {
    const [ev, tk, st] = await Promise.all([
      sb.from('events').select('*').order('started_at', { ascending: false }).limit(3000),
      sb.from('tasks').select('*').order('due_at', { ascending: true }),
      sb.from('settings').select('*')
    ]);
    if (ev.error || tk.error || st.error) throw (ev.error || tk.error || st.error);
    S.events = ev.data; sortEvents();
    S.tasks = tk.data;
    S.settings = {};
    st.data.forEach((r) => { S.settings[r.key] = r.value; });
    cacheSave();
  } catch (e) {
    if (!isNetError(e)) toast('Could not load data: ' + (e.message || e));
  }
}

function loadCache() {
  try {
    const c = JSON.parse(ls.get('bt_cache', 'null'));
    if (c) { S.events = c.events || []; S.tasks = c.tasks || []; S.settings = c.settings || {}; sortEvents(); }
  } catch (e) {}
}

function subscribe() {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  const ch = sb.channel('household');
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (p) => {
    if (p.eventType === 'DELETE') S.events = S.events.filter((e) => e.id !== p.old.id);
    else {
      const i = S.events.findIndex((e) => e.id === p.new.id);
      if (i >= 0) S.events[i] = p.new; else S.events.push(p.new);
    }
    sortEvents(); cacheSave(); render();
  });
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => {
    if (p.eventType === 'DELETE') S.tasks = S.tasks.filter((t) => t.id !== p.old.id);
    else {
      const i = S.tasks.findIndex((t) => t.id === p.new.id);
      if (i >= 0) S.tasks[i] = p.new; else S.tasks.push(p.new);
    }
    cacheSave(); render();
  });
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (p) => {
    if (p.eventType === 'DELETE') delete S.settings[p.old.key];
    else S.settings[p.new.key] = p.new.value;
    cacheSave(); render();
  });
  ch.subscribe((status) => {
    const was = S.rt;
    S.rt = status; S.rtSince = Date.now();
    if (status === 'SUBSCRIBED' && was !== 'idle' && was !== 'SUBSCRIBED') { flush().then(() => loadAll()).then(render); }
    updateSyncUI();
  });
  S.channel = ch;
}

/* ============================================================
   Derived numbers
   ============================================================ */
function feedGapMs() {
  const f = S.events.filter((e) => e.type === 'feed').slice(0, 8);
  if (f.length >= 2) {
    let sum = 0;
    for (let i = 0; i < f.length - 1; i++) sum += new Date(f[i].started_at) - new Date(f[i + 1].started_at);
    // Recent pattern only, kept in a sane newborn range so one long overnight gap can't blow up the gauge.
    return Math.min(4 * HR, Math.max(2 * HR, sum / (f.length - 1)));
  }
  return (parseFloat(S.settings.feed_interval_target_hours) || 3) * HR;
}

function overlap(e, from, to) {
  const s = new Date(e.started_at).getTime();
  const en = e.ended_at ? new Date(e.ended_at).getTime() : Date.now();
  return Math.max(0, Math.min(en, to) - Math.max(s, from));
}

function dayStats(dayStart) {
  const from = dayStart.getTime(), to = from + DAY;
  const evs = S.events.filter((e) => { const t = new Date(e.started_at).getTime(); return t >= from && t < to; });
  const feeds = evs.filter((e) => e.type === 'feed');
  const diapers = evs.filter((e) => e.type === 'diaper');
  return {
    feeds: feeds.length,
    oz: feeds.reduce((a, e) => a + (+e.amount_oz || 0), 0),
    wet: diapers.filter((e) => e.diaper_kind === 'wet' || e.diaper_kind === 'both').length,
    dirty: diapers.filter((e) => e.diaper_kind === 'dirty' || e.diaper_kind === 'both').length,
    sleepMs: S.events.filter((e) => e.type === 'sleep').reduce((a, e) => a + overlap(e, from, to), 0)
  };
}

/* ============================================================
   Rendering
   ============================================================ */
function render() {
  if (!S.user) { renderLogin(); return; }
  const app = $('#app');
  const prev = $('#main');
  const scroll = prev ? prev.scrollTop : 0;
  const dol = dayOfLife();
  const tabs = [['home', 'Home', 'home'], ['timeline', 'Timeline', 'timeline'], ['tasks', 'Tasks', 'tasks'], ['trends', 'Trends', 'trends']];
  const sleeping = !!openOf('sleep');
  let body = '';
  if (S.tab === 'home') body = homeHtml();
  else if (S.tab === 'timeline') body = timelineHtml();
  else if (S.tab === 'tasks') body = tasksHtml();
  else body = trendsHtml();

  app.innerHTML =
    '<header class="top"><h1>' + esc(babyName()) + (dol ? '<small>day ' + dol + '</small>' : '') + '</h1>' +
    '<div style="display:flex;align-items:center;gap:6px"><span class="pill" id="sync-pill" role="status" hidden></span>' +
    '<button class="iconbtn" data-act="settings" aria-label="Settings">' + ic('gear') + '</button></div></header>' +
    '<main id="main">' + body + '</main>' +
    '<div class="bottombar"><div class="quick">' +
    '<button class="btn primary" data-act="feed">' + ic('feed') + 'Feed</button>' +
    '<button class="btn" data-act="diaper">' + ic('diaper') + 'Diaper</button>' +
    '<button class="btn' + (sleeping ? ' asleep' : '') + '" data-act="sleep-toggle">' + ic('sleep') + (sleeping ? 'Wake' : 'Sleep') + '</button>' +
    '<button class="btn" data-act="more">' + ic('more') + 'More</button></div>' +
    '<nav class="tabs" aria-label="Sections">' +
    tabs.map((t) => '<button data-act="tab" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + ic(t[2]) + t[1] + '</button>').join('') + '</nav></div>';
  const main = $('#main');
  if (main) main.scrollTop = scroll;
  updateSyncUI();
}

function homeHtml() {
  const now = Date.now();
  const lf = latest('feed'), ld = latest('diaper');
  const sleepOpen = openOf('sleep'), tummyOpen = openOf('tummy');
  const gap = feedGapMs();
  let html = '';

  // Feed card (the hero)
  if (lf) {
    const since = now - new Date(lf.started_at).getTime();
    const next = new Date(lf.started_at).getTime() + gap;
    const over = now > next;
    const scaleH = Math.max(3, Math.ceil(gap / HR));
    const scale = scaleH * HR;
    const pct = Math.min(1, since / scale);
    let ticks = '', labels = '';
    for (let i = 1; i <= scaleH; i++) {
      const left = (i / scaleH * 100).toFixed(2);
      if (i < scaleH) ticks += '<i style="left:' + left + '%"></i>';
      labels += '<span style="left:' + left + '%">' + i + 'h</span>';
    }
    html += '<section class="card status feed' + (over ? ' alert' : '') + '"><div class="label">' + ic('feed') + 'Last feed</div>' +
      '<div class="big">' + fmtDur(since) + '</div>' +
      '<div class="sub">' + fmtOz(lf.amount_oz || 0) + ' oz · ' + fmtTime(lf.started_at) + (who(lf) ? ' · ' + esc(who(lf)) : '') + '</div>' +
      '<div class="gaugebox" aria-hidden="true"><div class="gauge' + (over ? ' alert' : '') + '"><div class="fill" style="width:' + (pct * 100).toFixed(1) + '%"></div>' + ticks + '<b style="left:' + Math.min(100, gap / scale * 100).toFixed(1) + '%"></b></div>' +
      '<div class="gauge-labels mono">' + labels + '</div></div>' +
      '<div class="next-line">Next feed around ' + fmtTime(next) + ' (' + (over ? fmtDur(now - next) + ' overdue' : 'in ' + fmtDur(next - now)) + ')</div></section>';
  } else {
    html += '<section class="card status feed"><div class="label">' + ic('feed') + 'Last feed</div><div class="sub" style="margin-top:8px">' +
      (isCozy() ? "Nothing yet today. Log the first feed when you're ready." : 'Nothing logged yet. First feed counts.') + '</div></section>';
  }

  html += nextUpHtml(now);

  // Diaper + sleep cards, same height
  const lastSleepEnd = S.events.find((e) => e.type === 'sleep' && e.ended_at);
  let sleepBig, sleepSub;
  if (sleepOpen) { sleepBig = 'Asleep ' + fmtHM(now - new Date(sleepOpen.started_at).getTime()); sleepSub = 'Since ' + fmtTime(sleepOpen.started_at); }
  else if (lastSleepEnd) { sleepBig = 'Awake ' + fmtHM(now - new Date(lastSleepEnd.ended_at).getTime()); sleepSub = 'Woke at ' + fmtTime(lastSleepEnd.ended_at); }
  else { sleepBig = 'Awake'; sleepSub = 'No sleep logged'; }

  const todayStart = startOfDay(new Date()).getTime();
  const lastOf = (kinds) => S.events.find((e) => e.type === 'diaper' && kinds.includes(e.diaper_kind));
  const sinceLine = (ev, label) => (ev && new Date(ev.started_at).getTime() >= todayStart) ? 'Last ' + label + ' ' + fmtDur(now - new Date(ev.started_at).getTime()) + ' ago' : 'No ' + label + ' today';

  html += '<div class="grid2">' +
    '<section class="card status diaper compact"><div class="label">' + ic('diaper') + 'Last diaper</div>' +
    (ld ? '<div class="big">' + fmtDur(now - new Date(ld.started_at).getTime()) + '</div><div class="sub">' + cap(ld.diaper_kind) + (who(ld) ? ' · ' + esc(who(ld)) : '') + '</div>'
        : '<div class="sub" style="margin-top:8px">None yet</div>') +
    '<div class="pushdown minor">' + sinceLine(lastOf(['wet', 'both']), 'wet') + '<br>' + sinceLine(lastOf(['dirty', 'both']), 'dirty') + '</div></section>' +
    '<section class="card status sleep compact' + (sleepOpen ? ' asleep' : '') + '">' + (sleepOpen ? MOON : SUN) + '<div class="label">' + ic('sleep') + 'Sleep</div>' +
    '<div class="big" style="font-size:calc(var(--big)*.42)">' + sleepBig + '</div><div class="sub">' + sleepSub + '</div>' +
    '<div class="sleep-wrap"><button class="btn sleep-btn" data-act="sleep-toggle" style="width:100%">' + (sleepOpen ? 'Wake' : 'Sleep') + '</button></div></section></div>';

  if (tummyOpen) {
    html += '<div class="banner"><span>' + ic('tummy') + ' Tummy time ' + fmtDur(now - new Date(tummyOpen.started_at).getTime()) + '</span><button class="btn primary" data-act="tummy-stop">Stop</button></div>';
  }

  // Today's totals
  const t = dayStats(startOfDay(new Date()));
  html += '<section class="card"><h2>Today</h2><div class="totals">' +
    '<div><b>' + t.feeds + ' · ' + fmtOz(t.oz) + ' oz</b><span>Feeds</span></div>' +
    '<div><b>' + fmtHM(t.sleepMs) + '</b><span>Sleep</span></div>' +
    '<div><b>' + t.wet + '</b><span>Wet diapers</span></div>' +
    '<div><b>' + t.dirty + '</b><span>Dirty diapers</span></div></div></section>';

  return html;
}

/* ---------- Next up (Home) ---------- */
function fmtOver(ms) {
  const m = Math.max(1, Math.floor(ms / MIN));
  if (m >= 2880) return Math.floor(m / 1440) + 'd';
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? h + 'h ' + pad2(r) + 'm' : m + 'm';
}
function nextUpHtml(now) {
  const up = S.tasks.filter((x) => !x.completed_at).sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, 2);
  if (!up.length) return '';
  return '<div class="nextup" aria-label="Next up">' + up.map((x) => {
    const ms = new Date(x.due_at) - now;
    const over = ms < 0, soon = !over && ms <= 30 * MIN;
    const sub = over ? 'Overdue by ' + fmtOver(-ms) : fmtTime(x.due_at) + ', in ' + fmtDur(ms);
    return '<div class="nrow' + (over ? ' over' : soon ? ' soon' : '') + '" role="button" tabindex="0" data-act="task-open" data-id="' + x.id + '">' +
      '<div class="mid"><b>' + esc(x.title) + '</b><span class="cd">' + (over ? sub : sub) + '</span></div>' +
      '<button class="checkbtn" data-act="task-check" data-id="' + x.id + '" aria-label="Mark ' + esc(x.title) + ' done">' + ic('check', 24) + '</button></div>';
  }).join('') + '</div>';
}

/* ---------- Timeline ---------- */
function eventTitle(e) {
  return ({ feed: 'Feed', diaper: 'Diaper', sleep: 'Sleep', tummy: 'Tummy time', med: e.label || 'Medication', measure: 'Weight and length', note: e.label || 'Note' })[e.type];
}
function eventDetail(e) {
  if (e.type === 'feed') return fmtOz(e.amount_oz || 0) + ' oz' + (e.notes ? ' · ' + e.notes : '');
  if (e.type === 'diaper') return cap(e.diaper_kind) + (e.notes ? ' · ' + e.notes : '');
  if (e.type === 'sleep' || e.type === 'tummy') {
    const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now();
    return (e.ended_at ? fmtHM(end - new Date(e.started_at).getTime()) : 'Running, ' + fmtHM(end - new Date(e.started_at).getTime())) + (e.notes ? ' · ' + e.notes : '');
  }
  if (e.type === 'measure') return [e.weight_lb ? e.weight_lb + ' lb' : '', e.length_in ? e.length_in + ' in' : ''].filter(Boolean).join(' · ') + (e.notes ? ' · ' + e.notes : '');
  return e.notes || '';
}
const DOT = { feed: 'var(--c-feed)', diaper: 'var(--c-diaper)', sleep: 'var(--c-sleep)', tummy: 'var(--c-tummy)', med: 'var(--c-med)', measure: 'var(--c-measure)', note: 'var(--c-note)' };

function timelineHtml() {
  const from = S.tlDay.getTime(), to = from + DAY;
  const evs = S.events.filter((e) => { const t = new Date(e.started_at).getTime(); return t >= from && t < to; });
  const today = startOfDay(new Date()).getTime() === from;
  let html = '<div class="daynav"><button class="iconbtn" data-act="day-prev" aria-label="Previous day">' + ic('chevL') + '</button>' +
    '<label class="date">' + (today ? 'Today, ' + fmtShort(S.tlDay) : fmtDay(S.tlDay)) + '<input type="date" id="dayjump" aria-label="Jump to date" value="' + dateVal(S.tlDay) + '"></label>' +
    '<button class="iconbtn" data-act="day-next" aria-label="Next day"' + (today ? ' disabled style="opacity:.3"' : '') + '>' + ic('chevR') + '</button></div>';
  if (!evs.length) {
    html += '<div class="card empty">' + (today ? (isCozy() ? "Nothing yet today. Log the first feed when you're ready." : 'Nothing logged yet. First feed counts.') : 'Nothing logged this day.') + '</div>';
  } else {
    const st = dayStats(S.tlDay);
    html += '<section class="card"><div class="daysum mono">' + st.feeds + ' feed' + (st.feeds === 1 ? '' : 's') + ', ' + fmtOz(st.oz) + ' oz, ' + st.wet + ' wet, ' + st.dirty + ' dirty, ' + fmtHM(st.sleepMs) + ' sleep</div>' +
      '<div class="rows tl">' + evs.map((e) => {
      const time = (e.type === 'sleep' || e.type === 'tummy') ? fmtTime(e.started_at) + (e.ended_at ? ' – ' + fmtTime(e.ended_at) : ' – now') : fmtTime(e.started_at);
      const icon = e.type === 'diaper' ? (e.diaper_kind || 'diaper') : e.type;
      return '<button class="row" style="--dotc:' + DOT[e.type] + '" data-act="edit" data-id="' + e.id + '"><span class="dot2"></span><span class="mid"><b>' + ic(icon, 18) + esc(eventTitle(e)) + '</b><span>' + esc(eventDetail(e)) + '</span></span><span class="time">' + time + (who(e) ? '<br>' + esc(who(e)) : '') + '</span></button>';
    }).join('') + '</div></section>';
  }
  return html;
}

/* ---------- Tasks ---------- */
function recurLabel(t) {
  if (t.recurrence === 'daily') return 'Daily';
  if (t.recurrence === 'weekly') return 'Weekly';
  if (t.recurrence === 'every_n_hours') return 'Every ' + (t.interval_hours || '?') + ' h';
  return '';
}
const TASK_PRESETS = [
  { label: 'Vitamin D, daily', title: 'Vitamin D', rec: 'daily', med: true },
  { label: 'Weight check', title: 'Weight check' },
  { label: 'Pediatrician visit (first one)', title: 'First pediatrician visit' },
  { label: 'Custom' }
];
function tasksHtml() {
  const now = Date.now();
  const open = S.tasks.filter((t) => !t.completed_at).sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const done = S.tasks.filter((t) => t.completed_at).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 5);
  let html = '<button class="btn outline big" data-act="task-add">' + ic('plus') + 'Add task</button>';
  html += '<section class="card"><h2>Upcoming</h2>' + (open.length ? '<div class="rows">' + open.map((t) => {
    const ms = new Date(t.due_at) - now;
    return '<div class="row' + (ms < 0 ? ' overdue' : '') + '"><button class="iconbtn" style="border:1px solid var(--line)" data-act="task-check" data-id="' + t.id + '" aria-label="Mark ' + esc(t.title) + ' done">' + ic('check') + '</button>' +
      '<div class="mid"><b>' + esc(t.title) + '</b><span><span class="cd">' + fmtCountdown(ms) + '</span> · ' + fmtDateTime(t.due_at) + (recurLabel(t) ? ' · ' + recurLabel(t) : '') + '</span></div>' +
      '<button class="iconbtn" data-act="task-cal" data-id="' + t.id + '" aria-label="Add ' + esc(t.title) + ' to calendar">' + ic('calendar') + '</button></div>';
  }).join('') + '</div>' : '<div class="empty">Nothing scheduled yet. Start with one of these:</div><div class="chips" style="margin-top:8px">' +
    TASK_PRESETS.map((p, i) => '<button class="chip" data-act="task-preset" data-i="' + i + '">' + p.label + '</button>').join('') + '</div>') + '</section>';
  if (done.length) {
    html += '<section class="card"><h2>Done</h2><div class="rows">' + done.map((t) =>
      '<div class="row done" style="min-height:48px"><div class="mid"><b>' + esc(t.title) + '</b><span>' + fmtDateTime(t.completed_at) + '</span></div></div>').join('') + '</div></section>';
  }
  return html;
}

function nextDue(t) {
  if (t.recurrence === 'none') return null;
  const step = t.recurrence === 'daily' ? DAY : t.recurrence === 'weekly' ? 7 * DAY : (t.interval_hours || 4) * HR;
  let d = new Date(t.due_at).getTime() + step;
  const now = Date.now();
  while (d <= now) d += step;
  return new Date(d);
}
function completeTask(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t || t.completed_at) return;
  const nowIso = new Date().toISOString();
  patchTask(id, { completed_at: nowIso });
  if (t.log_as === 'med') addEvent({ type: 'med', label: t.title, started_at: nowIso });
  const nx = nextDue(t);
  if (nx) addTask({ title: t.title, due_at: nx.toISOString(), recurrence: t.recurrence, interval_hours: t.interval_hours, log_as: t.log_as });
  toast(nx ? 'Done. Next one is set.' : 'Done');
}

/* ---------- Trends ---------- */
function lastDays(n) {
  const out = [];
  const today = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * DAY));
  return out;
}
/* Single-series bars: today in the accent, earlier days muted. Stacked bars: today full strength, earlier days dimmed. */
function barChart(days, partsFn, labels) {
  const W = 320, H = 124, base = 96, maxH = 66;
  const data = days.map((d) => partsFn(d));
  const totals = data.map((p) => p.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const stacked = data[0].length > 1;
  const bw = 28, step = (W - 20) / days.length;
  let g = '';
  [1, 2 / 3, 1 / 3].forEach((f) => { const y = base - f * maxH; g += '<line class="grid" x1="10" x2="' + (W - 10) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'; });
  g += '<line class="grid" x1="10" x2="' + (W - 10) + '" y1="' + base + '" y2="' + base + '"/>';
  data.forEach((parts, i) => {
    const x = 10 + i * step + (step - bw) / 2;
    const isToday = i === days.length - 1;
    let y = base;
    parts.forEach((v, pi) => {
      const h = (v / max) * maxH;
      if (h > 0) { y -= h; g += '<rect class="p' + pi + (isToday ? ' today' : '') + (stacked ? ' stacked' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="' + (isCozy() ? 7 : 2) + '"/>'; }
    });
    if (totals[i] > 0) g += '<text class="val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + labels.fmt(totals[i], parts) + '</text>';
    g += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (base + 15) + '" text-anchor="middle">' + days[i].toLocaleDateString([], { weekday: 'short' }) + '</text>';
  });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(labels.aria) + '">' + g + '</svg>';
}

function rangeInfo(range) {
  const now = Date.now();
  const dol = dayOfLife();
  const days = range === '24h' ? 1 : Math.min(7, Math.max(1, dol || 7));
  return { from: now - (range === '24h' ? DAY : 7 * DAY), now, days, label: range === '24h' ? 'Last 24 hours' : 'Last 7 days' };
}
function buildSummary(range) {
  const r = rangeInfo(range);
  const evs = S.events.filter((e) => new Date(e.started_at).getTime() >= r.from);
  const feeds = evs.filter((e) => e.type === 'feed');
  const diapers = evs.filter((e) => e.type === 'diaper');
  const wet = diapers.filter((e) => e.diaper_kind === 'wet' || e.diaper_kind === 'both').length;
  const dirty = diapers.filter((e) => e.diaper_kind === 'dirty' || e.diaper_kind === 'both').length;
  const oz = feeds.reduce((a, e) => a + (+e.amount_oz || 0), 0);
  const sleepMs = S.events.filter((e) => e.type === 'sleep').reduce((a, e) => a + overlap(e, r.from, r.now), 0);
  const per = (n) => (n / r.days).toFixed(1);
  const dol = dayOfLife();
  const lines = [
    babyName() + ': ' + r.label.toLowerCase() + ', as of ' + fmtDateTime(new Date()) + (dol ? ' (day ' + dol + ' of life)' : ''),
    'Feeds: ' + feeds.length + ' total, ' + fmtOz(oz) + ' oz' + (feeds.length ? ', ' + fmtOz(oz / feeds.length) + ' oz per feed' : '') + ', ' + per(feeds.length) + ' per day',
    'Wet diapers: ' + wet + ' (' + per(wet) + ' per day)',
    'Dirty diapers: ' + dirty + ' (' + per(dirty) + ' per day)',
    'Sleep: ' + fmtHM(sleepMs) + ' total (' + fmtHM(sleepMs / r.days) + ' per day)'
  ];
  const meas = S.events.filter((e) => e.type === 'measure').slice().reverse();
  if (meas.length) {
    lines.push('Weight and length:');
    meas.forEach((m) => lines.push('  ' + fmtShort(m.started_at) + ': ' + [m.weight_lb ? m.weight_lb + ' lb' : '', m.length_in ? m.length_in + ' in' : ''].filter(Boolean).join(', ')));
  }
  return lines.join('\n');
}

function trendsHtml() {
  const days = lastDays(7);
  const stats = days.map((d) => dayStats(d));
  const idx = (d) => days.findIndex((x) => x.getTime() === d.getTime());
  const daysWithData = days.filter((d) => S.events.some((e) => dayKey(e.started_at) === dayKey(d))).length;
  let html = '';
  if (daysWithData < 3) html += '<div class="card empty">Not enough data yet. Charts fill in after a few days of logging.</div>';
  const dol = dayOfLife();
  if (dol) {
    const today = stats[6];
    const target = dol <= 5 ? dol : 6;
    const ok = today.wet >= target;
    html += '<section class="card"><h2>Wet diapers today</h2><div class="target"><span class="dot' + (ok ? '' : ' amber') + '"></span><div><b>' + today.wet + ' wet diaper' + (today.wet === 1 ? '' : 's') + ' today. Goal: ' + target + ' or more.</b></div></div>' +
      '<p class="note-small" style="margin:10px 0 0">General guidance: about 1 wet diaper on day 1, rising by one a day to 6 or more from day 6. Stools turn yellow around day 5. Call the pediatrician with any concerns.</p></section>';
  }
  html += '<section class="card"><h2>Formula per day (oz)</h2><div class="sub2">' + stats[6].feeds + ' feed' + (stats[6].feeds === 1 ? '' : 's') + ' today.</div>' +
    barChart(days, (d) => [stats[idx(d)].oz], { aria: 'Total ounces of formula per day, last 7 days', fmt: (t) => fmtOz(t) }) + '</section>';
  html += '<section class="card"><h2>Diapers per day</h2>' +
    barChart(days, (d) => [stats[idx(d)].wet, stats[idx(d)].dirty], { aria: 'Wet and dirty diapers per day, last 7 days', fmt: (t) => t }) +
    '<div class="legend"><span><i style="background:var(--accent)"></i>Wet</span><span><i style="background:var(--accent-2)"></i>Dirty</span></div></section>';
  html += '<section class="card"><h2>Sleep per day</h2>' +
    barChart(days, (d) => [stats[idx(d)].sleepMs], { aria: 'Sleep per day, last 7 days', fmt: (t) => fmtHM(t) }) + '</section>';
  html += '<section class="card"><h2>Pediatrician summary</h2><div class="chips"><button class="chip' + (S.sumRange === '24h' ? ' on' : '') + '" data-act="sum-range" data-r="24h">Last 24 hours</button><button class="chip' + (S.sumRange === '7d' ? ' on' : '') + '" data-act="sum-range" data-r="7d">Last 7 days</button></div>' +
    '<pre class="summary">' + esc(buildSummary(S.sumRange)) + '</pre><button class="btn big" data-act="copy-summary">Copy summary</button></section>';
  return html;
}

/* ---------- Login ---------- */
function renderLogin() {
  $('#app').innerHTML = '<div class="login"><h1>Baby tracker</h1><p class="muted" style="margin:0">Sign in with the account you were set up with.</p>' +
    '<form id="loginform"><input type="email" id="le" placeholder="Email" autocomplete="username" autocapitalize="none" required aria-label="Email">' +
    '<input type="password" id="lp" placeholder="Password" autocomplete="current-password" required aria-label="Password">' +
    '<div class="err" id="lerr" role="alert"></div><button class="btn primary big" type="submit">Sign in</button></form></div>';
  $('#loginform').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#le').value.trim(), password: $('#lp').value });
    btn.disabled = false;
    if (error) $('#lerr').textContent = error.message;
  });
}

/* ============================================================
   Sheets
   ============================================================ */
function openSheet(title, html, wire) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = '<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"><i></i></div><div class="head"><h2>' + esc(title) + '</h2><button class="iconbtn" data-sheet="close" aria-label="Close">' + ic('close') + '</button></div><div class="stack">' + html + '</div></div></div>';
  const el = $('.sheet', root);
  $('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim') closeSheet(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-sheet="close"]')) closeSheet(); });
  makeDismissable(el);
  if (wire) wire(el, closeSheet);
  return el;
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

/* Drag the handle or title down to dismiss. */
function makeDismissable(sheet) {
  let y0 = null, dy = 0, t0 = 0;
  const grabbers = sheet.querySelectorAll('.grab, .head h2');
  grabbers.forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      y0 = e.clientY; dy = 0; t0 = Date.now();
      g.setPointerCapture && g.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
    });
    g.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    const end = () => {
      if (y0 === null) return;
      const v = dy / Math.max(1, Date.now() - t0);
      y0 = null;
      sheet.classList.remove('dragging');
      if (dy > 110 || (dy > 40 && v > 0.6)) closeSheet();
      else sheet.style.transform = '';
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  });
}

/* Time: one scrollable chip row. "Custom" reveals date and time fields. */
function timeField(label) {
  return '<div class="field"><span>' + (label || 'Time') + '</span><div class="chips scroll" id="tchips">' +
    [0, 5, 10, 20, 30, 60].map((m) => '<button type="button" class="chip' + (m === 0 ? ' on' : '') + '" data-ago="' + m + '">' + (m ? m + ' min ago' : 'Now') + '</button>').join('') +
    '<button type="button" class="chip" data-custom="1">Custom</button></div>' +
    '<div id="tcustom" hidden>' + dtHtml('tc', new Date()) + '</div></div>';
}
function wireTime(el, ctx) {
  ctx.when = new Date(); ctx.now = true;
  const custom = $('#tcustom', el);
  const read = () => { const d = dtVal(el, 'tc'); if (d) { ctx.when = d; ctx.now = false; } };
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ago],[data-custom]');
    if (!c) return;
    el.querySelectorAll('#tchips .chip').forEach((x) => x.classList.toggle('on', x === c));
    if (c.dataset.custom) {
      custom.hidden = false;
      read();
    } else {
      custom.hidden = true;
      const m = +c.dataset.ago;
      ctx.now = m === 0;
      ctx.when = new Date(Date.now() - m * MIN);
    }
  });
  custom.addEventListener('input', read);
  custom.addEventListener('change', read);
}
const whenOf = (ctx) => (ctx.now ? new Date() : ctx.when);

function feedSheet() {
  const last = latest('feed');
  const lastOz = last && last.amount_oz ? +last.amount_oz : null;
  const ctx = { oz: lastOz || 2 };
  openSheet('Log feed',
    (lastOz ? '<button class="chip" style="min-height:48px;align-self:flex-start" data-same="1">Same as last (' + fmtOz(lastOz) + ' oz)</button>' : '') +
    '<div class="stepper"><button class="btn round" data-s="dec" aria-label="Less formula">' + ic('minus') + '</button><div class="oz"><span id="oz">' + fmtOz(ctx.oz) + '</span><small>oz</small></div><button class="btn round" data-s="inc" aria-label="More formula">' + ic('plus') + '</button></div>' +
    '<div class="chips scroll">' + [1, 2, 3, 4, 5, 6, 8].map((n) => '<button class="chip" data-oz="' + n + '">' + n + ' oz</button>').join('') + '</div>' +
    timeField() +
    '<label class="toggle"><input type="checkbox" id="spit"> Spit-up</label>' +
    '<input type="text" id="note" placeholder="Note (optional)" aria-label="Note">' +
    '<button class="btn primary big" data-s="save">Save feed</button>',
    (el, close) => {
      wireTime(el, ctx);
      const show = () => { $('#oz', el).textContent = fmtOz(ctx.oz); };
      const save = () => {
        const notes = [$('#spit', el).checked ? 'Spit-up' : '', $('#note', el).value.trim()].filter(Boolean).join('. ');
        addEvent({ type: 'feed', amount_oz: ctx.oz, started_at: whenOf(ctx).toISOString(), notes: notes || null });
        close(); toast('Feed saved');
      };
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-same]')) { ctx.oz = lastOz; show(); save(); return; }
        const b = e.target.closest('[data-s],[data-oz]');
        if (!b) return;
        if (b.dataset.oz) { ctx.oz = +b.dataset.oz; show(); }
        else if (b.dataset.s === 'dec') { ctx.oz = Math.max(0, ctx.oz - 0.5); show(); }
        else if (b.dataset.s === 'inc') { ctx.oz = ctx.oz + 0.5; show(); }
        else if (b.dataset.s === 'save') save();
      });
    });
}

function diaperSheet() {
  const ctx = {};
  openSheet('Log diaper',
    '<div class="kinds">' + ['wet', 'dirty', 'both'].map((k) => '<button class="btn primary" data-kind="' + k + '">' + ic(k, 30) + cap(k) + '</button>').join('') + '</div>' +
    '<p class="note-small" style="margin:-4px 0 0">Tap a kind to save.</p>' +
    timeField() +
    '<input type="text" id="note" placeholder="Note (color, rash). Fill in before you tap a kind." aria-label="Note">',
    (el, close) => {
      wireTime(el, ctx);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-kind]');
        if (!b) return;
        addEvent({ type: 'diaper', diaper_kind: b.dataset.kind, started_at: whenOf(ctx).toISOString(), notes: $('#note', el).value.trim() || null });
        close(); toast('Diaper saved');
      });
    });
}

function toggleSleep() {
  const open = openOf('sleep');
  if (open) { patchEvent(open.id, { ended_at: new Date().toISOString() }); toast('Sleep stopped'); }
  else { addEvent({ type: 'sleep', started_at: new Date().toISOString(), ended_at: null }); toast('Sleep started'); }
}

function moreSheet() {
  const tummy = openOf('tummy');
  openSheet('More',
    '<div class="menu">' +
    '<button class="btn" data-m="med">' + ic('med', 28) + 'Medication or vitamin</button>' +
    (tummy ? '<button class="btn primary" data-m="tummy-stop">' + ic('tummy', 28) + 'Stop tummy time</button>' : '<button class="btn" data-m="tummy">' + ic('tummy', 28) + 'Start tummy time</button>') +
    '<button class="btn" data-m="measure">' + ic('measure', 28) + 'Weight and length</button>' +
    '<button class="btn" data-m="note">' + ic('note', 28) + 'Note</button>' +
    '<button class="btn" data-m="past-sleep">' + ic('sleep', 28) + 'Add past sleep</button></div>',
    (el, close) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        const m = b.dataset.m;
        if (m === 'tummy') { addEvent({ type: 'tummy', started_at: new Date().toISOString(), ended_at: null }); close(); toast('Tummy time started'); }
        else if (m === 'tummy-stop') { stopTummy(); close(); }
        else if (m === 'med') medSheet();
        else if (m === 'measure') measureSheet();
        else if (m === 'note') noteSheet();
        else if (m === 'past-sleep') pastSleepSheet();
      });
    });
}
function stopTummy() {
  const t = openOf('tummy');
  if (t) { patchEvent(t.id, { ended_at: new Date().toISOString() }); toast('Tummy time stopped'); }
}

function medSheet() {
  const ctx = {};
  openSheet('Medication or vitamin',
    '<div class="chips"><button class="chip" data-label="Vitamin D">Vitamin D</button></div>' +
    '<label class="field">Name<input type="text" id="label" placeholder="e.g. Vitamin D" aria-label="Name"></label>' +
    timeField() + '<input type="text" id="note" placeholder="Dose or note (optional)" aria-label="Dose or note">' +
    '<button class="btn primary big" data-s="save">Save</button>',
    (el, close) => {
      wireTime(el, ctx);
      el.addEventListener('click', (e) => {
        const c = e.target.closest('[data-label]');
        if (c) { $('#label', el).value = c.dataset.label; return; }
        if (e.target.closest('[data-s="save"]')) {
          const label = $('#label', el).value.trim();
          if (!label) { toast('Add a name'); return; }
          addEvent({ type: 'med', label, started_at: whenOf(ctx).toISOString(), notes: $('#note', el).value.trim() || null });
          close(); toast('Saved');
        }
      });
    });
}

function measureSheet() {
  const ctx = {};
  openSheet('Weight and length',
    '<div class="split"><label class="field">Weight (lb)<input type="number" inputmode="decimal" step="0.1" min="0" id="w" aria-label="Weight in pounds"></label>' +
    '<label class="field">Length (in)<input type="number" inputmode="decimal" step="0.25" min="0" id="l" aria-label="Length in inches"></label></div>' +
    timeField() + '<input type="text" id="note" placeholder="Note (optional)" aria-label="Note">' +
    '<button class="btn primary big" data-s="save">Save</button>',
    (el, close) => {
      wireTime(el, ctx);
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-s="save"]')) return;
        const w = parseFloat($('#w', el).value), l = parseFloat($('#l', el).value);
        if (isNaN(w) && isNaN(l)) { toast('Add a weight or a length'); return; }
        addEvent({ type: 'measure', weight_lb: isNaN(w) ? null : w, length_in: isNaN(l) ? null : l, started_at: whenOf(ctx).toISOString(), notes: $('#note', el).value.trim() || null });
        close(); toast('Saved');
      });
    });
}

function noteSheet() {
  const ctx = {};
  openSheet('Note',
    '<input type="text" id="label" placeholder="Title (optional)" aria-label="Title">' +
    '<label class="field">Note<textarea id="note" aria-label="Note"></textarea></label>' + timeField() +
    '<button class="btn primary big" data-s="save">Save note</button>',
    (el, close) => {
      wireTime(el, ctx);
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-s="save"]')) return;
        const notes = $('#note', el).value.trim();
        if (!notes && !$('#label', el).value.trim()) { toast('Write something first'); return; }
        addEvent({ type: 'note', label: $('#label', el).value.trim() || null, notes: notes || null, started_at: whenOf(ctx).toISOString() });
        close(); toast('Saved');
      });
    });
}

function pastSleepSheet() {
  const end = new Date(), start = new Date(Date.now() - HR);
  openSheet('Add past sleep',
    '<div class="field"><span>Fell asleep</span>' + dtHtml('ps', start) + '</div>' +
    '<div class="field"><span>Woke up</span>' + dtHtml('pe', end) + '</div>' +
    '<button class="btn primary big" data-s="save">Save sleep</button>',
    (el, close) => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-s="save"]')) return;
        const s = dtVal(el, 'ps'), en = dtVal(el, 'pe');
        if (!s || !en || en <= s) { toast('Wake time must be after the start'); return; }
        addEvent({ type: 'sleep', started_at: s.toISOString(), ended_at: en.toISOString() });
        close(); toast('Sleep saved');
      });
    });
}

/* ---------- Edit an event ---------- */
function editSheet(id) {
  const e = S.events.find((x) => x.id === id);
  if (!e) return;
  const ranged = e.type === 'sleep' || e.type === 'tummy';
  let fields = '';
  if (e.type === 'feed') fields += '<label class="field">Amount (oz)<input type="number" inputmode="decimal" step="0.5" min="0" id="f-oz" value="' + (e.amount_oz ?? '') + '"></label>';
  if (e.type === 'diaper') fields += '<div class="chips" id="f-kind">' + ['wet', 'dirty', 'both'].map((k) => '<button type="button" class="chip' + (e.diaper_kind === k ? ' on' : '') + '" data-k="' + k + '">' + cap(k) + '</button>').join('') + '</div>';
  if (e.type === 'med' || e.type === 'note') fields += '<label class="field">' + (e.type === 'med' ? 'Name' : 'Title') + '<input type="text" id="f-label" value="' + esc(e.label || '') + '"></label>';
  if (e.type === 'measure') fields += '<div class="split"><label class="field">Weight (lb)<input type="number" inputmode="decimal" step="0.1" id="f-w" value="' + (e.weight_lb ?? '') + '"></label><label class="field">Length (in)<input type="number" inputmode="decimal" step="0.25" id="f-l" value="' + (e.length_in ?? '') + '"></label></div>';
  fields += '<div class="field"><span>' + (ranged ? 'Start' : 'Time') + '</span>' + dtHtml('fs', new Date(e.started_at)) + '</div>';
  if (ranged) fields += '<div class="field"><span>End</span>' + dtHtml('fe', e.ended_at ? new Date(e.ended_at) : null) + '<button type="button" class="chip" data-running="1" style="align-self:flex-start">Still running</button></div>';
  fields += '<label class="field">Notes<textarea id="f-notes">' + esc(e.notes || '') + '</textarea></label>';
  fields += '<p class="note-small" style="margin:0">Logged by ' + esc(who(e) || 'unknown') + '</p>';
  let kind = e.diaper_kind;

  openSheet('Edit ' + eventTitle(e).toLowerCase(),
    fields + '<button class="btn primary big" data-s="save">Save changes</button><div id="delzone"><button class="btn danger big" data-s="del">' + ic('trash') + 'Delete</button></div>',
    (el, close) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-running]')) { $('#fe-d', el).value = ''; $('#fe-t', el).value = ''; return; }
        const k = ev.target.closest('[data-k]');
        if (k) { kind = k.dataset.k; el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === k)); return; }
        const b = ev.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'del') {
          $('#delzone', el).innerHTML = '<p style="margin:0 0 10px">Delete this entry?</p><div class="confirm"><button class="btn" data-s="cancel-del">Cancel</button><button class="btn danger" data-s="confirm-del">Yes, delete</button></div>';
        } else if (b.dataset.s === 'cancel-del') {
          $('#delzone', el).innerHTML = '<button class="btn danger big" data-s="del">' + ic('trash') + 'Delete</button>';
        } else if (b.dataset.s === 'confirm-del') {
          removeEvent(id); close(); toast('Deleted');
        } else if (b.dataset.s === 'save') {
          const patch = { notes: $('#f-notes', el).value.trim() || null };
          const st = dtVal(el, 'fs');
          if (!st) { toast('Check the time'); return; }
          patch.started_at = st.toISOString();
          if (ranged) {
            const en = dtVal(el, 'fe');
            if (en) {
              if (en <= st) { toast('End must be after the start'); return; }
              patch.ended_at = en.toISOString();
            } else {
              const other = S.events.find((x) => x.type === e.type && !x.ended_at && x.id !== id);
              if (other) { toast('Another ' + (e.type === 'sleep' ? 'sleep' : 'tummy time') + ' is already running'); return; }
              patch.ended_at = null;
            }
          }
          if (e.type === 'feed') { const v = parseFloat($('#f-oz', el).value); patch.amount_oz = isNaN(v) ? null : v; }
          if (e.type === 'diaper') patch.diaper_kind = kind;
          if (e.type === 'med' || e.type === 'note') patch.label = $('#f-label', el).value.trim() || null;
          if (e.type === 'measure') { const w = parseFloat($('#f-w', el).value), l = parseFloat($('#f-l', el).value); patch.weight_lb = isNaN(w) ? null : w; patch.length_in = isNaN(l) ? null : l; }
          patchEvent(id, patch); close(); toast('Saved');
        }
      });
    });
}

/* ---------- Tasks: add + calendar ---------- */
function taskSheet(preset, existing) {
  preset = preset || {};
  if (existing) preset = { title: existing.title, rec: existing.recurrence, med: existing.log_as === 'med' };
  const nextHour = existing ? new Date(existing.due_at) : new Date(Math.ceil((Date.now() + 5 * MIN) / HR) * HR);
  openSheet(existing ? 'Edit task' : 'Add task',
    (existing ? '' : '<div class="chips scroll">') + (existing ? '' : TASK_PRESETS.map((p, i) => '<button class="chip' + (preset.label === p.label ? ' on' : '') + '" data-preset="' + i + '">' + p.label + '</button>').join('') + '</div>') +
    '<label class="field">Title<input type="text" id="t-title" aria-label="Title" value="' + esc(preset.title || '') + '"></label>' +
    '<div class="field"><span>Due</span>' + dtHtml('td', nextHour) + '</div>' +
    '<label class="field">Repeat<select id="t-rec"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="every_n_hours">Every N hours</option></select></label>' +
    '<label class="field" id="t-int-wrap" hidden>Hours between<input type="number" inputmode="numeric" min="1" step="1" id="t-int" value="' + ((existing && existing.interval_hours) || 4) + '"></label>' +
    '<label class="toggle"><input type="checkbox" id="t-med"' + (preset.med ? ' checked' : '') + '> Log as medication when checked off</label>' +
    '<button class="btn primary big" data-s="save">' + (existing ? 'Save changes' : 'Save task') + '</button>',
    (el, close) => {
      const rec = $('#t-rec', el);
      rec.value = preset.rec || 'none';
      $('#t-int-wrap', el).hidden = rec.value !== 'every_n_hours';
      rec.addEventListener('change', () => { $('#t-int-wrap', el).hidden = rec.value !== 'every_n_hours'; });
      el.addEventListener('click', (e) => {
        const p = e.target.closest('[data-preset]');
        if (p) {
          const pr = TASK_PRESETS[+p.dataset.preset];
          el.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === p));
          $('#t-title', el).value = pr.title || '';
          rec.value = pr.rec || 'none';
          $('#t-med', el).checked = !!pr.med;
          $('#t-int-wrap', el).hidden = true;
          if (!pr.title) $('#t-title', el).focus();
          return;
        }
        if (!e.target.closest('[data-s="save"]')) return;
        const title = $('#t-title', el).value.trim();
        const due = dtVal(el, 'td');
        if (!title) { toast('Add a title'); return; }
        if (!due) { toast('Check the due time'); return; }
        const recurrence = rec.value;
        const n = parseInt($('#t-int', el).value, 10);
        if (recurrence === 'every_n_hours' && !(n >= 1)) { toast('Hours between must be 1 or more'); return; }
        const row = { title, due_at: due.toISOString(), recurrence, interval_hours: recurrence === 'every_n_hours' ? n : null, log_as: $('#t-med', el).checked ? 'med' : null };
        if (existing) { patchTask(existing.id, row); close(); toast('Task updated'); return; }
        addTask(row);
        close(); toast('Task added');
      });
    });
}

function taskDetailSheet(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  const ms = new Date(t.due_at) - Date.now();
  openSheet(t.title,
    '<p style="margin:0">' + fmtDateTime(t.due_at) + (recurLabel(t) ? ' · ' + recurLabel(t) : '') + '<br><span class="muted">' + (ms < 0 ? 'Overdue by ' + fmtOver(-ms) : 'In ' + fmtDur(ms)) + '</span></p>' +
    '<button class="btn primary big" data-s="done">' + ic('check') + 'Mark done</button>' +
    '<button class="btn big" data-s="edit">Edit</button>' +
    '<button class="btn big" data-s="cal">' + ic('calendar') + 'Add to calendar</button>',
    (el, close) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'done') { close(); completeTask(id); }
        else if (b.dataset.s === 'edit') taskSheet(null, t);
        else if (b.dataset.s === 'cal') calendarSheet(id);
      });
    });
}

const icsStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function rruleFor(t) {
  if (t.recurrence === 'daily') return 'FREQ=DAILY';
  if (t.recurrence === 'weekly') return 'FREQ=WEEKLY';
  if (t.recurrence === 'every_n_hours') return 'FREQ=HOURLY;INTERVAL=' + (t.interval_hours || 4);
  return '';
}
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function calendarSheet(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  const start = new Date(t.due_at), end = new Date(start.getTime() + 15 * MIN);
  const details = 'From the ' + babyName() + ' tracker';
  const rr = rruleFor(t);
  openSheet('Add to calendar',
    '<button class="btn big" data-c="google">Google Calendar</button><button class="btn big" data-c="apple">Apple Calendar (.ics file)</button>' +
    '<p class="note-small" style="margin:0">Apple Reminders and Google Tasks have no reliable link method, so we use Calendar.</p>',
    (el, close) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        if (b.dataset.c === 'google') {
          const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t.title) + '&dates=' + icsStamp(start) + '/' + icsStamp(end) + '&details=' + encodeURIComponent(details) + (rr ? '&recur=' + encodeURIComponent('RRULE:' + rr) : '');
          window.open(url, '_blank', 'noopener');
        } else {
          const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baby tracker//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:' + t.id + '@baby-tracker', 'DTSTAMP:' + icsStamp(new Date()), 'DTSTART:' + icsStamp(start), 'DTEND:' + icsStamp(end),
            'SUMMARY:' + icsEsc(t.title), 'DESCRIPTION:' + icsEsc(details)];
          if (rr) lines.push('RRULE:' + rr);
          lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(t.title), 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
          const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (t.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'task') + '.ics';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        close();
      });
    });
}

/* ---------- Settings, look, and your name ---------- */
function toneHtml() {
  const cur = ls.get('bt_tone', 'auto');
  return '<div class="field"><span>Night Shift color (this phone)</span><div class="chips" id="tones">' +
    [['auto', 'Auto'], ['blue', 'Dad Blue'], ['deep', 'Deep Night']].map((t) => '<button type="button" class="chip' + (cur === t[0] ? ' on' : '') + '" data-tone="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div><p class="note-small" style="margin:0">Auto is Dad Blue by day and a dim amber from 10 PM to 6 AM.</p></div>';
}
function wireTone(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tone]');
    if (!b) return;
    ls.set('bt_tone', b.dataset.tone);
    applyTheme();
    el.querySelectorAll('[data-tone]').forEach((x) => x.classList.toggle('on', x === b));
  });
}
/* Temporary layout readout (round 3). Remove once the numbers are in. */
function layoutReadout() {
  dbgSnap('readout opened');
  const probe = document.getElementById('sa-probe') || (() => { const d = document.createElement('div'); d.id = 'sa-probe'; document.body.appendChild(d); return d; })();
  const cs = getComputedStyle(probe);
  const head = 'safe-area bottom ' + cs.paddingBottom + ', top ' + cs.paddingTop + '\nstandalone ' + (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches) + '   build bt-v6\n' +
    'viewport fix: ' + (document.documentElement.hasAttribute('data-vfix') ? 'ACTIVE (' + document.documentElement.style.getPropertyValue('--app-h') + ')' : 'not active') + '\n' +
    'ms  event  innerH vvH screenH clientH mainSH/CH navBottom appBottom fix\n';
  return head + DBG.map((r) => r.t + ' ' + r.tag + ' ' + r.iH + ' ' + r.vv + ' ' + r.sH + ' ' + r.cH + ' ' + r.mSH + '/' + r.mCH + ' ' + r.nav + ' ' + r.app + ' ' + r.fix).join('\n');
}
function lookHtml(current) {
  return '<div class="stack" id="looks">' + THEMES.map((t) =>
    '<button class="btn' + (current === t[0] ? ' primary' : '') + '" data-look="' + t[0] + '" style="justify-content:space-between"><span>' + t[1] + '</span><span style="font-weight:400;font-size:14px">' + t[2] + '</span></button>').join('') + '</div>';
}
function wireLook(el, onPick) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look]');
    if (!b) return;
    ls.set('bt_theme', b.dataset.look);
    applyTheme();
    if (onPick) onPick();
  });
}
function lookSheet() {
  openSheet('Pick a look', '<p class="note-small" style="margin:0">This is saved on this phone only. Change it any time in Settings.</p>' + lookHtml(ls.get('bt_theme', '')),
    (el, close) => wireLook(el, () => { close(); render(); }));
}
function nameSheet(then) {
  openSheet('What should we call you?',
    '<p class="note-small" style="margin:0">Shown next to the entries you log. Both phones see it.</p>' +
    '<input type="text" id="nm" placeholder="Your first name" autocomplete="given-name" aria-label="Your name">' +
    '<button class="btn primary big" data-s="save">Save</button>',
    (el, close) => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-s="save"]')) return;
        const v = $('#nm', el).value.trim();
        if (!v) { toast('Add a name'); return; }
        setSetting(myNameKey(), v);
        close(); render(); if (then) then();
      });
    });
}

function settingsSheet() {
  const birth = S.settings.birth_datetime ? new Date(S.settings.birth_datetime) : null;
  openSheet('Settings',
    '<label class="field">Baby name<input type="text" id="s-name" value="' + esc(S.settings.baby_name || '') + '" placeholder="Baby"></label>' +
    '<div class="field"><span>Birth date and time</span>' + dtHtml('sb', birth) + '</div>' +
    '<label class="field">Target hours between feeds<input type="number" inputmode="decimal" step="0.25" min="1" id="s-int" value="' + esc(S.settings.feed_interval_target_hours || '3') + '"></label>' +
    '<label class="field">Your name<input type="text" id="s-me" value="' + esc(S.settings[myNameKey()] || '') + '" placeholder="' + esc(S.user.email.split('@')[0]) + '"></label>' +
    '<div class="field"><span>Look (this phone)</span>' + lookHtml(ls.get('bt_theme', 'night-shift')) + '</div>' + toneHtml() +
    '<div class="field"><span>Layout readout (temporary)</span><pre class="dbg" id="dbg">' + esc(layoutReadout()) + '</pre><div class="chips"><button type="button" class="chip" data-s="dbg-refresh">Refresh readout</button><button type="button" class="chip" data-s="vfix-toggle">Viewport fix: ' + (ls.get('bt_vfix', 'on') === 'off' ? 'off' : 'on') + '</button></div></div>' +
    '<button class="btn primary big" data-s="save">Save settings</button>' +
    '<button class="btn ghost big" data-s="signout">Sign out</button>',
    (el, close) => {
      wireTone(el);
      wireLook(el, () => { render(); el.querySelectorAll('[data-look]').forEach((x) => x.classList.toggle('primary', x.dataset.look === ls.get('bt_theme', 'night-shift'))); });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        if (b.dataset.s === 'vfix-toggle') {
          const nowOff = ls.get('bt_vfix', 'on') !== 'off';
          ls.set('bt_vfix', nowOff ? 'off' : 'on');
          fixViewport();
          b.textContent = 'Viewport fix: ' + (nowOff ? 'off' : 'on');
          $('#dbg', el).textContent = layoutReadout();
          return;
        }
        if (b.dataset.s === 'dbg-refresh') { $('#dbg', el).textContent = layoutReadout(); return; }
        if (b.dataset.s === 'signout') { close(); await sb.auth.signOut(); return; }
        if (b.dataset.s === 'save') {
          setSetting('baby_name', $('#s-name', el).value.trim());
          const bd = dtVal(el, 'sb');
          if (bd) setSetting('birth_datetime', bd.toISOString());
          const iv = parseFloat($('#s-int', el).value);
          if (iv >= 1) setSetting('feed_interval_target_hours', iv);
          const me = $('#s-me', el).value.trim();
          if (me) setSetting(myNameKey(), me);
          close(); render(); toast('Settings saved');
        }
      });
    });
}

/* ============================================================
   Actions (delegated)
   ============================================================ */
const actions = {
  tab: (t) => { S.tab = t.dataset.tab; render(); const m = $('#main'); if (m) m.scrollTop = 0; },
  settings: settingsSheet,
  feed: feedSheet,
  diaper: diaperSheet,
  more: moreSheet,
  'sleep-toggle': toggleSleep,
  'tummy-stop': stopTummy,
  edit: (t) => editSheet(t.dataset.id),
  'day-prev': () => { S.tlDay = startOfDay(new Date(S.tlDay.getTime() - DAY + 3 * HR)); render(); },
  'day-next': () => {
    const n = startOfDay(new Date(S.tlDay.getTime() + DAY + 3 * HR));
    if (n.getTime() <= startOfDay(new Date()).getTime()) { S.tlDay = n; render(); }
  },
  'task-add': () => taskSheet(),
  'task-preset': (t) => { const p = TASK_PRESETS[+t.dataset.i]; taskSheet(p); },
  'task-open': (t) => taskDetailSheet(t.dataset.id),
  'task-check': (t) => {
    // Short pop animation (Cozy) before the task completes and the list re-renders.
    t.classList.add('pop');
    setTimeout(() => completeTask(t.dataset.id), 240);
  },
  'task-cal': (t) => calendarSheet(t.dataset.id),
  'sum-range': (t) => { S.sumRange = t.dataset.r; render(); },
  'copy-summary': async () => {
    const text = buildSummary(S.sumRange);
    try { await navigator.clipboard.writeText(text); toast('Summary copied'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Summary copied'); } catch (e2) { toast('Could not copy'); }
      ta.remove();
    }
  }
};

document.addEventListener('click', (e) => {
  if (e.target.closest('#sheet-root')) return;
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = actions[t.dataset.act];
  if (fn) fn(t, e);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('nrow')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'dayjump' && e.target.value) {
    const [y, m, d] = e.target.value.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    const today = startOfDay(new Date());
    S.tlDay = picked > today ? today : picked;
    render();
  }
});

/* ============================================================
   Boot
   ============================================================ */
async function start() {
  if (S.started) return;
  S.started = true;
  loadCache();
  render();
  await flush();
  await loadAll();
  subscribe();
  render();
  const askLook = () => { if (!ls.get('bt_theme', '')) lookSheet(); };
  if (!S.settings[myNameKey()]) nameSheet(askLook); else askLook();
}
function stop() {
  S.started = false;
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  S.events = []; S.tasks = []; S.settings = {};
  ls.set('bt_cache', 'null');
  closeSheet(); render();
}

setInterval(() => {
  applyTheme();
  if (!S.user) return;
  const a = document.activeElement;
  if (a && a.closest && a.closest('#main') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  render();
}, 30000);
// Retry a stuck queue, and keep the badge honest.
setInterval(() => { if (S.user && qLoad().length) flush(); updateSyncUI(); }, 5000);

window.addEventListener('online', () => { flush().then(() => S.user && loadAll().then(render)); updateSyncUI(); });
window.addEventListener('offline', updateSyncUI);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') applyTheme();
  if (document.visibilityState === 'visible' && S.user && S.started) { flush().then(() => loadAll().then(render)); }
});

(async function boot() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const { data } = await sb.auth.getSession();
  S.user = data && data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((ev, session) => {
    const had = !!S.user;
    S.user = session ? session.user : null;
    if (S.user && !had) setTimeout(start, 0);
    if (!S.user && had) setTimeout(stop, 0);
  });
  if (S.user) start(); else render();
})();
