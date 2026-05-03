/**
 * ScholarFeedback AI — Submission & Auto-Save Service
 * Supports both Mock and Supabase modes.
 */
import DB from '../supabase-client.js';
import Store from '../store.js';

let _saveTimeout = null;

/** Detect language from text content */
function detectLanguage(text) {
  return /[çğışöüÇĞİŞÖÜ]/.test(text) ? 'tr' : 'en';
}

/** Find an existing submission for a task+user in mock or DB */
async function _findExisting(taskId, userId) {
  if (DB.isMock()) {
    return DB.mock.submissions.find(
      s => s.task_id === taskId && s.student_id === userId
    ) || null;
  }
  const client = DB.client() || window.supabaseClient;
  if (!client) return null;
  try {
    // Use limit(1) instead of maybeSingle() to avoid 406 errors from RLS
    const { data, error } = await client
      .from('submissions')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('student_id', userId)
      .limit(1);
    if (error) {
      console.warn('[SubmissionService] _findExisting error:', error.message, error.code);
      return null;
    }
    return (data && data.length > 0) ? data[0] : null;
  } catch (e) {
    console.warn('[SubmissionService] _findExisting exception:', e);
    return null;
  }
}

/** Refresh submissions in store after a write */
async function _refreshStore(userId) {
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

    const client = DB.client() || window.supabaseClient;
    if (!client) return;

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
   * Final submit. Creates or updates the submission with status SUBMITTED.
   * Always overwrites content so resubmit shows the latest version.
   */
  async submitFinal(taskId, content) {
    const user = Store.getState('currentUser');
    if (!user) { Store.toast('error', 'Oturum bulunamadı, lütfen tekrar giriş yapın.'); return null; }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    const existing = await _findExisting(taskId, user.id);

    if (DB.isMock()) {
      const payload = {
        content,
        status: 'SUBMITTED',
        word_count: wordCount,
        language_detected: detectLanguage(content),
        submitted_at: now,
        updated_at: now
      };
      if (existing) {
        await DB.query('submissions', { update: payload, eq: ['id', existing.id] });
      } else {
        await DB.query('submissions', { insert: { ...payload, id: 'sub-' + Date.now().toString(36), task_id: taskId, student_id: user.id } });
      }
      await _refreshStore(user.id);
      return true;
    }

    // Supabase mode
    const client = DB.client() || window.supabaseClient;
    if (!client) { Store.toast('error', 'Veritabanı bağlantısı kurulamadı.'); return null; }

    const payload = {
      task_id: taskId,
      student_id: user.id,
      content,
      status: 'SUBMITTED',
      word_count: wordCount,
      language_detected: detectLanguage(content),
      submitted_at: now,
      updated_at: now
    };

    let err;
    if (existing) {
      const res = await DB.query('submissions', { update: payload, eq: ['id', existing.id] });
      err = res.error;
      if (err) console.error('[SubmissionService] UPDATE error:', err.message, err.code, err.details);
    } else {
      const res = await DB.query('submissions', { insert: { ...payload, id: DB.generateUUID() } });
      err = res.error;
      if (err) console.error('[SubmissionService] INSERT error:', err.message, err.code, err.details);
    }

    if (err) {
      Store.toast('error', 'Teslim edilemedi: ' + (err.message || 'Veritabı hatası — RLS politikasını kontrol edin.'));
      return null;
    }
    await _refreshStore(user.id);
    return true;
  }
};

export default SubmissionService;
