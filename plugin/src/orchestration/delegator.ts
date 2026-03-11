import type { AbsoluteDB } from '../db/database.js';
import type { ToolResult } from '../types.js';

const TERMINAL_STATUSES = ['completed', 'failed'];

export class Delegator {
  constructor(private db: AbsoluteDB) {}

  delegateTask(taskId: string): ToolResult {
    const task = this.db.getTask(taskId);
    if (!task) {
      return { content: '', error: `Task not found: ${taskId}` };
    }

    if (TERMINAL_STATUSES.includes(task.status)) {
      return { content: '', error: `Cannot delegate task: task is already in terminal status "${task.status}" (completed or failed tasks cannot be re-delegated).` };
    }

    this.db.updateTaskStatus(taskId, 'delegated');
    this.db.logAction('task_delegated', `Task "${task.title}" delegated to ${task.agent_id}`, task.plan_id, taskId);
    return { content: `Task "${task.title}" has been delegated to ${task.agent_id}.` };
  }

  consult(taskId: string, agentId: string, phase: string, message: string): ToolResult {
    const task = this.db.getTask(taskId);
    if (!task) {
      return { content: '', error: `Task not found: ${taskId}` };
    }

    const consultation = this.db.createConsultation(agentId, phase, message, task.plan_id, taskId);
    this.db.logAction('consultation_sent', `Consultation sent to ${agentId} for task "${task.title}"`, task.plan_id, taskId);
    return { content: `Consultation created. ID: ${consultation.id}` };
  }

  consultPlan(planId: string, agentId: string, message: string): ToolResult {
    const plan = this.db.getPlan(planId);
    if (!plan) {
      return { content: '', error: `Plan not found: ${planId}` };
    }

    const consultation = this.db.createConsultation(agentId, 'planning', message, planId);
    return { content: `Consultation created. ID: ${consultation.id}` };
  }

  recordResponse(consultationId: string, response: string): ToolResult {
    const consultation = this.db.getConsultation(consultationId);
    if (!consultation) {
      return { content: '', error: `Consultation not found: ${consultationId}` };
    }

    this.db.recordConsultationResponse(consultationId, response);
    return { content: `Response recorded for consultation ${consultationId}.` };
  }

  getActiveTaskList(): ToolResult {
    const tasks = this.db.getActiveTasks();

    if (tasks.length === 0) {
      return { content: 'No active tasks.' };
    }

    const lines = tasks.map(t => `[${t.status}] ${t.agent_id} — ${t.title} (plan: ${t.plan_id})`);
    return { content: lines.join('\n') };
  }
}
