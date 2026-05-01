/**
 * ScholarFeedback AI — Teacher Dashboard View
 */
import Store from '../store.js';
import I18n from '../i18n.js';
import DB from '../supabase-client.js';
import DeadlineEngine from '../services/deadline-engine.js';
import QueueHandler from '../services/queue-handler.js';

let _activeTab = 'classes';
let _selectedTask = null;
let _activeClassId = null;

async function render() {
  const t = I18n.t.bind(I18n);
  const user = Store.getState('currentUser');
  const tasks = DB.isMock() ? DB.mock.tasks : Store.getState('tasks');

  return `
    <div class="app-layout">
      ${_renderSidebar(user, t)}
      <div class="sidebar-overlay" id="teacher-sidebar-overlay"></div>
      <div class="main-content" id="teacher-main">
        ${_renderMobileHeader(t)}
        ${await _renderContent(t, tasks)}
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

async function _renderContent(t, tasks) {
  if (_activeTab === 'classes') return await _renderClasses(t);
  if (_activeTab === 'tasks') return _renderTasks(t, tasks);
  if (_activeTab === 'submissions') return _renderSubmissions(t, tasks);
  if (_activeTab === 'analytics') return _renderAnalytics(t);
  return '';
}

async function _renderClasses(t) {
  const user = Store.getState('currentUser');
  
  // Kullanıcı bilgisi henüz sisteme oturmadıysa bir yükleme ekranı göster
  if (!user || !user.id) {
    return `<div class="empty-state"><div class="processing-spinner"></div><div class="mt-2">Yükleniyor...</div></div>`;
  }

  // Kullanıcı hazırsa sadece o öğretmene ait sınıfları getir
  const { data: classes = [] } = await DB.query('classes', { eq: ['teacher_id', user.id] });
  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('class.title')}</h1><p class="page-subtitle">${t('app.subtitle')}</p></div>
      <button class="btn btn-primary" id="new-class-btn">➕ ${t('class.create')}</button>
    </div>
    <div class="class-grid">
      ${classes.map(cls => {
        const enrolled = DB.isMock() ? DB.mock.class_enrollments.filter(e => e.class_id === cls.id).length : 0;
        const taskCount = DB.isMock() ? DB.mock.tasks.filter(tk => tk.class_id === cls.id).length : 0;
        return `
          <div class="class-card ${_activeClassId === cls.id ? 'active' : ''}" data-class-id="${cls.id}">
            <div class="class-card-header">
              <div class="class-card-name">${cls.class_name}</div>
              <div class="join-code-badge" data-code="${cls.join_code}" title="Click to copy">${cls.join_code}</div>
            </div>
            <div class="class-card-meta">
              <span>👥 ${enrolled} ${t('teacher.students')}</span>
              <span>📋 ${t('class.taskCount', { count: taskCount })}</span>
            </div>
          </div>
        `;
      }).join('')}
      ${classes.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">🏫</div><div class="empty-state-text">${t('common.noData')}</div></div>` : ''}
    </div>
    <div id="class-modal-area"></div>
    <div id="class-detail-area"></div>
  `;
}

function _renderTasks(t, tasks) {
  // Filter tasks by active class if set
  if (_activeClassId) tasks = tasks.filter(tk => tk.class_id === _activeClassId);
  const activeClassName = _activeClassId ? (DB.isMock() ? DB.mock.classes.find(c => c.id === _activeClassId)?.class_name : '') : '';
  const subs = DB.isMock() ? DB.mock.submissions : [];
  const totalStudents = DB.isMock() ? DB.mock.profiles.filter(p => p.role === 'STUDENT').length : 0;
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
        const enrollments = DB.isMock() ? DB.mock.enrollments.filter(e => e.task_id === task.id) : [];
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
            <div class="task-card-footer">
              <div class="task-card-meta">👥 ${enrollments.length} ${t('teacher.students')}</div>
              <div class="flex gap-2">
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
  `;
}

function _renderSubmissions(t, tasks) {
  const subs = DB.isMock() ? DB.mock.submissions : [];
  const reports = DB.isMock() ? DB.mock.feedback_reports : [];
  const profiles = DB.isMock() ? DB.mock.profiles : [];

  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('teacher.submissions')}</h1></div>
    </div>
    <div class="disclaimer mb-4">
      ⚠️ ${t('integrity.disclaimer')}
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t('auth.fullName')}</th>
            <th>${t('teacher.tasks')}</th>
            <th>${t('common.status')}</th>
            <th>${t('integrity.riskScore')}</th>
            <th>${t('feedback.grade')}</th>
            <th>${t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${subs.map(sub => {
            const student = profiles.find(p => p.id === sub.student_id);
            const task = tasks.find(t => t.id === sub.task_id);
            const report = reports.find(r => r.submission_id === sub.id);
            const risk = report ? Math.round((report.plagiarism_score + report.ai_probability_score) / 2) : null;
            const isHighRisk = risk !== null && (report.plagiarism_score > 20 || report.ai_probability_score > 80);
            const statusBadge = sub.status === 'GRADED' ? 'badge-success' : sub.status === 'PROCESSING' ? 'badge-warning' : sub.status === 'PUBLISHED' ? 'badge-info' : 'badge-neutral';
            return `
              <tr>
                <td class="submission-name">${student?.full_name || 'Unknown'}</td>
                <td class="text-sm text-muted">${task?.title || ''}</td>
                <td><span class="badge ${statusBadge}">${t('status.' + sub.status)}</span></td>
                <td>
                  ${risk !== null ? `<span class="badge ${isHighRisk ? 'badge-risk' : 'badge-neutral'}">${risk}%${isHighRisk ? ' ⚠' : ''}</span>` : '<span class="text-muted">—</span>'}
                </td>
                <td class="font-mono font-bold">${report?.final_grade ?? '—'}</td>
                <td>
                  ${report ? `<button class="btn btn-ghost btn-sm view-report-btn" data-sub-id="${sub.id}">🔍</button>` : ''}
                </td>
              </tr>
            `;
          }).join('')}
          ${subs.length === 0 ? `<tr><td colspan="6" class="text-center text-muted" style="padding:32px">${t('common.noData')}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
    <div id="report-modal-area"></div>
  `;
}

function _renderAnalytics(t) {
  const reports = DB.isMock() ? DB.mock.feedback_reports : [];
  return `
    <div class="page-header">
      <div><h1 class="page-title">${t('teacher.analytics')}</h1></div>
    </div>
    ${reports.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">${t('common.noData')}<br><span class="text-xs text-muted">Run batch processing to see analytics</span></div>
      </div>
    ` : `
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Avg Grade</div>
          <div class="stat-value text-accent">${Math.round(reports.reduce((a, r) => a + (r.final_grade || 0), 0) / reports.length)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Plagiarism</div>
          <div class="stat-value" style="color:var(--warning-light)">${Math.round(reports.reduce((a, r) => a + (r.plagiarism_score || 0), 0) / reports.length)}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg AI Probability</div>
          <div class="stat-value" style="color:var(--cyan-light)">${Math.round(reports.reduce((a, r) => a + (r.ai_probability_score || 0), 0) / reports.length)}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">High Risk</div>
          <div class="stat-value text-danger">${reports.filter(r => r.risk_flag).length}</div>
        </div>
      </div>
      <div class="card"><canvas id="analytics-chart" height="300"></canvas></div>
    `}
  `;
}

function _renderTaskModal(t) {
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
                ${(DB.isMock() ? DB.mock.classes.filter(c => c.teacher_id === Store.getState('currentUser')?.id) : []).map(c =>
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

function _renderReportModal(sub, report, t) {
  const profiles = DB.isMock() ? DB.mock.profiles : [];
  const student = profiles.find(p => p.id === sub.student_id);
  const segments = report?.integrity_details?.suspicious_segments || [];
  const heatmap = report?.integrity_details?.heatmap_data || [];
  const isHighRisk = report && (report.plagiarism_score > 20 || report.ai_probability_score > 80);

  return `
    <div class="modal-overlay" id="report-modal-overlay">
      <div class="modal" style="max-width:800px">
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
        ${segments.length > 0 ? `
          <h4 class="mb-2">${t('integrity.suspicious')}</h4>
          <div class="card mb-4" style="padding:16px">
            <div class="heatmap-text">
              ${_renderHeatmapText(sub.content, segments)}
            </div>
          </div>
        ` : ''}
        <h4 class="mb-2">${t('feedback.title')}</h4>
        <div class="feedback-content" id="feedback-md-content">${report?.ai_feedback_markdown || t('feedback.pending')}</div>
        <div class="flex gap-2 mt-4 justify-between">
          <div class="form-group" style="max-width:120px">
            <label class="form-label">${t('teacher.overrideGrade')}</label>
            <input type="number" class="input font-mono" min="0" max="100" value="${report?.final_grade ?? ''}" id="override-grade" data-sub-id="${sub.id}">
          </div>
          <button class="btn btn-primary btn-sm" id="save-override-btn" data-sub-id="${sub.id}">${t('common.save')}</button>
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
          teacher_id: user.id, // user?.id yerine doğrudan kesin ID
          class_name: document.getElementById('cf-name').value, 
          join_code: DB.generateJoinCode()
          // id ve created_at kısımları Supabase tarafından otomatik atanacak
      };

      try {
        const { error } = await DB.query('classes', { insert: cls });
        
        if (error) throw error;

        Store.toast('success', I18n.t('class.create') + ' ✓ — ' + I18n.t('class.joinCode') + ': ' + cls.join_code);
        area.innerHTML = '';
        _rerender(); // Sayfayı yenile

      } catch (err) {
        console.error("Sınıf kaydedilirken hata:", err);
        Store.toast('error', "Sınıf oluşturulamadı!");
      }
    });
  });

  // Copy join code
  document.querySelectorAll('.join-code-badge[data-code]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard?.writeText(el.dataset.code); Store.toast('success', I18n.t('class.codeCopied')); });
  });

  // Click class card -> show detail
  document.querySelectorAll('.class-card[data-class-id]').forEach(el => {
    el.addEventListener('click', () => {
      _activeClassId = el.dataset.classId;
      _activeTab = 'tasks';
      _rerender();
    });
  });

  // Back to classes
  document.getElementById('back-to-classes')?.addEventListener('click', () => {
    _activeClassId = null;
    _activeTab = 'classes';
    _rerender();
  });

  // New task
  document.getElementById('new-task-btn')?.addEventListener('click', () => {
    const area = document.getElementById('task-modal-area');
    if (area) { area.innerHTML = _renderTaskModal(I18n.t.bind(I18n)); _attachModalEvents(); }
  });

  // Batch process
  document.querySelectorAll('.batch-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = el.dataset.taskId;
      const task = (DB.isMock() ? DB.mock.tasks : []).find(t => t.id === taskId);
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

  // Publish
  document.querySelectorAll('.publish-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(I18n.t('teacher.publishConfirm'))) return;
      const taskId = el.dataset.taskId;
      if (DB.isMock()) {
        const task = DB.mock.tasks.find(t => t.id === taskId);
        if (task) task.is_published = true;
        DB.mock.submissions.filter(s => s.task_id === taskId && s.status === 'GRADED')
          .forEach(s => { s.status = 'PUBLISHED'; });
      }
      Store.toast('success', I18n.t('teacher.publish') + ' ✓');
      _rerender();
    });
  });

  // View report
  document.querySelectorAll('.view-report-btn').forEach(el => {
    el.addEventListener('click', () => {
      const subId = el.dataset.subId;
      const sub = (DB.isMock() ? DB.mock.submissions : []).find(s => s.id === subId);
      const report = (DB.isMock() ? DB.mock.feedback_reports : []).find(r => r.submission_id === subId);
      if (sub && report) {
        const area = document.getElementById('report-modal-area');
        if (area) {
          area.innerHTML = _renderReportModal(sub, report, I18n.t.bind(I18n));
          // Render markdown
          const mdEl = document.getElementById('feedback-md-content');
          if (mdEl && window.marked) mdEl.innerHTML = window.marked.parse(mdEl.textContent);
          document.getElementById('close-report-modal')?.addEventListener('click', () => { area.innerHTML = ''; });
          document.getElementById('report-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'report-modal-overlay') area.innerHTML = ''; });
          // Override grade
          document.getElementById('save-override-btn')?.addEventListener('click', () => {
            const val = parseInt(document.getElementById('override-grade')?.value);
            if (!isNaN(val) && val >= 0 && val <= 100) {
              report.final_grade = val;
              Store.toast('success', I18n.t('teacher.overrideGrade') + ': ' + val);
              area.innerHTML = '';
            }
          });
        }
      }
    });
  });
}

function _attachModalEvents() {
  document.getElementById('close-task-modal')?.addEventListener('click', () => {
    document.getElementById('task-modal-area').innerHTML = '';
  });
  document.getElementById('task-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'task-modal-overlay') document.getElementById('task-modal-area').innerHTML = '';
  });
  document.getElementById('task-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const criteriaRaw = document.getElementById('tf-criteria').value;
    const criteria = criteriaRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const classSelect = document.getElementById('tf-class');
    const newTask = {
      id: 'task-' + Date.now().toString(36),
      created_by: Store.getState('currentUser')?.id,
      class_id: classSelect ? classSelect.value : null,
      title: document.getElementById('tf-title').value,
      description: document.getElementById('tf-desc').value,
      deadline_datetime: new Date(document.getElementById('tf-deadline').value).toISOString(),
      custom_criteria: JSON.stringify(criteria),
      language_policy: document.getElementById('tf-lang').value,
      scoring_framework: document.getElementById('tf-framework').value,
      show_integrity_to_student: document.getElementById('tf-show-integrity').checked,
      is_published: false,
      created_at: new Date().toISOString()
    };
    if (DB.isMock()) {
      DB.mock.tasks.push(newTask);
      // Auto-enroll all students
      DB.mock.profiles.filter(p => p.role === 'STUDENT').forEach(p => {
        DB.mock.enrollments.push({ id: 'e-' + Date.now().toString(36) + Math.random().toString(36).slice(2,4), task_id: newTask.id, student_id: p.id, whitelisted_late: false });
      });
    }
    Store.toast('success', I18n.t('teacher.newTask') + ' ✓');
    document.getElementById('task-modal-area').innerHTML = '';
    _rerender();
  });
}

async function _rerender() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = await render();
    attachEvents();
    _renderCharts();
  }
}

function _renderCharts() {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas || !window.Chart) return;
  const reports = DB.isMock() ? DB.mock.feedback_reports : [];
  if (reports.length === 0) return;

  const labels = reports.map((_, i) => `Student ${i + 1}`);
  new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Grade', data: reports.map(r => r.final_grade || 0), backgroundColor: 'rgba(99,102,241,0.6)', borderRadius: 6 },
        { label: 'Plagiarism %', data: reports.map(r => r.plagiarism_score || 0), backgroundColor: 'rgba(245,158,11,0.5)', borderRadius: 6 },
        { label: 'AI Probability %', data: reports.map(r => r.ai_probability_score || 0), backgroundColor: 'rgba(6,182,212,0.5)', borderRadius: 6 },
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
}

export default { render, attachEvents, afterMount: _renderCharts };
