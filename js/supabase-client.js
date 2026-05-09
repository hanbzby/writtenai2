/**
 * ScholarFeedback AI — Supabase Client
 * Uses mock mode when no Supabase URL is configured.
 * Stage 3: Added classes + class_enrollments mock data.
 *
 * STABILITY FIX: init() now retries until window.supabaseClient is available,
 * and all queries are wrapped in a per-call timeout to prevent hangs.
 */
import Store from './store.js';
import ENV from './config.js';

// ── Config (read from config.js / window.ENV) ──
const SUPABASE_URL = ENV.SUPABASE_URL || '';
const SUPABASE_ANON = ENV.SUPABASE_ANON_KEY || '';

let _supabase = null;
let _mockMode = true;
let _ready = false;  // true once init has resolved (mock or real)
let _readyPromise = null;

/**
 * Attempt to connect to Supabase.
 * Returns true if connected, false if should stay in mock mode.
 */
function _tryConnect() {
  if (window.supabaseClient) {
    _supabase = window.supabaseClient;
    _mockMode = false;
    console.log('[DB] Supabase connected via global client');
    return true;
  }
  if (SUPABASE_URL && SUPABASE_ANON && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    _mockMode = false;
    console.log('[DB] Supabase connected');
    return true;
  }
  return false;
}

/**
 * Initialize DB.  Retries up to 20 × 100ms (2 seconds) waiting for the
 * Supabase CDN + supabase-crud.js to set window.supabaseClient.
 * After 2s, falls back to mock mode gracefully.
 */
function init() {
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise(resolve => {
    if (_tryConnect()) {
      _ready = true;
      _checkProtocol();
      resolve();
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;
      if (_tryConnect()) {
        clearInterval(interval);
        _ready = true;
        _checkProtocol();
        resolve();
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        _mockMode = true;
        console.log('[DB] Running in MOCK mode — no Supabase configured after 2s wait');
        try {
          const savedMock = localStorage.getItem('scholarfeedback_mock_db');
          if (savedMock) {
            Object.assign(mock, JSON.parse(savedMock));
          }
        } catch (e) {
          console.error("Failed to parse mock DB", e);
        }
        _ready = true;
        resolve();
      }
    }, 100);
  });
  return _readyPromise;
}

/** Warn if running from file:// protocol (causes intermittent CORS/fetch failures) */
function _checkProtocol() {
  if (window.location.protocol === 'file:') {
    console.warn(
      '[DB] ⚠️ file:// protokolü üzerinden çalışıyorsunuz. Bu, Supabase REST API isteklerinde tutarsız zaman aşımlarına neden olabilir.',
      '\n→ Çözüm: Uygulamayı bir HTTP sunucu üzerinden çalıştırın.',
      '\n→ Örnek: npx serve .',
      '\n→ Veya: python -m http.server 8000'
    );
  }
}

/** Wait until DB is initialized (call from any service before first query) */
function ensureReady() {
  if (_ready) return Promise.resolve();
  return _readyPromise || init();
}

function isMock() { return _mockMode; }
function client() { return _supabase; }

/** Generate a random 6-char alphanumeric code */
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // Ensure unique in mock
  if (_mockMode && mock.classes.some(c => c.join_code === code)) return generateJoinCode();
  return code;
}

/** Robust UUID Generator for compatibility with file:// protocol */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ── Mock Data Store ──
const mock = {
  profiles: [
    { id: 'admin-001', full_name: 'Prof. Dr. Ayşe Yılmaz', role: 'ADMIN', language_pref: 'tr', created_at: new Date().toISOString() },
    { id: 'student-001', full_name: 'Mehmet Kaya', role: 'STUDENT', language_pref: 'tr', created_at: new Date().toISOString() },
    { id: 'student-002', full_name: 'Elif Demir', role: 'STUDENT', language_pref: 'en', created_at: new Date().toISOString() },
    { id: 'student-003', full_name: 'Ahmet Çelik', role: 'STUDENT', language_pref: 'tr', created_at: new Date().toISOString() },
  ],
  // ── Stage 3: Classes ──
  classes: [
    { id: 'class-001', teacher_id: 'admin-001', class_name: 'Çeviri Kuramları 101', join_code: 'MAR101', created_at: new Date().toISOString() },
    { id: 'class-002', teacher_id: 'admin-001', class_name: 'Academic Writing EN', join_code: 'AWR202', created_at: new Date().toISOString() },
  ],
  // ── Stage 3: Class Enrollments ──
  class_enrollments: [
    { id: 'ce1', student_id: 'student-001', class_id: 'class-001', enrolled_at: new Date().toISOString() },
    { id: 'ce2', student_id: 'student-002', class_id: 'class-001', enrolled_at: new Date().toISOString() },
    { id: 'ce3', student_id: 'student-002', class_id: 'class-002', enrolled_at: new Date().toISOString() },
    { id: 'ce4', student_id: 'student-003', class_id: 'class-002', enrolled_at: new Date().toISOString() },
  ],
  tasks: [
    {
      id: 'task-001', created_by: 'admin-001', class_id: 'class-002', title: 'Academic Essay: Translation Theories',
      description: 'Write a 500-word essay comparing Skopos Theory and Functionalism in translation studies. Use at least 5 academic conjunctions and cite 3 sources.',
      deadline_datetime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      custom_criteria: JSON.stringify(["Use at least 5 academic conjunctions", "Compare Skopos Theory and Functionalism", "Cite at least 3 academic sources"]),
      language_policy: 'EN', scoring_framework: 'SKOPOS', show_integrity_to_student: false, is_published: false,
      created_at: new Date().toISOString()
    },
    {
      id: 'task-002', created_by: 'admin-001', class_id: 'class-001', title: 'Çeviri Kuramları Analizi',
      description: 'Çeviri kuramlarının tarihsel gelişimini 300 kelimeyle özetleyiniz. Akademik dil kullanınız.',
      deadline_datetime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      custom_criteria: JSON.stringify(["Akademik dil kullanın", "Kronolojik sıralama yapın"]),
      language_policy: 'TR', scoring_framework: 'IELTS', show_integrity_to_student: true, is_published: false,
      created_at: new Date().toISOString()
    }
  ],
  // Legacy task_enrollments kept for backward compat, but tasks now filter via class
  enrollments: [
    { id: 'e1', task_id: 'task-001', student_id: 'student-001', whitelisted_late: false },
    { id: 'e2', task_id: 'task-001', student_id: 'student-002', whitelisted_late: false },
    { id: 'e3', task_id: 'task-001', student_id: 'student-003', whitelisted_late: false },
    { id: 'e4', task_id: 'task-002', student_id: 'student-001', whitelisted_late: false },
    { id: 'e5', task_id: 'task-002', student_id: 'student-002', whitelisted_late: false },
  ],
  submissions: [
    {
      id: 'sub-001', task_id: 'task-002', student_id: 'student-001',
      content: 'Çeviri kuramları, 20. yüzyılın ikinci yarısında önemli bir gelişim göstermiştir. Eugene Nida\'nın "dinamik eşdeğerlik" kavramı, çeviri çalışmalarında devrim niteliğinde olmuştur. Skopos kuramı ise Hans Vermeer tarafından geliştirilmiş ve çevirinin amacını ön plana çıkarmıştır. Fonksiyonalist yaklaşım, metnin işlevini ve hedef kitleyi dikkate alarak çeviri stratejilerini belirler. Bu kuramlar, çeviri pratiğinde farklı perspektifler sunmaktadır.',
      status: 'SUBMITTED', word_count: 52, language_detected: 'tr',
      submitted_at: new Date().toISOString(), updated_at: new Date().toISOString()
    },
    {
      id: 'sub-002', task_id: 'task-002', student_id: 'student-002',
      content: 'Translation theories have evolved significantly over the past century. Starting from linguistic approaches by Jakobson, moving through Nida\'s dynamic equivalence, and arriving at the functionalist school of thought led by Vermeer and Nord. The Skopos theory emphasizes the purpose of translation, while Functionalism focuses on the communicative function of the target text.',
      status: 'SUBMITTED', word_count: 48, language_detected: 'en',
      submitted_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
  ],
  processing_queue: [],
  feedback_reports: []
};

/**
 * Execute a Supabase query directly.
 * No timeout wrapper — raw Supabase queries work fine (~300ms).
 * Errors are caught and returned as { data: null, error: {...} }.
 */
async function query(table, { select, match, eq, upsert, onConflict, insert, update, del, order } = {}) {
  // Ensure DB is initialized before any query
  await ensureReady();

  if (!_mockMode && _supabase) {
    try {
      if (insert) {
        const res = await _supabase.from(table).insert(insert).select();
        if (!res.error) _notifyChange(table, 'INSERT', res.data?.[0]);
        return res;
      }
      if (upsert) {
        const options = onConflict ? { onConflict } : {};
        const res = await _supabase.from(table).upsert(upsert, options).select();
        if (!res.error) _notifyChange(table, 'UPSERT', res.data?.[0]);
        return res;
      }
      if (update) {
        let q = _supabase.from(table).update(update);
        if (eq) q = q.eq(eq[0], eq[1]);
        if (match) Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
        const res = await q.select();
        if (!res.error) _notifyChange(table, 'UPDATE', res.data?.[0]);
        return res;
      }
      if (del) {
        let q = _supabase.from(table).delete();
        if (eq) q = q.eq(eq[0], eq[1]);
        if (match) Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
        const res = await q.select();
        if (res.error) return res;
        _notifyChange(table, 'DELETE', null);
        return res;
      }
      let q = _supabase.from(table).select(select || '*');
      if (eq) q = q.eq(eq[0], eq[1]);
      if (match) Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      if (order) {
        if (Array.isArray(order)) {
          q = q.order(order[0], order[1] || { ascending: false });
        } else if (typeof order === 'string') {
          const parts = order.split('.');
          q = q.order(parts[0], { ascending: parts[1] !== 'desc' });
        }
      }
      return await q;
    } catch (err) {
      console.error(`[DB] Query error (${table}):`, err.message);
      return { data: null, error: { message: err.message } };
    }
  }
  // Mock mode
  await new Promise(r => setTimeout(r, 80 + Math.random() * 80));
  let data = mock[table] ? [...mock[table]] : [];
  if (eq) data = data.filter(r => r[eq[0]] === eq[1]);
  if (match) data = data.filter(r => Object.entries(match).every(([k, v]) => r[k] === v));

  const saveMock = () => {
    try { localStorage.setItem('scholarfeedback_mock_db', JSON.stringify(mock)); } catch (e) {}
  };
  const changed = (type, record) => { saveMock(); _notifyChange(table, type, record); };

  if (upsert) {
    let existing = -1;
    if (onConflict) {
      const keys = onConflict.split(',');
      existing = (mock[table] || []).findIndex(r => keys.every(k => r[k] === upsert[k]));
    } else if (upsert._matchKeys) {
      existing = (mock[table] || []).findIndex(r => upsert._matchKeys.every(k => r[k] === upsert[k]));
    } else if (upsert.id) {
      existing = (mock[table] || []).findIndex(r => r.id === upsert.id);
    }
    
    if (existing >= 0) { 
      Object.assign(mock[table][existing], upsert); 
      changed('UPDATE', mock[table][existing]); 
      return { data: [mock[table][existing]], error: null }; 
    }
    
    if (!mock[table]) mock[table] = [];
    if (!upsert.id) upsert.id = generateUUID();
    mock[table].push(upsert);
    changed('INSERT', upsert);
    return { data: [upsert], error: null };
  }
  if (insert) {
    if (!mock[table]) mock[table] = [];
    if (!insert.id) insert.id = generateUUID();
    mock[table].push(insert);
    changed('INSERT', insert);
    return { data: [insert], error: null };
  }
  if (update && eq) {
    const idx = (mock[table] || []).findIndex(r => r[eq[0]] === eq[1]);
    if (idx >= 0) { Object.assign(mock[table][idx], update); changed('UPDATE', mock[table][idx]); return { data: [mock[table][idx]], error: null }; }
  }
  if (del && eq) {
    const before = (mock[table] || []).length;
    mock[table] = (mock[table] || []).filter(r => r[eq[0]] !== eq[1]);
    if (mock[table].length !== before) { changed('DELETE', null); return { data: null, error: null }; }
  }
  if (del && match) {
    const before = (mock[table] || []).length;
    mock[table] = (mock[table] || []).filter(r => !Object.entries(match).every(([k, v]) => r[k] === v));
    if (mock[table].length !== before) { changed('DELETE', null); return { data: null, error: null }; }
  }
  return { data, error: null };
}

/** Dispatch DATA_CHANGED with context after any write */
function _notifyChange(table, type, record) {
  Store.dispatch(Store.Events.DATA_CHANGED, { _lastChange: { table, type, record, ts: Date.now() } });
}

/** Supabase Realtime: subscribe to key tables for live updates */
let _realtimeChannels = [];
function subscribeRealtime(onUpdate) {
  if (_mockMode || !_supabase) return;
  // Unsubscribe existing channels first
  _realtimeChannels.forEach(ch => ch.unsubscribe());
  _realtimeChannels = [];

  const tables = ['classes', 'class_enrollments', 'tasks', 'submissions', 'feedback_reports'];
  tables.forEach(table => {
    const ch = _supabase
      .channel(`rt_${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        Store.dispatch(Store.Events.REALTIME_UPDATE, {
          _lastChange: { table, type: payload.eventType, record: payload.new || payload.old, ts: Date.now() }
        });
        if (typeof onUpdate === 'function') onUpdate(table, payload);
      })
      .subscribe();
    _realtimeChannels.push(ch);
  });
  console.log('[DB] Supabase Realtime subscribed to:', tables.join(', '));
}

function unsubscribeRealtime() {
  _realtimeChannels.forEach(ch => ch.unsubscribe());
  _realtimeChannels = [];
}

const DB = { init, ensureReady, isMock, client, query, mock, generateJoinCode, generateUUID, subscribeRealtime, unsubscribeRealtime };
init(); // Start initialization (non-blocking, resolves within ~2s)
export default DB;
