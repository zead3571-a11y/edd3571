import {
  OnlineExam,
  OnlineExamAttempt,
  OnlineExamQuestion,
} from '../../types/eduflow';

export interface ParsedVideoEmbed {
  kind: 'youtube' | 'vimeo' | 'direct' | 'external';
  embedUrl?: string;
  externalUrl: string;
}

/**
 * Parses common YouTube, Vimeo, or direct MP4 URLs into safe embed URLs.
 */
export function parseVideoEmbedUrl(rawUrl?: string): ParsedVideoEmbed | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    // YouTube watch or short link
    if (host.includes('youtube.com') || host === 'youtu.be') {
      let videoId = '';
      if (host === 'youtu.be') {
        videoId = parsed.pathname.replace(/^\//, '').split('/')[0] || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.replace('/embed/', '').split('/')[0] || '';
      } else {
        videoId = parsed.searchParams.get('v') || '';
      }
      if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
          externalUrl: trimmed,
        };
      }
    }

    // Vimeo
    if (host.includes('vimeo.com')) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match?.[1]) {
        return {
          kind: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${match[1]}`,
          externalUrl: trimmed,
        };
      }
    }

    // Direct video file
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(parsed.pathname)) {
      return {
        kind: 'direct',
        embedUrl: trimmed,
        externalUrl: trimmed,
      };
    }

    return {
      kind: 'external',
      externalUrl: trimmed,
    };
  } catch {
    return null;
  }
}

export function computeExamMaxScore(questions: OnlineExamQuestion[]): number {
  return questions.reduce((sum, q) => sum + Math.max(0, Number(q.points) || 0), 0);
}

export interface GradedExamResult {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
}

export function gradeOnlineExamSubmission(
  exam: OnlineExam,
  answers: number[]
): GradedExamResult {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  exam.questions.forEach((q, index) => {
    const pts = Math.max(0, Number(q.points) || 0);
    maxScore += pts;
    const chosen = answers[index];
    if (typeof chosen === 'number' && chosen === q.correctIndex) {
      score += pts;
      correctCount += 1;
    }
  });

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = score >= exam.passingScore;

  return {
    score,
    maxScore,
    percentage,
    passed,
    correctCount,
    totalQuestions: exam.questions.length,
  };
}

export function computeStudentExamStats(attempts: OnlineExamAttempt[]): {
  totalAttempts: number;
  passedCount: number;
  averagePct: number;
} {
  if (attempts.length === 0) {
    return { totalAttempts: 0, passedCount: 0, averagePct: 0 };
  }
  const passedCount = attempts.filter((a) => a.passed).length;
  const pctSum = attempts.reduce(
    (sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0),
    0
  );
  return {
    totalAttempts: attempts.length,
    passedCount,
    averagePct: Math.round(pctSum / attempts.length),
  };
}
