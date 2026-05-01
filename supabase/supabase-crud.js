/**
 * ScholarFeedback AI - Global Supabase Client
 * Vercel ortamında çevresel değişkenler (process.env) statik HTML'e yansımadığı için
 * değerler manuel olarak (veya build aşamasında replace edilecek şekilde) buraya yazılmalıdır.
 */

// Buraya Vercel Dashboard'daki SUPABASE_URL ve SUPABASE_ANON_KEY değerlerinizi yapıştırın.
const SUPABASE_URL = window.ENV?.SUPABASE_URL || 'https://qttknzyufticlkukxuse.supabase.co';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0dGtuenl1ZnRpY2xrdWt4dXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjE2NDAsImV4cCI6MjA5MzE5NzY0MH0.DO7mX1C3e7s1fHyPtJHMpp_H46qIacupLkGJWxZEB2A';

if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'VERCEL_URLNİZ_BURAYA') {
  if (window.supabase) {
    // CDN üzerinden yüklenen supabase objesini kullanarak global istemciyi oluştur
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[DB] Global Supabase Client Initialized');
  } else {
    console.error('[DB] Supabase CDN kütüphanesi yüklenemedi. Lütfen index.html içindeki script sırasını kontrol edin.');
  }
} else {
  console.warn('[DB] Supabase bağlantı bilgileri eksik. Lütfen supabase-crud.js içindeki URL ve KEY değerlerini doldurun.');
  window.supabaseClient = null;
}
