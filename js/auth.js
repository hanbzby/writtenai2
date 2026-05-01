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
    if (!DB.client()) throw new Error("Supabase client not initialized.");
    const { data, error } = await DB.client().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    
    // Ensure profile exists in DB
    const profile = await this._ensureProfile(data.user);
    this._setUser(profile);
    return profile;
  },

  async register(email, password, fullName, role) {
    if (!DB.client()) throw new Error("Supabase client not initialized.");
    const { data, error } = await DB.client().auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: role || 'STUDENT' } }
    });
    if (error) throw new Error(error.message);
    
    if (!data.user) throw new Error("User creation failed.");
    
    // Ensure profile exists in DB
    const profile = await this._ensureProfile(data.user, fullName, role);
    this._setUser(profile);
    return profile;
  },

  async logout() {
    if (DB.client()) {
      await DB.client().auth.signOut();
    }
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
    if (!DB.client()) return null;

    // Real Supabase session check using getUser for extra security
    const { data: { user }, error } = await DB.client().auth.getUser();
    if (user) {
      const profile = await this._fetchProfile(user.id);
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
    if (!DB.client()) return;
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
      const { data, error } = await DB.client().from('profiles').upsert(newProfile).select();
      if (!error && data?.length) profile = data[0];
    }
    return profile;
  },

  _setUser(profile) {
    if (!profile) return;
    I18n.setLang(profile.language_pref || 'tr');

    // Persist session info to localStorage (optional fallback)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: profile.id, full_name: profile.full_name,
        role: profile.role, language_pref: profile.language_pref
      }));
    } catch {}

    const userClasses = []; // Will be loaded dynamically via other components if needed

    Store.dispatch(Store.Events.AUTH_CHANGED, {
      currentUser: profile,
      isAuthenticated: true,
      language: profile.language_pref || 'tr',
      activeView: profile.role === 'ADMIN' ? 'teacher' : 'student',
      userClasses,
      activeClass: null
    });
  }
};

export default Auth;
