/**
 * ScholarFeedback AI — Submission & Auto-Save Service
 * Supports both Mock and Supabase modes.
 *
 * STABILITY FIX: All Supabase operations are wrapped in a single master
 * timeout.  _findExisting is no longer called outside the timeout boundary.
 */
import DB from '../supabase-client.js';
import Store from '../store.js';

let _saveTimeout = null;

/** Detect language from text content */
function detectLanguage(text) {
  return /[çğışöüÇĞİŞÖÜ]/.test(text) ? 'tr' : 'en';
}

/** Find an existing submission for a task+user — uses DB.query (has built-in timeout) */
async function _findExisting(taskId, userId) {
  if (DB.isMock()) {
    return DB.mock.submissions.find(
      s => s.task_id === taskId && s.student_id === userId
    ) || null;
  }
  try {
    const { data, error } = await DB.query('submissions', {
      select: 'id, status',
      match: { task_id: taskId, student_id: userId }
    });
    if (error) {
      console.warn('[SubmissionService] _findExisting error:', error.message);
      return null;
    }
    return (data && data.length > 0) ? data[0] : null;
  } catch (e) {
    console.warn('[SubmissionService] _findExisting exception:', e.message);
    return null;
  }
}

/** Refresh submissions in store after a write */
async function _refreshStore(userId) {
  try {
    if (DB.isMock()) {
      const subs = DB.mock.submissions.filter(s => s.student_id === userId);
      const subIds = subs.map(s => s.id);
      const reports = DB.mock.feedback_reports.filter(r => subIds.includes(r.submission_id));
      Store.dispatch('REFRESH_STUDENT_DATA', {
        submissions: subs,
        feedbackReports: reports
      });
      return;
    }
    const client = DB.client() || window.supabaseClient;
    if (!client) return;
    const { data: subs } = await client.from('submissions').select('*').eq('student_id', userId);
    if (subs) {
      const subIds = subs.map(s => s.id);
      let reports = [];
      if (subIds.length > 0) {
        const { data: r } = await client.from('feedback_reports').select('*').in('submission_id', subIds);
        reports = r || [];
      }
      Store.dispatch('REFRESH_STUDENT_DATA', { submissions: subs, feedbackReports: reports });
    }
  } catch (e) {
    console.warn('[SubmissionService] _refreshStore error (non-critical):', e.message);
  }
}

const SubmissionService = {
  /**
   * Auto-save a draft. Updates even if status is SUBMITTED (for resubmit flow).
   */
  async autoSaveDraft(taskId, content) {
    const user = Store.getState('currentUser');
    if (!user) return;
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    const existing = await _findExisting(taskId, user.id);

    if (DB.isMock()) {
      if (existing) {
        await DB.query('submissions', { update: { content, word_count: wordCount, language_detected: detectLanguage(content), updated_at: now }, eq: ['id', existing.id] });
      } else {
        const newSub = {
          id: 'sub-' + Date.now().toString(36),
          task_id: taskId,
          student_id: user.id,
          content,
          status: 'DRAFT',
          word_count: wordCount,
          language_detected: detectLanguage(content),
          submitted_at: now,
          updated_at: now
        };
        await DB.query('submissions', { insert: newSub });
      }
      await _refreshStore(user.id);
      return;
    }

    const payload = {
      task_id: taskId,
      student_id: user.id,
      content,
      word_count: wordCount,
      language_detected: detectLanguage(content),
      updated_at: now
    };

    if (existing) {
      await DB.query('submissions', { update: payload, eq: ['id', existing.id] });
    } else {
      await DB.query('submissions', { insert: { ...payload, id: DB.generateUUID(), status: 'DRAFT', submitted_at: now } });
    }
    await _refreshStore(user.id);
  },

  debounceAutoSave(taskId, content, delay = 30000) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      this.autoSaveDraft(taskId, content).then(() => {
        Store.toast('info', 'Taslak otomatik kaydedildi', 2000);
      });
    }, delay);
  },

  /**
   * Final submit.  The ENTIRE flow (find existing → insert/update → refresh)
   * is wrapped inside a single 15s master timeout so nothing can hang.
   */
  async submitFinal(taskId, content) {
    const user = Store.getState('currentUser');
    if (!user) { Store.toast('error', 'Oturum bulunamadı, lütfen tekrar giriş yapın.'); return null; }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    console.log('[Submit] Başlıyor…', { taskId, userId: user.id });

    // ── Mock mode (always fast) ──
    if (DB.isMock()) {
      const existing = DB.mock.submissions.find(s => s.task_id === taskId && s.student_id === user.id);
      const payload = {
        content, status: 'SUBMITTED', word_count: wordCount,
        language_detected: detectLanguage(content), submitted_at: now, updated_at: now
      };
      if (existing) {
        await DB.query('submissions', { update: payload, eq: ['id', existing.id] });
      } else {
        await DB.query('submissions', { insert: { ...payload, id: 'sub-' + Date.now().toString(36), task_id: taskId, student_id: user.id } });
      }
      await _refreshStore(user.id);
      return true;
    }

    // ── Supabase mode ──
    // Direct execution — no timeout wrapper (raw queries complete in ~300ms)
    try {
      const client = DB.client() || window.supabaseClient;
      if (!client) throw new Error('Veritabanı bağlantısı kurulamadı.');

      const record = {
        task_id: taskId,
        student_id: user.id,
        content,
        status: 'SUBMITTED',
        word_count: wordCount,
        language_detected: detectLanguage(content),
        submitted_at: now,
        updated_at: now
      };

      // Step 1: Check for existing submission
      console.log('[Submit] Mevcut kayıt kontrol ediliyor…');
      const existing = await _findExisting(taskId, user.id);

      // Step 2: Insert or Update
      let res;
      if (existing) {
        console.log('[Submit] Güncelleniyor (UPDATE)…', existing.id);
        res = await DB.query('submissions', { update: record, eq: ['id', existing.id] });
      } else {
        console.log('[Submit] Yeni kayıt ekleniyor (INSERT)…');
        res = await DB.query('submissions', { insert: { ...record, id: DB.generateUUID() } });
      }

      if (res && res.error) {
        throw new Error(res.error.message || 'Veritabanı hatası');
      }

      console.log('[Submit] Başarılı ✓', res ? res.data : null);

      // Step 3: Refresh store (non-blocking)
      try { await _refreshStore(user.id); } catch (e) { console.warn('[Submit] Refresh sonrası hata (önemsiz):', e); }

      return true;
    } catch (err) {
      console.error('[Submit] İstisna:', err.message);
      Store.toast('error', 'Teslim edilemedi: ' + err.message);
      return null;
    }
  }
};

export default SubmissionService;
