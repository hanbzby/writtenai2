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

## TOPIC RELEVANCE (CRITICAL — READ CAREFULLY)
You will be given the assignment's title and description. You MUST evaluate how closely the student's submission addresses the assigned topic.

- **topic_relevance** score (0–9):
  - 9: Fully on-topic. Every paragraph addresses the assigned subject directly.
  - 6–8: Mostly on-topic with minor digressions.
  - 3–5: Partially relevant. Significant portions stray from the topic.
  - 0–2: Completely off-topic. The submission does not address the assigned subject at all.

- **Off-topic penalty rule**: If topic_relevance ≤ 3, you MUST apply a severe penalty:
  - Cap final_grade at 40 (max 40/100).
  - Set task_response score to ≤ 3.
  - Add a dedicated ### ⚠️ Konu Dışı Uyarı / Off-Topic Warning section at the TOP of feedback_markdown explaining clearly that the submission does not address the assigned topic, with a direct quote from the submission as evidence.

- If topic_relevance is between 4 and 6, apply a moderate penalty:
  - Reduce final_grade by 15 points from what it would otherwise be.
  - Note partial off-topic content in the Critical Growth Areas section.

## TECHNICAL RULES
- Preserve all Turkish characters (ğ, ş, ı, etc.) perfectly.
- Provide feedback in the essay's language unless specified.
- Return ONLY a valid JSON object with this structure:
{
  "scores": { "cohesion": 0-9, "lexical": 0-9, "grammar": 0-9, "task_response": 0-9, "topic_relevance": 0-9 },
  "final_grade": 0-100,
  "is_off_topic": true|false,
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

  // Inject assignment topic so the AI can judge relevance
  let topicContext = '';
  if (task?.title || task?.description) {
    topicContext = `\n\n## ASSIGNMENT TOPIC (use this to judge topic_relevance)`;
    if (task.title)       topicContext += `\n**Title:** ${task.title}`;
    if (task.description) topicContext += `\n**Description:** ${task.description}`;
  }

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
    system: SYSTEM_PROMPT + topicContext + criteria + framework + langPolicy,
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

  // --- Topic relevance simulation ---
  // If the task has a title/description, do a simple keyword overlap check.
  let topicRelevance = 7; // default: assume mostly on-topic
  let isOffTopic = false;
  if (task?.title || task?.description) {
    const topicText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    const topicWords = topicText.match(/[a-zA-ZğüşıöçĞÜŞİÖÇ]{4,}/g) || [];
    const essayLower = essayText.toLowerCase();
    const matchCount = topicWords.filter(w => essayLower.includes(w)).length;
    const overlapRatio = topicWords.length > 0 ? matchCount / topicWords.length : 1;
    if (overlapRatio < 0.08)      { topicRelevance = 1; isOffTopic = true; }
    else if (overlapRatio < 0.2)  { topicRelevance = 3; isOffTopic = true; }
    else if (overlapRatio < 0.35) { topicRelevance = 5; }
    else if (overlapRatio < 0.5)  { topicRelevance = 6; }
    else                          { topicRelevance = 7 + Math.floor(Math.random() * 3); }
  }

  const scores = {
    cohesion: 5 + Math.floor(Math.random() * 4),
    lexical: 4 + Math.floor(Math.random() * 4),
    grammar: 5 + Math.floor(Math.random() * 4),
    task_response: isOffTopic ? Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 5),
    topic_relevance: topicRelevance
  };
  const avg = (scores.cohesion + scores.lexical + scores.grammar + scores.task_response + scores.topic_relevance) / 5;
  let finalGrade = Math.round((avg / 9) * 100);

  // Apply off-topic penalty
  if (topicRelevance <= 3) {
    finalGrade = Math.min(finalGrade, 40);
  } else if (topicRelevance <= 6) {
    finalGrade = Math.max(0, finalGrade - 15);
  }

  // Off-topic warning block (prepended when needed)
  const offTopicWarningTR = isOffTopic
    ? `### ⚠️ Konu Dışı Uyarı\n> Bu ödev **verilen konuyla doğrudan ilgili değil.** Ödev konusu: "${task?.title || ''}". Öğrencinin teslim ettiği metin bu konuyu ele almıyor. Örnek: "${sampleQuotes[0] || '(örnek bulunamadı)'}" — bu cümle ödevde istenen konuyla örtüşmüyor. Puan buna göre düşürülmüştür.\n\n`
    : '';
  const offTopicWarningEN = isOffTopic
    ? `### ⚠️ Off-Topic Warning\n> This submission **does not address the assigned topic.** The assignment was: "${task?.title || ''}". The student's text does not engage with the required subject matter. For example: "${sampleQuotes[0] || '(no sample found)'}" — this does not relate to the assigned topic. The score has been penalised accordingly.\n\n`
    : '';

  const feedbackMd = isTurkish
    ? `## Akademik Değerlendirme Raporu\n\n${offTopicWarningTR}### 🌟 Temel Güçlü Yönler
- **Mantıksal Akış:** Metninizde düşünceler birbirini çok iyi takip ediyor. Özellikle giriş bölümünde kurduğunuz temel, okuyucuyu konuya başarıyla hazırlıyor.
- **Terminoloji Kullanımı:** Seçtiğiniz kavramlar akademik standartlara uygun. "${sampleQuotes[0] || ''}" ifadesini kullanma biçiminiz, konuya olan hakimiyetinizi gösteriyor.

### 🔍 Gelişim Alanları
- **Konu Bağlılığı:** ${isOffTopic ? 'Metin, verilen ödev konusundan önemli ölçüde sapıyor. Lütfen bir sonraki çalışmanızda konuya sadık kalın.' : 'Konu genel olarak iyi ele alınmış, ancak bazı bölümler konunun dışına çıkıyor.'}
- **Bağlaç Çeşitliliği:** Cümleler arası geçişlerde "ve", "ama" gibi temel bağlaçlara çok sık başvurulmuş. Daha sofistike geçiş ifadeleri (örneğin; "buna ek olarak", "öte yandan", "dolayısıyla") metnin kalitesini artıracaktır.
- **Kaynak Desteği:** İddialarınızı desteklemek için yeterli akademik referans bulunmuyor.

### 🚀 Mükemmelliğe Giden Yol
1. **Konu Odağı:** Bir sonraki taslağınızda her paragrafın ödev sorusuyla doğrudan ilişkili olduğundan emin olun.
2. **Genişletilmiş Sözcük Dağarcığı:** Her paragraf için en az iki adet ileri düzey akademik bağlaç kullanmaya odaklanın.
3. **Referans Ekleme:** Mevcut argümanlarınız için en az 3 farklı akademik kaynak ekleyin.

**Kelime Sayısı Analizi:** ${wordCount} kelime | **Konu Bağlılığı:** ${topicRelevance}/9`
    : `## Academic Evaluation Report\n\n${offTopicWarningEN}### 🌟 Core Strengths
- **Logical Progression:** Your ideas follow a very clear trajectory. The foundation you established in the introductory segment successfully prepares the reader for the core arguments.
- **Terminology Precision:** The vocabulary chosen aligns well with academic standards. Your usage of "${sampleQuotes[0] || ''}" demonstrates a solid grasp of the subject matter.

### 🔍 Critical Growth Areas
- **Topic Relevance:** ${isOffTopic ? 'Your submission does not adequately address the assigned topic. Please ensure your next draft directly engages with the prompt.' : 'While mostly on-topic, some sections drift from the core question.'}
- **Connective Variety:** There is a heavy reliance on basic conjunctions like "and" and "but." Utilizing more sophisticated transitional phrases would elevate the formal tone.
- **Evidentiary Support:** Your claims lack sufficient academic referencing.

### 🚀 Path to Excellence
1. **Topic Focus:** Ensure every paragraph directly responds to the assignment question before drafting.
2. **Vocabulary Expansion:** Incorporate at least two high-level academic connectors per paragraph.
3. **Integrate Citations:** Find and integrate at least 3 distinct academic sources.

**Word Count Analysis:** ${wordCount} words | **Topic Relevance:** ${topicRelevance}/9`;

  return {
    scores,
    final_grade: finalGrade,
    is_off_topic: isOffTopic,
    feedback_markdown: feedbackMd,
    evidence_quotes: sampleQuotes.map((q, i) => ({
      quote: q,
      issue: isOffTopic
        ? (isTurkish ? 'Konu dışı içerik' : 'Off-topic content')
        : (isTurkish ? `Bu alan geliştirilebilir ${i + 1}` : `Area ${i + 1} needs improvement`),
      suggestion: isOffTopic
        ? (isTurkish ? 'Bu kısım ödev konusuyla ilgili değil, lütfen konuya odaklanın.' : 'This section does not address the assignment topic. Please stay on topic.')
        : (isTurkish ? 'Netlik için tekrar gözden geçirin.' : 'Consider revising for clarity')
    })),
    common_issues: isTurkish
      ? (isOffTopic ? ['Konu dışı içerik', 'Bağlaç eksikliği', 'Kaynak gösterimi yetersiz'] : ['Bağlaç eksikliği', 'Kaynak gösterimi yetersiz', 'Cümle yapısı karmaşıklığı'])
      : (isOffTopic ? ['Off-topic submission', 'Weak cohesive devices', 'Insufficient citations'] : ['Weak cohesive devices', 'Insufficient citations', 'Syntactic complexity']),
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
