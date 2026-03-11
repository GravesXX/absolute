import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../../db/database';
import { MetricsTracker } from '../metrics';

const TEST_DB_PATH = path.join(__dirname, 'test-metrics.db');

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

let db: AbsoluteDB;
let metrics: MetricsTracker;

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
  metrics = new MetricsTracker(db);
});

afterEach(() => {
  db.close();
  cleanup();
});

describe('MetricsTracker', () => {
  // Test 1: single completion records metric
  it('should record a single completion', () => {
    const result = metrics.recordCompletion('sophon', 'philosophy', 4, 2);
    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();

    const agentMetrics = db.getAgentMetrics('sophon');
    expect(agentMetrics).toHaveLength(1);
    expect(agentMetrics[0].agent_id).toBe('sophon');
    expect(agentMetrics[0].domain).toBe('philosophy');
    expect(agentMetrics[0].tasks_completed).toBe(1);
    expect(agentMetrics[0].avg_quality).toBeCloseTo(4);
    expect(agentMetrics[0].avg_response_rounds).toBeCloseTo(2);
  });

  // Test 2: rolling averages update correctly on multiple completions
  it('should compute rolling averages over multiple completions', () => {
    metrics.recordCompletion('sophon', 'ethics', 4, 2);
    metrics.recordCompletion('sophon', 'ethics', 2, 4);

    const agentMetrics = db.getAgentMetrics('sophon');
    const ethicsMetric = agentMetrics.find(m => m.domain === 'ethics');
    expect(ethicsMetric).toBeDefined();
    expect(ethicsMetric!.tasks_completed).toBe(2);
    // avg quality = (4 + 2) / 2 = 3
    expect(ethicsMetric!.avg_quality).toBeCloseTo(3);
    // avg rounds = (2 + 4) / 2 = 3
    expect(ethicsMetric!.avg_response_rounds).toBeCloseTo(3);
  });

  // Test 3: getMetrics filtered by agent and all agents
  it('should return metrics filtered by agent and all agents', () => {
    metrics.recordCompletion('sophon', 'logic', 5, 1);
    metrics.recordCompletion('athena', 'career', 3, 3);

    const sophonResult = metrics.getMetrics('sophon');
    expect(sophonResult.error).toBeUndefined();
    expect(sophonResult.content).toContain('sophon');
    expect(sophonResult.content).toContain('logic');
    expect(sophonResult.content).not.toContain('career');

    const allResult = metrics.getMetrics();
    expect(allResult.error).toBeUndefined();
    expect(allResult.content).toContain('sophon');
    expect(allResult.content).toContain('athena');
  });

  // Test 4: empty state returns appropriate message
  it('should return a meaningful message when no metrics exist', () => {
    const result = metrics.getMetrics();
    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();
    // Should either say no metrics or return empty content gracefully
  });
});
