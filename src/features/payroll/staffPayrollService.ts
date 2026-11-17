import { StaffAttendanceRecord } from '../../types/eduflow';

export function calculateNetPayroll(params: {
  baseSalary: number;
  bonuses: number;
  deductions: number;
  advances: number;
}): number {
  const base = Math.max(0, Number(params.baseSalary) || 0);
  const bonuses = Math.max(0, Number(params.bonuses) || 0);
  const deductions = Math.max(0, Number(params.deductions) || 0);
  const advances = Math.max(0, Number(params.advances) || 0);
  return Math.max(0, Math.round((base + bonuses - deductions - advances) * 100) / 100);
}

export function computeStaffAttendanceSummary(
  records: StaffAttendanceRecord[],
  monthKey: string,
  userId?: string
): {
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
} {
  const filtered = records.filter(
    (r) => r.date.startsWith(monthKey) && (!userId || r.userId === userId)
  );
  return {
    presentDays: filtered.filter((r) => r.status === 'present').length,
    lateDays: filtered.filter((r) => r.status === 'late').length,
    absentDays: filtered.filter((r) => r.status === 'absent').length,
    leaveDays: filtered.filter((r) => r.status === 'leave').length,
  };
}
