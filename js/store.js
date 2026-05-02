/**
 * ScholarFeedback AI — Centralized State Store + Pub/Sub Bus
 * Single source of truth. Views read, services dispatch.
 */

const Store = (() => {
  // ── Initial State ──
  const _state = {
    currentUser: null,        // { id, full_name, role, language_pref }
    isAuthenticated: false,
    language: 'tr',           // 'tr' | 'en'
    activeView: 'login',      // 'login' | 'teacher' | 'student'
    tasks: [],
    activeTask: null,
    submissions: [],
    enrollments: [],
    feedbackReports: [],
    processingQueue: [],
    processingProgress: { total: 0, completed: 0, failed: 0 },
    isProcessing: false,
    isLoading: false,
    toasts: [],               // { id, type, message, duration }
    profiles: [],             // Cached profiles for dashboard use
    // ── Class Management ──
    userClasses: [],          // classes the user owns (teacher) or is enrolled in (student)
    activeClass: null,        // currently selected class
    teacherProfiles: [],      // cached teacher profiles for student view
  };

  // ── Subscribers (Pub/Sub) ──
  const _listeners = {};

  /**
   * Subscribe to a state event.
   * @param {string} event - Event name or '*' for all events
   * @param {Function} callback - fn(newState) or fn(event, newState) for '*'
   * @returns {Function} unsubscribe function
   */
  function subscribe(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return () => {
      _listeners[event] = (_listeners[event] || []).filter(cb => cb !== callback);
    };
  }

  /**
   * Dispatch a state change event.
   * @param {string} event - Event name
   * @param {*} payload - Partial state update (object) or scalar (boolean etc.)
   */
  function dispatch(event, payload) {
    // Merge object payloads into state
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      Object.assign(_state, payload);
    } else if (payload !== undefined && typeof payload !== 'object') {
      // Handle scalar dispatches like LOADING: true
      if (event === Events.LOADING) _state.isLoading = payload;
    }

    // Notify specific event subscribers
    const snapshot = { ..._state };
    (_listeners[event] || []).forEach(cb => {
      try { cb(snapshot); }
      catch (e) { console.error(`[Store] Subscriber error on ${event}:`, e); }
    });

    // Notify wildcard listeners
    (_listeners['*'] || []).forEach(cb => {
      try { cb(event, snapshot); }
      catch (e) { console.error(`[Store] Wildcard subscriber error:`, e); }
    });
  }

  /**
   * Read a state value (immutable copy).
   * @param {string} [key] - Specific key, or undefined for full state
   */
  function getState(key) {
    if (key) {
      const val = _state[key];
      return (typeof val === 'object' && val !== null) ? JSON.parse(JSON.stringify(val)) : val;
    }
    return JSON.parse(JSON.stringify(_state));
  }

  /**
   * Show a toast notification.
   */
  function toast(type, message, duration = 4000) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const t = { id, type, message, duration };
    _state.toasts = [..._state.toasts, t];
    dispatch(Events.TOAST, { toasts: _state.toasts });
    if (duration > 0) {
      setTimeout(() => {
        _state.toasts = _state.toasts.filter(x => x.id !== id);
        dispatch(Events.TOAST, { toasts: _state.toasts });
      }, duration);
    }
    return id;
  }

  // ── Event Constants ──
  const Events = Object.freeze({
    AUTH_CHANGED:          'AUTH_CHANGED',
    LANGUAGE_CHANGED:      'LANGUAGE_CHANGED',
    VIEW_CHANGED:          'VIEW_CHANGED',
    TASKS_LOADED:          'TASKS_LOADED',
    TASK_SELECTED:         'TASK_SELECTED',
    SUBMISSIONS_LOADED:    'SUBMISSIONS_LOADED',
    SUBMISSION_UPDATED:    'SUBMISSION_UPDATED',
    FEEDBACK_READY:        'FEEDBACK_READY',
    PROCESSING_PROGRESS:   'PROCESSING_PROGRESS',
    PROCESSING_COMPLETE:   'PROCESSING_COMPLETE',
    TOAST:                 'TOAST',
    LOADING:               'LOADING',
    // Class management
    CLASSES_LOADED:        'CLASSES_LOADED',
    CLASS_CHANGED:         'CLASS_CHANGED',
    PROFILES_LOADED:       'PROFILES_LOADED',
    // Reactive data refresh triggers
    DATA_CHANGED:          'DATA_CHANGED',          // generic: any table mutated
    REFRESH_STUDENT_DATA:  'REFRESH_STUDENT_DATA',  // student submissions/reports refreshed
    REALTIME_UPDATE:       'REALTIME_UPDATE',        // Supabase realtime pushed a change
  });

  return Object.freeze({ subscribe, dispatch, getState, toast, Events });
})();

export default Store;
