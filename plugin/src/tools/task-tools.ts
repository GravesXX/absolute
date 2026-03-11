import type { PluginAPI } from '../types.js';
import type { Planner } from '../orchestration/planner.js';
import type { Delegator } from '../orchestration/delegator.js';
import { text } from './helpers.js';

export function registerTaskTools(api: PluginAPI, planner: Planner, delegator: Delegator): void {
  api.registerTool({
    name: 'absolute_task_create',
    description: 'Add a task to an existing plan, assigned to a specific agent.',
    parameters: {
      plan_id: { type: 'string', description: 'ID of the plan to add the task to', required: true },
      agent_id: {
        type: 'string',
        description: 'Agent to assign the task to',
        required: true,
        enum: ['sophon', 'athena', 'hermes'],
      },
      title: { type: 'string', description: 'Short title of the task', required: true },
      description: { type: 'string', description: 'Full description of what the task involves', required: true },
      sequence: { type: 'number', description: 'Execution order of this task within the plan', required: true },
    },
    execute: (_id, params) => {
      const planId = params['plan_id'] as string;
      const agentId = params['agent_id'] as string;
      const title = params['title'] as string;
      const description = params['description'] as string;
      const sequence = params['sequence'] as number;
      return Promise.resolve(text(planner.addTask(planId, agentId, title, description, sequence)));
    },
  });

  api.registerTool({
    name: 'absolute_task_update',
    description: 'Update the status and/or result summary of a task.',
    parameters: {
      task_id: { type: 'string', description: 'ID of the task to update', required: true },
      status: {
        type: 'string',
        description: 'New status to set on the task',
        required: false,
        enum: ['pending', 'consulting', 'delegated', 'in_progress', 'review', 'completed', 'failed'],
      },
      result_summary: {
        type: 'string',
        description: 'Summary of the task result to record',
        required: false,
      },
    },
    execute: (_id, params) => {
      const taskId = params['task_id'] as string;
      const status = params['status'] as string | undefined;
      const resultSummary = params['result_summary'] as string | undefined;

      const db = (delegator as unknown as { db: import('../db/database.js').AbsoluteDB }).db;

      if (status !== undefined) {
        db.updateTaskStatus(taskId, status);
      }
      if (resultSummary !== undefined) {
        db.updateTaskResult(taskId, resultSummary);
      }

      const task = db.getTask(taskId);
      if (!task) {
        return Promise.resolve(text({ content: '', error: `Task not found: ${taskId}` }));
      }

      const parts: string[] = [];
      if (status !== undefined) parts.push(`status → ${status}`);
      if (resultSummary !== undefined) parts.push(`result recorded`);
      const summary = parts.length > 0 ? parts.join(', ') : 'no changes';

      return Promise.resolve(text({ content: `Task ${taskId} updated: ${summary}` }));
    },
  });

  api.registerTool({
    name: 'absolute_task_list',
    description: 'List tasks. If plan_id is provided, lists tasks for that plan; otherwise lists all active tasks.',
    parameters: {
      plan_id: { type: 'string', description: 'ID of the plan to list tasks for (optional)', required: false },
    },
    execute: (_id, params) => {
      const planId = params['plan_id'] as string | undefined;

      if (planId !== undefined) {
        const db = (delegator as unknown as { db: import('../db/database.js').AbsoluteDB }).db;
        const tasks = db.getPlanTasks(planId);
        if (tasks.length === 0) {
          return Promise.resolve(text({ content: 'No tasks found for this plan.' }));
        }
        const lines = tasks.map(t => {
          const quality = t.quality_score !== null ? ` [quality: ${t.quality_score}/5]` : '';
          return `[${t.sequence}] ${t.agent_id} — ${t.title} (${t.status})${quality}`;
        });
        return Promise.resolve(text({ content: lines.join('\n') }));
      }

      return Promise.resolve(text(delegator.getActiveTaskList()));
    },
  });

  api.registerTool({
    name: 'absolute_task_delegate',
    description: 'Delegate a task to its assigned agent, marking it as delegated in the system.',
    parameters: {
      task_id: { type: 'string', description: 'ID of the task to delegate', required: true },
    },
    execute: (_id, params) => {
      const taskId = params['task_id'] as string;
      return Promise.resolve(text(delegator.delegateTask(taskId)));
    },
  });
}
