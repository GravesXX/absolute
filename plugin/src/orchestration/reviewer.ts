import type { AbsoluteDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

const DEFAULT_QUALITY_THRESHOLD = 3;
const AGENTS = ['sophon', 'athena', 'hermes'];

export class Reviewer {
  constructor(private db: AbsoluteDB) {}

  private getThreshold(): number {
    const pref = this.db.getPreference('quality_threshold');
    if (pref) {
      const parsed = parseInt(pref.value, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return DEFAULT_QUALITY_THRESHOLD;
  }

  reviewTask(taskId: string, score: number, notes: string): ToolResult {
    if (score < 1 || score > 5) {
      return { content: '', error: `Score must be between 1 and 5 (received ${score}).` };
    }

    const task = this.db.getTask(taskId);
    if (!task) {
      return { content: '', error: `Task not found: ${taskId}` };
    }

    this.db.updateTaskQuality(taskId, score, notes);
    this.db.logAction('quality_review', `Task "${task.title}" scored ${score}/5`, task.plan_id, taskId);

    const threshold = this.getThreshold();

    if (score >= threshold) {
      return { content: `Review complete: score ${score}/5 — pass` };
    } else {
      return { content: `Review complete: score ${score}/5 — fail — score ${score}/5 is below threshold (${threshold})` };
    }
  }

  getQualitySummary(): ToolResult {
    const lines: string[] = [];

    for (const agentId of AGENTS) {
      const tasks = this.db.getTasksByAgent(agentId);
      const scored = tasks.filter(t => t.quality_score !== null);

      if (scored.length === 0) {
        lines.push(`${agentId}: no scored tasks`);
        continue;
      }

      const avgQuality = scored.reduce((sum, t) => sum + (t.quality_score ?? 0), 0) / scored.length;
      const threshold = this.getThreshold();
      const passing = scored.filter(t => (t.quality_score ?? 0) >= threshold).length;
      const passRate = Math.round((passing / scored.length) * 100);

      lines.push(
        `${agentId}: ${scored.length} reviewed, avg ${avgQuality.toFixed(1)}/5, pass rate ${passRate}%`
      );
    }

    return { content: lines.join('\n') };
  }
}
