import { GamificationPointEntry, Student } from '../../types/eduflow';

export interface StudentGamificationRank {
  studentId: string;
  studentName: string;
  stage: string;
  totalPoints: number;
  badgeTitle: string;
  badgeTone: 'success' | 'navy' | 'warning' | 'neutral';
  rank: number;
}

export function getPointsBadge(totalPoints: number): {
  title: string;
  tone: 'success' | 'navy' | 'warning' | 'neutral';
} {
  if (totalPoints >= 500) return { title: 'نجم السنتر الذهبي', tone: 'success' };
  if (totalPoints >= 250) return { title: 'طالب متفوق', tone: 'navy' };
  if (totalPoints >= 100) return { title: 'طالب مجتهد', tone: 'warning' };
  return { title: 'بداية موفقة', tone: 'neutral' };
}

export function computeStudentPointsTotal(
  entries: GamificationPointEntry[],
  studentId: string
): number {
  return entries
    .filter((e) => e.studentId === studentId)
    .reduce((sum, e) => sum + e.points, 0);
}

export function computeLeaderboard(
  students: Student[],
  entries: GamificationPointEntry[]
): StudentGamificationRank[] {
  const activeStudents = students.filter((s) => s.status === 'active');
  const unsorted = activeStudents.map((st) => {
    const totalPoints = computeStudentPointsTotal(entries, st.id);
    const badge = getPointsBadge(totalPoints);
    return {
      studentId: st.id,
      studentName: st.name,
      stage: st.stage,
      totalPoints,
      badgeTitle: badge.title,
      badgeTone: badge.tone,
      rank: 0,
    };
  });

  unsorted.sort((a, b) => b.totalPoints - a.totalPoints || a.studentName.localeCompare(b.studentName, 'ar'));
  return unsorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}
