import type { PluginAPI } from './types.js';
import { registerAllTools } from './tools/register.js';

export const id = 'absolute';
export const name = 'Absolute - Omniscient Orchestrator';

export function register(api: PluginAPI) {
  registerAllTools(api);
  console.log('[Absolute] Plugin loaded successfully');
}
