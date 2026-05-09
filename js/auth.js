/**
 * ScholarFeedback AI — Auth Module
 * Stage 3: Session persistence via localStorage + onAuthStateChanged.
 *
 * STABILITY FIX: checkSession now tries getSession() first (faster, uses cached token),
 * falls back to getUser() (server-side validation), and handles token refresh errors
 * gracefully instead of leaving the app in a broken auth state.
 */
import Store from './store.js';
import DB from './supabase-client.js';
import I18n from './i18n.js';

const SESSION_KEY = 'scholarfeedback_session';

const Auth = {
  async login(email, password) {
    await DB.ensureReady();
    if (!window.supabaseClient) { alert('Veritabanı bağlantısı kurulamadı'); return; }
    
    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      
      // Ensure profile exists in DB
      const profile = await this._ensureProfile(data.user);
      this._setUser(profile);
      return profile;
    } catch (err) {
      console.error('[Auth] Login hatası:', err.message);
      throw err;
    }
  },

  async register(email, password, fullName, role) {
    await DB.ensureReady();
    if (!window.supabaseClient) { alert('Veritabanı bağlantısı kurulamadı'); return; }
    
    const { data, error } = await window.supabaseClient.auth.signUp({
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
    await DB.ensureReady();
    if (!window.supabaseClient) { alert('Veritabanı bağlantısı kurulamadı'); return; }
    try {
      await window.supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('[Auth] Logout error (non-critical):', e.message);
    }
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    Store.dispatch(Store.Events.AUTH_CHANGED, {
      currentUser: null, isAuthenticated: false, activeView: 'login',
      userClasses: [], activeClass: null
    });
  },

  /**
   * Check for existing session.
   * Uses getSession() first (fast, local token cache), then validates with getUser().
   * If token is expired, tries refreshSession() before giving up.
   */
  async checkSession() {
    await DB.ensureReady();
    if (!window.supabaseClient) { console.warn('[Auth] Veritabanı bağlantısı kurulamadı'); return null; }

    try {
      // Step 1: Try to get cached session (fast, no network call)
      const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
      
      if (sessionError) {
        console.warn('[Auth] getSession hatası:', sessionError.message);
      }
      
      if (!session) {
        console.log('[Auth] Aktif oturum bulunamadı.');
        return null;
      }

      // Step 2: Validate the session with server (getUser)
      const { data: { user }, error: userError } = await window.supabaseClient.auth.getUser();
      
      if (userError) {
        console.warn('[Auth] Token doğrulama hatası, oturum yenileniyor…', userError.message);
        
        // Step 3: Try to refresh the token
        const { data: refreshData, error: refreshError } = await window.supabaseClient.auth.refreshSession();
        
        if (refreshError || !refreshData?.user) {
          console.warn('[Auth] Oturum yenilenemedi, login ekranına yönlendiriliyor.');
          try { localStorage.removeItem(SESSION_KEY); } catch {}
          return null;
        }
        
        // Refresh succeeded — use the new user data
        const profile = await this._fetchProfile(refreshData.user.id);
        if (profile) {
          this._setUser(profile);
          console.log('[Auth] Oturum yenilendi ✓');
          return profile;
        }
        return null;
      }

      // Token is valid
      if (user) {
        const profile = await this._fetchProfile(user.id);
        if (profile) {
          this._setUser(profile);
          return profile;
        }
      }
      return null;
      
    } catch (err) {
      console.error('[Auth] checkSession hatası:', err.message);
      return null;
    }
  },

  /**
   * Listen for auth state changes (Supabase live mode).
   * Called once at init to handle token refresh and session changes.
   */
  setupAuthListener() {
    if (!window.supabaseClient) { console.warn('[Auth] Veritabanı bağlantısı kurulamadı'); return; }
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] Event:', event);
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const profile = await this._fetchProfile(session.user.id);
        if (profile) this._setUser(profile);
      } else if (event === 'SIGNED_OUT') {
        Store.dispatch(Store.Events.AUTH_CHANGED, {
          currentUser: null, isAuthenticated: false, activeView: 'login',
          userClasses: [], activeClass: null
        });
      }
    });
  },

  // ── Internal ──
  async _fetchProfile(userId) {
    try {
      const { data, error } = await window.supabaseClient.from('profiles').select('*').eq('id', userId);
      if (error) {
        console.warn('[Auth] Profile fetch hatası:', error.message);
        return null;
      }
      return data?.[0] || null;
    } catch (e) {
      console.warn('[Auth] Profile fetch exception:', e.message);
      return null;
    }
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
      try {
        const { data, error } = await window.supabaseClient.from('profiles').upsert(newProfile).select();
        if (!error && data?.length) profile = data[0];
      } catch (e) {
        console.warn('[Auth] Profile create hatası:', e.message);
      }
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
