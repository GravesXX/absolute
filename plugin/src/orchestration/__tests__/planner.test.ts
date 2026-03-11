import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../../db/database';
import { Planner } from '../planner';

const TEST_DB_PATH = path.join(__dirname, 'test-planner.db');

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

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
  planner = new Planner(db);
});

afterEach(() => {
  db.close();
  cleanup();
});

describe('Planner', () => {
  // Test 1: createPlan creates with draft status
  it('should create a plan with draft status', () => {
    const result = planner.createPlan('My Plan', 'A plan description');
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('ID:');

    const id = extractId(result.content);
    const plan = db.getPlan(id);
    expect(plan).toBeDefined();
    expect(plan!.title).toBe('My Plan');
    expect(plan!.status).toBe('draft');
    expect(plan!.user_approved).toBe(0);
  });

  // Test 2: addTask adds tasks with correct sequence
  it('should add tasks to a plan with correct sequence', () => {
    const planResult = planner.createPlan('Multi-task Plan', 'Plan with multiple tasks');
    const planId = extractId(planResult.content);

    const task1Result = planner.addTask(planId, 'sophon', 'Research', 'Do research', 1);
    expect(task1Result.error).toBeUndefined();
    expect(task1Result.content).toContain('ID:');
    const task1Id = extractId(task1Result.content);

    const task2Result = planner.addTask(planId, 'athena', 'Career Alignment', 'Align career', 2);
    expect(task2Result.error).toBeUndefined();
    const task2Id = extractId(task2Result.content);

    const tasks = db.getPlanTasks(planId);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe(task1Id);
    expect(tasks[0].sequence).toBe(1);
    expect(tasks[1].id).toBe(task2Id);
    expect(tasks[1].sequence).toBe(2);
  });

  // Test 3: addTask rejects invalid agent_id
  it('should reject addTask with invalid agent_id (error contains unknown_agent)', () => {
    const planResult = planner.createPlan('Plan', 'Description');
    const planId = extractId(planResult.content);

    const result = planner.addTask(planId, 'invalid-agent', 'Task', 'Desc', 1);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('unknown_agent');
  });

  // Test 4: approvePlan transitions to approved and logs it
  it('should approve a plan and log the action', () => {
    const planResult = planner.createPlan('Approvable Plan', 'Ready to approve');
    const planId = extractId(planResult.content);
    planner.addTask(planId, 'hermes', 'Task One', 'Do something', 1);

    const approveResult = planner.approvePlan(planId);
    expect(approveResult.error).toBeUndefined();
    expect(approveResult.content).toContain('approved');

    const plan = db.getPlan(planId);
    expect(plan!.status).toBe('approved');
    expect(plan!.user_approved).toBe(1);

    const log = db.getLog({ planId, action: 'plan_approved' });
    expect(log.length).toBeGreaterThanOrEqual(1);
  });

  // Test 5: approvePlan rejects plan with no tasks
  it('should reject approvePlan with no tasks (error contains no tasks)', () => {
    const planResult = planner.createPlan('Empty Plan', 'No tasks here');
    const planId = extractId(planResult.content);

    const result = planner.approvePlan(planId);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('no tasks');
  });

  // Test 6: getPlanStatus returns full plan with tasks
  it('should return full plan status with tasks', () => {
    const planResult = planner.createPlan('Status Plan', 'Plan for status check');
    const planId = extractId(planResult.content);
    planner.addTask(planId, 'sophon', 'First Task', 'Description one', 1);
    planner.addTask(planId, 'athena', 'Second Task', 'Description two', 2);

    const statusResult = planner.getPlanStatus(planId);
    expect(statusResult.error).toBeUndefined();
    expect(statusResult.content).toContain('Status Plan');
    expect(statusResult.content).toContain('draft');
    expect(statusResult.content).toContain('First Task');
    expect(statusResult.content).toContain('Second Task');
    expect(statusResult.content).toContain('sophon');
    expect(statusResult.content).toContain('athena');
  });
});
