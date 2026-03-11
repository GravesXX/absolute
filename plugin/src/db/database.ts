import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  title: string;
  description: string;
  status: string;
  user_approved: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  plan_id: string;
  agent_id: string;
  title: string;
  description: string;
  status: string;
  sequence: number;
  result_summary: string | null;
  quality_score: number | null;
  quality_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Consultation {
  id: string;
  plan_id: string | null;
  task_id: string | null;
  agent_id: string;
  phase: string;
  message: string;
  response: string | null;
  created_at: string;
}

export interface AgentMetric {
  id: string;
  agent_id: string;
  domain: string;
  tasks_completed: number;
  avg_quality: number;
  avg_response_rounds: number;
  last_updated: string;
}

export interface Preference {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface LogEntry {
  id: string;
  plan_id: string | null;
  task_id: string | null;
  action: string;
  detail: string;
  created_at: string;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','consulting','approved','in_progress','completed','failed')),
  user_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  agent_id TEXT NOT NULL CHECK (agent_id IN ('sophon','athena','hermes')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consulting','delegated','in_progress','review','completed','failed')),
  sequence INTEGER NOT NULL,
  result_summary TEXT,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  quality_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id),
  task_id TEXT REFERENCES tasks(id),
  agent_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('planning','execution')),
  message TEXT NOT NULL,
  response TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_metrics (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  avg_quality REAL NOT NULL DEFAULT 0.0,
  avg_response_rounds REAL NOT NULL DEFAULT 0.0,
  last_updated TEXT NOT NULL,
  UNIQUE(agent_id, domain)
);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coordination_log (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id),
  task_id TEXT REFERENCES tasks(id),
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_consultations_task ON consultations(task_id);
CREATE INDEX IF NOT EXISTS idx_consultations_plan ON consultations(plan_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent ON agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_coordination_log_plan ON coordination_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_coordination_log_action ON coordination_log(action);
`;

// ── AbsoluteDB ───────────────────────────────────────────────────────────────

export class AbsoluteDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  // ── Introspection ────────────────────────────────────────────────────────

  listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  createPlan(title: string, description: string): Plan {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO plans (id, title, description, status, user_approved, created_at, updated_at) VALUES (?, ?, ?, 'draft', 0, ?, ?)"
      )
      .run(id, title, description, now, now);
    return this.getPlan(id)!;
  }

  getPlan(id: string): Plan | undefined {
    return this.db
      .prepare('SELECT * FROM plans WHERE id = ?')
      .get(id) as Plan | undefined;
  }

  getActivePlans(): Plan[] {
    return this.db
      .prepare(
        "SELECT * FROM plans WHERE status IN ('draft','consulting','approved','in_progress') ORDER BY created_at DESC"
      )
      .all() as Plan[];
  }

  getAllPlans(limit?: number): Plan[] {
    if (limit !== undefined) {
      return this.db
        .prepare('SELECT * FROM plans ORDER BY created_at DESC LIMIT ?')
        .all(limit) as Plan[];
    }
    return this.db
      .prepare('SELECT * FROM plans ORDER BY created_at DESC')
      .all() as Plan[];
  }

  updatePlanStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE plans SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
  }

  approvePlan(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE plans SET user_approved = 1, status = 'approved', updated_at = ? WHERE id = ?")
      .run(now, id);
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  createTask(
    planId: string,
    agentId: string,
    title: string,
    description: string,
    sequence: number
  ): Task {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO tasks (id, plan_id, agent_id, title, description, status, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)"
      )
      .run(id, planId, agentId, title, description, sequence, now, now);
    return this.getTask(id)!;
  }

  getTask(id: string): Task | undefined {
    return this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Task | undefined;
  }

  getPlanTasks(planId: string): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE plan_id = ? ORDER BY sequence ASC')
      .all(planId) as Task[];
  }

  getActiveTasks(): Task[] {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE status NOT IN ('completed','failed') ORDER BY created_at ASC"
      )
      .all() as Task[];
  }

  getTasksByAgent(agentId: string): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at ASC')
      .all(agentId) as Task[];
  }

  updateTaskStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
  }

  updateTaskResult(id: string, resultSummary: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET result_summary = ?, updated_at = ? WHERE id = ?')
      .run(resultSummary, now, id);
  }

  updateTaskQuality(id: string, score: number, notes: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET quality_score = ?, quality_notes = ?, updated_at = ? WHERE id = ?')
      .run(score, notes, now, id);
  }

  // ── Consultations ────────────────────────────────────────────────────────

  createConsultation(
    agentId: string,
    phase: string,
    message: string,
    planId?: string,
    taskId?: string
  ): Consultation {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO consultations (id, plan_id, task_id, agent_id, phase, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, planId ?? null, taskId ?? null, agentId, phase, message, now);
    return this.getConsultation(id)!;
  }

  getConsultation(id: string): Consultation | undefined {
    return this.db
      .prepare('SELECT * FROM consultations WHERE id = ?')
      .get(id) as Consultation | undefined;
  }

  recordConsultationResponse(id: string, response: string): void {
    this.db
      .prepare('UPDATE consultations SET response = ? WHERE id = ?')
      .run(response, id);
  }

  getTaskConsultations(taskId: string): Consultation[] {
    return this.db
      .prepare('SELECT * FROM consultations WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as Consultation[];
  }

  getPlanConsultations(planId: string): Consultation[] {
    return this.db
      .prepare('SELECT * FROM consultations WHERE plan_id = ? ORDER BY created_at ASC')
      .all(planId) as Consultation[];
  }

  // ── Agent Metrics ────────────────────────────────────────────────────────

  upsertMetric(
    agentId: string,
    domain: string,
    tasksCompleted: number,
    avgQuality: number,
    avgResponseRounds: number
  ): AgentMetric {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM agent_metrics WHERE agent_id = ? AND domain = ?')
      .get(agentId, domain) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          'UPDATE agent_metrics SET tasks_completed = ?, avg_quality = ?, avg_response_rounds = ?, last_updated = ? WHERE agent_id = ? AND domain = ?'
        )
        .run(tasksCompleted, avgQuality, avgResponseRounds, now, agentId, domain);
      return this.getMetric(existing.id)!;
    } else {
      const id = uuidv4();
      this.db
        .prepare(
          'INSERT INTO agent_metrics (id, agent_id, domain, tasks_completed, avg_quality, avg_response_rounds, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, agentId, domain, tasksCompleted, avgQuality, avgResponseRounds, now);
      return this.getMetric(id)!;
    }
  }

  getMetric(id: string): AgentMetric | undefined {
    return this.db
      .prepare('SELECT * FROM agent_metrics WHERE id = ?')
      .get(id) as AgentMetric | undefined;
  }

  getAgentMetrics(agentId?: string): AgentMetric[] {
    if (agentId !== undefined) {
      return this.db
        .prepare('SELECT * FROM agent_metrics WHERE agent_id = ? ORDER BY domain ASC')
        .all(agentId) as AgentMetric[];
    }
    return this.db
      .prepare('SELECT * FROM agent_metrics ORDER BY agent_id ASC, domain ASC')
      .all() as AgentMetric[];
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  setPreference(key: string, value: string): Preference {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM preferences WHERE key = ?')
      .get(key) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare('UPDATE preferences SET value = ?, updated_at = ? WHERE key = ?')
        .run(value, now, key);
      return this.getPreference(existing.id)!;
    } else {
      const id = uuidv4();
      this.db
        .prepare('INSERT INTO preferences (id, key, value, updated_at) VALUES (?, ?, ?, ?)')
        .run(id, key, value, now);
      return this.getPreference(id)!;
    }
  }

  getPreference(idOrKey: string): Preference | undefined {
    const byId = this.db
      .prepare('SELECT * FROM preferences WHERE id = ?')
      .get(idOrKey) as Preference | undefined;
    if (byId) return byId;
    return this.db
      .prepare('SELECT * FROM preferences WHERE key = ?')
      .get(idOrKey) as Preference | undefined;
  }

  getAllPreferences(): Preference[] {
    return this.db
      .prepare('SELECT * FROM preferences ORDER BY key ASC')
      .all() as Preference[];
  }

  // ── Coordination Log ─────────────────────────────────────────────────────

  logAction(
    action: string,
    detail: string,
    planId?: string,
    taskId?: string
  ): LogEntry {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO coordination_log (id, plan_id, task_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, planId ?? null, taskId ?? null, action, detail, now);
    return this.getLogEntry(id)!;
  }

  getLogEntry(id: string): LogEntry | undefined {
    return this.db
      .prepare('SELECT * FROM coordination_log WHERE id = ?')
      .get(id) as LogEntry | undefined;
  }

  getLog(filters?: { planId?: string; taskId?: string; action?: string; limit?: number }): LogEntry[] {
    const limit = filters?.limit ?? 100;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.planId !== undefined) {
      conditions.push('plan_id = ?');
      params.push(filters.planId);
    }
    if (filters?.taskId !== undefined) {
      conditions.push('task_id = ?');
      params.push(filters.taskId);
    }
    if (filters?.action !== undefined) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    return this.db
      .prepare(`SELECT * FROM coordination_log ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as LogEntry[];
  }
}
