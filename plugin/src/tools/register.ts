import type { PluginAPI } from '../types.js';
import { AbsoluteDB } from '../db/database.js';
import { Planner } from '../orchestration/planner.js';
import { Delegator } from '../orchestration/delegator.js';
import { Reviewer } from '../orchestration/reviewer.js';
import { MetricsTracker } from '../tracking/metrics.js';
import { PreferencesManager } from '../tracking/preferences.js';
import { registerPlanTools } from './plan-tools.js';
import { registerTaskTools } from './task-tools.js';
import { registerConsultTools } from './consult-tools.js';
import { registerQualityTools } from './quality-tools.js';
import { registerTrackingTools } from './tracking-tools.js';
import { registerLogTools } from './log-tools.js';
import path from 'path';
import os from 'os';

export function registerAllTools(api: PluginAPI): void {
  const vaultPath = path.join(os.homedir(), 'Documents', 'Obsidian Vault');
  const db = new AbsoluteDB(vaultPath);

  const planner = new Planner(db);
  const delegator = new Delegator(db);
  const reviewer = new Reviewer(db);
  const metrics = new MetricsTracker(db);
  const prefs = new PreferencesManager(db);

  registerPlanTools(api, planner);               // 4 tools
  registerTaskTools(api, planner, delegator);     // 4 tools
  registerConsultTools(api, delegator);           // 2 tools
  registerQualityTools(api, reviewer);            // 2 tools
  registerTrackingTools(api, metrics, prefs);     // 3 tools
  registerLogTools(api, db);                      // 1 tool
  // Total: 16 tools
}
