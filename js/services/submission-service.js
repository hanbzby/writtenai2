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
   * Final submit. Pure UPSERT — no pre-flight SELECT needed.
   * PostgreSQL handles insert-vs-update via UNIQUE(task_id, student_id).
   * 15s timeout prevents hanging. Always returns true (success) or null (failure).
   */
  async submitFinal(taskId, content) {
    const user = Store.getState('currentUser');
    if (!user) { Store.toast('error', 'Oturum bulunamadı, lütfen tekrar giriş yapın.'); return null; }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const now = new Date().toISOString();

    console.log('[Submit] Başlıyor…', { taskId, userId: user.id });

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

    // ── Supabase mode: pure UPSERT, no pre-flight SELECT ──
    const client = DB.client() || window.supabaseClient;
    if (!client) { Store.toast('error', 'Veritabanı bağlantısı kurulamadı.'); return null; }

    // Provide a UUID for new inserts. On conflict (existing record), PostgreSQL
    // Yeniden teslimlerde (UPDATE) mevcut id'nin ezilmemesi ve yeni kayıt eklenecekse (INSERT)
    // Postgres'in kendi UUID'sini üretebilmesi için id alanını record'a dahil etmiyoruz.
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

    console.log('[Submit] Upsert yapılıyor…');

    try {
      // Use the application's standard DB.query wrapper with onConflict
      const upsertPromise = DB.query('submissions', {
        upsert: record,
        onConflict: 'task_id,student_id'
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Bağlantı 15 saniye içinde tamamlanamadı. Lütfen internet bağlantınızı ve Supabase ayarlarını kontrol edin.')), 15000)
      );

      const res = await Promise.race([upsertPromise, timeoutPromise]);
      
      if (res.error) {
        console.error('[Submit] Supabase hatası:', res.error);
        Store.toast('error', 'Teslim edilemedi: ' + (res.error.message || 'Veritabanı hatası'));
        return null;
      }

      console.log('[Submit] Başarılı ✓', res.data);
      // DB.query automatically calls _notifyChange which triggers DATA_CHANGED
      await _refreshStore(user.id);
      return true;

    } catch (err) {
      console.error('[Submit] İstisna:', err.message);
      Store.toast('error', 'Teslim edilemedi: ' + err.message);
      return null;
    }
  }
};

export default SubmissionService;
