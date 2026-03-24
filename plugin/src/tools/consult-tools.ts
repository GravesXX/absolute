import type { PluginAPI } from '../types.js';
import type { Delegator } from '../orchestration/delegator.js';
import { text } from './helpers.js';

export function registerConsultTools(api: PluginAPI, delegator: Delegator): void {
  api.registerTool({
    name: 'absolute_consult',
    description: 'Send a consultation message to an agent for a specific task or plan.',
    parameters: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent to consult',
          enum: ['sophon', 'athena', 'hermes'],
        },
        message: { type: 'string', description: 'Message or question to send to the agent' },
        plan_id: { type: 'string', description: 'ID of the plan this consultation relates to (optional)' },
        task_id: { type: 'string', description: 'ID of the task this consultation relates to (optional)' },
        phase: {
          type: 'string',
          description: 'Phase of the consultation (planning or execution)',
          enum: ['planning', 'execution'],
        },
      },
      required: ['agent_id', 'message'],
    },
    execute: (_id, params) => {
      const agentId = params['agent_id'] as string;
      const message = params['message'] as string;
      const planId = params['plan_id'] as string | undefined;
      const taskId = params['task_id'] as string | undefined;
      const phase = (params['phase'] as string | undefined) ?? 'planning';

      if (taskId !== undefined) {
        return Promise.resolve(text(delegator.consult(taskId, agentId, phase, message)));
      }

      if (planId !== undefined) {
        return Promise.resolve(text(delegator.consultPlan(planId, agentId, message)));
      }

      return Promise.resolve(text({ content: '', error: 'Either task_id or plan_id must be provided.' }));
    },
  });

  api.registerTool({
    name: 'absolute_consult_response',
    description: 'Record an agent\'s response to a previously created consultation.',
    parameters: {
      type: 'object' as const,
      properties: {
        consultation_id: { type: 'string', description: 'ID of the consultation to respond to' },
        response: { type: 'string', description: 'The agent\'s response to the consultation' },
      },
      required: ['consultation_id', 'response'],
    },
    execute: (_id, params) => {
      const consultationId = params['consultation_id'] as string;
      const response = params['response'] as string;
      return Promise.resolve(text(delegator.recordResponse(consultationId, response)));
    },
  });
}
