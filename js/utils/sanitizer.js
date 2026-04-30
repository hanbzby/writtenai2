/**
 * ScholarFeedback AI — Prompt Injection Sanitizer
 * Strips hidden commands, zero-width chars, and instructional keywords.
 */

// Dangerous instructional patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)/gi,
  /override\s+(all\s+)?(rules?|instructions?|criteria|grading)/gi,
  /you\s+(are|must)\s+(now|act\s+as)/gi,
  /system\s*:?\s*(message|prompt|override|instruction)/gi,
  /developer\s*:?\s*(mode|override|access)/gi,
  /give\s+(me|this)\s+(a\s+)?(100|full|perfect|maximum)\s*(marks?|points?|score|grade)/gi,
  /\bdo\s+not\s+(deduct|penalize|mark\s+down)\b/gi,
  /\bforget\s+(everything|all|your\s+instructions?)\b/gi,
  /\bact\s+as\s+(if|though)\b/gi,
  /\brole\s*:\s*(assistant|system|admin|teacher)\b/gi,
  /\[\s*SYSTEM\s*\]/gi,
  /\[\s*INST(RUCTION)?\s*\]/gi,
  /```\s*(system|instruction|override)/gi,
];

// Zero-width and invisible Unicode characters
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064]/g;

// HTML/script injection
const HTML_PATTERNS = /<\s*\/?\s*(script|iframe|object|embed|link|style|meta|form|input|button)[^>]*>/gi;

const Sanitizer = {
  /**
   * Full sanitization pipeline for essay text before AI evaluation.
   * @param {string} text - Raw essay text
   * @returns {{ cleaned: string, warnings: string[] }}
   */
  sanitize(text) {
    if (!text || typeof text !== 'string') return { cleaned: '', warnings: [] };
    const warnings = [];
    let cleaned = text;

    // 1. Strip zero-width / invisible chars
    const invisibleCount = (cleaned.match(INVISIBLE_CHARS) || []).length;
    if (invisibleCount > 0) {
      warnings.push(`Removed ${invisibleCount} hidden Unicode characters`);
      cleaned = cleaned.replace(INVISIBLE_CHARS, '');
    }

    // 2. Strip HTML/script tags
    if (HTML_PATTERNS.test(cleaned)) {
      warnings.push('Stripped HTML/script injection attempts');
      cleaned = cleaned.replace(HTML_PATTERNS, '');
    }

    // 3. Detect and flag injection patterns (but preserve the text for essay context)
    INJECTION_PATTERNS.forEach(pattern => {
      const matches = cleaned.match(pattern);
      if (matches) {
        warnings.push(`Detected prompt injection pattern: "${matches[0]}"`);
        // Replace the injection with a neutralized version
        cleaned = cleaned.replace(pattern, (match) => `[FLAGGED: ${match}]`);
      }
    });

    // 4. Normalize excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n').replace(/[ \t]{10,}/g, '  ');

    return { cleaned, warnings };
  },

  /**
   * Wrap student text in delimited tags for the AI prompt.
   */
  delimit(text) {
    return `[STUDENT_TEXT_START]\n${text}\n[STUDENT_TEXT_END]`;
  },

  /**
   * Sanitize HTML for safe rendering in the UI.
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

export default Sanitizer;
