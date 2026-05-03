/**
 * ScholarFeedback AI — Teacher Dashboard View
 */
import Store from '../store.js';
import I18n from '../i18n.js';
import DB from '../supabase-client.js';
import DeadlineEngine from '../services/deadline-engine.js';
import QueueHandler from '../services/queue-handler.js';

const NAV_KEY = 'sf_teacher_nav';

function _loadNav() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NAV_KEY) || '{}');
    return saved;
  } catch { return {}; }
}
function _saveNav() {
  try {
    sessionStorage.setItem(NAV_KEY, JSON.stringify({ tab: _activeTab, classId: _activeClassId }));
  } catch {}
}

const _nav = _loadNav();
let _activeTab = _nav.tab || 'tasks';
let _selectedTask = null;
let _activeClassId = _nav.classId || null;
let _realtimeChannel = null;

function render() {
  const t = I18n.t.bind(I18n);
  const user = Store.getState('currentUser');
  const tasks = Store.getState('tasks') || [];

  return `
    <div class="app-layout">
      ${_renderSidebar(user, t)}
      <div class="sidebar-overlay" id="teacher-sidebar-overlay"></div>
      <div class="main-content" id="teacher-main">
        ${_renderMobileHeader(t)}
        ${_renderContent(t, tasks)}
      </div>
    </div>
  `;
}

/**
 * Heavy lift: Fetch everything and update Store
 */
async function refreshData() {
  try {
    const user = Store.getState('currentUser');
    if (!user) return;

    let classes = [], tasks = [], submissions = [], reports = [], profiles = [], enrollments = [];

    if (DB.isMock()) {
      classes = DB.mock.classes.filter(c => c.teacher_id === user.id);
      tasks = DB.mock.tasks.filter(t => t.created_by === user.id);
      submissions = DB.mock.submissions;
      reports = DB.mock.feedback_reports;
      profiles = DB.mock.profiles;
      enrollments = DB.mock.class_enrollments;
    } else {
      // Parallel fetch for speed
      const [clsRes, tskRes, subRes, repRes, profRes, enrRes] = await Promise.all([
        DB.query('classes', { eq: ['teacher_id', user.id] }),
        DB.query('tasks', { eq: ['created_by', user.id] }),
        DB.query('submissions'),
        DB.query('feedback_reports'),
        DB.query('profiles'),
        DB.query('class_enrollments')
      ]);

      classes = clsRes.data || [];
      tasks = tskRes.data || [];
      submissions = subRes.data || [];
      reports = repRes.data || [];
      profiles = profRes.data || [];
      enrollments = enrRes.data || [];
    }

    // Sort tasks
    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Update Store
    Store.dispatch('REFRESH_TEACHER_DATA', {
      userClasses: classes,
      tasks: tasks,
      submissions: submissions,
      feedbackReports: reports,
      profiles: profiles,
      enrollments: enrollments
    });
  } catch (err) {
    console.error("[Dashboard] Refresh failed", err);
  }
}

function _renderMobileHeader(t) {
  return `
    <header class="mobile-header">
      <div class="mobile-header-logo">🎓 ScholarFeedback</div>
      <div class="flex items-center gap-2">
        <button class="btn btn-danger btn-sm mobile-logout-btn" title="${t('auth.logout')}">🚪</button>
        <button class="hamburger-btn" id="teacher-hamburger">☰</button>
      </div>
    </header>
  `;
}

function _renderSidebar(user, t) {
  const initials = (user?.full_name || 'A').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const lang = I18n.getLang();
  return `
    <aside class="sidebar" id="teacher-sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">🎓</div>
        <div class="sidebar-logo-text">ScholarFeedback<span>AI Platform</span></div>
      </div>
      <div class="sidebar-section">${t('teacher.dashboard')}</div>
      <nav class="sidebar-nav">
        <div class="sidebar-link ${_activeTab === 'classes' ? 'active' : ''}" data-tab="classes">
          <span class="sidebar-link-icon">🏫</span> ${t('class.title')}
        </div>
        <div class="sidebar-link ${_activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks">
          <span class="sidebar-link-icon">📋</span> ${t('teacher.tasks')}
        </div>
        <div class="sidebar-link ${_activeTab === 'submissions' ? 'active' : ''}" data-tab="submissions">
          <span class="sidebar-link-icon">📝</span> ${t('teacher.submissions')}
        </div>
        <div class="sidebar-link ${_activeTab === 'analytics' ? 'active' : ''}" data-tab="analytics">
          <span class="sidebar-link-icon">📊</span> ${t('teacher.analytics')}
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
            <div class="sidebar-user-name">${user?.full_name || 'Admin'}</div>
            <div class="sidebar-user-role">${t('auth.role.admin')}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm w-full" id="logout-btn">🚪 ${t('auth.logout')}</button>
      </div>
    </aside>
  `;
}

function _renderContent(t, tasks) {
  if (_activeTab === 'classes') return _renderClasses(t);
  if (_activeTab === 'tasks') return _renderTasks(t, tasks);
  if (_activeTab === 'submissions') return _renderSubmissions(t, tasks);
  if (_activeTab === 'analytics') return _renderAnalytics(t, tasks);
  return '';
}

function _renderClasses(t) {
  const user = Store.getState('currentUser');
  const classes = Store.getState('userClasses') || [];
  const enrollments = Store.getState('enrollments') || [];
  const tasksList = Store.getState('tasks') || [];

  if (!user || !user.id) return `<div class="p-6">Yükleniyor...</div>`;

  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('class.title')}</h1><p class="page-subtitle">${t('app.subtitle')}</p></div>
      <button class="btn btn-primary" id="new-class-btn">➕ ${t('class.create')}</button>
    </div>
    <div class="class-grid">
      ${classes.map(cls => {
        const enrolledCount = enrollments.filter(e => e.class_id === cls.id).length;
        const taskCount = tasksList.filter(tk => tk.class_id === cls.id).length;
        return `
          <div class="class-card ${_activeClassId === cls.id ? 'active' : ''}" data-class-id="${cls.id}">
            <div class="class-card-header" style="align-items: center;">
              <div class="class-card-name" style="font-size: 1.15rem; font-weight: 600;">${cls.class_name}</div>
              <div class="flex items-center gap-2">
                <div class="join-code-badge" data-code="${cls.join_code}" title="Kodu Kopyala">${cls.join_code}</div>
                <button class="btn btn-ghost btn-sm text-danger delete-class-btn" data-class-id="${cls.id}" title="Sınıfı Sil" style="padding: 2px 6px;">🗑️</button>
              </div>
            </div>
            <div class="class-card-meta mt-2" style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 16px;">
              <span style="display: flex; align-items: center; gap: 6px;">👥 ${enrolledCount} Öğrenci</span>
              <span style="display: flex; align-items: center; gap: 6px;">📋 ${taskCount} Görev</span>
            </div>
          </div>
        `;
      }).join('')}
      ${classes.length === 0 ? `
        <div class="empty-state" style="padding: 60px 20px; border: 1px dashed var(--border); border-radius: var(--r-lg); margin-top: var(--sp-4);">
          <div style="font-size: 3rem; margin-bottom: 16px;">🌱</div>
          <div class="text-lg font-bold mb-2">Henüz buralar çok sessiz...</div>
          <p class="text-muted text-sm mb-4" style="max-width: 400px; margin: 0 auto;">İlk sınıfınızı oluşturarak öğrencilerinize eğitim serüveninde rehberlik etmeye başlayabilirsiniz.</p>
        </div>
      ` : ''}
    </div>
    <div id="class-modal-area"></div>
  `;
}

function _renderTasks(t, tasks) {
  const user = Store.getState('currentUser');
  const subs = Store.getState('submissions') || [];
  const reports = Store.getState('feedbackReports') || [];
  const profiles = Store.getState('profiles') || [];
  const enrollmentsList = Store.getState('enrollments') || [];
  const classes = Store.getState('userClasses') || [];

  if (_activeClassId) tasks = tasks.filter(tk => tk.class_id === _activeClassId);
  
  const activeClassName = _activeClassId ? classes.find(c => c.id === _activeClassId)?.class_name || '' : '';
  
  // Sınıf seçiliyse sadece o sınıfın kaydolan öğrenci sayısı,
  // Seçili değilse öğretmenin tüm sınıflarındaki "toplam öğrenci kaydı" sayısı.
  const teacherClassIds = classes.map(c => c.id);
  const totalStudents = _activeClassId 
    ? enrollmentsList.filter(e => e.class_id === _activeClassId).length 
    : enrollmentsList.filter(e => teacherClassIds.includes(e.class_id)).length;

  const totalSubmitted = subs.filter(s => tasks.some(tk => tk.id === s.task_id)).length;
  const graded = subs.filter(s => tasks.some(tk => tk.id === s.task_id) && (s.status === 'GRADED' || s.status === 'PUBLISHED')).length;

  return `
    <div class="page-header">
      <div>
        ${_activeClassId ? `<button class="btn btn-ghost btn-sm mb-2" id="back-to-classes">← ${t('class.allClasses')}</button>` : ''}
        <h1 class="page-title">${activeClassName || t('teacher.tasks')}</h1>
        <p class="page-subtitle">${_activeClassId ? t('teacher.tasks') : t('app.subtitle')}</p>
      </div>
      <button class="btn btn-primary" id="new-task-btn">➕ ${t('teacher.newTask')}</button>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">${t('teacher.tasks')}</div>
        <div class="stat-value text-accent">${tasks.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('teacher.students')}</div>
        <div class="stat-value" style="color:var(--cyan-light)">${totalStudents}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('teacher.submissions')}</div>
        <div class="stat-value text-success">${totalSubmitted}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('status.GRADED')}</div>
        <div class="stat-value text-warning">${graded}</div>
      </div>
    </div>
    <div class="flex flex-col gap-4">
      ${tasks.map(task => {
        const deadline = DeadlineEngine.getRemaining(task.deadline_datetime);
        const urgency = DeadlineEngine.getUrgency(task.deadline_datetime);
        const badgeClass = urgency === 'expired' ? 'badge-danger' : urgency === 'critical' ? 'badge-warning' : 'badge-success';
        const classStudents = enrollmentsList.filter(e => e.class_id === task.class_id);
        const taskSubs = subs.filter(s => s.task_id === task.id);
        return `
          <div class="task-card" data-task-id="${task.id}">
            <div class="task-card-header">
              <div class="task-card-title">${task.title}</div>
              <div class="flex gap-2">
                ${task.is_published ? `<span class="badge badge-success">${t('status.PUBLISHED')}</span>` : ''}
                <span class="badge ${badgeClass}">${deadline.expired ? t('task.deadlinePassed') : `${deadline.days}d ${deadline.hours}h`}</span>
              </div>
            </div>
            <div class="task-card-desc">${task.description || ''}</div>
            
            <div class="mt-4 pt-4" style="border-top: 1px solid var(--border)">
              <div class="text-sm font-bold mb-2">${t('teacher.submissions')} (${taskSubs.length} / ${classStudents.length})</div>
              ${taskSubs.length > 0 ? `
                <table style="width: 100%; font-size: var(--text-xs); border-collapse: collapse; margin-bottom: var(--sp-2);">
                  <thead>
                    <tr style="border-bottom: 1px solid var(--border); text-align: left;">
                      <th style="padding: 4px;">${t('auth.fullName')}</th>
                      <th style="padding: 4px;">${t('common.status')}</th>
                      <th style="padding: 4px;">${t('teacher.wordCount')}</th>
                      <th style="padding: 4px;">${t('feedback.grade')}</th>
                      <th style="padding: 4px;">${t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${taskSubs.map(s => {
                      const st = profiles.find(p => p.id === s.student_id);
                      const rep = reports.find(r => r.submission_id === s.id);
                      const statusBadge = s.status === 'GRADED' ? 'badge-success' : s.status === 'PROCESSING' ? 'badge-warning' : s.status === 'PUBLISHED' ? 'badge-info' : 'badge-neutral';
                      return `
                        <tr style="border-bottom: 1px dashed var(--border);">
                          <td style="padding: 4px;">${st?.full_name || 'Bilinmiyor'}</td>
                          <td style="padding: 4px;"><span class="badge ${statusBadge}" style="font-size: 0.65rem; padding: 2px 6px;">${t('status.' + s.status)}</span></td>
                          <td style="padding: 4px;">${s.word_count || 0}</td>
                          <td style="padding: 4px; font-weight: bold; font-family: var(--font-mono);">${rep?.final_grade ?? '—'}</td>
                          <td style="padding: 4px;">
                            <div class="flex gap-1">
                              ${rep ? `<button class="btn btn-ghost btn-sm view-report-btn" data-sub-id="${s.id}" style="padding:2px; min-height:auto;" title="Raporu Gör">🔍</button>` : ''}
                              <button class="btn btn-ghost btn-sm view-essay-btn" data-sub-id="${s.id}" style="padding:2px; min-height:auto;" title="Ödevi Gör">📄</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              ` : `<div class="text-xs text-muted mb-2">${t('teacher.noSubmissions')}</div>`}
            </div>

            <div class="task-card-footer mt-4">
              <div class="task-card-meta">👥 ${classStudents.length} ${t('teacher.students')}</div>
              <div class="flex gap-2">
                ${!deadline.expired && !task.is_published ? `<button class="btn btn-sm btn-warning end-early-btn" data-task-id="${task.id}">${t('teacher.endDeadline')}</button>` : ''}
                ${deadline.expired && !task.is_published ? `<button class="btn btn-sm btn-secondary batch-btn" data-task-id="${task.id}">${t('teacher.batchProcess')}</button>` : ''}
                ${deadline.expired && !task.is_published ? `<button class="btn btn-sm btn-success publish-btn" data-task-id="${task.id}">${t('teacher.publish')}</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div id="task-modal-area"></div>
    <div id="processing-area"></div>
    <div id="report-modal-area"></div>
  `;
}

function _renderSubmissions(t, tasks) {
  const subs = Store.getState('submissions') || [];
  const reports = Store.getState('feedbackReports') || [];
  const profiles = Store.getState('profiles') || [];
  
  const teacherTaskIds = tasks.map(t => t.id);
  const relevantSubs = subs.filter(s => teacherTaskIds.includes(s.task_id));

  const grouped = {};
  relevantSubs.forEach(s => {
    if (!grouped[s.task_id]) grouped[s.task_id] = [];
    grouped[s.task_id].push(s);
  });

  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('teacher.submissions')}</h1></div>
    </div>
    <div class="disclaimer mb-4">
      ⚠️ ${t('integrity.disclaimer')}
    </div>
    
    ${Object.keys(grouped).length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📥</div>
        <div class="empty-state-text">Henüz hiç teslimat yapılmamış.</div>
      </div>
    ` : Object.entries(grouped).map(([taskId, taskSubs]) => {
      const task = tasks.find(tk => tk.id === taskId);
      return `
        <div class="task-submission-group mb-8">
          <h3 class="mb-3 flex items-center gap-2" style="font-size: 1.1rem; color: var(--accent);">
            📋 ${task?.title || 'Bilinmeyen Görev'}
          </h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${t('auth.fullName')}</th>
                  <th>${t('common.status')}</th>
                  <th>Kelime Sayısı</th>
                  <th>İntihal / AI</th>
                  <th>${t('feedback.grade')}</th>
                  <th>${t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${taskSubs.map(sub => {
                  const student = profiles.find(p => p.id === sub.student_id);
                  const report = reports.find(r => r.submission_id === sub.id);
                  const statusBadge = sub.status === 'GRADED' ? 'badge-success' : sub.status === 'PROCESSING' ? 'badge-warning' : sub.status === 'PUBLISHED' ? 'badge-info' : 'badge-neutral';
                  return `
                    <tr>
                      <td class="submission-name">${student?.full_name || 'Unknown'}</td>
                      <td><span class="badge ${statusBadge}">${t('status.' + sub.status)}</span></td>
                      <td>${sub.word_count || 0}</td>
                      <td>
                        ${report ? `
                          <div class="flex flex-col gap-1">
                            <span class="text-xs ${report.plagiarism_score > 20 ? 'text-danger font-bold' : 'text-muted'}">P: %${report.plagiarism_score}</span>
                            <span class="text-xs ${report.ai_probability_score > 80 ? 'text-danger font-bold' : 'text-muted'}">AI: %${report.ai_probability_score}</span>
                          </div>
                        ` : '<span class="text-muted">—</span>'}
                      </td>
                      <td class="font-mono font-bold">${report?.final_grade ?? '—'}</td>
                      <td>
                        <div class="flex gap-1">
                          ${report ? `<button class="btn btn-ghost btn-sm view-report-btn" data-sub-id="${sub.id}" title="Raporu Gör">🔍</button>` : ''}
                          <button class="btn btn-ghost btn-sm view-essay-btn" data-sub-id="${sub.id}" title="Ödevi Gör">📄</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('')}
    <div id="report-modal-area"></div>
  `;
}

function _renderAnalytics(t, tasks) {
  const reports = Store.getState('feedbackReports') || [];
  const subs = Store.getState('submissions') || [];
  const classes = Store.getState('userClasses') || [];

  const classAnalytics = classes.map(cls => {
    const classTasks = tasks.filter(tk => tk.class_id === cls.id);
    const classTaskIds = classTasks.map(tk => tk.id);
    const classSubs = subs.filter(s => classTaskIds.includes(s.task_id));
    const classSubIds = classSubs.map(s => s.id);
    const classReports = reports.filter(r => classSubIds.includes(r.submission_id));
    
    return { class: cls, reports: classReports };
  }).filter(group => group.reports.length > 0);

  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('teacher.analytics')}</h1></div>
    </div>
    ${classAnalytics.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">${t('common.noData')}<br><span class="text-xs text-muted">Sınıf analizi için önce ödevleri notlandırmalısınız.</span></div>
      </div>
    ` : classAnalytics.map(({ class: cls, reports: rps }) => `
      <div class="class-analytics-section mb-12">
        <h2 class="mb-4 flex items-center gap-2" style="font-size: 1.4rem; border-bottom: 2px solid var(--border); padding-bottom: 8px;">
          🏫 ${cls.class_name} <span class="text-xs text-muted font-normal">(${rps.length} Rapor)</span>
        </h2>
        <div class="stats-row mb-6">
          <div class="stat-card">
            <div class="stat-label">Ortalama Not</div>
            <div class="stat-value text-accent">${Math.round(rps.reduce((a, r) => a + (r.final_grade || 0), 0) / rps.length)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Ort. İntihal</div>
            <div class="stat-value" style="color:var(--warning-light)">%${Math.round(rps.reduce((a, r) => a + (r.plagiarism_score || 0), 0) / rps.length)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Ort. AI Olasılığı</div>
            <div class="stat-value" style="color:var(--cyan-light)">%${Math.round(rps.reduce((a, r) => a + (r.ai_probability_score || 0), 0) / rps.length)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Yüksek Risk</div>
            <div class="stat-value text-danger">${rps.filter(r => r.risk_flag).length}</div>
          </div>
        </div>
        <div class="card"><canvas id="chart-${cls.id}" height="300"></canvas></div>
      </div>
    `).join('')}
  `;
}

function _renderTaskModal(t, classes = []) {
  return `
    <div class="modal-overlay" id="task-modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t('teacher.newTask')}</div>
          <button class="btn btn-ghost btn-sm" id="close-task-modal">${t('common.close')}</button>
        </div>
        <form id="task-form" class="flex flex-col gap-4">
          <div class="form-group">
            <label class="form-label">${t('task.title')} *</label>
            <input type="text" id="tf-title" class="input" required>
          </div>
          <div class="form-group">
            <label class="form-label">${t('task.description')}</label>
            <textarea id="tf-desc" class="textarea"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">${t('task.deadline')} *</label>
            <input type="datetime-local" id="tf-deadline" class="input" required>
            <div class="flex gap-2 mt-2" style="flex-wrap:wrap">
              <button type="button" class="btn btn-ghost btn-sm quick-deadline" data-minutes="5">+5 Dakika</button>
              <button type="button" class="btn btn-ghost btn-sm quick-deadline" data-hours="1">+1 Saat</button>
              <button type="button" class="btn btn-ghost btn-sm quick-deadline" data-hours="3">+3 Saat</button>
              <button type="button" class="btn btn-ghost btn-sm quick-deadline" data-hours="24">+24 Saat</button>
              <button type="button" class="btn btn-ghost btn-sm quick-deadline" data-hours="168">+1 Hafta</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">${t('task.criteria')}</label>
            <textarea id="tf-criteria" class="textarea" placeholder="${t('task.criteriaHint')}" rows="3"></textarea>
            <div class="form-hint">One criterion per line</div>
          </div>
          <div class="flex gap-4">
            <div class="form-group" style="flex:1">
              <label class="form-label">${t('class.selectClass')}</label>
              <select id="tf-class" class="select">
                ${classes.map(c =>
                  `<option value="${c.id}" ${c.id === _activeClassId ? 'selected' : ''}>${c.class_name}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">${t('task.language')}</label>
              <select id="tf-lang" class="select">
                <option value="EN">English</option>
                <option value="TR">Türkçe</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">${t('task.framework')}</label>
              <select id="tf-framework" class="select">
                <option value="IELTS">IELTS</option>
                <option value="TOEFL">TOEFL</option>
                <option value="SKOPOS">Skopos</option>
                <option value="FUNCTIONALISM">Functionalism</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
          </div>
          <label class="checkbox-group">
            <input type="checkbox" id="tf-show-integrity">
            <span class="text-sm">${t('task.showIntegrity')}</span>
          </label>
          <button type="submit" class="btn btn-primary btn-lg">${t('common.save')}</button>
        </form>
      </div>
    </div>
  `;
}

function _renderReportModal(sub, report, t, profiles = []) {
  const student = profiles.find(p => p.id === sub.student_id);
  const segments = report?.integrity_details?.suspicious_segments || [];
  const heatmap = report?.integrity_details?.heatmap_data || [];
  const isHighRisk = report && (report.plagiarism_score > 20 || report.ai_probability_score > 80);

  return `
    <div class="modal-overlay" id="report-modal-overlay">
      <div class="modal" style="max-width:900px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <div class="modal-title">${student?.full_name || 'Student'} — ${t('feedback.title')}</div>
          <button class="btn btn-ghost btn-sm" id="close-report-modal">${t('common.close')}</button>
        </div>
        ${isHighRisk ? `<div class="disclaimer mb-4">⚠️ ${t('integrity.disclaimer')}</div>` : ''}
        <div class="flex gap-4 mb-6" style="flex-wrap:wrap">
          <div class="score-gauge">
            <div class="score-ring" style="--score:${report?.final_grade || 0}"><span>${report?.final_grade ?? '—'}</span></div>
            <div class="score-label">${t('feedback.grade')}</div>
          </div>
          <div class="score-gauge">
            <div class="score-ring" style="--score:${report?.plagiarism_score || 0};${report?.plagiarism_score > 20 ? '--accent:var(--danger)' : ''}"><span>${report?.plagiarism_score ?? 0}%</span></div>
            <div class="score-label">${t('integrity.plagiarism')}</div>
          </div>
          <div class="score-gauge">
            <div class="score-ring" style="--score:${report?.ai_probability_score || 0};${report?.ai_probability_score > 80 ? '--accent:var(--danger)' : ''}"><span>${report?.ai_probability_score ?? 0}%</span></div>
            <div class="score-label">${t('integrity.aiProb')}</div>
          </div>
        </div>
        <div class="flex flex-col gap-6">
          <!-- Student Essay Section -->
          <div class="essay-detail-section">
            <h4 class="mb-2 flex items-center gap-2">📄 ${t('report.studentEssay')} <span class="text-xs text-muted font-normal">(${sub.word_count} kelime)</span></h4>
            <div class="card" style="padding:20px; background: var(--bg-app); border: 1px solid var(--border); font-size: 0.95rem; line-height: 1.7; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">${sub.content}</div>
          </div>

          <!-- Integrity Heatmap (if segments exist) -->
          ${segments.length > 0 ? `
            <div>
              <h4 class="mb-2">🚨 ${t('report.integrityHeatmap')}</h4>
              <div class="card" style="padding:16px; background: var(--bg-card);">
                <div class="heatmap-text" style="font-size: 0.9rem;">
                  ${_renderHeatmapText(sub.content, segments)}
                </div>
              </div>
            </div>
          ` : ''}

          <!-- AI Feedback Section -->
          <div>
            <h4 class="mb-2">🤖 ${t('report.aiFeedback')}</h4>
            <div class="card feedback-content" id="feedback-md-content" style="padding:24px; background: var(--bg-card); border-left: 4px solid var(--accent);">
              ${report?.ai_feedback_markdown || t('feedback.pending')}
            </div>
          </div>
        </div>
        <div class="flex gap-2 mt-4 justify-between">
          ${report ? `
            <div class="form-group" style="max-width:120px">
              <label class="form-label">${t('teacher.overrideGrade')}</label>
              <input type="number" class="input font-mono" min="0" max="100" value="${report.final_grade ?? ''}" id="override-grade" data-sub-id="${sub.id}">
            </div>
            <button class="btn btn-primary btn-sm" id="save-override-btn" data-sub-id="${sub.id}">${t('common.save')}</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function _renderHeatmapText(content, segments) {
  if (!content || segments.length === 0) return content || '';
  let result = '';
  let lastEnd = 0;
  const sorted = [...segments].sort((a, b) => a.start_offset - b.start_offset);
  sorted.forEach(seg => {
    if (seg.start_offset > lastEnd) {
      result += _escHtml(content.substring(lastEnd, seg.start_offset));
    }
    const level = seg.confidence > 80 ? 'critical' : seg.confidence > 60 ? 'high' : seg.confidence > 40 ? 'medium' : 'low';
    result += `<span class="heatmap-segment heatmap-${level}" title="${seg.type}: ${seg.confidence}%">${_escHtml(seg.text)}</span>`;
    lastEnd = seg.end_offset;
  });
  if (lastEnd < content.length) result += _escHtml(content.substring(lastEnd));
  return result;
}

function _escHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function attachEvents() {
  // Tab navigation
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = el.dataset.tab;
      _saveNav();
      _rerender();
    });
  });

  // Real-time subscription
  if (!DB.isMock() && !_realtimeChannel) {
    _realtimeChannel = DB.client()
      .channel('teacher_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => {
        _debouncedRerender();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback_reports' }, () => {
        _debouncedRerender();
      })
      .subscribe();
  }

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
  const sidebar = document.getElementById('teacher-sidebar');
  const overlay = document.getElementById('teacher-sidebar-overlay');
  
  const closeSidebar = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
  };

  document.getElementById('teacher-hamburger')?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
  });
  
  overlay?.addEventListener('click', closeSidebar);
  // Auto-close sidebar on link click in mobile
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _activeTab = el.dataset.tab;
      _saveNav();
      closeSidebar();
      _rerender();
    });
  });
  document.getElementById('new-class-btn')?.addEventListener('click', () => {
    const area = document.getElementById('class-modal-area');
    if (!area) return;
    const t = I18n.t.bind(I18n);
    area.innerHTML = `
      <div class="modal-overlay" id="class-modal-overlay">
        <div class="modal">
          <div class="modal-header"><div class="modal-title">${t('class.create')}</div><button class="btn btn-ghost btn-sm" id="close-class-modal">${t('common.close')}</button></div>
          <form id="class-form" class="flex flex-col gap-4">
            <div class="form-group"><label class="form-label">${t('class.name')} *</label><input type="text" id="cf-name" class="input" required placeholder="e.g. Çeviri 101"></div>
            <button type="submit" class="btn btn-primary btn-lg">${t('common.save')}</button>
          </form>
        </div>
      </div>`;
    document.getElementById('close-class-modal')?.addEventListener('click', () => { area.innerHTML = ''; });
    document.getElementById('class-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'class-modal-overlay') area.innerHTML = ''; });
    document.getElementById('class-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = Store.getState('currentUser');
      
      // Kullanıcı kimliği doğrulaması
      if (!user || !user.id) {
        Store.toast('error', 'Oturum hatası! Lütfen tekrar giriş yapın.');
        return;
      }

      const cls = { 
          id: DB.generateUUID(),
          teacher_id: user.id, // user?.id yerine doğrudan kesin ID
          class_name: document.getElementById('cf-name').value, 
          join_code: DB.generateJoinCode(),
          created_at: new Date().toISOString()
      };

      try {
        const { data, error } = await DB.query('classes', { insert: cls });
        if (error) throw error;
        Store.toast('success', I18n.t('class.create') + ' ✓');
        area.innerHTML = '';
        // DATA_CHANGED from DB.query → app.js → silent refresh (no manual rerender needed)
      } catch (err) {
        console.error("DB Error:", err);
        Store.toast('error', "Hata: " + (err.message || "Sınıf kaydedilemedi. Supabase RLS ayarlarını kontrol et!"));
      }
    });
  });

  // Copy join code
  document.querySelectorAll('.join-code-badge[data-code]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard?.writeText(el.dataset.code); Store.toast('success', I18n.t('class.codeCopied')); });
  });

  // Delete class
  document.querySelectorAll('.delete-class-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!confirm(I18n.t('class.deleteConfirm'))) return;
      const classId = el.dataset.classId;
      
      try {
        // Mock veya Supabase fark etmeksizin DB.query kullanılır
        // Bu sayede her işlem DATA_CHANGED eventini otomatik fırlatır
        await DB.query('class_enrollments', { del: true, eq: ['class_id', classId] });
        await DB.query('tasks', { del: true, eq: ['class_id', classId] });
        
        const res = await DB.query('classes', { del: true, eq: ['id', classId] });
        
        if (res.error) throw res.error;
        if (!DB.isMock() && res.data && res.data.length === 0) {
          throw new Error("Veritabanı güvenliği (RLS) bu sınıfı silmenizi engelledi veya sınıf bulunamadı.");
        }
        
        Store.toast('success', I18n.t('class.delete') + ' ✓');
        if (_activeClassId === classId) { _activeClassId = null; _saveNav(); }
        // app.js dinleyicisi DATA_CHANGED ile arayüzü anında yeniler
      } catch (err) {
        console.error("Delete Class Error:", err);
        Store.toast('error', "Sınıf silinemedi: " + (err.message || 'Bilinmeyen hata'));
      }
    });
  });

  // Click class card -> show detail
  document.querySelectorAll('.class-card[data-class-id]').forEach(el => {
    el.addEventListener('click', () => {
      _activeClassId = el.dataset.classId;
      _activeTab = 'tasks';
      _saveNav();
      _rerender();
    });
  });

  // Back to classes
  document.getElementById('back-to-classes')?.addEventListener('click', () => {
    _activeClassId = null;
    _activeTab = 'classes';
    _saveNav();
    _rerender();
  });

  // New task
  document.getElementById('new-task-btn')?.addEventListener('click', async () => {
    const area = document.getElementById('task-modal-area');
    if (area) { 
      let classes = [];
      if (DB.isMock()) {
         classes = DB.mock.classes.filter(c => c.teacher_id === Store.getState('currentUser')?.id);
      } else {
         const { data } = await DB.query('classes', { eq: ['teacher_id', Store.getState('currentUser')?.id] });
         classes = data || [];
      }
      area.innerHTML = _renderTaskModal(I18n.t.bind(I18n), classes); 
      _attachModalEvents(classes); 
    }
  });

  // Batch process
  document.querySelectorAll('.batch-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = el.dataset.taskId;
      let task = null;
      if (DB.isMock()) {
        task = DB.mock.tasks.find(t => t.id === taskId);
      } else {
        const { data } = await DB.query('tasks', { eq: ['id', taskId] });
        task = data?.[0];
      }
      if (!task) return;
      el.disabled = true;
      el.textContent = I18n.t('teacher.processing');

      // Show processing overlay
      const area = document.getElementById('processing-area');
      if (area) {
        area.innerHTML = `
          <div class="processing-overlay mt-4">
            <div class="processing-spinner"></div>
            <h3>${I18n.t('teacher.processing')}</h3>
            <div class="progress-bar mt-4"><div class="progress-bar__fill" id="proc-bar" style="width:0%"></div></div>
            <div class="text-sm text-muted mt-2" id="proc-status">0 / 0</div>
          </div>
        `;
      }

      const unsub = Store.subscribe(Store.Events.PROCESSING_PROGRESS, (state) => {
        const { total, completed, failed } = state.processingProgress;
        const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
        const bar = document.getElementById('proc-bar');
        const status = document.getElementById('proc-status');
        if (bar) bar.style.width = pct + '%';
        if (status) status.textContent = `${completed + failed} / ${total} (${failed} failed)`;
      });

      await QueueHandler.processTask(taskId, task);
      unsub();
      setTimeout(() => _rerender(), 500);
    });
  });

  // End early
  document.querySelectorAll('.end-early-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm("Bu görevin teslim süresini şimdi bitirmek istediğinize emin misiniz? Öğrenciler artık teslim yapamayacak.")) return;
      const taskId = el.dataset.taskId;
      await DB.query('tasks', { update: { deadline_datetime: new Date().toISOString() }, eq: ['id', taskId] });
      Store.toast('success', 'Görev süresi sonlandırıldı.');
      // DATA_CHANGED triggers silent refresh
    });
  });

  // Publish
  document.querySelectorAll('.publish-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(I18n.t('teacher.publishConfirm'))) return;
      const taskId = el.dataset.taskId;
      // Unified path: DB.query handles both mock and Supabase
      await DB.query('tasks', { update: { is_published: true }, eq: ['id', taskId] });
      if (DB.isMock()) {
        // Also publish all GRADED submissions for this task
        (DB.mock.submissions || []).filter(s => s.task_id === taskId && s.status === 'GRADED')
          .forEach(s => { s.status = 'PUBLISHED'; });
        try { localStorage.setItem('scholarfeedback_mock_db', JSON.stringify(DB.mock)); } catch(e) {}
      } else {
        // Göreve ait 'GRADED' olan tüm submission'ları 'PUBLISHED' yap
        await DB.client()
          .from('submissions')
          .update({ status: 'PUBLISHED' })
          .eq('task_id', taskId)
          .eq('status', 'GRADED');
      }
      Store.toast('success', I18n.t('teacher.publish') + ' ✓');
      // DATA_CHANGED triggers silent refresh
    });
  });

  // View report
  document.querySelectorAll('.view-report-btn').forEach(el => {
    el.addEventListener('click', async () => {
      try {
        const subId = el.dataset.subId;
        Store.dispatch(Store.Events.LOADING, true);
        
        let sub = null;
        let report = null;
        if (DB.isMock()) {
          sub = DB.mock.submissions.find(s => s.id === subId);
          report = DB.mock.feedback_reports.find(r => r.submission_id === subId);
        } else {
          const { data: sData } = await DB.query('submissions', { eq: ['id', subId] });
          sub = sData?.[0];
          const { data: rData } = await DB.query('feedback_reports', { eq: ['submission_id', subId] });
          report = rData?.[0];
        }

        if (sub && report) {
          // Immediate modal open with loading state
          const area = document.getElementById('report-modal-area');
          if (area) {
             area.innerHTML = `<div class="modal-overlay"><div class="modal"><h3>Yükleniyor...</h3></div></div>`;
          }

          let profilesList = Store.getState('profiles') || [];
          if (profilesList.length === 0) {
            try {
              const { data: pData } = await DB.query('profiles');
              profilesList = pData || [];
            } catch (e) { }
          }
          
          if (area) {
            area.innerHTML = _renderReportModal(sub, report, I18n.t.bind(I18n), profilesList);
            const mdEl = document.getElementById('feedback-md-content');
            if (mdEl && window.marked) mdEl.innerHTML = window.marked.parse(mdEl.textContent);
            document.getElementById('close-report-modal')?.addEventListener('click', () => { area.innerHTML = ''; });
            document.getElementById('report-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'report-modal-overlay') area.innerHTML = ''; });
            
            document.getElementById('save-override-btn')?.addEventListener('click', async () => {
              try {
                const val = parseInt(document.getElementById('override-grade')?.value);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                  if (DB.isMock()) {
                    report.final_grade = val;
                  } else {
                    await DB.query('feedback_reports', { update: { final_grade: val }, eq: ['submission_id', sub.id] });
                  }
                  Store.toast('success', I18n.t('teacher.overrideGrade') + ': ' + val);
                  area.innerHTML = '';
                  _rerender();
                }
              } catch (err) {
                Store.toast('error', 'Not güncellenemedi');
              }
            });
          }
        } else {
          Store.toast('warning', 'Rapor bulunamadı');
        }
      } catch (err) {
        console.error("View Report Error:", err);
        Store.toast('error', 'Rapor açılırken bir hata oluştu');
      } finally {
        Store.dispatch(Store.Events.LOADING, false);
      }
    });
  });

  // View essay only
  document.querySelectorAll('.view-essay-btn').forEach(el => {
    el.addEventListener('click', async () => {
      try {
        const subId = el.dataset.subId;
        Store.dispatch(Store.Events.LOADING, true);
        let sub = null;
        if (DB.isMock()) {
          sub = DB.mock.submissions.find(s => s.id === subId);
        } else {
          const { data: sData } = await DB.query('submissions', { eq: ['id', subId] });
          sub = sData?.[0];
        }

        if (sub) {
          const area = document.getElementById('report-modal-area');
          if (area) area.innerHTML = `<div class="modal-overlay"><div class="modal"><h3>Yükleniyor...</h3></div></div>`;

          let profilesList = Store.getState('profiles') || [];
          if (profilesList.length === 0) {
            try {
              const { data: pData } = await DB.query('profiles');
              profilesList = pData || [];
            } catch (e) { }
          }

          if (area) {
            area.innerHTML = _renderReportModal(sub, null, I18n.t.bind(I18n), profilesList);
            document.getElementById('close-report-modal')?.addEventListener('click', () => { area.innerHTML = ''; });
            document.getElementById('report-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'report-modal-overlay') area.innerHTML = ''; });
          }
        }
      } catch (err) {
        Store.toast('error', 'Metin görüntülenemedi');
      } finally {
        Store.dispatch(Store.Events.LOADING, false);
      }
    });
  });
}

function _attachModalEvents(classes = []) {
  document.getElementById('close-task-modal')?.addEventListener('click', () => {
    document.getElementById('task-modal-area').innerHTML = '';
  });
  document.getElementById('task-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'task-modal-overlay') document.getElementById('task-modal-area').innerHTML = '';
  });
  
  // Quick deadlines
  document.querySelectorAll('.quick-deadline').forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseFloat(btn.dataset.hours || 0);
      const minutes = parseFloat(btn.dataset.minutes || 0);
      const d = new Date(Date.now() + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000));
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById('tf-deadline').value = d.toISOString().slice(0, 16);
    });
  });

  document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const criteriaRaw = document.getElementById('tf-criteria').value;
    const criteria = criteriaRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const classSelect = document.getElementById('tf-class');
    const classId = (classSelect && classSelect.value) ? classSelect.value : null;

    if (!classId && classes.length > 0) {
      Store.toast('error', 'Lütfen bir sınıf seçin!');
      return;
    }
    
    const newTask = {
      id: DB.generateUUID(),
      created_by: Store.getState('currentUser')?.id,
      class_id: classId,
      title: document.getElementById('tf-title').value,
      description: document.getElementById('tf-desc').value,
      deadline_datetime: new Date(document.getElementById('tf-deadline').value).toISOString(),
      custom_criteria: criteria,
      language_policy: document.getElementById('tf-lang').value,
      scoring_framework: document.getElementById('tf-framework').value,
      show_integrity_to_student: document.getElementById('tf-show-integrity').checked,
      is_published: false,
      created_at: new Date().toISOString()
    };

    try {
      if (DB.isMock()) {
        newTask.id = 'task-' + Date.now().toString(36);
      }
      const { error } = await DB.query('tasks', { insert: newTask });
      if (error) throw error;
      Store.toast('success', I18n.t('teacher.newTask') + ' ✓');
      document.getElementById('task-modal-area').innerHTML = '';
      // DATA_CHANGED from DB.query triggers silent refresh — no manual _rerender() needed
    } catch (err) {
      console.error('[NewTask]', err);
      Store.toast('error', "Görev oluşturulamadı!");
    }
  });
}

function _rerender() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = render();
    attachEvents();
    _renderCharts();
  }
}

let _rerenderTimeout = null;
function _debouncedRerender() {
  if (_rerenderTimeout) clearTimeout(_rerenderTimeout);
  // DATA_CHANGED from DB.query already triggers app.js silent refresh.
  // This is kept as a local fallback for cases where no DB query fires.
  _rerenderTimeout = setTimeout(() => _rerender(), 500);
}

function _renderCharts() {
  const canvases = document.querySelectorAll('canvas[id^="chart-"]');
  if (canvases.length === 0 || !window.Chart) return;

  const reports = Store.getState('feedbackReports') || [];
  const subs = Store.getState('submissions') || [];
  const tasks = Store.getState('tasks') || [];

  canvases.forEach(canvas => {
    const classId = canvas.id.replace('chart-', '');
    const classTasks = tasks.filter(tk => tk.class_id === classId);
    const classTaskIds = classTasks.map(tk => tk.id);
    const classSubs = subs.filter(s => classTaskIds.includes(s.task_id));
    const classSubIds = classSubs.map(s => s.id);
    const classReports = reports.filter(r => classSubIds.includes(r.submission_id));

    if (classReports.length === 0) return;

    const labels = classReports.map((_, i) => `Öğrenci ${i + 1}`);
    new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Not', data: classReports.map(r => r.final_grade || 0), backgroundColor: 'rgba(99,102,241,0.6)', borderRadius: 6 },
          { label: 'İntihal %', data: classReports.map(r => r.plagiarism_score || 0), backgroundColor: 'rgba(245,158,11,0.5)', borderRadius: 6 },
          { label: 'AI Olasılığı %', data: classReports.map(r => r.ai_probability_score || 0), backgroundColor: 'rgba(6,182,212,0.5)', borderRadius: 6 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' }, max: 100 }
        }
      }
    });
  });
}

function cleanup() {
  if (_realtimeChannel) {
    _realtimeChannel.unsubscribe();
    _realtimeChannel = null;
  }
}

export default { render, refreshData, attachEvents, cleanup, afterMount: _renderCharts };
