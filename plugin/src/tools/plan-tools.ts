import type { PluginAPI } from '../types.js';
import type { Planner } from '../orchestration/planner.js';
import { text } from './helpers.js';

export function registerPlanTools(api: PluginAPI, planner: Planner): void {
  api.registerTool({
    name: 'absolute_plan_create',
    description: 'Create a new orchestration plan with a title and description.',
    parameters: {
      title: { type: 'string', description: 'Title of the plan', required: true },
      description: { type: 'string', description: 'Description of what this plan achieves', required: true },
    },
    execute: (_id, params) => {
      const title = params['title'] as string;
      const description = params['description'] as string;
      return Promise.resolve(text(planner.createPlan(title, description)));
    },
  });

  api.registerTool({
    name: 'absolute_plan_status',
    description: 'Get the full status of a plan including all tasks and consultation count.',
    parameters: {
      plan_id: { type: 'string', description: 'ID of the plan to inspect', required: true },
    },
    execute: (_id, params) => {
      const planId = params['plan_id'] as string;
      return Promise.resolve(text(planner.getPlanStatus(planId)));
    },
  });

  api.registerTool({
    name: 'absolute_plan_approve',
    description: 'Approve a plan so its tasks can be delegated to agents.',
    parameters: {
      plan_id: { type: 'string', description: 'ID of the plan to approve', required: true },
    },
    execute: (_id, params) => {
      const planId = params['plan_id'] as string;
      return Promise.resolve(text(planner.approvePlan(planId)));
    },
  });

  api.registerTool({
    name: 'absolute_plan_list',
    description: 'List all plans with their status and task completion counts.',
    parameters: {
      limit: { type: 'number', description: 'Maximum number of plans to return', required: false },
    },
    execute: (_id, params) => {
      const limit = params['limit'] !== undefined ? (params['limit'] as number) : undefined;
      return Promise.resolve(text(planner.listPlans(limit)));
    },
  });
}
