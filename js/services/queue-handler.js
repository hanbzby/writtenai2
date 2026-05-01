/**
 * ScholarFeedback AI — Async Queue Handler
 * Processes submissions in batches of 5 with 2s cooldown and retry logic.
 */
import Store from '../store.js';
import AIFeedback from './ai-feedback.js';
import Integrity from './integrity.js';
import DB from '../supabase-client.js';

const BATCH_SIZE = 5;
const COOLDOWN_MS = 2000;
const MAX_RETRIES = 3;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const QueueHandler = {
  /**
   * Process all SUBMITTED essays for a task.
   * @param {string} taskId
   * @param {Object} task - Task object with criteria
   */
  async processTask(taskId, task) {
    let submissions = [];
    if (DB.isMock()) {
      submissions = DB.mock.submissions.filter(s => s.task_id === taskId && s.status === 'SUBMITTED');
    } else {
      const { data } = await DB.client()
        .from('submissions')
        .select('*')
        .eq('task_id', taskId)
        .eq('status', 'SUBMITTED');
      submissions = data || [];
    }

    if (submissions.length === 0) return;

    const total = submissions.length;
    let completed = 0, failed = 0;

    Store.dispatch(Store.Events.PROCESSING_PROGRESS, {
      isProcessing: true,
      processingProgress: { total, completed: 0, failed: 0 }
    });

    // Process in batches
    for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
      const batch = submissions.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(sub => this._processOne(sub, task))
      );

      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          completed++;
          batch[idx].status = 'GRADED';
        } else {
          failed++;
          console.error(`[Queue] Failed submission ${batch[idx].id}:`, r.reason);
        }
      });

      Store.dispatch(Store.Events.PROCESSING_PROGRESS, {
        processingProgress: { total, completed, failed }
      });

      // Cooldown between batches (skip after last batch)
      if (i + BATCH_SIZE < submissions.length) {
        await sleep(COOLDOWN_MS);
      }
    }

    Store.dispatch(Store.Events.PROCESSING_COMPLETE, {
      isProcessing: false,
      processingProgress: { total, completed, failed }
    });
  },

  /**
   * Process a single submission with retry logic.
   */
  async _processOne(submission, task, retryCount = 0) {
    try {
      // 1. Generate AI feedback
      const feedback = await AIFeedback.generate(submission.content, task);
      // 2. Run integrity analysis
      const integrity = await Integrity.analyze(submission.content);
      // 3. Store results
      const report = {
        id: DB.generateUUID(),
        submission_id: submission.id,
        plagiarism_score: integrity.plagiarism_score,
        ai_probability_score: integrity.ai_probability_score,
        ai_feedback_markdown: feedback.feedback_markdown,
        scores_breakdown: feedback.scores,
        evidence_quotes: feedback.evidence_quotes,
        final_grade: feedback.final_grade,
        integrity_details: {
          suspicious_segments: integrity.suspicious_segments,
          heatmap_data: integrity.heatmap_data,
          sources: integrity.sources
        },
        risk_flag: integrity.risk_flag,
        created_at: new Date().toISOString()
      };

      if (DB.isMock()) {
        DB.mock.feedback_reports.push(report);
      } else {
        await DB.client().from('feedback_reports').insert([report]);
        // Also update submission status to GRADED
        await DB.client().from('submissions').update({ status: 'GRADED' }).eq('id', submission.id);
      }
      return report;
    } catch (err) {
      if (retryCount < MAX_RETRIES) {
        const backoff = Math.pow(2, retryCount) * 1000;
        await sleep(backoff);
        return this._processOne(submission, task, retryCount + 1);
      }
      throw err;
    }
  }
};

export default QueueHandler;
