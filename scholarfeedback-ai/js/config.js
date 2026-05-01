/**
 * ScholarFeedback AI — Configuration
 * Fallback environment variables mechanism for Vanilla JS.
 * 
 * Usage:
 * - Local development: Create a `.env` file (if using a local server that parses it) or just 
 *   directly populate window.ENV properties below.
 * - Production: Vercel/Netlify will inject process.env variables if a build step is added later, 
 *   but for true Vanilla SPA, you can either inject a script tag during CI/CD, or rely on 
 *   window.ENV being populated by the server.
 */

window.ENV = window.ENV || {
  // Canlı (Production) ortamda bu değerler sunucu/platform tarafından enjekte edilebilir.
  // Yerel geliştirme için buraya test değerlerinizi yazıp dosyayı git'e commit'lemeyebilirsiniz.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};

export default window.ENV;
