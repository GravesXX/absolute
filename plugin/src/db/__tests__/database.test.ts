import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { AbsoluteDB } from '../database';

const TEST_DB_PATH = path.join(__dirname, 'test-absolute.db');

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

let db: AbsoluteDB;

beforeEach(() => {
  cleanup();
  db = new AbsoluteDB(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  cleanup();
});

// ── Test 1 ───────────────────────────────────────────────────────────────────

describe('AbsoluteDB', () => {
  it('should create all 6 tables on initialization', () => {
    const tables = db.listTables();
    expect(tables).toContain('plans');
    expect(tables).toContain('tasks');
    expect(tables).toContain('consultations');
    expect(tables).toContain('agent_metrics');
    expect(tables).toContain('preferences');
    expect(tables).toContain('coordination_log');
    expect(tables).toHaveLength(6);
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────

  it('should create and retrieve a plan', () => {
    const plan = db.createPlan('Build API', 'Create a REST API for the project');

    expect(plan.id).toBeTruthy();
    expect(plan.title).toBe('Build API');
    expect(plan.description).toBe('Create a REST API for the project');
    expect(plan.status).toBe('draft');
    expect(plan.user_approved).toBe(0);
    expect(plan.created_at).toBeTruthy();
    expect(plan.updated_at).toBeTruthy();

    const fetched = db.getPlan(plan.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(plan.id);
    expect(fetched!.title).toBe('Build API');

    const active = db.getActivePlans();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(plan.id);

    const all = db.getAllPlans();
    expect(all.length).toBe(1);

    // completed plan should not appear in active
    db.updatePlanStatus(plan.id, 'completed');
    const activeAfter = db.getActivePlans();
    expect(activeAfter.length).toBe(0);

    // getAllPlans with limit
    const limited = db.getAllPlans(1);
    expect(limited.length).toBe(1);
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────

  it('should update plan status and approval', () => {
    const plan = db.createPlan('Deploy Service', 'Deploy to production');

    db.updatePlanStatus(plan.id, 'consulting');
    const consulting = db.getPlan(plan.id);
    expect(consulting!.status).toBe('consulting');

    db.approvePlan(plan.id);
    const approved = db.getPlan(plan.id);
    expect(approved!.status).toBe('approved');
    expect(approved!.user_approved).toBe(1);
    expect(approved!.updated_at >= plan.updated_at).toBe(true);
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────

  it('should create tasks for a plan and retrieve by agent', () => {
    const plan = db.createPlan('Full Stack App', 'Build a full stack application');

    const task1 = db.createTask(plan.id, 'sophon', 'Research phase', 'Do research', 1);
    const task2 = db.createTask(plan.id, 'athena', 'Career alignment', 'Align with career goals', 2);
    const task3 = db.createTask(plan.id, 'sophon', 'Analyze results', 'Analyze the research results', 3);

    expect(task1.id).toBeTruthy();
    expect(task1.plan_id).toBe(plan.id);
    expect(task1.agent_id).toBe('sophon');
    expect(task1.sequence).toBe(1);
    expect(task1.status).toBe('pending');

    // getPlanTasks ordered by sequence
    const planTasks = db.getPlanTasks(plan.id);
    expect(planTasks).toHaveLength(3);
    expect(planTasks[0].sequence).toBe(1);
    expect(planTasks[1].sequence).toBe(2);
    expect(planTasks[2].sequence).toBe(3);

    // getTasksByAgent
    const sophonTasks = db.getTasksByAgent('sophon');
    expect(sophonTasks).toHaveLength(2);
    const athenaTasks = db.getTasksByAgent('athena');
    expect(athenaTasks).toHaveLength(1);

    // getActiveTasks - all pending so all active
    const active = db.getActiveTasks();
    expect(active).toHaveLength(3);

    // completed task should not appear in active
    db.updateTaskStatus(task1.id, 'completed');
    const activeAfter = db.getActiveTasks();
    expect(activeAfter).toHaveLength(2);
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────

  it('should update task status, result, and quality', () => {
    const plan = db.createPlan('Task Updates Plan', 'Testing task updates');
    const task = db.createTask(plan.id, 'hermes', 'Write report', 'Write a detailed report', 1);

    db.updateTaskStatus(task.id, 'in_progress');
    const inProgress = db.getTask(task.id);
    expect(inProgress!.status).toBe('in_progress');
    expect(inProgress!.updated_at >= task.updated_at).toBe(true);

    db.updateTaskResult(task.id, 'Report completed successfully');
    const withResult = db.getTask(task.id);
    expect(withResult!.result_summary).toBe('Report completed successfully');

    db.updateTaskQuality(task.id, 4, 'Good quality work, minor improvements possible');
    const withQuality = db.getTask(task.id);
    expect(withQuality!.quality_score).toBe(4);
    expect(withQuality!.quality_notes).toBe('Good quality work, minor improvements possible');
  });

  // ── Test 6 ─────────────────────────────────────────────────────────────

  it('should create consultations with plan-level and task-level references', () => {
    const plan = db.createPlan('Consultation Plan', 'A plan for consultation testing');
    const task = db.createTask(plan.id, 'sophon', 'Consultation task', 'Task for consultation', 1);

    // plan-level consultation
    const planConsultation = db.createConsultation(
      'sophon',
      'planning',
      'What is the best approach for this plan?',
      plan.id,
      undefined
    );
    expect(planConsultation.id).toBeTruthy();
    expect(planConsultation.agent_id).toBe('sophon');
    expect(planConsultation.phase).toBe('planning');
    expect(planConsultation.plan_id).toBe(plan.id);
    expect(planConsultation.task_id).toBeNull();
    expect(planConsultation.response).toBeNull();

    // task-level consultation
    const taskConsultation = db.createConsultation(
      'athena',
      'execution',
      'How should I execute this task?',
      undefined,
      task.id
    );
    expect(taskConsultation.task_id).toBe(task.id);
    expect(taskConsultation.plan_id).toBeNull();

    // record response
    db.recordConsultationResponse(planConsultation.id, 'Use an iterative approach.');
    const updated = db.getConsultation(planConsultation.id);
    expect(updated!.response).toBe('Use an iterative approach.');

    // getPlanConsultations
    const planConsultations = db.getPlanConsultations(plan.id);
    expect(planConsultations).toHaveLength(1);
    expect(planConsultations[0].id).toBe(planConsultation.id);

    // getTaskConsultations
    const taskConsultations = db.getTaskConsultations(task.id);
    expect(taskConsultations).toHaveLength(1);
    expect(taskConsultations[0].id).toBe(taskConsultation.id);
  });

  // ── Test 7 ─────────────────────────────────────────────────────────────

  it('should upsert agent metrics', () => {
    // insert new metric
    const metric = db.upsertMetric('sophon', 'philosophy', 5, 4.2, 2.5);
    expect(metric.id).toBeTruthy();
    expect(metric.agent_id).toBe('sophon');
    expect(metric.domain).toBe('philosophy');
    expect(metric.tasks_completed).toBe(5);
    expect(metric.avg_quality).toBeCloseTo(4.2);
    expect(metric.avg_response_rounds).toBeCloseTo(2.5);

    // upsert same agent+domain (update)
    const updated = db.upsertMetric('sophon', 'philosophy', 10, 4.5, 2.1);
    expect(updated.agent_id).toBe('sophon');
    expect(updated.domain).toBe('philosophy');
    expect(updated.tasks_completed).toBe(10);
    expect(updated.avg_quality).toBeCloseTo(4.5);

    // verify only one entry for sophon+philosophy
    const sophonMetrics = db.getAgentMetrics('sophon');
    const philosophyEntries = sophonMetrics.filter(m => m.domain === 'philosophy');
    expect(philosophyEntries).toHaveLength(1);

    // add different domain
    db.upsertMetric('sophon', 'ethics', 3, 3.8, 3.0);
    const sophonAll = db.getAgentMetrics('sophon');
    expect(sophonAll).toHaveLength(2);

    // getAgentMetrics for all agents
    db.upsertMetric('athena', 'career', 8, 4.7, 1.8);
    const allMetrics = db.getAgentMetrics();
    expect(allMetrics.length).toBeGreaterThanOrEqual(3);

    // getMetric by id
    const fetched = db.getMetric(metric.id);
    expect(fetched).toBeDefined();
    expect(fetched!.agent_id).toBe('sophon');
  });

  // ── Test 8 ─────────────────────────────────────────────────────────────

  it('should set and get preferences with upsert behavior', () => {
    const pref = db.setPreference('theme', 'dark');
    expect(pref.id).toBeTruthy();
    expect(pref.key).toBe('theme');
    expect(pref.value).toBe('dark');
    expect(pref.updated_at).toBeTruthy();

    // get by id
    const byId = db.getPreference(pref.id);
    expect(byId).toBeDefined();
    expect(byId!.key).toBe('theme');

    // get by key
    const byKey = db.getPreference('theme');
    expect(byKey).toBeDefined();
    expect(byKey!.value).toBe('dark');

    // upsert existing key
    const upserted = db.setPreference('theme', 'light');
    expect(upserted.key).toBe('theme');
    expect(upserted.value).toBe('light');

    // only one entry for theme
    const all = db.getAllPreferences();
    const themeEntries = all.filter(p => p.key === 'theme');
    expect(themeEntries).toHaveLength(1);
    expect(themeEntries[0].value).toBe('light');

    // add another preference
    db.setPreference('language', 'en');
    const allAfter = db.getAllPreferences();
    expect(allAfter.length).toBeGreaterThanOrEqual(2);
  });

  // ── Test 9 ─────────────────────────────────────────────────────────────

  it('should log actions and filter by plan, task, and action type', () => {
    const plan = db.createPlan('Log Test Plan', 'Testing log actions');
    const task = db.createTask(plan.id, 'hermes', 'Log task', 'A task for logging', 1);

    const entry1 = db.logAction('plan_created', 'Plan was created', plan.id);
    const entry2 = db.logAction('task_delegated', 'Task delegated to hermes', plan.id, task.id);
    const entry3 = db.logAction('status_update', 'Status updated', plan.id);
    const entry4 = db.logAction('task_completed', 'Task completed by hermes', plan.id, task.id);

    expect(entry1.id).toBeTruthy();
    expect(entry1.action).toBe('plan_created');
    expect(entry1.detail).toBe('Plan was created');
    expect(entry1.plan_id).toBe(plan.id);
    expect(entry1.task_id).toBeNull();

    // getLogEntry by id
    const fetched = db.getLogEntry(entry1.id);
    expect(fetched).toBeDefined();
    expect(fetched!.action).toBe('plan_created');

    // filter by planId
    const byPlan = db.getLog({ planId: plan.id });
    expect(byPlan.length).toBe(4);

    // filter by taskId
    const byTask = db.getLog({ taskId: task.id });
    expect(byTask.length).toBe(2);

    // filter by action
    const byAction = db.getLog({ action: 'task_delegated' });
    expect(byAction.length).toBe(1);
    expect(byAction[0].id).toBe(entry2.id);

    // filter by planId + action
    const byPlanAndAction = db.getLog({ planId: plan.id, action: 'task_completed' });
    expect(byPlanAndAction.length).toBe(1);

    // limit
    const limited = db.getLog({ planId: plan.id, limit: 2 });
    expect(limited.length).toBe(2);
  });
});
