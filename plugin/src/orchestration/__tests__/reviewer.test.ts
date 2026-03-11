import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../../db/database';
import { Planner } from '../planner';
import { Reviewer } from '../reviewer';

const TEST_DB_PATH = path.join(__dirname, 'test-reviewer.db');

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function extractId(content: string): string {
  const match = content.match(/ID: ([a-f0-9-]+)/);
  if (!match) throw new Error(`No ID found in: ${content}`);
  return match[1];
}

let db: AbsoluteDB;
let planner: Planner;
let reviewer: Reviewer;

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
  planner = new Planner(db);
  reviewer = new Reviewer(db);
});

afterEach(() => {
  db.close();
  cleanup();
});

describe('Reviewer', () => {
  // Test 1: reviewTask scores and logs (score 4 = pass)
  it('should score a task, log it, and return pass for score 4', () => {
    const planResult = planner.createPlan('Review Plan', 'A plan to review');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'sophon', 'Review Task', 'A task to review', 1);
    const taskId = extractId(taskResult.content);

    const result = reviewer.reviewTask(taskId, 4, 'Good work');
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('4/5');
    expect(result.content).toContain('pass');

    const task = db.getTask(taskId);
    expect(task!.quality_score).toBe(4);
    expect(task!.quality_notes).toBe('Good work');

    const log = db.getLog({ taskId, action: 'quality_review' });
    expect(log.length).toBeGreaterThanOrEqual(1);
  });

  // Test 2: reviewTask returns fail below threshold (score 2)
  it('should return fail for score 2 below default threshold', () => {
    const planResult = planner.createPlan('Fail Plan', 'A plan that fails review');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'athena', 'Fail Task', 'Poor quality task', 1);
    const taskId = extractId(taskResult.content);

    const result = reviewer.reviewTask(taskId, 2, 'Poor quality');
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('fail');
    expect(result.content).toContain('below threshold');
  });

  // Test 3: reviewTask rejects score outside 1-5
  it('should reject score outside 1-5 range (error contains 1 and 5)', () => {
    const planResult = planner.createPlan('Score Plan', 'A plan for score validation');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'hermes', 'Score Task', 'Task to score', 1);
    const taskId = extractId(taskResult.content);

    const tooLow = reviewer.reviewTask(taskId, 0, 'Zero');
    expect(tooLow.error).toBeDefined();
    expect(tooLow.error).toContain('1');
    expect(tooLow.error).toContain('5');

    const tooHigh = reviewer.reviewTask(taskId, 6, 'Six');
    expect(tooHigh.error).toBeDefined();
    expect(tooHigh.error).toContain('1');
    expect(tooHigh.error).toContain('5');
  });

  // Test 4: getQualitySummary aggregates across agents
  it('should aggregate quality summary across agents', () => {
    const planResult = planner.createPlan('Summary Plan', 'A plan for summary testing');
    const planId = extractId(planResult.content);

    const t1Result = planner.addTask(planId, 'sophon', 'Sophon Task 1', 'First sophon task', 1);
    const t1Id = extractId(t1Result.content);
    const t2Result = planner.addTask(planId, 'sophon', 'Sophon Task 2', 'Second sophon task', 2);
    const t2Id = extractId(t2Result.content);
    const t3Result = planner.addTask(planId, 'athena', 'Athena Task', 'Athena task', 3);
    const t3Id = extractId(t3Result.content);

    reviewer.reviewTask(t1Id, 4, 'Good');
    reviewer.reviewTask(t2Id, 2, 'Poor');
    reviewer.reviewTask(t3Id, 5, 'Excellent');

    const result = reviewer.getQualitySummary();
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('sophon');
    expect(result.content).toContain('athena');
  });

  // Test 5: reviewTask uses custom threshold from preferences
  it('should use custom threshold from preferences (threshold=4, score 3 should fail)', () => {
    db.setPreference('quality_threshold', '4');

    const planResult = planner.createPlan('Custom Threshold Plan', 'Custom threshold test');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'sophon', 'Threshold Task', 'Testing threshold', 1);
    const taskId = extractId(taskResult.content);

    const result = reviewer.reviewTask(taskId, 3, 'Below custom threshold');
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('fail');
    expect(result.content).toContain('below threshold');
  });
});
