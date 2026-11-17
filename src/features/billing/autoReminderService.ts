import {
  AutoReminderRule,
  Group,
  Invoice,
  Student,
} from '../../types/eduflow';
import { buildLatePaymentMessage } from '../messaging/whatsappService';

export interface AutoReminderCandidate {
  invoice: Invoice;
  student: Student;
  group?: Group;
  dueAmount: number;
  body: string;
}

/**
 * Selects unpaid invoices matching the center's auto-reminder rule,
 * skipping invoices already reminded on the same day or lacking a parent phone.
 */
export function scanInvoicesForAutoReminders(params: {
  invoices: Invoice[];
  students: Student[];
  groups: Group[];
  templateBody: string;
  rule: AutoReminderRule;
  todayIso?: string;
}): AutoReminderCandidate[] {
  const { invoices, students, groups, templateBody, rule } = params;
  if (!rule.enabled) return [];

  const todayIso = params.todayIso || new Date().toISOString().slice(0, 10);
  const candidates: AutoReminderCandidate[] = [];

  for (const inv of invoices) {
    const dueAmount = Math.max(0, inv.total - inv.paid);
    if (dueAmount <= 0 || inv.status === 'paid') continue;
    if (inv.lastReminderDate === todayIso) continue;

    const isOverdueMatch =
      inv.status === 'overdue' && inv.daysOverdue >= Math.max(0, rule.daysOverdueThreshold);
    const isDueSoonMatch =
      rule.includePendingDueSoon && (inv.status === 'pending' || inv.status === 'partial');

    if (!isOverdueMatch && !isDueSoonMatch) continue;

    const student = students.find((s) => s.id === inv.studentId);
    if (!student || student.status !== 'active') continue;
    const phone = student.parentPhone || student.parent?.phone || '';
    if (!phone.trim()) continue;

    const group = groups.find((g) => g.id === inv.groupId);
    const body = buildLatePaymentMessage(templateBody, {
      student,
      group,
      invoice: inv,
    });

    candidates.push({
      invoice: inv,
      student,
      group,
      dueAmount,
      body,
    });
  }

  return candidates;
}
