/**
 * ScholarFeedback AI — Submission & Auto-Save Service
 */
import DB from '../supabase-client.js';
import Store from '../store.js';
import FileParser from '../utils/file-parser.js';

let _saveTimeout = null;

const SubmissionService = {
  async loadSubmissionsForUser() {
    if (!window.supabaseClient) { console.warn('Veritabanı bağlantısı kurulamadı'); return []; }
    Store.dispatch(Store.Events.LOADING, true);
    
    // Use dynamic user from Supabase as requested
    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) {
       Store.dispatch(Store.Events.LOADING, false);
       return [];
    }
    const userId = user.id;

    const { data: subsData, error: subsError } = await window.supabaseClient.from('submissions').select('*').eq('student_id', userId);
    
    if (!subsError && subsData) {
      Store.dispatch(Store.Events.SUBMISSIONS_LOADED, { submissions: subsData });
      
      const subIds = subsData.map(s => s.id);
      if (subIds.length > 0) {
        const { data: reportsData } = await window.supabaseClient.from('feedback_reports').select('*').in('submission_id', subIds);
        if (reportsData) {
          Store.dispatch(Store.Events.FEEDBACK_READY, { feedbackReports: reportsData });
        }
      }
    }
    
    Store.dispatch(Store.Events.LOADING, false);
    return subsData || [];
  },

  async autoSaveDraft(taskId, content) {
    if (!window.supabaseClient) return;
    const user = Store.getState('currentUser');
    if (!user) return;

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const sub = {
      task_id: taskId,
      student_id: user.id,
      content: content,
      status: 'DRAFT',
      word_count: wordCount,
      language_detected: FileParser.detectLanguage(content),
      updated_at: new Date().toISOString()
    };

    // Real Supabase auto-save
    // We first check if a submission exists for this task & user
    const { data: existing } = await window.supabaseClient.from('submissions')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('student_id', user.id)
      .single();

    if (existing && existing.status === 'SUBMITTED') return;

    if (existing) {
      sub.id = existing.id;
      await window.supabaseClient.from('submissions').update(sub).eq('id', existing.id);
    } else {
      sub.submitted_at = new Date().toISOString();
      await window.supabaseClient.from('submissions').insert([sub]);
    }
    
    // Refresh local store silently
    const { data } = await window.supabaseClient.from('submissions').select('*').eq('student_id', user.id);
    if (data) Store.dispatch(Store.Events.SUBMISSIONS_LOADED, { submissions: data });
  },

  debounceAutoSave(taskId, content, delay = 30000) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      this.autoSaveDraft(taskId, content).then(() => {
        Store.toast('success', 'Draft auto-saved', 2000);
      });
    }, delay);
  },
  
  async submitFinal(taskId, content) {
    if (!window.supabaseClient) { alert('Veritabanı bağlantısı kurulamadı'); return null; }
    const user = Store.getState('currentUser');
    if (!user) return null;
    
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const sub = {
      task_id: taskId,
      student_id: user.id,
      content: content,
      status: 'SUBMITTED',
      word_count: wordCount,
      language_detected: FileParser.detectLanguage(content),
      updated_at: new Date().toISOString()
    };

    const { data: existing } = await window.supabaseClient.from('submissions')
      .select('id')
      .eq('task_id', taskId)
      .eq('student_id', user.id)
      .single();

    if (existing) {
      await window.supabaseClient.from('submissions').update(sub).eq('id', existing.id);
    } else {
      sub.submitted_at = new Date().toISOString();
      await window.supabaseClient.from('submissions').insert([sub]);
    }
    
    await this.loadSubmissionsForUser(user.id);
    return true;
  }
};

export default SubmissionService;
