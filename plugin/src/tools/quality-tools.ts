import type { PluginAPI } from '../types.js';
import type { Reviewer } from '../orchestration/reviewer.js';
import { text } from './helpers.js';

export function registerQualityTools(api: PluginAPI, reviewer: Reviewer): void {
  api.registerTool({
    name: 'absolute_quality_review',
    description: 'Score a completed task on a 1-5 quality scale with notes.',
    parameters: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'ID of the task to review' },
        score: { type: 'number', description: 'Quality score from 1 (poor) to 5 (excellent)' },
        notes: { type: 'string', description: 'Review notes explaining the score' },
      },
      required: ['task_id', 'score', 'notes'],
    },
    execute: (_id, params) => {
      const taskId = params['task_id'] as string;
      const score = params['score'] as number;
      const notes = params['notes'] as string;
      return Promise.resolve(text(reviewer.reviewTask(taskId, score, notes)));
    },
  });

  api.registerTool({
    name: 'absolute_quality_summary',
    description: 'Get a quality summary aggregated across all agents showing scores and pass rates.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
    execute: (_id, _params) => {
      return Promise.resolve(text(reviewer.getQualitySummary()));
    },
  });
}
