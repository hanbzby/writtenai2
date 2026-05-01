/**
 * ScholarFeedback AI — AI Feedback Service (Mock + Real API)
 */
import Sanitizer from '../utils/sanitizer.js';

const SYSTEM_PROMPT = `You are ScholarFeedback AI, a high-level academic writing evaluator and pedagogical mentor. Your goal is to provide deep, transformative feedback that helps students understand not just *what* they did, but *why* it matters and *how* to level up.

Follow these rules STRICTLY:

## FEEDBACK STRUCTURE & CONTENT
1. COMPREHENSIVE ANALYSIS: Provide a long, detailed evaluation (at least 3-4 paragraphs).
2. CONSTRUCTIVE TONE: Always start with what the student did well. Use supportive, academic language.
3. SPECIFIC SECTIONS:
   - ### 🌟 Core Strengths: Highlight 2-3 specific areas where the writing excels (logic, vocabulary, etc.).
   - ### 🔍 Critical Growth Areas: Identify 2-3 specific weaknesses. Be precise but kind.
   - ### 🚀 Path to Excellence: Provide a 3-step actionable plan for the student to follow for their next draft.
4. EVIDENCE-BASED: Every piece of feedback MUST refer to a specific sentence or concept from the essay.

## EVALUATION METRICS
- Apply Custom Criteria (if any) with the highest priority.
- Evaluate based on: Cohesion, Lexical Sophistication, Grammatical Precision, and Task Fulfillment.

## TECHNICAL RULES
- preservce all Turkish characters (ğ, ş, etc.) perfectly.
- Provide feedback in the essay's language unless specified.
- Return ONLY a valid JSON object with this structure:
{
  "scores": { "cohesion": 0-9, "lexical": 0-9, "grammar": 0-9, "task_response": 0-9 },
  "final_grade": 0-100,
  "feedback_markdown": "## Academic Evaluation Report\\n\\n### 🌟 Core Strengths... [Detailed content]...",
  "evidence_quotes": [
    { "quote": "...", "issue": "...", "suggestion": "..." }
  ],
  "common_issues": ["..."],
  "language_detected": "en|tr"
}`;

function buildPrompt(essayText, task) {
  const { cleaned } = Sanitizer.sanitize(essayText);
  const delimited = Sanitizer.delimit(cleaned);
  let criteria = '';
  if (task?.custom_criteria) {
    try {
      const c = typeof task.custom_criteria === 'string' ? JSON.parse(task.custom_criteria) : task.custom_criteria;
      criteria = `\n\n## CUSTOM CRITERIA (HIGHEST PRIORITY)\n${c.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
    } catch { criteria = ''; }
  }
  const framework = task?.scoring_framework ? `\n\n## SCORING FRAMEWORK: ${task.scoring_framework}` : '';
  const langPolicy = task?.language_policy ? `\n\n## LANGUAGE POLICY: Provide feedback in ${task.language_policy}` : '';
  return {
    system: SYSTEM_PROMPT + criteria + framework + langPolicy,
    user: delimited
  };
}

/** Chunk long essays into segments under token limit */
function chunkText(text, maxWords = 2500) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}

/** Mock feedback generator */
function generateMockFeedback(essayText, task) {
  const wordCount = essayText.split(/\s+/).length;
  const isTurkish = /[çğıöşüÇĞİÖŞÜ]/.test(essayText);
  const sentences = essayText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sampleQuotes = sentences.slice(0, 3).map(s => s.trim().substring(0, 80));

  const scores = {
    cohesion: 5 + Math.floor(Math.random() * 4),
    lexical: 4 + Math.floor(Math.random() * 4),
    grammar: 5 + Math.floor(Math.random() * 4),
    task_response: 4 + Math.floor(Math.random() * 5)
  };
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
  const finalGrade = Math.round((avg / 9) * 100);

  const feedbackMd = isTurkish
    ? `## Akademik Değerlendirme Raporu

### 🌟 Temel Güçlü Yönler
- **Mantıksal Akış:** Metninizde düşünceler birbirini çok iyi takip ediyor. Özellikle giriş bölümünde kurduğunuz temel, okuyucuyu konuya başarıyla hazırlıyor.
- **Terminoloji Kullanımı:** Seçtiğiniz kavramlar akademik standartlara uygun. "${sampleQuotes[0] || ''}" ifadesini kullanma biçiminiz, konuya olan hakimiyetinizi gösteriyor.

### 🔍 Gelişim Alanları
- **Bağlaç Çeşitliliği:** Cümleler arası geçişlerde "ve", "ama" gibi temel bağlaçlara çok sık başvurulmuş. Daha sofistike geçiş ifadeleri (örneğin; "buna ek olarak", "öte yandan", "dolayısıyla") metnin kalitesini artıracaktır.
- **Kaynak Desteği:** İddialarınızı desteklemek için yeterli akademik referans bulunmuyor. Her temel argümanı güvenilir bir kaynakla desteklemek bilimsel yazımın temelidir.

### 🚀 Mükemmelliğe Giden Yol
1. **Genişletilmiş Sözcük Dağarcığı:** Bir sonraki taslağınızda, her paragraf için en az iki adet ileri düzey akademik bağlaç kullanmaya odaklanın.
2. **Referans Ekleme:** Mevcut argümanlarınız için en az 3 farklı akademik kaynak bularak metne entegre edin.
3. **Cümle Yapısı:** Çok uzun ve karmaşık cümleleri, anlam kaybı yaşamadan ikiye bölerek netliği artırın.

**Kelime Sayısı Analizi:** ${wordCount} kelime ile istenen kapsamın %85'ine ulaşıldı.`
    : `## Academic Evaluation Report

### 🌟 Core Strengths
- **Logical Progression:** Your ideas follow a very clear trajectory. The foundation you established in the introductory segment successfully prepares the reader for the core arguments.
- **Terminology Precision:** The vocabulary chosen aligns well with academic standards. Your usage of "${sampleQuotes[0] || ''}" demonstrates a solid grasp of the subject matter.

### 🔍 Critical Growth Areas
- **Connective Variety:** There is a heavy reliance on basic conjunctions like "and" and "but." Utilizing more sophisticated transitional phrases (e.g., "furthermore," "conversely," "consequently") would significantly elevate the formal tone.
- **Evidentiary Support:** Your claims lack sufficient academic referencing. Grounding every major argument in credible sources is a cornerstone of scientific writing.

### 🚀 Path to Excellence
1. **Vocabulary Expansion:** In your next draft, aim to incorporate at least two high-level academic connectors per paragraph.
2. **Integrate Citations:** Find and integrate at least 3 distinct academic sources to support your existing arguments.
3. **Syntactic Clarity:** Review your longer sentences; splitting them into more concise units could improve readability without sacrificing depth.

**Word Count Analysis:** ${wordCount} words, reaching approximately 85% of the target scope.`;

  return {
    scores,
    final_grade: finalGrade,
    feedback_markdown: feedbackMd,
    evidence_quotes: sampleQuotes.map((q, i) => ({
      quote: q, issue: isTurkish ? `Bu alan geliştirilebilir ${i + 1}` : `Area ${i + 1} needs improvement`, suggestion: isTurkish ? 'Netlik için tekrar gözden geçirin.' : 'Consider revising for clarity'
    })),
    common_issues: isTurkish
      ? ['Bağlaç eksikliği', 'Kaynak gösterimi yetersiz', 'Cümle yapısı karmaşıklığı']
      : ['Weak cohesive devices', 'Insufficient citations', 'Syntactic complexity'],
    language_detected: isTurkish ? 'tr' : 'en'
  };
}

const AIFeedback = {
  buildPrompt,
  chunkText,
  async generate(essayText, task) {
    // Mock mode — simulate delay
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    return generateMockFeedback(essayText, task);
  }
};

export default AIFeedback;
