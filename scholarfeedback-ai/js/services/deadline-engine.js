/**
 * ScholarFeedback AI — Deadline Engine
 */
const DeadlineEngine = {
  /** Check if a deadline has passed */
  isPassed(deadlineDatetime) {
    return new Date(deadlineDatetime) < new Date();
  },

  /** Get remaining time object */
  getRemaining(deadlineDatetime) {
    const diff = new Date(deadlineDatetime) - new Date();
    if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
    return {
      expired: false,
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      total: diff
    };
  },

  /** Get urgency level for UI styling */
  getUrgency(deadlineDatetime) {
    const r = this.getRemaining(deadlineDatetime);
    if (r.expired) return 'expired';
    if (r.total < 3600000) return 'critical';     // < 1 hour
    if (r.total < 86400000) return 'warning';      // < 1 day
    return 'safe';
  },

  /** Check if student can submit (deadline not passed or whitelisted) */
  canSubmit(deadlineDatetime, isWhitelisted = false) {
    return !this.isPassed(deadlineDatetime) || isWhitelisted;
  }
};

export default DeadlineEngine;
