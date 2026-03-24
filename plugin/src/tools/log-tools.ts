import type { PluginAPI } from '../types.js';
import type { AbsoluteDB } from '../db/database.js';
import { text } from './helpers.js';

export function registerLogTools(api: PluginAPI, db: AbsoluteDB): void {
  api.registerTool({
    name: 'absolute_log',
    description: 'Retrieve coordination log entries. Supports filtering by plan, task, or action type.',
    parameters: {
      type: 'object' as const,
      properties: {
        plan_id: { type: 'string', description: 'Filter log entries by plan ID (optional)' },
        task_id: { type: 'string', description: 'Filter log entries by task ID (optional)' },
        action: { type: 'string', description: 'Filter log entries by action type (optional)' },
        limit: { type: 'number', description: 'Maximum number of entries to return (default: 20)' },
      },
    },
    execute: (_id, params) => {
      const planId = params['plan_id'] as string | undefined;
      const taskId = params['task_id'] as string | undefined;
      const action = params['action'] as string | undefined;
      const limit = params['limit'] !== undefined ? (params['limit'] as number) : 20;

      const entries = db.getLog({ planId, taskId, action, limit });

      if (entries.length === 0) {
        return Promise.resolve(text({ content: 'No log entries found.' }));
      }

      const lines = entries.map(e => {
        const planPart = e.plan_id ? ` plan:${e.plan_id.slice(0, 8)}` : '';
        const taskPart = e.task_id ? ` task:${e.task_id.slice(0, 8)}` : '';
        return `[${e.created_at}]${planPart}${taskPart} ${e.action}: ${e.detail}`;
      });

      return Promise.resolve(text({ content: lines.join('\n') }));
    },
  });
}
