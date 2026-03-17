import { v4 as uuidv4 } from 'uuid';
import { ObsidianAdapter } from 'obsidian-adapter';

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

// ── Preferences parsing helpers ─────────────────────────────────────────────

const PREF_TAG_RE = /<!-- pref:([^ ]+) -->/;

function parsePreferencesBody(body: string): Preference[] {
  const prefs: Preference[] = [];
  const lines = body.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      const key = line.slice(4).trim();
      let value = '';
      let updated_at = '';
      let prefId = '';

      i++;
      while (i < lines.length && !lines[i].startsWith('### ')) {
        const l = lines[i];
        if (l.startsWith('- **Value:**')) value = l.slice(12).trim();
        else if (l.startsWith('- **Updated:**')) updated_at = l.slice(14).trim();

        const tagMatch = l.match(PREF_TAG_RE);
        if (tagMatch) prefId = tagMatch[1];

        i++;
      }

      if (prefId && key) {
        prefs.push({ id: prefId, key, value, updated_at });
      }
      continue;
    }

    i++;
  }
  return prefs;
}

function formatPreference(p: Preference): string {
  return `### ${p.key}\n- **Value:** ${p.value}\n- **Updated:** ${p.updated_at}\n<!-- pref:${p.id} -->`;
}

function buildPreferencesBody(prefs: Preference[]): string {
  let body = '# Preferences\n\n';
  const sorted = [...prefs].sort((a, b) => a.key.localeCompare(b.key));
  body += sorted.map(formatPreference).join('\n\n') + '\n';
  return body;
}

// ── AbsoluteDB ───────────────────────────────────────────────────────────────

export class AbsoluteDB {
  private adapter: ObsidianAdapter;
  private readonly PREFERENCES_PATH = 'Preferences.md';

  constructor(vaultPath: string) {
    this.adapter = new ObsidianAdapter(vaultPath, 'Agents/Absolute');

    // Ensure folder structure
    this.adapter.ensureFolder('Plans');
    this.adapter.ensureFolder('Tasks');
    this.adapter.ensureFolder('Consultations');
    this.adapter.ensureFolder('Metrics');
    this.adapter.ensureFolder('Log');

    // Ensure preferences note exists
    const existing = this.adapter.readNote(this.PREFERENCES_PATH);
    if (!existing) {
      this.adapter.createNote('', 'Preferences.md', {
        id: 'preferences',
        type: 'absolute-preferences',
        updated_at: new Date().toISOString(),
        tags: ['absolute', 'preferences'],
      }, '# Preferences\n');
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  close(): void {
    // No-op for Obsidian adapter
  }

  // ── Introspection ────────────────────────────────────────────────────────

  listTables(): string[] {
    return ['plans', 'tasks', 'consultations', 'agent_metrics', 'preferences', 'coordination_log'];
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  createPlan(title: string, description: string): Plan {
    const id = uuidv4();
    const now = new Date().toISOString();
    const filename = `${this.adapter.sanitize(title)} - ${this.adapter.shortId(id)}.md`;

    this.adapter.createNote('Plans', filename, {
      id,
      type: 'absolute-plan',
      title,
      status: 'draft',
      user_approved: 0,
      created_at: now,
      updated_at: now,
      tags: ['absolute', 'plan'],
    }, `# ${title}\n\n## Description\n\n${description}\n`);

    return this.getPlan(id)!;
  }

  getPlan(id: string): Plan | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'absolute-plan') return undefined;
    return this.planFromEntry(entry);
  }

  getActivePlans(): Plan[] {
    const activeStatuses = new Set(['draft', 'consulting', 'approved', 'in_progress']);
    return this.adapter.findByType('absolute-plan')
      .filter(e => activeStatuses.has(e.frontmatter.status as string))
      .map(e => this.planFromEntry(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getAllPlans(limit?: number): Plan[] {
    let plans = this.adapter.findByType('absolute-plan')
      .map(e => this.planFromEntry(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (limit !== undefined) {
      plans = plans.slice(0, limit);
    }
    return plans;
  }

  updatePlanStatus(id: string, status: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    this.adapter.updateFrontmatter(entry.relativePath, {
      status,
      updated_at: new Date().toISOString(),
    });
  }

  approvePlan(id: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    this.adapter.updateFrontmatter(entry.relativePath, {
      user_approved: 1,
      status: 'approved',
      updated_at: new Date().toISOString(),
    });
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

    // Resolve plan title for folder naming
    const plan = this.getPlan(planId);
    const planFolder = plan
      ? this.adapter.sanitize(plan.title)
      : this.adapter.shortId(planId);
    const taskFolder = `Tasks/${planFolder}`;
    this.adapter.ensureFolder(taskFolder);

    const filename = `${sequence} - ${this.adapter.sanitize(title)} - ${this.adapter.shortId(id)}.md`;

    this.adapter.createNote(taskFolder, filename, {
      id,
      type: 'absolute-task',
      plan_id: planId,
      agent_id: agentId,
      title,
      status: 'pending',
      sequence,
      result_summary: null,
      quality_score: null,
      quality_notes: null,
      created_at: now,
      updated_at: now,
      tags: ['absolute', 'task', agentId],
    }, `# ${title}\n\n## Description\n\n${description}\n\n## Result\n\n## Quality Notes\n`);

    return this.getTask(id)!;
  }

  getTask(id: string): Task | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'absolute-task') return undefined;
    return this.taskFromEntry(entry);
  }

  getPlanTasks(planId: string): Task[] {
    return this.adapter.findByType('absolute-task')
      .filter(e => e.frontmatter.plan_id === planId)
      .map(e => this.taskFromEntry(e))
      .sort((a, b) => a.sequence - b.sequence);
  }

  getActiveTasks(): Task[] {
    const terminalStatuses = new Set(['completed', 'failed']);
    return this.adapter.findByType('absolute-task')
      .filter(e => !terminalStatuses.has(e.frontmatter.status as string))
      .map(e => this.taskFromEntry(e))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  getTasksByAgent(agentId: string): Task[] {
    return this.adapter.findByType('absolute-task')
      .filter(e => e.frontmatter.agent_id === agentId)
      .map(e => this.taskFromEntry(e))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  updateTaskStatus(id: string, status: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    this.adapter.updateFrontmatter(entry.relativePath, {
      status,
      updated_at: new Date().toISOString(),
    });
  }

  updateTaskResult(id: string, resultSummary: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    const now = new Date().toISOString();

    this.adapter.updateFrontmatter(entry.relativePath, {
      result_summary: resultSummary,
      updated_at: now,
    });

    // Also update the body's Result section
    const note = this.adapter.readNote(entry.relativePath);
    if (note) {
      const body = note.body.replace(
        /## Result\n[\s\S]*?(?=\n## |$)/,
        `## Result\n\n${resultSummary}\n`
      );
      this.adapter.replaceBody(entry.relativePath, body);
    }
  }

  updateTaskQuality(id: string, score: number, notes: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;
    const now = new Date().toISOString();

    this.adapter.updateFrontmatter(entry.relativePath, {
      quality_score: score,
      quality_notes: notes,
      updated_at: now,
    });

    // Also update the body's Quality Notes section
    const note = this.adapter.readNote(entry.relativePath);
    if (note) {
      const body = note.body.replace(
        /## Quality Notes\n[\s\S]*$/,
        `## Quality Notes\n\nScore: ${score}/5\n\n${notes}\n`
      );
      this.adapter.replaceBody(entry.relativePath, body);
    }
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

    const agentFolder = `Consultations/${this.adapter.sanitize(agentId)}`;
    this.adapter.ensureFolder(agentFolder);

    const filename = `${this.adapter.shortId(id)}.md`;

    this.adapter.createNote(agentFolder, filename, {
      id,
      type: 'absolute-consultation',
      plan_id: planId ?? null,
      task_id: taskId ?? null,
      agent_id: agentId,
      phase,
      response: null,
      created_at: now,
      tags: ['absolute', 'consultation', agentId, phase],
    }, `# Consultation with ${agentId}\n\n## Message\n\n${message}\n\n## Response\n\n`);

    return this.getConsultation(id)!;
  }

  getConsultation(id: string): Consultation | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'absolute-consultation') return undefined;
    return this.consultationFromEntry(entry);
  }

  recordConsultationResponse(id: string, response: string): void {
    const entry = this.adapter.findById(id);
    if (!entry) return;

    this.adapter.updateFrontmatter(entry.relativePath, {
      response,
    });

    // Also update the body's Response section
    const note = this.adapter.readNote(entry.relativePath);
    if (note) {
      const body = note.body.replace(
        /## Response\n[\s\S]*$/,
        `## Response\n\n${response}\n`
      );
      this.adapter.replaceBody(entry.relativePath, body);
    }
  }

  getTaskConsultations(taskId: string): Consultation[] {
    return this.adapter.findByType('absolute-consultation')
      .filter(e => e.frontmatter.task_id === taskId)
      .map(e => this.consultationFromEntry(e))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  getPlanConsultations(planId: string): Consultation[] {
    return this.adapter.findByType('absolute-consultation')
      .filter(e => e.frontmatter.plan_id === planId)
      .map(e => this.consultationFromEntry(e))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
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

    // Check for existing metric by agent_id + domain
    const existing = this.adapter.findByType('absolute-metric')
      .find(e => e.frontmatter.agent_id === agentId && e.frontmatter.domain === domain);

    if (existing) {
      this.adapter.updateFrontmatter(existing.relativePath, {
        tasks_completed: tasksCompleted,
        avg_quality: avgQuality,
        avg_response_rounds: avgResponseRounds,
        last_updated: now,
      });

      // Update body
      const body = `# Agent Metric: ${agentId} - ${domain}\n\n- **Tasks Completed:** ${tasksCompleted}\n- **Avg Quality:** ${avgQuality}\n- **Avg Response Rounds:** ${avgResponseRounds}\n- **Last Updated:** ${now}\n`;
      this.adapter.replaceBody(existing.relativePath, body);

      return this.getMetric(existing.frontmatter.id as string)!;
    } else {
      const id = uuidv4();
      const filename = `${this.adapter.sanitize(agentId)} - ${this.adapter.sanitize(domain)}.md`;

      this.adapter.createNote('Metrics', filename, {
        id,
        type: 'absolute-metric',
        agent_id: agentId,
        domain,
        tasks_completed: tasksCompleted,
        avg_quality: avgQuality,
        avg_response_rounds: avgResponseRounds,
        last_updated: now,
        tags: ['absolute', 'metric', agentId],
      }, `# Agent Metric: ${agentId} - ${domain}\n\n- **Tasks Completed:** ${tasksCompleted}\n- **Avg Quality:** ${avgQuality}\n- **Avg Response Rounds:** ${avgResponseRounds}\n- **Last Updated:** ${now}\n`);

      return this.getMetric(id)!;
    }
  }

  getMetric(id: string): AgentMetric | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'absolute-metric') return undefined;
    return this.metricFromEntry(entry);
  }

  getAgentMetrics(agentId?: string): AgentMetric[] {
    let entries = this.adapter.findByType('absolute-metric');
    if (agentId !== undefined) {
      entries = entries.filter(e => e.frontmatter.agent_id === agentId);
    }
    return entries
      .map(e => this.metricFromEntry(e))
      .sort((a, b) => {
        const agentCmp = a.agent_id.localeCompare(b.agent_id);
        if (agentCmp !== 0) return agentCmp;
        return a.domain.localeCompare(b.domain);
      });
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  setPreference(key: string, value: string): Preference {
    const now = new Date().toISOString();
    const allPrefs = this.getAllPreferencesFromNote();
    const existingIdx = allPrefs.findIndex(p => p.key === key);

    if (existingIdx >= 0) {
      allPrefs[existingIdx].value = value;
      allPrefs[existingIdx].updated_at = now;
    } else {
      const id = uuidv4();
      allPrefs.push({ id, key, value, updated_at: now });
    }

    this.writePreferencesNote(allPrefs);
    const pref = allPrefs.find(p => p.key === key)!;
    return pref;
  }

  getPreference(idOrKey: string): Preference | undefined {
    const allPrefs = this.getAllPreferencesFromNote();
    // Try by id first, then by key
    return allPrefs.find(p => p.id === idOrKey) ?? allPrefs.find(p => p.key === idOrKey);
  }

  getAllPreferences(): Preference[] {
    return this.getAllPreferencesFromNote()
      .sort((a, b) => a.key.localeCompare(b.key));
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

    // Folder: Log/YYYY-MM
    const date = new Date(now);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const logFolder = `Log/${yearMonth}`;
    this.adapter.ensureFolder(logFolder);

    const filename = `${this.adapter.sanitize(action)} - ${this.adapter.shortId(id)}.md`;

    this.adapter.createNote(logFolder, filename, {
      id,
      type: 'absolute-log',
      plan_id: planId ?? null,
      task_id: taskId ?? null,
      action,
      created_at: now,
      tags: ['absolute', 'log', action],
    }, `# ${action}\n\n${detail}\n`);

    return this.getLogEntry(id)!;
  }

  getLogEntry(id: string): LogEntry | undefined {
    const entry = this.adapter.findById(id);
    if (!entry || entry.frontmatter.type !== 'absolute-log') return undefined;
    return this.logFromEntry(entry);
  }

  getLog(filters?: { planId?: string; taskId?: string; action?: string; limit?: number }): LogEntry[] {
    const limit = filters?.limit ?? 100;

    let entries = this.adapter.findByType('absolute-log');

    if (filters?.planId !== undefined) {
      entries = entries.filter(e => e.frontmatter.plan_id === filters.planId);
    }
    if (filters?.taskId !== undefined) {
      entries = entries.filter(e => e.frontmatter.task_id === filters.taskId);
    }
    if (filters?.action !== undefined) {
      entries = entries.filter(e => e.frontmatter.action === filters.action);
    }

    return entries
      .map(e => this.logFromEntry(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private planFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Plan {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);
    // Extract description from body
    let description = '';
    if (note) {
      const descMatch = note.body.match(/## Description\n\n([\s\S]*?)(?:\n## |$)/);
      if (descMatch) description = descMatch[1].trim();
    }
    return {
      id: fm.id as string,
      title: fm.title as string,
      description,
      status: fm.status as string,
      user_approved: fm.user_approved as number,
      created_at: fm.created_at as string,
      updated_at: fm.updated_at as string,
    };
  }

  private taskFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Task {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);
    // Extract description from body
    let description = '';
    if (note) {
      const descMatch = note.body.match(/## Description\n\n([\s\S]*?)(?:\n## |$)/);
      if (descMatch) description = descMatch[1].trim();
    }
    return {
      id: fm.id as string,
      plan_id: fm.plan_id as string,
      agent_id: fm.agent_id as string,
      title: fm.title as string,
      description,
      status: fm.status as string,
      sequence: fm.sequence as number,
      result_summary: (fm.result_summary as string) ?? null,
      quality_score: (fm.quality_score as number) ?? null,
      quality_notes: (fm.quality_notes as string) ?? null,
      created_at: fm.created_at as string,
      updated_at: fm.updated_at as string,
    };
  }

  private consultationFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): Consultation {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);

    let message = '';
    let response: string | null = null;
    if (note) {
      const msgMatch = note.body.match(/## Message\n\n([\s\S]*?)(?:\n## Response)/);
      if (msgMatch) message = msgMatch[1].trim();

      const respMatch = note.body.match(/## Response\n\n([\s\S]*?)$/);
      if (respMatch) {
        const respText = respMatch[1].trim();
        response = respText.length > 0 ? respText : (fm.response as string) ?? null;
      } else {
        response = (fm.response as string) ?? null;
      }
    }

    return {
      id: fm.id as string,
      plan_id: (fm.plan_id as string) ?? null,
      task_id: (fm.task_id as string) ?? null,
      agent_id: fm.agent_id as string,
      phase: fm.phase as string,
      message,
      response,
      created_at: fm.created_at as string,
    };
  }

  private metricFromEntry(entry: { frontmatter: Record<string, unknown> }): AgentMetric {
    const fm = entry.frontmatter;
    return {
      id: fm.id as string,
      agent_id: fm.agent_id as string,
      domain: fm.domain as string,
      tasks_completed: fm.tasks_completed as number,
      avg_quality: fm.avg_quality as number,
      avg_response_rounds: fm.avg_response_rounds as number,
      last_updated: fm.last_updated as string,
    };
  }

  private logFromEntry(entry: { relativePath: string; frontmatter: Record<string, unknown> }): LogEntry {
    const fm = entry.frontmatter;
    const note = this.adapter.readNote(entry.relativePath);

    // Detail is the body content after the heading
    let detail = '';
    if (note) {
      const detailMatch = note.body.match(/^# .+\n\n([\s\S]*)$/);
      if (detailMatch) detail = detailMatch[1].trim();
    }

    return {
      id: fm.id as string,
      plan_id: (fm.plan_id as string) ?? null,
      task_id: (fm.task_id as string) ?? null,
      action: fm.action as string,
      detail,
      created_at: fm.created_at as string,
    };
  }

  private getAllPreferencesFromNote(): Preference[] {
    const note = this.adapter.readNote(this.PREFERENCES_PATH);
    if (!note) return [];
    return parsePreferencesBody(note.body);
  }

  private writePreferencesNote(prefs: Preference[]): void {
    const body = buildPreferencesBody(prefs);
    this.adapter.updateFrontmatter(this.PREFERENCES_PATH, {
      updated_at: new Date().toISOString(),
    });
    this.adapter.replaceBody(this.PREFERENCES_PATH, body);
  }
}
