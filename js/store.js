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
    // ── Stage 3: Class Management ──
    userClasses: [],          // classes the user owns (teacher) or is enrolled in (student)
    activeClass: null,        // currently selected class { id, class_name, join_code, ... }
  };

  // ── Subscribers (Pub/Sub) ──
  const _listeners = {};

  /**
   * Subscribe to a state event.
   * @param {string} event - Event name (e.g., 'AUTH_CHANGED')
   * @param {Function} callback - fn(newState)
   * @returns {Function} unsubscribe function
   */
  function subscribe(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return () => {
      _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Dispatch a state change event.
   * @param {string} event - Event name
   * @param {Object} payload - Partial state update
   */
  function dispatch(event, payload) {
    // Merge payload into state
    if (payload && typeof payload === 'object') {
      Object.assign(_state, payload);
    }
    // Notify subscribers
    const callbacks = _listeners[event] || [];
    callbacks.forEach(cb => {
      try { cb({ ..._state }); }
      catch (e) { console.error(`[Store] Subscriber error on ${event}:`, e); }
    });
    // Also notify wildcard listeners
    (_listeners['*'] || []).forEach(cb => {
      try { cb(event, { ..._state }); }
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
    dispatch('TOAST', { toasts: _state.toasts });
    if (duration > 0) {
      setTimeout(() => {
        _state.toasts = _state.toasts.filter(x => x.id !== id);
        dispatch('TOAST', { toasts: _state.toasts });
      }, duration);
    }
    return id;
  }

  // ── Event Constants ──
  const Events = Object.freeze({
    AUTH_CHANGED: 'AUTH_CHANGED',
    LANGUAGE_CHANGED: 'LANGUAGE_CHANGED',
    VIEW_CHANGED: 'VIEW_CHANGED',
    TASKS_LOADED: 'TASKS_LOADED',
    TASK_SELECTED: 'TASK_SELECTED',
    SUBMISSIONS_LOADED: 'SUBMISSIONS_LOADED',
    SUBMISSION_UPDATED: 'SUBMISSION_UPDATED',
    FEEDBACK_READY: 'FEEDBACK_READY',
    PROCESSING_PROGRESS: 'PROCESSING_PROGRESS',
    PROCESSING_COMPLETE: 'PROCESSING_COMPLETE',
    TOAST: 'TOAST',
    LOADING: 'LOADING',
    // Stage 3
    CLASSES_LOADED: 'CLASSES_LOADED',
    CLASS_CHANGED: 'CLASS_CHANGED',
  });

  return Object.freeze({ subscribe, dispatch, getState, toast, Events });
})();

export default Store;
