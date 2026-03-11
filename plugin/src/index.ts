import type { PluginAPI } from './types.js';

export const id = 'absolute';
export const name = 'Absolute - Omniscient Orchestrator';

export function register(api: PluginAPI) {
  console.log('[Absolute] Plugin loaded successfully');
}
