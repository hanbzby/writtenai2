/**
 * ScholarFeedback AI — Integrity Service (Plagiarism + AI Detection)
 * Mock mode with realistic segment-level results.
 */

function generateMockIntegrity(essayText) {
  const sentences = essayText.split(/[.!?]+/).filter(s => s.trim().length > 15);
  const plagiarismScore = Math.round(Math.random() * 35);
  const aiProbability = Math.round(Math.random() * 60 + 10);
  const riskScore = Math.round((plagiarismScore + aiProbability) / 2);
  const isHighRisk = plagiarismScore > 20 || aiProbability > 80;

  // Generate suspicious segments (random subset of sentences)
  const suspiciousCount = Math.max(1, Math.floor(sentences.length * 0.2));
  const suspicious = [];
  const used = new Set();
  for (let i = 0; i < suspiciousCount && i < sentences.length; i++) {
    let idx;
    do { idx = Math.floor(Math.random() * sentences.length); } while (used.has(idx));
    used.add(idx);
    suspicious.push({
      text: sentences[idx].trim(),
      start_offset: essayText.indexOf(sentences[idx].trim()),
      end_offset: essayText.indexOf(sentences[idx].trim()) + sentences[idx].trim().length,
      type: Math.random() > 0.5 ? 'plagiarism' : 'ai_generated',
      confidence: Math.round(40 + Math.random() * 55),
      source_url: Math.random() > 0.5 ? 'https://scholar.google.com/...' : null
    });
  }

  // Heatmap data: per-sentence scores (0-100 AI probability)
  const heatmap = sentences.map((s, i) => ({
    sentence_index: i,
    text: s.trim().substring(0, 100),
    ai_score: Math.round(Math.random() * 100),
    plagiarism_score: Math.round(Math.random() * 30)
  }));

  return {
    plagiarism_score: plagiarismScore,
    ai_probability_score: aiProbability,
    risk_score: riskScore,
    risk_flag: isHighRisk,
    suspicious_segments: suspicious,
    heatmap_data: heatmap,
    sources: plagiarismScore > 10 ? [
      { url: 'https://scholar.google.com/article/123', match_percent: Math.round(plagiarismScore * 0.6) },
      { url: 'https://academic.oup.com/paper/456', match_percent: Math.round(plagiarismScore * 0.4) }
    ] : []
  };
}

const Integrity = {
  async analyze(essayText) {
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
    return generateMockIntegrity(essayText);
  }
};

export default Integrity;
