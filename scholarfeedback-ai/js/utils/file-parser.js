/**
 * ScholarFeedback AI — File Parser (PDF/DOCX)
 * Forces UTF-8, fixes Turkish mojibake, strips control chars.
 */

// Common Turkish mojibake fixes (Windows-1254 → UTF-8 corruption)
const MOJIBAKE_MAP = [
  ['Ã§', 'ç'], ['Ã¶', 'ö'], ['Ã¼', 'ü'], ['ÅŸ', 'ş'], ['Äž', 'Ğ'],
  ['ÄŸ', 'ğ'], ['Ä°', 'İ'], ['Ã‡', 'Ç'], ['Ã–', 'Ö'], ['Ãœ', 'Ü'],
  ['Å ', 'Ş'], ['Ä±', 'ı'],
];

const FileParser = {
  /**
   * Extract text from a File object (PDF or DOCX).
   * @param {File} file
   * @returns {Promise<{ text: string, wordCount: number, language: string }>}
   */
  async parse(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let raw = '';
    if (ext === 'pdf') raw = await this._parsePDF(file);
    else if (ext === 'docx' || ext === 'doc') raw = await this._parseDOCX(file);
    else raw = await file.text();

    const text = this.normalizeText(raw);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const language = this.detectLanguage(text);

    return { text, wordCount, language };
  },

  /**
   * Parse PDF using PDF.js (loaded via CDN).
   */
  async _parsePDF(file) {
    if (!window.pdfjsLib) {
      console.warn('[FileParser] PDF.js not loaded, reading as text');
      return await file.text();
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n\n');
  },

  /**
   * Parse DOCX using Mammoth.js (loaded via CDN).
   */
  async _parseDOCX(file) {
    if (!window.mammoth) {
      console.warn('[FileParser] Mammoth.js not loaded, reading as text');
      return await file.text();
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
  },

  /**
   * Normalize text: fix mojibake, enforce UTF-8, strip control chars, preserve Turkish.
   */
  normalizeText(text) {
    if (!text) return '';
    let t = text;
    // Fix common mojibake patterns
    MOJIBAKE_MAP.forEach(([bad, good]) => { t = t.replaceAll(bad, good); });
    // Strip non-printable control chars (keep newlines, tabs, spaces)
    t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Normalize Unicode (NFC — composed form for Turkish chars)
    if (typeof t.normalize === 'function') t = t.normalize('NFC');
    // Collapse excessive whitespace
    t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t;
  },

  /**
   * Simple language detection (TR vs EN) based on character frequency.
   */
  detectLanguage(text) {
    const turkishChars = (text.match(/[çğıöşüÇĞİÖŞÜ]/g) || []).length;
    const totalChars = text.length;
    if (totalChars === 0) return 'en';
    return (turkishChars / totalChars) > 0.005 ? 'tr' : 'en';
  }
};

export default FileParser;
