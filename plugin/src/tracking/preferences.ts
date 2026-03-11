import type { AbsoluteDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

export class PreferencesManager {
  constructor(private db: AbsoluteDB) {}

  setPreference(key: string, value: string): ToolResult {
    const pref = this.db.setPreference(key, value);
    return { content: `Preference set: ${pref.key} = ${pref.value}` };
  }

  getPreferences(): ToolResult {
    const prefs = this.db.getAllPreferences();

    if (prefs.length === 0) {
      return { content: 'No preferences set.' };
    }

    const lines = prefs.map(p => `${p.key}: ${p.value}`);
    return { content: lines.join('\n') };
  }
}
