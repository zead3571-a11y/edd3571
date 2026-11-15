import { EduflowRepositories, runWithSystemActor } from '../../data/repositories';
import { ScheduledJobRunRecord, UserRole } from '../../types/eduflow';

export interface JobContext {
  centerId: string;
  repos: EduflowRepositories;
  nowMs: number;
}

export interface JobDefinition {
  name: string;
  label: string;
  scheduleLabel: string;
  intervalMs: number;
  handler: (ctx: JobContext) => Promise<{ summary: string }> | { summary: string };
}

export interface JobRunOutcome {
  jobName: string;
  status: 'success' | 'failed' | 'skipped';
  summary: string;
  record: ScheduledJobRunRecord;
}

export class JobScheduler {
  private registry = new Map<string, JobDefinition>();

  public registerJob(def: JobDefinition): void {
    this.registry.set(def.name, def);
  }

  public getRegisteredDefinitions(): JobDefinition[] {
    return Array.from(this.registry.values());
  }

  public listJobs(repos: EduflowRepositories, centerId: string, nowMs = Date.now()): ScheduledJobRunRecord[] {
    return runWithSystemActor(() => {
      const existing = repos.scheduledJobRuns.list({ centerId });
      const byName = new Map(existing.map((r) => [r.jobName, r]));

      const result: ScheduledJobRunRecord[] = [];
      for (const def of this.registry.values()) {
        const stored = byName.get(def.name);
        if (stored) {
          result.push(stored);
        } else {
          const created = repos.scheduledJobRuns.create({
            centerId,
            jobName: def.name,
            label: def.label,
            scheduleLabel: def.scheduleLabel,
            intervalMs: def.intervalMs,
            enabled: true,
            nextRunAt: new Date(nowMs + def.intervalMs).toISOString(),
            runCount: 0,
            lastSummary: 'لم يتم التشغيل بعد',
          });
          result.push(created);
        }
      }
      return result;
    });
  }

  public async runNow(
    repos: EduflowRepositories,
    name: string,
    centerId: string,
    options?: { actorName?: string; nowMs?: number; manual?: boolean }
  ): Promise<JobRunOutcome> {
    const def = this.registry.get(name);
    if (!def) {
      throw new Error(`المهمة المجدولة "${name}" غير مسجلة في النظام.`);
    }
    const nowMs = options?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const nextIso = new Date(nowMs + def.intervalMs).toISOString();

    const jobs = this.listJobs(repos, centerId, nowMs);
    const existing = jobs.find((j) => j.jobName === name)!;

    try {
      const res = await def.handler({ centerId, repos, nowMs });
      const updated = runWithSystemActor(() => {
        const saved = repos.scheduledJobRuns.update(existing.id, {
          lastRunAt: nowIso,
          nextRunAt: nextIso,
          lastStatus: 'success',
          lastSummary: res.summary,
          runCount: (existing.runCount || 0) + 1,
        })!;

        if (options?.manual !== false) {
          repos.activityLog.create({
            centerId,
            actorId: 'system',
            actorName: options?.actorName || 'النظام',
            actorRole: UserRole.OWNER,
            action: 'job.run',
            resource: 'scheduledJobs',
            resourceId: def.name,
            summary: `تشغيل المهمة المجدولة «${def.label}»: ${res.summary}`,
            timestamp: nowIso,
          });
        }
        return saved;
      });

      return {
        jobName: def.name,
        status: 'success',
        summary: res.summary,
        record: updated,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'فشل غير متوقع أثناء تشغيل المهمة.';
      const updated = runWithSystemActor(() =>
        repos.scheduledJobRuns.update(existing.id, {
          lastRunAt: nowIso,
          nextRunAt: nextIso,
          lastStatus: 'failed',
          lastSummary: errorMsg,
          runCount: (existing.runCount || 0) + 1,
        })!
      );
      return {
        jobName: def.name,
        status: 'failed',
        summary: errorMsg,
        record: updated,
      };
    }
  }

  public async runDueJobs(
    repos: EduflowRepositories,
    centerId: string,
    nowMs = Date.now()
  ): Promise<JobRunOutcome[]> {
    const jobs = this.listJobs(repos, centerId, nowMs);
    const outcomes: JobRunOutcome[] = [];

    for (const job of jobs) {
      if (!job.enabled) continue;
      const dueTs = Date.parse(job.nextRunAt);
      if (!Number.isFinite(dueTs) || dueTs <= nowMs) {
        const outcome = await this.runNow(repos, job.jobName, centerId, {
          nowMs,
          manual: false,
          actorName: 'المجدول التلقائي',
        });
        outcomes.push(outcome);
      }
    }

    return outcomes;
  }
}

export function createDefaultScheduler(): JobScheduler {
  const scheduler = new JobScheduler();

  scheduler.registerJob({
    name: 'webhook-health-digest',
    label: 'فحص سجل Webhooks والتوقيعات',
    scheduleLabel: 'كل 15 دقيقة (أثناء فتح التطبيق)',
    intervalMs: 15 * 60 * 1000,
    handler: ({ centerId, repos }) => {
      const events = repos.webhookEvents.list({ centerId });
      const failedCount = events.filter(
        (e) => e.status === 'rejected_signature' || e.status === 'rejected_replay' || e.status === 'failed'
      ).length;
      return {
        summary: `تم فحص ${events.length} حدث Webhook (${failedCount} مرفوض/فاشل).`,
      };
    },
  });

  scheduler.registerJob({
    name: 'overdue-invoices-scan',
    label: 'مراجعة الفواتير المستحقة والتنبيهات',
    scheduleLabel: 'يومياً (محاكاة عند فتح النظام)',
    intervalMs: 24 * 60 * 60 * 1000,
    handler: ({ centerId, repos }) => {
      const invoices = repos.invoices.list({ centerId });
      const overdue = invoices.filter((i) => i.status === 'overdue' || i.status === 'pending').length;
      return {
        summary: `تم مسح ${invoices.length} فاتورة (${overdue} قيد الانتظار أو متأخرة).`,
      };
    },
  });

  scheduler.registerJob({
    name: 'session-expiry-sweep',
    label: 'تنظيف جلسات منصة الطالب المنتهية',
    scheduleLabel: 'كل ساعة',
    intervalMs: 60 * 60 * 1000,
    handler: ({ centerId, repos, nowMs }) => {
      const sessions = repos.studentSessions.list({ centerId });
      const active = sessions.filter((s) => !s.revokedAt && s.expiresAt > nowMs).length;
      return {
        summary: `الجلسات النشطة الحالية لمنصة الطالب: ${active} من إجمالي ${sessions.length}.`,
      };
    },
  });

  return scheduler;
}

export const defaultJobScheduler = createDefaultScheduler();
