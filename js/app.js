/**
 * ScholarFeedback AI — Main Application Router
 * Reactive: listens to Store events and re-renders on data changes.
 */
import Store from './store.js';
import I18n from './i18n.js';
import Auth from './auth.js';
import DB from './supabase-client.js';
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

// ── Debounced Silent Re-render ──
// Called when DATA_CHANGED or REALTIME_UPDATE fires.
// Refetches data and re-renders the active view without a full page reload.
let _refreshTimer = null;
function _debouncedSilentRefresh(delayMs = 300) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async () => {
    const view = Store.getState('activeView');
    if (view === 'teacher') {
      await TeacherDashboard.refreshData();
      _rerenderTeacher();
    } else if (view === 'student') {
      await StudentDashboard.refreshData();
      _rerenderStudent();
    }
  }, delayMs);
}

function _rerenderTeacher() {
  app.innerHTML = TeacherDashboard.render();
  TeacherDashboard.attachEvents();
  if (TeacherDashboard.afterMount) TeacherDashboard.afterMount();
}

function _rerenderStudent() {
  app.innerHTML = StudentDashboard.render();
  StudentDashboard.attachEvents();
}

// ── Subscribe to state changes ──
Store.subscribe(Store.Events.AUTH_CHANGED,     renderView);
Store.subscribe(Store.Events.LANGUAGE_CHANGED, renderView);
Store.subscribe(Store.Events.TOAST,            renderToasts);

// Reactive: any DB write (mock or Supabase) triggers a silent refresh
Store.subscribe(Store.Events.DATA_CHANGED, () => {
  _debouncedSilentRefresh(300);
});

// Reactive: Supabase Realtime pushed a change
Store.subscribe(Store.Events.REALTIME_UPDATE, () => {
  _debouncedSilentRefresh(150); // faster for realtime
});

// Reactive: student submission/report data updated
Store.subscribe(Store.Events.REFRESH_STUDENT_DATA, async (state) => {
  const view = Store.getState('activeView');
  if (view === 'student') {
    // Refetch full data so all derived state (classes, tasks, etc.) is consistent
    await StudentDashboard.refreshData();
    _rerenderStudent();
  }
});

// ── Initialize ──
async function init() {
  // Setup Supabase auth state listener (token refresh, session sync)
  Auth.setupAuthListener();

  // Start Supabase Realtime subscriptions (no-op in mock mode)
  DB.subscribeRealtime((table, payload) => {
    console.log(`[Realtime] ${table} ${payload.eventType}`, payload.new || payload.old);
  });

  // Check for existing session on page load
  const session = await Auth.checkSession();
  if (!session) {
    await renderView({ activeView: 'login' });
  }
  // If session exists, AUTH_CHANGED was already dispatched by checkSession → renderView runs

  console.log('[ScholarFeedback AI] Initialized — Reactive mode active');
}

init();
