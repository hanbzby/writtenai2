/**
 * ScholarFeedback AI — Submission & Auto-Save Service
 */
import DB from '../supabase-client.js';
import Store from '../store.js';
import FileParser from '../utils/file-parser.js';

let _saveTimeout = null;

const SubmissionService = {
  async loadSubmissionsForUser() {
    Store.dispatch(Store.Events.LOADING, true);
    
    // Use dynamic user from Supabase as requested
    const { data: { user }, error: authError } = await DB.client().auth.getUser();
    if (authError || !user) {
       Store.dispatch(Store.Events.LOADING, false);
       return [];
    }
    const userId = user.id;

    const { data: subsData, error: subsError } = await DB.query('submissions', { eq: ['student_id', userId] });
    
    if (!subsError && subsData) {
      Store.dispatch(Store.Events.SUBMISSIONS_LOADED, { submissions: subsData });
      
      const subIds = subsData.map(s => s.id);
      if (subIds.length > 0) {
        const { data: reportsData } = await DB.client().from('feedback_reports').select('*').in('submission_id', subIds);
        if (reportsData) {
          Store.dispatch(Store.Events.FEEDBACK_READY, { feedbackReports: reportsData });
        }
      }
    }
    
    Store.dispatch(Store.Events.LOADING, false);
    return subsData || [];
  },

  async autoSaveDraft(taskId, content) {
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

    if (DB.isMock()) {
      const existingIdx = DB.mock.submissions.findIndex(s => s.task_id === taskId && s.student_id === user.id);
      if (existingIdx >= 0) {
        if (DB.mock.submissions[existingIdx].status === 'SUBMITTED') return; // Don't overwrite submitted
        Object.assign(DB.mock.submissions[existingIdx], sub);
      } else {
        sub.id = 'sub-' + Date.now().toString(36);
        sub.submitted_at = new Date().toISOString();
        DB.mock.submissions.push(sub);
      }
      this.loadSubmissionsForUser(user.id);
      return;
    }

    // Real Supabase auto-save
    // We first check if a submission exists for this task & user
    const { data: existing } = await DB.client().from('submissions')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('student_id', user.id)
      .single();

    if (existing && existing.status === 'SUBMITTED') return;

    if (existing) {
      sub.id = existing.id;
      await DB.client().from('submissions').update(sub).eq('id', existing.id);
    } else {
      sub.submitted_at = new Date().toISOString();
      await DB.client().from('submissions').insert([sub]);
    }
    
    // Refresh local store silently
    const { data } = await DB.query('submissions', { eq: ['student_id', user.id] });
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

    if (DB.isMock()) {
      const existingIdx = DB.mock.submissions.findIndex(s => s.task_id === taskId && s.student_id === user.id);
      if (existingIdx >= 0) {
        Object.assign(DB.mock.submissions[existingIdx], sub);
      } else {
        sub.id = 'sub-' + Date.now().toString(36);
        sub.submitted_at = new Date().toISOString();
        DB.mock.submissions.push(sub);
      }
      return DB.mock.submissions.find(s => s.task_id === taskId && s.student_id === user.id);
    }

    const { data: existing } = await DB.client().from('submissions')
      .select('id')
      .eq('task_id', taskId)
      .eq('student_id', user.id)
      .single();

    if (existing) {
      await DB.client().from('submissions').update(sub).eq('id', existing.id);
    } else {
      sub.submitted_at = new Date().toISOString();
      await DB.client().from('submissions').insert([sub]);
    }
    
    await this.loadSubmissionsForUser(user.id);
    return true;
  }
};

export default SubmissionService;
