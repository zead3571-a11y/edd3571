import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AiTaskKind =
  | 'lesson_outline'
  | 'exam_questions'
  | 'student_insight'
  | 'parent_summary'
  | 'chat';

export interface AiExamQuestionDraft {
  prompt: string;
  options: string[];
  correctIndex: number;
  points: number;
}

function getConfiguredGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return key;
}

function buildSystemInstruction(task: AiTaskKind): string {
  const base =
    'أنت مساعد تعليمي وإداري خبير داخل نظام EDUFLOW لإدارة السناتر والمراكز التعليمية في مصر. اكتب دائماً بلغة عربية واضحة ومرتبة ومناسبة للمناهج المصرية، واستخدم الأرقام الإنجليزية القياسية (0-9) وعملة (ج) عند ذكر المبالغ.';

  switch (task) {
    case 'lesson_outline':
      return `${base} مهمتك إعداد خطة شرح درس أو ملخص نقاط مركزة للمدرس والطلاب بعناوين واضحة وأمثلة تطبيقية.`;
    case 'exam_questions':
      return `${base} مهمتك إعداد أسئلة اختيار من متعدد دقيقة تعليمياً مكونة من 4 اختيارات لكل سؤال مع تحديد الإجابة الصحيحة (correctIndex من 0 إلى 3).`;
    case 'student_insight':
      return `${base} مهمتك تحليل بيانات أداء الطلاب أو المجموعة واقتراح خطة دعم عملية قصيرة ومحددة لرفع مستوى الحضور والدرجات.`;
    case 'parent_summary':
      return `${base} مهمتك صياغة رسالة متابعة احترافية ومهذبة ومختصرة لولي الأمر حول مستوى ابنه/ابنته تشجع على الاستمرار أو المعالجة.`;
    default:
      return `${base} أجب باحترافية وإيجاز مفيد لمدير السنتر أو المدرس أو المحاسب.`;
  }
}

export function createEduflowApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'eduflow-api',
      aiConfigured: Boolean(getConfiguredGeminiKey()),
    });
  });

  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const apiKey = getConfiguredGeminiKey();
      if (!apiKey) {
        return res.status(503).json({
          ok: false,
          error:
            'مفتاح الذكاء الاصطناعي GEMINI_API_KEY غير متاح في بيئة الخادم. تأكد من إضافته في إعدادات البيئة لإتمام الطلب.',
        });
      }

      const body = (req.body || {}) as {
        task?: AiTaskKind;
        prompt?: string;
        context?: Record<string, unknown>;
      };

      const task: AiTaskKind = body.task && [
        'lesson_outline',
        'exam_questions',
        'student_insight',
        'parent_summary',
        'chat',
      ].includes(body.task)
        ? body.task
        : 'chat';

      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        return res.status(400).json({
          ok: false,
          error: 'يرجى كتابة المطلوب أو الموضوع قبل إرسال الطلب للمساعد الذكي.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const contextText =
        body.context && Object.keys(body.context).length > 0
          ? `\n\nسياق البيانات من السنتر:\n${JSON.stringify(body.context, null, 2)}`
          : '';

      if (task === 'exam_questions') {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `${prompt}${contextText}`,
          config: {
            systemInstruction: buildSystemInstruction(task),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      prompt: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      points: { type: Type.INTEGER },
                    },
                    required: ['prompt', 'options', 'correctIndex', 'points'],
                  },
                },
              },
              required: ['title', 'questions'],
            },
          },
        });

        const rawJson = response.text || '{}';
        const parsed = JSON.parse(rawJson) as {
          title?: string;
          questions?: AiExamQuestionDraft[];
        };
        const safeQuestions = Array.isArray(parsed.questions)
          ? parsed.questions
              .filter(
                (q) =>
                  typeof q?.prompt === 'string' &&
                  Array.isArray(q?.options) &&
                  q.options.length >= 2
              )
              .map((q) => ({
                prompt: q.prompt,
                options: q.options.slice(0, 4),
                correctIndex: Math.min(
                  Math.max(0, Number(q.correctIndex) || 0),
                  Math.max(0, q.options.slice(0, 4).length - 1)
                ),
                points: Math.max(1, Number(q.points) || 2),
              }))
          : [];

        return res.json({
          ok: true,
          task,
          model: 'gemini-4-hydrogen',
          title: parsed.title || 'اختبار مقترح بالذكاء الاصطناعي',
          questions: safeQuestions,
          text:
            safeQuestions.length > 0
              ? `تم إعداد ${safeQuestions.length} أسئلة اختيار من متعدد بنجاح. يمكنك مراجعتها أو إضافتها مباشرة إلى الامتحانات الأونلاين.`
              : rawJson,
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${prompt}${contextText}`,
        config: {
          systemInstruction: buildSystemInstruction(task),
        },
      });

      return res.json({
        ok: true,
        task,
        model: 'gemini-4-hydrogen',
        text: response.text || 'لم يتم استلام نص من النموذج.',
      });
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الاتصال بالمساعد الذكي.';
      const lower = rawMessage.toLowerCase();
      const status =
        rawMessage.includes('503') || lower.includes('unavailable')
          ? 503
          : rawMessage.includes('429') || lower.includes('quota')
          ? 429
          : rawMessage.includes('403') || rawMessage.includes('401')
          ? 403
          : 500;
      const friendlyError =
        status === 503
          ? 'خدمة الذكاء الاصطناعي مشغولة مؤقتاً حالياً، يرجى المحاولة مرة أخرى بعد لحظات.'
          : status === 429
          ? 'تم الوصول للحد الأقصى لطلبات الذكاء الاصطناعي مؤقتاً، يرجى الانتظار قليلاً ثم إعادة المحاولة.'
          : status === 403
          ? 'مفتاح API الخاص بالمساعد الذكي غير مصرح له أو منتهي الصلاحية.'
          : 'تعذر إتمام طلب الذكاء الاصطناعي حالياً، يرجى المحاولة مرة أخرى.';
      return res.status(status).json({
        ok: false,
        error: friendlyError,
      });
    }
  });

  return app;
}

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = createEduflowApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EDUFLOW server listening on http://localhost:${PORT}`);
  });
}

if (process.env.EDUFLOW_SKIP_SERVER_LISTEN !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start EDUFLOW server:', err);
    process.exit(1);
  });
}
