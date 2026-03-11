import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../../db/database';
import { PreferencesManager } from '../preferences';

const TEST_DB_PATH = path.join(__dirname, 'test-preferences.db');

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

let db: AbsoluteDB;
let prefs: PreferencesManager;

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
  prefs = new PreferencesManager(db);
});

afterEach(() => {
  db.close();
  cleanup();
});

describe('PreferencesManager', () => {
  // Test 1: set + get preference
  it('should set and retrieve a preference', () => {
    const setResult = prefs.setPreference('theme', 'dark');
    expect(setResult.error).toBeUndefined();
    expect(setResult.content).toBeTruthy();

    const getResult = prefs.getPreferences();
    expect(getResult.error).toBeUndefined();
    expect(getResult.content).toContain('theme');
    expect(getResult.content).toContain('dark');
  });

  // Test 2: upsert existing key updates the value
  it('should upsert an existing preference key', () => {
    prefs.setPreference('language', 'en');
    prefs.setPreference('language', 'fr');

    const getResult = prefs.getPreferences();
    expect(getResult.content).toContain('fr');

    // Only one entry for 'language'
    const all = db.getAllPreferences();
    const langEntries = all.filter(p => p.key === 'language');
    expect(langEntries).toHaveLength(1);
    expect(langEntries[0].value).toBe('fr');
  });

  // Test 3: empty and populated getPreferences
  it('should return "No preferences set." when empty, and list entries when populated', () => {
    const emptyResult = prefs.getPreferences();
    expect(emptyResult.error).toBeUndefined();
    expect(emptyResult.content).toContain('No preferences set.');

    prefs.setPreference('model', 'claude-sonnet');
    prefs.setPreference('timeout', '30');

    const populatedResult = prefs.getPreferences();
    expect(populatedResult.content).toContain('model');
    expect(populatedResult.content).toContain('claude-sonnet');
    expect(populatedResult.content).toContain('timeout');
    expect(populatedResult.content).toContain('30');
  });
});
