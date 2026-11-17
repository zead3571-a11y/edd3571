import { RegistrationLead } from '../../types/eduflow';

export function generateLeadTicketCode(existingCount: number): string {
  const seq = String(existingCount + 101).padStart(4, '0');
  return `REG-${seq}`;
}

export interface PublicRegistrationInput {
  studentName: string;
  stage: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  preferredSubject: string;
  preferredGroupId?: string;
  notes?: string;
}

export function validatePublicLeadForm(input: PublicRegistrationInput): {
  ok: boolean;
  error?: string;
} {
  if (!input.studentName.trim() || input.studentName.trim().length < 3) {
    return { ok: false, error: 'يرجى إدخال اسم الطالب ثلاثياً بشكل صحيح.' };
  }
  if (!input.stage.trim()) {
    return { ok: false, error: 'يرجى اختيار المرحلة الدراسية.' };
  }
  if (!input.parentName.trim()) {
    return { ok: false, error: 'يرجى إدخال اسم ولي الأمر.' };
  }
  const cleanParentPhone = input.parentPhone.replace(/[^\d]/g, '');
  if (cleanParentPhone.length < 10) {
    return { ok: false, error: 'يرجى إدخال رقم موبايل ولي الأمر صحيحاً (10 أرقام على الأقل).' };
  }
  if (!input.preferredSubject.trim()) {
    return { ok: false, error: 'يرجى تحديد المادة أو التخصص المطلوب.' };
  }
  return { ok: true };
}

export function countLeadsByStatus(leads: RegistrationLead[]) {
  return {
    total: leads.length,
    newCount: leads.filter((l) => l.status === 'new').length,
    contactedCount: leads.filter((l) => l.status === 'contacted').length,
    trialCount: leads.filter((l) => l.status === 'trial').length,
    convertedCount: leads.filter((l) => l.status === 'converted').length,
  };
}
