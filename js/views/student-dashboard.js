/**
 * ScholarFeedback AI — Student Dashboard View
 */
import Store from '../store.js';
import I18n from '../i18n.js';
import DB from '../supabase-client.js';
import DeadlineEngine from '../services/deadline-engine.js';
import FileParser from '../utils/file-parser.js';
import Sanitizer from '../utils/sanitizer.js';
import SubmissionService from '../services/submission-service.js';

const NAV_KEY = 'sf_student_nav';

function _loadNav() {
  try { return JSON.parse(sessionStorage.getItem(NAV_KEY) || '{}'); }
  catch { return {}; }
}
function _saveNav() {
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify({ tab: _activeTab, classId: _selectedClassId })); }
  catch {}
}

const _nav = _loadNav();
let _activeTab = _nav.tab || 'tasks';
let _selectedTask = null;
let _selectedClassId = _nav.classId || null;
let _countdownInterval = null;

function render() {
  const t = I18n.t.bind(I18n);
  const user = Store.getState('currentUser');
  const tasks = Store.getState('tasks') || [];
  const myClasses = Store.getState('userClasses') || [];

  return `
    <div class="app-layout">
      ${_renderSidebar(user, t)}
      <div class="sidebar-overlay" id="student-sidebar-overlay"></div>
      <div class="main-content" id="student-main">
        ${_renderMobileHeader(t)}
        ${_renderContent(t, user, tasks, myClasses)}
      </div>
    </div>
    ${_renderMobileBottomNav(t)}
  `;
}

async function refreshData() {
  try {
    const user = Store.getState('currentUser');
    if (!user) return;

    let myClassIds = [], tasks = [], myClasses = [], subs = [], reports = [], teacherProfiles = [];

    if (DB.isMock()) {
      myClassIds = DB.mock.class_enrollments.filter(ce => ce.student_id === user.id).map(ce => ce.class_id);
      tasks = DB.mock.tasks.filter(tk => myClassIds.includes(tk.class_id));
      myClasses = myClassIds.map(id => DB.mock.classes.find(c => c.id === id)).filter(Boolean);
      subs = DB.mock.submissions.filter(s => s.student_id === user.id);
      reports = DB.mock.feedback_reports.filter(r => subs.some(s => s.id === r.submission_id));
      // Fetch teacher profiles for all classes the student belongs to
      const teacherIds = [...new Set(myClasses.map(c => c.teacher_id).filter(Boolean))];
      teacherProfiles = DB.mock.profiles.filter(p => teacherIds.includes(p.id));
    } else {
      const { data: enrolls } = await DB.query('class_enrollments', { eq: ['student_id', user.id] });
      myClassIds = (enrolls || []).map(ce => ce.class_id);
      
      if (myClassIds.length > 0) {
        const [tskRes, clsRes, subRes, repRes] = await Promise.all([
          DB.query('tasks'),
          DB.query('classes'),
          DB.query('submissions', { eq: ['student_id', user.id] }),
          DB.query('feedback_reports')
        ]);

        tasks = (tskRes.data || []).filter(tk => myClassIds.includes(tk.class_id));
        myClasses = (clsRes.data || []).filter(c => myClassIds.includes(c.id));
        subs = subRes.data || [];
        reports = (repRes.data || []).filter(r => subs.some(s => s.id === r.submission_id));

        // Fetch teacher profiles
        const teacherIds = [...new Set(myClasses.map(c => c.teacher_id).filter(Boolean))];
        if (teacherIds.length > 0) {
          const { data: profData } = await DB.query('profiles');
          teacherProfiles = (profData || []).filter(p => teacherIds.includes(p.id));
        }
      }
    }

    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    Store.dispatch('REFRESH_STUDENT_DATA', {
      tasks,
      userClasses: myClasses,
      teacherProfiles,
      submissions: subs,
      feedbackReports: reports
    });
  } catch (err) {
    console.error("[Student] Refresh failed", err);
  }
}

function _renderMobileHeader(t) {
  const myClasses = Store.getState('userClasses') || [];
  const selectedClass = myClasses.find(c => c.id === _selectedClassId);
  return `
    <header class="mobile-header">
      <div class="flex items-center gap-2">
        ${_selectedClassId && _activeTab === 'tasks' ? `<button class="hamburger-btn" id="mobile-back-btn" style="font-size:20px">←</button>` : ''}
        <div class="mobile-header-logo">🎓 ${selectedClass ? selectedClass.class_name : 'ScholarFeedback'}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" id="mobile-join-btn" title="Sınıf Katıl">🔑</button>
        <button class="hamburger-btn" id="student-hamburger">☰</button>
      </div>
    </header>
  `;
}

function _renderMobileBottomNav(t) {
  return `
    <nav class="mobile-bottom-nav">
      <button class="mobile-nav-btn ${_activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
        <span>📋</span><span>${t('student.myTasks')}</span>
      </button>
      <button class="mobile-nav-btn" id="mobile-join-bottom-btn">
        <span>🔑</span><span>${t('class.join')}</span>
      </button>
      <button class="mobile-nav-btn ${_activeTab === 'feedback' ? 'active' : ''}" data-tab="feedback">
        <span>💬</span><span>${t('student.myFeedback')}</span>
      </button>
    </nav>
  `;
}

function _renderSidebar(user, t) {
  const initials = (user?.full_name || 'S').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const lang = I18n.getLang();
  return `
    <aside class="sidebar" id="student-sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">🎓</div>
        <div class="sidebar-logo-text">ScholarFeedback<span>AI Platform</span></div>
      </div>
      <div class="sidebar-section">${t('student.dashboard')}</div>
      <nav class="sidebar-nav">
        <div class="sidebar-link ${_activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
          <span class="sidebar-link-icon">📋</span> ${t('student.myTasks')}
        </div>
        <div class="sidebar-link ${_activeTab === 'feedback' ? 'active' : ''}" data-tab="feedback">
          <span class="sidebar-link-icon">💬</span> ${t('student.myFeedback')}
        </div>
        <div class="sidebar-link" id="join-class-sidebar-btn" style="margin-top:var(--sp-4);border:1px dashed var(--border)">
          <span class="sidebar-link-icon">🔑</span> ${t('class.join')}
        </div>
      </nav>
      <div class="sidebar-footer">
        <div class="lang-toggle">
          <button class="${lang === 'tr' ? 'active' : ''}" data-lang="tr">TR</button>
          <button class="${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        </div>
        <div class="sidebar-user">
          <div class="sidebar-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${user?.full_name || 'Student'}</div>
            <div class="sidebar-user-role">${t('auth.role.student')}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm w-full" id="logout-btn">🚪 ${t('auth.logout')}</button>
      </div>
    </aside>
  `;
}

function _renderContent(t, user, tasks, myClasses) {
  if (_activeTab === 'tasks') return _renderTasks(t, user, tasks, myClasses);
  if (_activeTab === 'feedback') return _renderFeedback(t, user, tasks);
  return '';
}

function _renderClassPicker(t, myClasses) {
  const teachers = Store.getState('teacherProfiles') || [];
  const allTasks = Store.getState('tasks') || [];
  if (myClasses.length === 0) return `
    <div class="page-header"><div><h1 class="page-title">${t('student.myTasks')}</h1></div></div>
    <div id="join-class-modal-area"></div>
    <div class="empty-state">
      <div class="empty-state-icon">🏫</div>
      <div class="empty-state-text" style="margin-bottom:16px">${t('class.noClasses') || 'Henüz bir sınıfa kayıtlı değilsiniz.'}</div>
      <button class="btn btn-primary" id="join-class-empty-btn">🔑 ${t('class.join')}</button>
    </div>
  `;
  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('student.myTasks')}</h1><p class="page-subtitle">${t('class.selectClass') || 'Ödevleri görmek için bir sınıf seçin'}</p></div>
      <button class="btn btn-secondary btn-sm" id="join-class-header-btn">🔑 ${t('class.join')}</button>
    </div>
    <div id="join-class-modal-area"></div>
    <div class="class-grid">
      ${myClasses.map(cls => {
        const teacher = teachers.find(p => p.id === cls.teacher_id);
        const taskCount = allTasks.filter(tk => tk.class_id === cls.id).length;
        return `
          <div class="class-card student-class-card" data-class-id="${cls.id}">
            <div class="class-card-header">
              <div class="class-card-name">🏫 ${cls.class_name}</div>
              <span class="badge badge-info">${taskCount} ${t('student.myTasks') || 'ödev'}</span>
            </div>
            ${teacher ? `<div class="text-sm text-muted" style="margin-bottom:8px">👤 ${teacher.full_name}</div>` : ''}
            <div class="class-card-meta">
              <span>📅 ${new Date(cls.created_at).toLocaleDateString()}</span>
            </div>
            <div class="flex gap-2 mt-3">
              <button class="btn btn-primary btn-sm" style="flex:1" data-class-id="${cls.id}">Ödevlere Bak →</button>
              <button class="btn btn-ghost btn-sm leave-class-btn" data-class-id="${cls.id}" title="Sınıftan Ayrıl">✖</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _renderTasks(t, user, tasks, myClasses) {
  // Step 1: No class selected → show class picker
  if (!_selectedClassId) return _renderClassPicker(t, myClasses);

  // Step 2: Class selected → show that class's tasks
  const currentClass = myClasses.find(c => c.id === _selectedClassId);
  const teachers = Store.getState('teacherProfiles') || [];
  const teacher = teachers.find(p => p.id === currentClass?.teacher_id);
  const filteredTasks = tasks.filter(tk => tk.class_id === _selectedClassId);

  return `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-ghost btn-sm" id="back-to-classes" style="font-size:18px">← </button>
        <div>
          <h1 class="page-title">${currentClass?.class_name || ''}</h1>
          ${teacher ? `<p class="page-subtitle">👤 ${teacher.full_name}</p>` : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="join-class-header-btn">🔑 ${t('class.join')}</button>
    </div>
    <div id="join-class-modal-area"></div>
    ${filteredTasks.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">${t('common.noData')}</div>
      </div>
    ` : `
      <div class="flex flex-col gap-4">
        ${filteredTasks.map(task => {
          const storeSubs = Store.getState('submissions') || [];
          const sub = storeSubs.find(s => s.task_id === task.id && s.student_id === user?.id) ||
                      (DB.isMock() ? DB.mock.submissions.find(s => s.task_id === task.id && s.student_id === user?.id) : null);
          const isSubmitted = sub && (sub.status === 'SUBMITTED' || sub.status === 'GRADED' || sub.status === 'PUBLISHED');
          const isDraft = sub && sub.status === 'DRAFT';
          const deadline = DeadlineEngine.getRemaining(task.deadline_datetime);
          const urgency = DeadlineEngine.getUrgency(task.deadline_datetime);
          const canSubmit = DeadlineEngine.canSubmit(task.deadline_datetime);
          return `
            <div class="task-card" data-task-id="${task.id}">
              <div class="task-card-header">
                <div class="task-card-title">${task.title}</div>
                <div class="flex gap-2">
                  ${task.is_published ? `<span class="badge badge-info">NOTLAR YAYINLANDI</span>` : ''}
                  ${isSubmitted ? `<span class="badge badge-success">${t('student.submitted')}</span>` : isDraft ? `<span class="badge badge-warning">Taslak</span>` : `<span class="badge badge-neutral">${t('student.notSubmitted')}</span>`}
                </div>
              </div>
              <div class="task-card-desc">${task.description || ''}</div>
              ${task.is_published && isSubmitted ? `
                <div class="mb-4 p-3" style="background: var(--bg-card); border: 1px solid var(--accent); border-radius: var(--radius-sm); border-left: 4px solid var(--accent);">
                  <div class="text-sm font-bold flex items-center gap-2">💬 Geri bildiriminiz hazır!</div>
                  <div class="text-xs text-muted mb-2">Öğretmeniniz ödevi değerlendirdi ve geri bildirim yayınladı.</div>
                  <button class="btn btn-accent btn-sm view-published-feedback" data-task-id="${task.id}">Raporu Görüntüle</button>
                </div>
              ` : ''}
              <div class="mb-4">
                <div class="text-xs text-muted mb-2">${t('student.timeLeft')}</div>
                <div class="countdown countdown--${urgency}" data-deadline="${task.deadline_datetime}">
                  <div class="countdown-unit"><div class="countdown-value" data-unit="days">${String(deadline.days).padStart(2, '0')}</div><div class="countdown-label">${t('time.days')}</div></div>
                  <div class="countdown-unit"><div class="countdown-value" data-unit="hours">${String(deadline.hours).padStart(2, '0')}</div><div class="countdown-label">${t('time.hours')}</div></div>
                  <div class="countdown-unit"><div class="countdown-value" data-unit="minutes">${String(deadline.minutes).padStart(2, '0')}</div><div class="countdown-label">${t('time.minutes')}</div></div>
                  <div class="countdown-unit"><div class="countdown-value" data-unit="seconds">${String(deadline.seconds).padStart(2, '0')}</div><div class="countdown-label">${t('time.seconds')}</div></div>
                </div>
              </div>
              ${canSubmit ? `
                <div class="card mt-4" style="background:var(--accent-tint); border:1px solid var(--border-accent);">
                  <div class="flex justify-between items-center mb-3">
                    <h4>${isSubmitted ? '🔄 ' + t('student.resubmit') : '📝 ' + t('student.submitEssay')}</h4>
                    ${isSubmitted ? `<span class="text-xs text-muted">Son teslim: ${new Date(sub.updated_at || sub.submitted_at).toLocaleString()}</span>` : ''}
                  </div>
                  <div class="flex gap-3 mb-3">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                      📎 ${t('student.uploadFile')}
                      <input type="file" accept=".pdf,.docx,.doc,.txt" class="hidden file-upload" data-task-id="${task.id}">
                    </label>
                  </div>
                  <div class="form-group">
                    <textarea class="textarea essay-text" data-task-id="${task.id}" rows="8" placeholder="${t('student.writeEssay')}...">${sub?.content || ''}</textarea>
                  </div>
                  <div class="flex justify-between items-center mt-3">
                    <span class="text-xs text-muted word-count" data-task-id="${task.id}">${sub ? (sub.word_count || 0) + ' kelime' : '0 kelime'}</span>
                    <button class="btn btn-primary submit-essay-btn" data-task-id="${task.id}">${t('common.submit')}</button>
                  </div>
                </div>
              ` : `
                <div class="card mt-4" style="background:var(--danger-glow);border-color:rgba(220,38,38,0.20)">
                  <div class="text-danger text-sm">🔒 ${t('student.deadlineLocked')}</div>
                  ${isSubmitted ? `<div class="text-xs text-muted mt-1">✅ Teslim edildi — ${new Date(sub.updated_at || sub.submitted_at).toLocaleString()}</div>` : ''}
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}

function _renderFeedback(t, user, tasks) {
  const subs = Store.getState('submissions')?.filter(s => s.student_id === user?.id) || 
               ((DB.isMock() ? DB.mock.submissions : []).filter(s => s.student_id === user?.id));
               
  const reports = Store.getState('feedbackReports') || (DB.isMock() ? DB.mock.feedback_reports : []);

  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('student.myFeedback')}</h1></div>
    </div>
    <div class="flex flex-col gap-4">
      ${subs.map(sub => {
        const task = tasks.find(t2 => t2.id === sub.task_id);
        const report = reports.find(r => r.submission_id === sub.id);
        const isPublished = task?.is_published;

        // Class & teacher meta for feedback view
        const allClasses = Store.getState('userClasses') || [];
        const feedbackClass = allClasses.find(c => c.id === task?.class_id);
        const feedbackTeachers = Store.getState('teacherProfiles') || [];
        const feedbackTeacher = feedbackTeachers.find(p => p.id === feedbackClass?.teacher_id);

        if (!isPublished) {
          return `
            <div class="card">
              <h3>${task?.title || 'Task'}</h3>
              ${feedbackClass || feedbackTeacher ? `
                <div class="flex gap-2 mt-1 mb-2" style="flex-wrap:wrap">
                  ${feedbackClass ? `<span class="badge badge-info" style="font-size:0.7rem">🏫 ${feedbackClass.class_name}</span>` : ''}
                  ${feedbackTeacher ? `<span class="badge badge-neutral" style="font-size:0.7rem">👤 ${feedbackTeacher.full_name}</span>` : ''}
                </div>
              ` : ''}
              <p class="mt-2 text-muted">${t('feedback.notPublished')}</p>
              <span class="badge badge-neutral mt-2">${t('status.' + sub.status)}</span>
            </div>
          `;
        }

        return `
          <div class="card">
            <div class="flex justify-between items-center mb-2">
              <h3>${task?.title || 'Task'}</h3>
              <span class="badge badge-success">${t('status.PUBLISHED')}</span>
            </div>
            ${feedbackClass || feedbackTeacher ? `
              <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
                ${feedbackClass ? `<span class="badge badge-info" style="font-size:0.7rem">🏫 ${feedbackClass.class_name}</span>` : ''}
                ${feedbackTeacher ? `<span class="badge badge-neutral" style="font-size:0.7rem">👤 ${feedbackTeacher.full_name}</span>` : ''}
              </div>
            ` : ''}
            ${report ? `
              <div class="flex gap-4 mb-4" style="flex-wrap:wrap">
                <div class="score-gauge">
                  <div class="score-ring" style="--score:${report.final_grade || 0}"><span>${report.final_grade ?? '—'}</span></div>
                  <div class="score-label">${t('feedback.grade')}</div>
                </div>
                ${task.show_integrity_to_student ? `
                  <div class="score-gauge">
                    <div class="score-ring" style="--score:${report.plagiarism_score || 0}"><span>${report.plagiarism_score ?? 0}%</span></div>
                    <div class="score-label">${t('integrity.plagiarism')}</div>
                  </div>
                  <div class="score-gauge">
                    <div class="score-ring" style="--score:${report.ai_probability_score || 0}"><span>${report.ai_probability_score ?? 0}%</span></div>
                    <div class="score-label">${t('integrity.aiProb')}</div>
                  </div>
                ` : ''}
              </div>
              <div class="feedback-content" data-md="${Sanitizer.escapeHtml(report.ai_feedback_markdown || '')}">${report.ai_feedback_markdown || t('feedback.pending')}</div>
            ` : `<p class="text-muted">${t('feedback.pending')}</p>`}
          </div>
        `;
      }).join('')}
      ${subs.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">${t('common.noData')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function attachEvents() {
  const t = I18n.t.bind(I18n);

  // Tab navigation (sidebar + mobile bottom nav)
  document.querySelectorAll('.sidebar-link[data-tab], .mobile-nav-btn[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = el.dataset.tab;
      if (_activeTab === 'feedback') _selectedClassId = null;
      _saveNav();
      document.getElementById('student-sidebar')?.classList.remove('open');
      document.getElementById('student-sidebar-overlay')?.classList.remove('active');
      _rerender();
    });
  });

  // Class picker cards — click on card body to select, but not on action buttons
  document.querySelectorAll('.student-class-card').forEach(el => {
    el.addEventListener('click', (e) => {
      // Ignore clicks on buttons inside the card (leave, primary btn)
      if (e.target.closest('button')) return;
      _selectedClassId = el.dataset.classId;
      _saveNav();
      _rerender();
    });
  });
  // "Ödevlere Bak" button inside class card
  document.querySelectorAll('.student-class-card .btn-primary[data-class-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      _selectedClassId = el.dataset.classId;
      _saveNav();
      _rerender();
    });
  });

  // Back to class list
  document.getElementById('back-to-classes')?.addEventListener('click', () => {
    _selectedClassId = null;
    _saveNav();
    _rerender();
  });
  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
    _selectedClassId = null;
    _saveNav();
    _rerender();
  });

  // Language toggle
  document.querySelectorAll('.lang-toggle button[data-lang]').forEach(el => {
    el.addEventListener('click', () => {
      I18n.setLang(el.dataset.lang);
      Store.dispatch(Store.Events.LANGUAGE_CHANGED, { language: el.dataset.lang });
      _rerender();
    });
  });

  // Logout
  const handleLogout = async () => {
    const { default: Auth } = await import('../auth.js');
    Auth.logout();
  };
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.querySelectorAll('.mobile-logout-btn').forEach(btn => btn.addEventListener('click', handleLogout));

  // Hamburger Menu Toggle
  const sidebar = document.getElementById('student-sidebar');
  const overlay = document.getElementById('student-sidebar-overlay');
  const closeSidebar = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('active'); };
  document.getElementById('student-hamburger')?.addEventListener('click', () => {
    sidebar?.classList.add('open'); overlay?.classList.add('active');
  });
  overlay?.addEventListener('click', closeSidebar);

  // Join modal triggers
  ['join-class-sidebar-btn','join-class-header-btn','mobile-join-btn','mobile-join-bottom-btn','join-class-empty-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', _showJoinModal);
  });

  // Leave class
  document.querySelectorAll('.leave-class-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const classId = el.dataset.classId;
      if (!classId) return;
      if (!confirm('Bu sınıftan ayrılmak istediğinize emin misiniz?')) return;
      const user = Store.getState('currentUser');
      if (!user) { Store.toast('error', 'Oturum hatası, lütfen tekrar giriş yapın.'); return; }
      try {
        const res = await DB.query('class_enrollments', { del: true, match: { class_id: classId, student_id: user.id } });
        if (res.error) throw res.error;
        if (!DB.isMock() && res.data && res.data.length === 0) {
          throw new Error("Bu sınıftan zaten ayrılmışsınız veya işlem engellendi (RLS).");
        }
        
        if (_selectedClassId === classId) { _selectedClassId = null; _saveNav(); }
        Store.toast('success', 'Sınıftan ayrıldınız.');
        // DATA_CHANGED will trigger silent refresh automatically
      } catch (err) {
        console.error('[LeaveClass]', err);
        Store.toast('error', 'Sınıftan ayrılırken hata oluştu.');
      }
    });
  });

  // File upload
  document.querySelectorAll('.file-upload').forEach(el => {
    el.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const taskId = el.dataset.taskId;
      const textarea = document.querySelector(`.essay-text[data-task-id="${taskId}"]`);
      const wordCountEl = document.querySelector(`.word-count[data-task-id="${taskId}"]`);
      try {
        Store.toast('info', I18n.t('common.loading'));
        const { text, wordCount } = await FileParser.parse(file);
        if (textarea) textarea.value = text;
        if (wordCountEl) wordCountEl.textContent = wordCount + ' words';
      } catch (err) {
        Store.toast('error', 'File parse error: ' + err.message);
      }
    });
  });

  // Word count & Auto-Save on typing
  document.querySelectorAll('.essay-text').forEach(el => {
    el.addEventListener('input', () => {
      const content = el.value;
      const wc = content.split(/\s+/).filter(Boolean).length;
      const wcEl = document.querySelector(`.word-count[data-task-id="${el.dataset.taskId}"]`);
      if (wcEl) wcEl.textContent = wc + ' words';
      
      SubmissionService.debounceAutoSave(el.dataset.taskId, content);
    });
  });

  // Submit essay
  document.querySelectorAll('.submit-essay-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const taskId = el.dataset.taskId;
      const textarea = document.querySelector(`.essay-text[data-task-id="${taskId}"]`);
      const content = textarea?.value?.trim();
      if (!content || content.length < 10) {
        Store.toast('error', 'Lütfen ödevinizi yazın (en az 10 karakter).');
        return;
      }

      const { cleaned, warnings } = Sanitizer.sanitize(content);
      if (warnings.length > 0) console.warn('[Sanitizer]', warnings);

      // Disable button to prevent double-submit
      el.disabled = true;
      el.textContent = '⏳ Gönderiliyor...';

      try {
        const result = await SubmissionService.submitFinal(taskId, cleaned);
        if (result) {
          Store.toast('success', I18n.t('student.submitted') + ' ✓');
          // _refreshStore inside submitFinal already dispatched REFRESH_STUDENT_DATA
          // → app.js listener will call _rerenderStudent(). No extra re-render needed.
        } else {
          // submitFinal returned null (DB error shown via toast). Re-enable button.
          el.disabled = false;
          el.textContent = I18n.t('common.submit');
        }
      } catch (err) {
        console.error('[Submit]', err);
        Store.toast('error', 'Teslim edilemedi: ' + (err.message || 'Bilinmeyen hata'));
        el.disabled = false;
        el.textContent = I18n.t('common.submit');
      }
    });
  });

  // Shortcut to feedback tab
  document.querySelectorAll('.view-published-feedback').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = 'feedback';
      _rerender();
    });
  });

  // Start countdown timer
  _startCountdown();

  // Render markdown in feedback
  document.querySelectorAll('.feedback-content[data-md]').forEach(el => {
    if (window.marked) el.innerHTML = window.marked.parse(el.textContent);
  });
}

function _startCountdown() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  _countdownInterval = setInterval(() => {
    document.querySelectorAll('.countdown[data-deadline]').forEach(el => {
      const r = DeadlineEngine.getRemaining(el.dataset.deadline);
      const urgency = DeadlineEngine.getUrgency(el.dataset.deadline);
      el.className = `countdown countdown--${urgency}`;
      el.querySelector('[data-unit="days"]').textContent = String(r.days).padStart(2, '0');
      el.querySelector('[data-unit="hours"]').textContent = String(r.hours).padStart(2, '0');
      el.querySelector('[data-unit="minutes"]').textContent = String(r.minutes).padStart(2, '0');
      el.querySelector('[data-unit="seconds"]').textContent = String(r.seconds).padStart(2, '0');
    });
  }, 1000);
}

async function _rerender() {
  const app = document.getElementById('app');
  if (app) { app.innerHTML = render(); attachEvents(); }
}

function _showJoinModal() {
  const t = I18n.t.bind(I18n);
  let area = document.getElementById('join-class-modal-area');
  if (!area) {
    // Fallback: create in body
    area = document.createElement('div');
    area.id = 'join-class-modal-area';
    document.body.appendChild(area);
  }
  area.innerHTML = `
    <div class="modal-overlay" id="join-modal-overlay">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">${t('class.join')}</div>
          <button class="btn btn-ghost btn-sm" id="close-join-modal">${t('common.close')}</button>
        </div>
        <p class="text-sm text-muted mb-4">${t('class.joinHint')}</p>
        <div class="join-input-group mb-4">
          <input type="text" id="join-code-input" class="input" maxlength="6" placeholder="MAR101" autocomplete="off">
          <button class="btn btn-primary" id="join-code-submit">${t('class.join')}</button>
        </div>
        <div id="join-error" class="text-danger text-sm" style="display:none"></div>
      </div>
    </div>
  `;
  document.getElementById('close-join-modal')?.addEventListener('click', () => { area.innerHTML = ''; });
  document.getElementById('join-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'join-modal-overlay') area.innerHTML = ''; });
  document.getElementById('join-code-input')?.focus();
  document.getElementById('join-code-submit')?.addEventListener('click', async () => {
    try {
      const code = document.getElementById('join-code-input')?.value?.trim().toUpperCase();
      const errEl = document.getElementById('join-error');
      if (!code || code.length !== 6) { errEl.textContent = I18n.t('class.invalidCode'); errEl.style.display = 'block'; return; }
      
      let cls = null;
      if (DB.isMock()) {
        cls = DB.mock.classes.find(c => c.join_code === code);
      } else {
        const { data, error } = await DB.query('classes', { eq: ['join_code', code] });
        if (error) { alert("Sınıf aranırken hata: " + error.message); return; }
        cls = data?.[0] || null;
      }

      if (!cls) { errEl.textContent = I18n.t('class.invalidCode'); errEl.style.display = 'block'; return; }
      const user = Store.getState('currentUser');
      
      let already = false;
      if (DB.isMock()) {
        already = DB.mock.class_enrollments.some(ce => ce.student_id === user?.id && ce.class_id === cls.id);
      } else {
        const { data, error } = await DB.query('class_enrollments', { match: { student_id: user?.id, class_id: cls.id } });
        if (error) { alert("Kayıt kontrolü hatası: " + error.message); return; }
        already = data && data.length > 0;
      }

      if (already) { errEl.textContent = I18n.t('class.alreadyJoined'); errEl.style.display = 'block'; return; }
      
      // Enroll
      if (DB.isMock()) {
        const payload = { id: DB.generateUUID(), student_id: user?.id, class_id: cls.id, enrolled_at: new Date().toISOString() };
        await DB.query('class_enrollments', { insert: payload });
      } else {
        const payload = { id: DB.generateUUID(), student_id: user?.id, class_id: cls.id, enrolled_at: new Date().toISOString() };
        const { error } = await DB.query('class_enrollments', { insert: payload });
        if (error) { alert("Sınıfa kayıt olunamadı: " + error.message); return; }
      }
      
      Store.toast('success', I18n.t('class.joined') + ' — ' + cls.class_name);
      area.innerHTML = '';
      await _rerender();
    } catch (err) {
      alert("Beklenmeyen Hata: " + err.message);
    }
  });
}

function cleanup() {
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
}

export default { render, refreshData, attachEvents, cleanup };
