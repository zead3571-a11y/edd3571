export type AiAssistantTask =
  | 'lesson_outline'
  | 'exam_questions'
  | 'student_insight'
  | 'parent_summary'
  | 'chat';

export interface AiGeneratedQuestionDraft {
  prompt: string;
  type: 'mcq' | 'tf';
  options: string[];
  correctIndex: number;
  points: number;
}

export interface AiAssistantResponse {
  ok: boolean;
  task: AiAssistantTask;
  model: string;
  reply: string;
  structuredQuestions?: AiGeneratedQuestionDraft[];
  error?: string;
}

export async function callEduflowAiAssistant(params: {
  task: AiAssistantTask;
  prompt: string;
  centerName?: string;
  context?: Record<string, unknown>;
}): Promise<AiAssistantResponse> {
  const response = await fetch('/api/ai/assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: params.task,
      prompt: params.prompt,
      context: {
        ...(params.centerName ? { centerName: params.centerName } : {}),
        ...(params.context || {}),
      },
    }),
  });

  const raw = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        task?: AiAssistantTask;
        model?: string;
        reply?: string;
        text?: string;
        structuredQuestions?: AiGeneratedQuestionDraft[];
        questions?: AiGeneratedQuestionDraft[];
        error?: string;
      }
    | null;

  if (!response.ok || !raw?.ok) {
    throw new Error(
      raw?.error ||
        `تعذر الاتصال بالمساعد الذكي (رمز الحالة ${response.status}).`
    );
  }

  return {
    ok: true,
    task: raw.task || params.task,
    model: raw.model || 'gemini-4-hydrogen',
    reply: raw.reply || raw.text || '',
    structuredQuestions: raw.structuredQuestions || raw.questions,
  };
}
