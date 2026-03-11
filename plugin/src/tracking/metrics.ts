import type { AbsoluteDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

export class MetricsTracker {
  constructor(private db: AbsoluteDB) {}

  recordCompletion(
    agentId: string,
    domain: string,
    qualityScore: number,
    consultationRounds: number
  ): ToolResult {
    const existing = this.db.getAgentMetrics(agentId).find(m => m.domain === domain);

    let newTasksCompleted: number;
    let newAvgQuality: number;
    let newAvgRounds: number;

    if (existing) {
      const n = existing.tasks_completed;
      newTasksCompleted = n + 1;
      // Rolling average: (old_avg * n + new_value) / (n + 1)
      newAvgQuality = (existing.avg_quality * n + qualityScore) / newTasksCompleted;
      newAvgRounds = (existing.avg_response_rounds * n + consultationRounds) / newTasksCompleted;
    } else {
      newTasksCompleted = 1;
      newAvgQuality = qualityScore;
      newAvgRounds = consultationRounds;
    }

    const metric = this.db.upsertMetric(agentId, domain, newTasksCompleted, newAvgQuality, newAvgRounds);
    return {
      content: `Recorded completion for ${agentId}/${domain}: ${metric.tasks_completed} task(s), avg quality ${metric.avg_quality.toFixed(1)}, avg rounds ${metric.avg_response_rounds.toFixed(1)}`,
    };
  }

  getMetrics(agentId?: string): ToolResult {
    const metrics = this.db.getAgentMetrics(agentId);

    if (metrics.length === 0) {
      return { content: 'No metrics recorded.' };
    }

    const lines = metrics.map(m =>
      `${m.agent_id}/${m.domain}: ${m.tasks_completed} completed, avg quality ${m.avg_quality.toFixed(1)}/5, avg rounds ${m.avg_response_rounds.toFixed(1)}`
    );

    return { content: lines.join('\n') };
  }
}
