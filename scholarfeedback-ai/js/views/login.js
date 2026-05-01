/**
 * ScholarFeedback AI — Login View
 */
import Store from '../store.js';
import I18n from '../i18n.js';
import Auth from '../auth.js';

let _isRegisterMode = false;

function render() {
  const t = I18n.t.bind(I18n);
  _isRegisterMode = false;
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <div style="margin-bottom:16px;">
            <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--cyan));display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:12px;">🎓</div>
          </div>
          <h1>ScholarFeedback AI</h1>
          <p style="margin-top:8px;font-size:0.875rem;">${t('app.subtitle')}</p>
        </div>
        <div id="login-form-area">
          ${_renderLoginForm()}
        </div>
      </div>
    </div>
  `;
}

function _renderLoginForm() {
  const t = I18n.t.bind(I18n);
  if (_isRegisterMode) {
    return `
      <form id="register-form" class="login-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label">${t('auth.fullName')}</label>
          <input type="text" id="reg-name" class="input" placeholder="Dr. Ayşe Yılmaz" required>
        </div>
        <div class="form-group">
          <label class="form-label">${t('auth.email')}</label>
          <input type="email" id="reg-email" class="input" placeholder="ornek@edu.tr" required>
        </div>
        <div class="form-group">
          <label class="form-label">${t('auth.password')}</label>
          <input type="password" id="reg-pass" class="input" placeholder="••••••••" required minlength="6">
        </div>
        <div class="form-group">
          <label class="form-label">${t('auth.role')}</label>
          <select id="reg-role" class="select">
            <option value="STUDENT">${t('auth.role.student')}</option>
            <option value="ADMIN">${t('auth.role.admin')}</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-lg w-full">${t('auth.register')}</button>
        <div id="reg-error" class="text-danger text-sm" style="display:none;text-align:center;"></div>
      </form>
      <div class="login-footer">
        ${t('auth.hasAccount')} <a id="switch-to-login">${t('auth.login')}</a>
      </div>
    `;
  }
  return `
    <form id="login-form" class="login-form" autocomplete="off">
      <div class="form-group">
        <label class="form-label">${t('auth.email')}</label>
        <input type="email" id="login-email" class="input" placeholder="ornek@edu.tr" required>
      </div>
      <div class="form-group">
        <label class="form-label">${t('auth.password')}</label>
        <input type="password" id="login-pass" class="input" placeholder="••••••••" required>
      </div>
      <button type="submit" class="btn btn-primary btn-lg w-full">${t('auth.login')}</button>
      <div id="login-error" class="text-danger text-sm" style="display:none;text-align:center;"></div>
      <div style="text-align:center;margin-top:8px;">
        <span class="text-xs text-muted">Demo: admin@edu.tr / student@edu.tr (any password)</span>
      </div>
    </form>
    <div class="login-footer">
      ${t('auth.noAccount')} <a id="switch-to-register">${t('auth.register')}</a>
    </div>
  `;
}

function attachEvents() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-pass').value;
      const errEl = document.getElementById('login-error');
      try {
        await Auth.login(email, pass);
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      }
    });
  }

  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const pass = document.getElementById('reg-pass').value;
      const role = document.getElementById('reg-role').value;
      const errEl = document.getElementById('reg-error');
      try {
        await Auth.register(email, pass, name, role);
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      }
    });
  }

  document.getElementById('switch-to-register')?.addEventListener('click', () => {
    _isRegisterMode = true;
    const area = document.getElementById('login-form-area');
    if (area) { area.innerHTML = _renderLoginForm(); attachEvents(); }
  });

  document.getElementById('switch-to-login')?.addEventListener('click', () => {
    _isRegisterMode = false;
    const area = document.getElementById('login-form-area');
    if (area) { area.innerHTML = _renderLoginForm(); attachEvents(); }
  });
}

export default { render, attachEvents };
