import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../../db/database';
import { Planner } from '../planner';
import { Delegator } from '../delegator';

const TEST_DB_PATH = path.join(__dirname, 'test-delegator.db');

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
let delegator: Delegator;

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
  planner = new Planner(db);
  delegator = new Delegator(db);
});

afterEach(() => {
  db.close();
  cleanup();
});

describe('Delegator', () => {
  // Test 1: delegateTask marks as delegated and logs
  it('should delegate a task and log the action', () => {
    const planResult = planner.createPlan('Delegate Plan', 'For delegation testing');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'sophon', 'Delegatable Task', 'Do it', 1);
    const taskId = extractId(taskResult.content);

    const result = delegator.delegateTask(taskId);
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('delegated');

    const task = db.getTask(taskId);
    expect(task!.status).toBe('delegated');

    const log = db.getLog({ taskId, action: 'task_delegated' });
    expect(log.length).toBeGreaterThanOrEqual(1);
  });

  // Test 2: delegateTask rejects completed tasks
  it('should reject delegating a completed task (error contains completed)', () => {
    const planResult = planner.createPlan('Completed Plan', 'Plan with completed task');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'athena', 'Completed Task', 'Already done', 1);
    const taskId = extractId(taskResult.content);

    db.updateTaskStatus(taskId, 'completed');

    const result = delegator.delegateTask(taskId);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('completed');
  });

  // Test 3: consult records consultation and allows response recording
  it('should create a consultation and record a response', () => {
    const planResult = planner.createPlan('Consult Plan', 'Plan for consultation');
    const planId = extractId(planResult.content);
    const taskResult = planner.addTask(planId, 'hermes', 'Consult Task', 'Needs consultation', 1);
    const taskId = extractId(taskResult.content);

    const consultResult = delegator.consult(taskId, 'sophon', 'execution', 'How should I proceed?');
    expect(consultResult.error).toBeUndefined();
    expect(consultResult.content).toContain('ID:');
    const consultId = extractId(consultResult.content);

    const consultation = db.getConsultation(consultId);
    expect(consultation).toBeDefined();
    expect(consultation!.task_id).toBe(taskId);
    expect(consultation!.agent_id).toBe('sophon');
    expect(consultation!.response).toBeNull();

    const responseResult = delegator.recordResponse(consultId, 'Proceed step by step.');
    expect(responseResult.error).toBeUndefined();

    const updated = db.getConsultation(consultId);
    expect(updated!.response).toBe('Proceed step by step.');
  });

  // Test 4: consultPlan records plan-level consultation (task_id is null)
  it('should create a plan-level consultation with null task_id', () => {
    const planResult = planner.createPlan('Plan Level Consult', 'For plan consultation');
    const planId = extractId(planResult.content);

    const consultResult = delegator.consultPlan(planId, 'athena', 'What is the best plan?');
    expect(consultResult.error).toBeUndefined();
    expect(consultResult.content).toContain('ID:');
    const consultId = extractId(consultResult.content);

    const consultation = db.getConsultation(consultId);
    expect(consultation).toBeDefined();
    expect(consultation!.plan_id).toBe(planId);
    expect(consultation!.task_id).toBeNull();
    expect(consultation!.agent_id).toBe('athena');
  });

  // Test 5: getActiveTaskList returns tasks across all plans
  it('should return active tasks across all plans', () => {
    const plan1Result = planner.createPlan('Plan Alpha', 'First plan');
    const plan1Id = extractId(plan1Result.content);
    planner.addTask(plan1Id, 'sophon', 'Task Alpha 1', 'Alpha task one', 1);
    planner.addTask(plan1Id, 'athena', 'Task Alpha 2', 'Alpha task two', 2);

    const plan2Result = planner.createPlan('Plan Beta', 'Second plan');
    const plan2Id = extractId(plan2Result.content);
    const task3Result = planner.addTask(plan2Id, 'hermes', 'Task Beta 1', 'Beta task one', 1);
    const task3Id = extractId(task3Result.content);

    // Complete one task — it should not appear in active list
    db.updateTaskStatus(task3Id, 'completed');

    const result = delegator.getActiveTaskList();
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Task Alpha 1');
    expect(result.content).toContain('Task Alpha 2');
    expect(result.content).not.toContain('Task Beta 1');
    expect(result.content).toContain('sophon');
    expect(result.content).toContain('athena');
  });
});
