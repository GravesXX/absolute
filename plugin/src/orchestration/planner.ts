import type { AbsoluteDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

const VALID_AGENTS = ['sophon', 'athena', 'hermes'];

export class Planner {
  constructor(private db: AbsoluteDB) {}

  createPlan(title: string, description: string): ToolResult {
    const plan = this.db.createPlan(title, description);
    this.db.logAction('plan_created', `Plan "${title}" created`, plan.id);
    return { content: `Plan created. ID: ${plan.id}` };
  }

  addTask(
    planId: string,
    agentId: string,
    title: string,
    description: string,
    sequence: number
  ): ToolResult {
    const plan = this.db.getPlan(planId);
    if (!plan) {
      return { content: '', error: `Plan not found: ${planId}` };
    }

    if (!VALID_AGENTS.includes(agentId)) {
      return { content: '', error: `unknown_agent: "${agentId}" is not a valid agent. Valid agents: ${VALID_AGENTS.join(', ')}` };
    }

    if (plan.status !== 'draft' && plan.status !== 'consulting') {
      return { content: '', error: `Plan is in status "${plan.status}". Tasks can only be added to plans in draft or consulting status.` };
    }

    const task = this.db.createTask(planId, agentId, title, description, sequence);
    return { content: `Task created. ID: ${task.id}` };
  }

  approvePlan(planId: string): ToolResult {
    const plan = this.db.getPlan(planId);
    if (!plan) {
      return { content: '', error: `Plan not found: ${planId}` };
    }

    const tasks = this.db.getPlanTasks(planId);
    if (tasks.length === 0) {
      return { content: '', error: `Cannot approve plan: no tasks have been added.` };
    }

    this.db.approvePlan(planId);
    this.db.logAction('plan_approved', `Plan "${plan.title}" approved`, planId);
    return { content: `Plan "${plan.title}" has been approved. ${tasks.length} task(s) ready for delegation.` };
  }

  getPlanStatus(planId: string): ToolResult {
    const plan = this.db.getPlan(planId);
    if (!plan) {
      return { content: '', error: `Plan not found: ${planId}` };
    }

    const tasks = this.db.getPlanTasks(planId);
    const consultations = this.db.getPlanConsultations(planId);

    const taskLines = tasks.map(t => {
      const quality = t.quality_score !== null ? ` [quality: ${t.quality_score}/5]` : '';
      return `  [${t.sequence}] ${t.agent_id} — ${t.title} (${t.status})${quality}`;
    });

    const approved = plan.user_approved === 1 ? 'yes' : 'no';

    const lines = [
      `Plan: ${plan.title}`,
      `Status: ${plan.status}`,
      `Approved: ${approved}`,
      `Tasks (${tasks.length}):`,
      ...taskLines,
      `Consultations: ${consultations.length}`,
    ];

    return { content: lines.join('\n') };
  }

  listPlans(limit?: number): ToolResult {
    const plans = this.db.getAllPlans(limit);

    if (plans.length === 0) {
      return { content: 'No plans found.' };
    }

    const lines = plans.map(p => {
      const tasks = this.db.getPlanTasks(p.id);
      const completed = tasks.filter(t => t.status === 'completed').length;
      return `[${p.status}] ${p.title} — ${completed}/${tasks.length} tasks completed (ID: ${p.id})`;
    });

    return { content: lines.join('\n') };
  }
}
