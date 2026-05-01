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

let _activeTab = 'tasks';
let _selectedTask = null;
let _countdownInterval = null;

async function render() {
  const t = I18n.t.bind(I18n);
  const user = Store.getState('currentUser');
  
  let myClassIds = [];
  let tasks = [];
  let myClasses = [];

  if (DB.isMock()) {
    myClassIds = DB.mock.class_enrollments.filter(ce => ce.student_id === user?.id).map(ce => ce.class_id);
    tasks = DB.mock.tasks.filter(tk => myClassIds.includes(tk.class_id));
    myClasses = myClassIds.map(id => DB.mock.classes.find(c => c.id === id)).filter(Boolean);
  } else {
    // Stage 3: Get tasks via class enrollments (Live mode)
    const { data: enrolls } = await DB.query('class_enrollments', { eq: ['student_id', user.id] });
    myClassIds = (enrolls || []).map(ce => ce.class_id);
    
    if (myClassIds.length > 0) {
      const { data: allTasks } = await DB.query('tasks');
      tasks = (allTasks || []).filter(tk => myClassIds.includes(tk.class_id));

      const { data: allClasses } = await DB.query('classes');
      myClasses = (allClasses || []).filter(c => myClassIds.includes(c.id));
    }
  }

  return `
    <div class="app-layout">
      ${_renderSidebar(user, t)}
      <div class="sidebar-overlay" id="student-sidebar-overlay"></div>
      <div class="main-content" id="student-main">
        ${_renderMobileHeader(t)}
        ${_renderContent(t, user, tasks, myClasses)}
      </div>
    </div>
  `;
}

function _renderMobileHeader(t) {
  return `
    <header class="mobile-header">
      <div class="mobile-header-logo">🎓 ScholarFeedback</div>
      <div class="flex items-center gap-2">
        <button class="btn btn-danger btn-sm mobile-logout-btn" title="${t('auth.logout')}">🚪</button>
        <button class="hamburger-btn" id="student-hamburger">☰</button>
      </div>
    </header>
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

function _renderTasks(t, user, tasks, myClasses) {
  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('student.myTasks')}</h1><p class="page-subtitle">${t('app.subtitle')}</p></div>
    </div>
    ${myClasses.length > 0 ? `
      <div class="mb-6">
        <div class="text-xs text-muted mb-2">${t('class.myClasses')}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          ${myClasses.map(c => `<span class="badge badge-info">🏫 ${c.class_name}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    <div id="join-class-modal-area"></div>
    ${tasks.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">${t('common.noData')}</div>
      </div>
    ` : `
      <div class="flex flex-col gap-4">
        ${tasks.map(task => {
          const storeSubs = Store.getState('submissions') || [];
          const sub = storeSubs.find(s => s.task_id === task.id && s.student_id === user?.id) || 
                      (DB.isMock() ? DB.mock.submissions.find(s => s.task_id === task.id && s.student_id === user?.id) : null);
          const isSubmitted = sub && sub.status === 'SUBMITTED';
          const isDraft = sub && sub.status === 'DRAFT';
          
          const deadline = DeadlineEngine.getRemaining(task.deadline_datetime);
          const urgency = DeadlineEngine.getUrgency(task.deadline_datetime);
          const canSubmit = DeadlineEngine.canSubmit(task.deadline_datetime);

          return `
            <div class="task-card" data-task-id="${task.id}">
              <div class="task-card-header">
                <div class="task-card-title">${task.title}</div>
                ${isSubmitted ? `<span class="badge badge-success">${t('student.submitted')}</span>` : isDraft ? `<span class="badge badge-warning">Taslak</span>` : `<span class="badge badge-neutral">${t('student.notSubmitted')}</span>`}
              </div>
              <div class="task-card-desc">${task.description || ''}</div>
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
                <div class="card mt-4" style="background:var(--bg-input)">
                  <h4 class="mb-4">${isSubmitted ? t('student.resubmit') : t('student.submitEssay')}</h4>
                  <div class="flex gap-3 mb-4">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                      📎 ${t('student.uploadFile')}
                      <input type="file" accept=".pdf,.docx,.doc,.txt" class="hidden file-upload" data-task-id="${task.id}">
                    </label>
                  </div>
                  <div class="form-group">
                    <textarea class="textarea essay-text" data-task-id="${task.id}" rows="8" placeholder="${t('student.writeEssay')}...">${sub?.content || ''}</textarea>
                  </div>
                  <div class="flex justify-between items-center mt-3">
                    <span class="text-xs text-muted word-count" data-task-id="${task.id}">${sub ? sub.word_count + ' words' : '0 words'}</span>
                    <button class="btn btn-primary submit-essay-btn" data-task-id="${task.id}">${t('common.submit')}</button>
                  </div>
                </div>
              ` : `
                <div class="card mt-4" style="background:rgba(239,68,68,0.05);border-color:rgba(239,68,68,0.2)">
                  <div class="text-danger text-sm">🔒 ${t('student.deadlineLocked')}</div>
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

        if (!isPublished) {
          return `
            <div class="card">
              <h3>${task?.title || 'Task'}</h3>
              <p class="mt-2 text-muted">${t('feedback.notPublished')}</p>
              <span class="badge badge-neutral mt-2">${t('status.' + sub.status)}</span>
            </div>
          `;
        }

        return `
          <div class="card">
            <div class="flex justify-between items-center mb-4">
              <h3>${task?.title || 'Task'}</h3>
              <span class="badge badge-success">${t('status.PUBLISHED')}</span>
            </div>
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
  // Tab navigation
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = el.dataset.tab;
      _rerender();
    });
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
  
  const closeSidebar = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
  };

  document.getElementById('student-hamburger')?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
  });
  
  overlay?.addEventListener('click', closeSidebar);
  // Auto-close sidebar on link click in mobile
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = el.dataset.tab;
      closeSidebar();
      _rerender();
    });
  });
  document.getElementById('join-class-sidebar-btn')?.addEventListener('click', _showJoinModal);
  document.getElementById('join-class-header-btn')?.addEventListener('click', _showJoinModal);

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
    el.addEventListener('click', () => {
      const taskId = el.dataset.taskId;
      const textarea = document.querySelector(`.essay-text[data-task-id="${taskId}"]`);
      const content = textarea?.value?.trim();
      if (!content) { Store.toast('error', 'Essay content is required'); return; }

      const { cleaned, warnings } = Sanitizer.sanitize(content);
      if (warnings.length > 0) console.warn('[Sanitizer]', warnings);

      const user = Store.getState('currentUser');
      const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

      SubmissionService.submitFinal(taskId, cleaned).then(() => {
        Store.toast('success', I18n.t('student.submitted') + ' ✓');
        _rerender();
      });
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
  if (app) { app.innerHTML = await render(); attachEvents(); }
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
    const code = document.getElementById('join-code-input')?.value?.trim().toUpperCase();
    const errEl = document.getElementById('join-error');
    if (!code || code.length !== 6) { errEl.textContent = I18n.t('class.invalidCode'); errEl.style.display = 'block'; return; }
    
    let cls = null;
    if (DB.isMock()) {
      cls = DB.mock.classes.find(c => c.join_code === code);
    } else {
      const { data } = await DB.query('classes', { eq: ['join_code', code] });
      cls = data?.[0] || null;
    }

    if (!cls) { errEl.textContent = I18n.t('class.invalidCode'); errEl.style.display = 'block'; return; }
    const user = Store.getState('currentUser');
    
    let already = false;
    if (DB.isMock()) {
      already = DB.mock.class_enrollments.some(ce => ce.student_id === user.id && ce.class_id === cls.id);
    } else {
      const { data } = await DB.query('class_enrollments', { match: { student_id: user.id, class_id: cls.id } });
      already = data && data.length > 0;
    }

    if (already) { errEl.textContent = I18n.t('class.alreadyJoined'); errEl.style.display = 'block'; return; }
    
    // Enroll
    if (DB.isMock()) {
      DB.mock.class_enrollments.push({ id: 'ce-' + Date.now().toString(36), student_id: user.id, class_id: cls.id, enrolled_at: new Date().toISOString() });
    } else {
      await DB.query('class_enrollments', { insert: { id: DB.generateUUID(), student_id: user.id, class_id: cls.id, enrolled_at: new Date().toISOString() } });
    }
    
    Store.toast('success', I18n.t('class.joined') + ' — ' + cls.class_name);
    area.innerHTML = '';
    _rerender();
  });
}

function cleanup() {
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
}

export default { render, attachEvents, cleanup };
