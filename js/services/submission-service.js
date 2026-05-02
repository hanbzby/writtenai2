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
  const { data } = await client
    .from('submissions')
    .select('id, status')
    .eq('task_id', taskId)
    .eq('student_id', userId)
    .maybeSingle();
  return data || null;
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
        Object.assign(existing, { content, word_count: wordCount, language_detected: detectLanguage(content), updated_at: now });
      } else {
        DB.mock.submissions.push({
          id: 'sub-' + Date.now().toString(36),
          task_id: taskId,
          student_id: user.id,
          content,
          status: 'DRAFT',
          word_count: wordCount,
          language_detected: detectLanguage(content),
          submitted_at: now,
          updated_at: now
        });
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
      await client.from('submissions').update(payload).eq('id', existing.id);
    } else {
      await client.from('submissions').insert([{ ...payload, id: DB.generateUUID(), status: 'DRAFT', submitted_at: now }]);
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
      if (existing) {
        // Update in place (resubmit)
        Object.assign(existing, {
          content,
          status: 'SUBMITTED',
          word_count: wordCount,
          language_detected: detectLanguage(content),
          submitted_at: now,
          updated_at: now
        });
      } else {
        DB.mock.submissions.push({
          id: 'sub-' + Date.now().toString(36),
          task_id: taskId,
          student_id: user.id,
          content,
          status: 'SUBMITTED',
          word_count: wordCount,
          language_detected: detectLanguage(content),
          submitted_at: now,
          updated_at: now
        });
      }
      // Persist to localStorage
      try { localStorage.setItem('scholarfeedback_mock_db', JSON.stringify(DB.mock)); } catch(e) {}
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
      const res = await client.from('submissions').update(payload).eq('id', existing.id);
      err = res.error;
    } else {
      const res = await client.from('submissions').insert([{ ...payload, id: DB.generateUUID() }]);
      err = res.error;
    }

    if (err) { Store.toast('error', 'Teslim edilemedi: ' + err.message); return null; }
    await _refreshStore(user.id);
    return true;
  }
};

export default SubmissionService;
