/**
 * ScholarFeedback AI — Auth Module
 * Stage 3: Session persistence via localStorage + onAuthStateChanged.
 */
import Store from './store.js';
import DB from './supabase-client.js';
import I18n from './i18n.js';

const SESSION_KEY = 'scholarfeedback_session';

const Auth = {
  async login(email, password) {
    if (DB.isMock()) return this._mockLogin(email, password);
    const { data, error } = await DB.client().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    
    // Ensure profile exists in DB
    const profile = await this._ensureProfile(data.user);
    this._setUser(profile);
    return profile;
  },

  async register(email, password, fullName, role) {
    if (DB.isMock()) return this._mockRegister(email, fullName, role);
    const { data, error } = await DB.client().auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: role || 'STUDENT' } }
    });
    if (error) throw new Error(error.message);
    
    // Ensure profile exists in DB
    const profile = await this._ensureProfile(data.user, fullName, role);
    this._setUser(profile);
    return profile;
  },

  async logout() {
    if (!DB.isMock()) await DB.client().auth.signOut();
    // Clear persisted session
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    Store.dispatch(Store.Events.AUTH_CHANGED, {
      currentUser: null, isAuthenticated: false, activeView: 'login',
      userClasses: [], activeClass: null
    });
  },

  /**
   * Check for existing session — supports both Supabase and mock mode.
   * In mock mode, reads from localStorage for session persistence.
   */
  async checkSession() {
    if (DB.isMock()) {
      try {
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved) {
          const profile = JSON.parse(saved);
          if (profile?.id && profile?.role) {
            // Verify the profile still exists in mock data
            const exists = DB.mock.profiles.find(p => p.id === profile.id);
            if (exists) {
              this._setUser(exists);
              return exists;
            }
          }
        }
      } catch {}
      return null;
    }

    // Real Supabase session check
    const { data: { session } } = await DB.client().auth.getSession();
    if (session?.user) {
      const profile = await this._fetchProfile(session.user.id);
      this._setUser(profile);
      return profile;
    }
    return null;
  },

  /**
   * Listen for auth state changes (Supabase live mode).
   * Called once at init to handle token refresh and session changes.
   */
  setupAuthListener() {
    if (DB.isMock() || !DB.client()) return;
    DB.client().auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await this._fetchProfile(session.user.id);
        this._setUser(profile);
      } else if (event === 'SIGNED_OUT') {
        Store.dispatch(Store.Events.AUTH_CHANGED, {
          currentUser: null, isAuthenticated: false, activeView: 'login',
          userClasses: [], activeClass: null
        });
      }
      // TOKEN_REFRESHED is handled automatically by Supabase client
    });
  },

  // ── Internal ──
  async _fetchProfile(userId) {
    const { data } = await DB.query('profiles', { eq: ['id', userId] });
    return data?.[0] || null;
  },

  async _ensureProfile(user, fullName, role) {
    let profile = await this._fetchProfile(user.id);
    if (!profile) {
      const newProfile = {
        id: user.id,
        full_name: fullName || user.user_metadata?.full_name || 'User',
        role: role || user.user_metadata?.role || 'STUDENT',
        language_pref: 'tr'
      };
      if (!DB.isMock()) {
        const { data, error } = await DB.client().from('profiles').upsert(newProfile).select();
        if (!error && data?.length) profile = data[0];
      } else {
        DB.mock.profiles.push(newProfile);
        profile = newProfile;
      }
    }
    return profile;
  },

  _setUser(profile) {
    if (!profile) return;
    I18n.setLang(profile.language_pref || 'tr');

    // Persist session to localStorage
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: profile.id, full_name: profile.full_name,
        role: profile.role, language_pref: profile.language_pref
      }));
    } catch {}

    // Load user's classes
    const userClasses = this._loadUserClasses(profile);

    Store.dispatch(Store.Events.AUTH_CHANGED, {
      currentUser: profile,
      isAuthenticated: true,
      language: profile.language_pref || 'tr',
      activeView: profile.role === 'ADMIN' ? 'teacher' : 'student',
      userClasses,
      activeClass: null
    });
  },

  /** Load classes for the user based on role */
  _loadUserClasses(profile) {
    if (!DB.isMock()) return []; // Will be loaded async in real mode
    if (profile.role === 'ADMIN') {
      return DB.mock.classes.filter(c => c.teacher_id === profile.id);
    } else {
      const classIds = DB.mock.class_enrollments
        .filter(ce => ce.student_id === profile.id)
        .map(ce => ce.class_id);
      return DB.mock.classes.filter(c => classIds.includes(c.id));
    }
  },

  _mockLogin(email, password) {
    const isAdmin = email.toLowerCase().includes('admin') || email.toLowerCase().includes('teacher');
    const profile = isAdmin ? DB.mock.profiles[0] : DB.mock.profiles[1];
    this._setUser(profile);
    return profile;
  },

  _mockRegister(email, fullName, role) {
    const id = 'user-' + Date.now().toString(36);
    const profile = { id, full_name: fullName, role: role || 'STUDENT', language_pref: 'tr', created_at: new Date().toISOString() };
    DB.mock.profiles.push(profile);
    this._setUser(profile);
    return profile;
  }
};

export default Auth;
