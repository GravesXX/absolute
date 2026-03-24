import type { PluginAPI } from '../types.js';
import type { MetricsTracker } from '../tracking/metrics.js';
import type { PreferencesManager } from '../tracking/preferences.js';
import { text } from './helpers.js';

export function registerTrackingTools(
  api: PluginAPI,
  metrics: MetricsTracker,
  prefs: PreferencesManager
): void {
  api.registerTool({
    name: 'absolute_metrics',
    description: 'Retrieve agent performance metrics. Optionally filter by a specific agent.',
    parameters: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent to retrieve metrics for (optional, returns all if omitted)',
          enum: ['sophon', 'athena', 'hermes'],
        },
      },
    },
    execute: (_id, params) => {
      const agentId = params['agent_id'] as string | undefined;
      return Promise.resolve(text(metrics.getMetrics(agentId)));
    },
  });

  api.registerTool({
    name: 'absolute_preference_set',
    description: 'Set an orchestration preference key/value pair.',
    parameters: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Preference key' },
        value: { type: 'string', description: 'Preference value' },
      },
      required: ['key', 'value'],
    },
    execute: (_id, params) => {
      const key = params['key'] as string;
      const value = params['value'] as string;
      return Promise.resolve(text(prefs.setPreference(key, value)));
    },
  });

  api.registerTool({
    name: 'absolute_preference_get',
    description: 'Get all orchestration preferences.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
    execute: (_id, _params) => {
      return Promise.resolve(text(prefs.getPreferences()));
    },
  });
}
