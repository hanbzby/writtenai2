/**
 * ScholarFeedback AI — Main Application Router
 */
import Store from './store.js';
import I18n from './i18n.js';
import Auth from './auth.js';
import LoginView from './views/login.js';
import TeacherDashboard from './views/teacher-dashboard.js';
import StudentDashboard from './views/student-dashboard.js';

const app = document.getElementById('app');

// ── Toast Renderer ──
function renderToasts() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toasts = Store.getState('toasts') || [];
  container.innerHTML = toasts.map(t =>
    `<div class="toast toast-${t.type}">${t.message}</div>`
  ).join('');
}

// ── View Router ──
async function renderView(state) {
  const view = state?.activeView || Store.getState('activeView');

  // Cleanup previous view
  if (StudentDashboard.cleanup) StudentDashboard.cleanup();
  if (TeacherDashboard.cleanup) TeacherDashboard.cleanup();

  switch (view) {
    case 'teacher':
      // Fetch initial data before rendering
      await TeacherDashboard.refreshData();
      app.innerHTML = TeacherDashboard.render();
      TeacherDashboard.attachEvents();
      if (TeacherDashboard.afterMount) TeacherDashboard.afterMount();
      break;
    case 'student':
      await StudentDashboard.refreshData();
      app.innerHTML = StudentDashboard.render();
      StudentDashboard.attachEvents();
      break;
    case 'login':
    default:
      app.innerHTML = LoginView.render();
      LoginView.attachEvents();
      break;
  }
}

// ── Subscribe to state changes ──
Store.subscribe(Store.Events.AUTH_CHANGED, renderView);
Store.subscribe(Store.Events.LANGUAGE_CHANGED, renderView);
Store.subscribe(Store.Events.TOAST, renderToasts);

// ── Initialize ──
async function init() {
  // Setup Supabase auth state listener (token refresh, session sync)
  Auth.setupAuthListener();

  // Check for existing session on page load
  const session = await Auth.checkSession();
  if (!session) {
    // No active session found, render login explicitly
    await renderView({ activeView: 'login' });
  } else {
    // If session exists, _setUser in checkSession already dispatched AUTH_CHANGED, 
    // which triggers renderView() to show the dashboard.
  }

  console.log('[ScholarFeedback AI] Initialized (LIVE MODE)');
}

init();
