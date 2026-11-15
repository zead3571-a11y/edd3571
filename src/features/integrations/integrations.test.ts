import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageAdapter, StorageLike } from '../../data/localStorageAdapter';
import { createRepositories, EduflowRepositories } from '../../data/repositories';
import {
  DEFAULT_CENTER_ID,
  INITIAL_CENTER_SETTINGS,
  PlanFeatureFlags,
  isPlanFeatureEnabled,
} from '../../data/seedData';
import { PermissionActor } from '../../permissions/permissions';
import { UserRole } from '../../types/eduflow';
import {
  JobScheduler,
  MockPaymobProvider,
  MockWhatsAppCloudProvider,
  PrototypeStorageProvider,
  processIncomingWebhook,
} from './index';

class TestMemoryStorage implements StorageLike {
  public map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function makeHarness(role: UserRole = UserRole.OWNER): {
  storage: TestMemoryStorage;
  adapter: LocalStorageAdapter;
  repos: EduflowRepositories;
  setActor: (actor: PermissionActor | null) => void;
} {
  const storage = new TestMemoryStorage();
  const adapter = new LocalStorageAdapter({ storage, debounceMs: 0 });
  let actor: PermissionActor | null = {
    userId: 'u-test',
    role,
    centerId: DEFAULT_CENTER_ID,
  };
  const repos = createRepositories(adapter, {
    getActor: () => actor,
    enforcePermissions: true,
  });
  return {
    storage,
    adapter,
    repos,
    setActor: (next) => {
      actor = next;
    },
  };
}

test('PlanFeatureFlags include all 15 new Phase 17 flags with tier defaults and editable overrides', () => {
  const newFlags: (keyof PlanFeatureFlags)[] = [
    'parentPayments',
    'whatsappAutomation',
    'cashRegister',
    'autoReminders',
    'pwaPush',
    'inventory',
    'assignments',
    'liveSessions',
    'monthlyReports',
    'registrationCrm',
    'staffPayroll',
    'installments',
    'multiBranch',
    'gamification',
    'aiAssistant',
  ];

  // Basic tier disables all 15 new flags
  for (const flag of newFlags) {
    assert.equal(isPlanFeatureEnabled('basic', flag), false, `basic should disable ${flag}`);
  }
  // Pro tier enables core growth flags but keeps enterprise-only flags off
  assert.equal(isPlanFeatureEnabled('pro', 'parentPayments'), true);
  assert.equal(isPlanFeatureEnabled('pro', 'whatsappAutomation'), true);
  assert.equal(isPlanFeatureEnabled('pro', 'multiBranch'), false);
  assert.equal(isPlanFeatureEnabled('pro', 'aiAssistant'), false);

  // Enterprise tier enables all 15 flags
  for (const flag of newFlags) {
    assert.equal(isPlanFeatureEnabled('enterprise', flag), true, `enterprise should enable ${flag}`);
  }

  // Editable overrides work without mutating static plan object
  assert.equal(
    isPlanFeatureEnabled('pro', 'aiAssistant', {
      planFeatureOverrides: { pro: { aiAssistant: true } },
    }),
    true
  );
  assert.equal(isPlanFeatureEnabled('pro', 'aiAssistant'), false);
});

test('MockPaymobProvider supports createCheckout, all 4 outcomes with HMAC webhooks, getTransaction, and refund', async () => {
  const paymob = new MockPaymobProvider();
  const session = await paymob.createCheckout({
    centerId: DEFAULT_CENTER_ID,
    invoiceIds: ['inv-1', 'inv-2'],
    amount: 900,
    method: 'card',
    returnUrl: 'https://eduflow.local/#/payments',
  });

  assert.ok(session.txId.startsWith('pmob-tx-'));
  assert.ok(session.checkoutUrl.includes(session.txId));
  assert.equal(session.status, 'pending');

  // Test failure, pending, cancel, success outcomes
  for (const outcome of ['failure', 'pending', 'cancel', 'success'] as const) {
    let deliveredBody = '';
    const res = await paymob.simulateCheckoutOutcome(
      session.txId,
      outcome,
      (signed) => {
        deliveredBody = signed.rawBody;
      },
      10
    );
    assert.equal(deliveredBody, res.rawBody);
    const sigOk = await paymob.verifyWebhook(res.rawBody, res.signature);
    assert.equal(sigOk, true);
  }

  const txAfterSuccess = await paymob.getTransaction(session.txId);
  assert.equal(txAfterSuccess?.status, 'success');

  // Partial then full refund
  const r1 = await paymob.refund(session.txId, 300, 'خصم خطأ في الفاتورة');
  assert.equal(r1.ok, true);
  assert.equal(r1.refundedAmount, 300);

  const rTooMuch = await paymob.refund(session.txId, 700, 'مبلغ زائد');
  assert.equal(rTooMuch.ok, false);

  const r2 = await paymob.refund(session.txId, 600, 'استرداد باقي المبلغ');
  assert.equal(r2.ok, true);
  assert.equal(r2.refundedAmount, 900);
  const txRefunded = await paymob.getTransaction(session.txId);
  assert.equal(txRefunded?.status, 'refunded');
});

test('Webhook handler verifies HMAC, rejects invalid signatures, rejects replay, and enforces eventId idempotency', async () => {
  const { repos, storage } = makeHarness(UserRole.OWNER);
  const paymob = new MockPaymobProvider();

  const checkout = await paymob.createCheckout({
    centerId: DEFAULT_CENTER_ID,
    invoiceIds: ['inv-99'],
    amount: 480,
    method: 'wallet',
    returnUrl: '#/payments',
  });

  const nowMs = Date.now();
  const signed = await paymob.buildSignedOutcomeWebhook(checkout.txId, 'success', {
    eventId: 'evt-fixed-idempotency-1',
    timestamp: new Date(nowMs).toISOString(),
  });

  // 1) Invalid signature must be rejected and logged
  const badSigResult = await processIncomingWebhook(
    repos,
    (body, sig) => paymob.verifyWebhook(body, sig),
    {
      centerId: DEFAULT_CENTER_ID,
      provider: 'paymob',
      rawBody: signed.rawBody,
      signature: '0'.repeat(64),
      nowMs,
    }
  );
  assert.equal(badSigResult.ok, false);
  assert.equal(badSigResult.status, 'rejected_signature');

  // 2) Stale timestamp (> 5 minutes) must be rejected as replay
  const staleSigned = await paymob.buildSignedOutcomeWebhook(checkout.txId, 'success', {
    eventId: 'evt-stale-1',
    timestamp: new Date(nowMs - 10 * 60 * 1000).toISOString(),
  });
  const replayResult = await processIncomingWebhook(
    repos,
    (body, sig) => paymob.verifyWebhook(body, sig),
    {
      centerId: DEFAULT_CENTER_ID,
      provider: 'paymob',
      rawBody: staleSigned.rawBody,
      signature: staleSigned.signature,
      nowMs,
    }
  );
  assert.equal(replayResult.ok, false);
  assert.equal(replayResult.status, 'rejected_replay');

  // 3) Valid signed webhook succeeds
  const okResult = await processIncomingWebhook(
    repos,
    (body, sig) => paymob.verifyWebhook(body, sig),
    {
      centerId: DEFAULT_CENTER_ID,
      provider: 'paymob',
      rawBody: signed.rawBody,
      signature: signed.signature,
      nowMs,
    }
  );
  assert.equal(okResult.ok, true);
  assert.equal(okResult.idempotent, false);
  assert.equal(okResult.status, 'processed');

  const logCountAfterFirst = repos.activityLog.list().length;

  // 4) Duplicate webhook with same eventId must do nothing & return idempotent=true
  const dupResult = await processIncomingWebhook(
    repos,
    (body, sig) => paymob.verifyWebhook(body, sig),
    {
      centerId: DEFAULT_CENTER_ID,
      provider: 'paymob',
      rawBody: signed.rawBody,
      signature: signed.signature,
      nowMs: nowMs + 1000,
    }
  );
  assert.equal(dupResult.ok, true);
  assert.equal(dupResult.idempotent, true);
  assert.equal(dupResult.status, 'duplicate');
  assert.equal(repos.activityLog.list().length, logCountAfterFirst);

  // 5) Ensure zero secret strings exist anywhere in persisted storage
  const dumped = Array.from(storage.map.values()).join('\n');
  assert.equal(dumped.includes('eduflow-dev-mock-paymob-hmac-secret'), false);
  assert.equal(dumped.includes('eduflow-dev-mock-wa-app-secret'), false);
  assert.equal('integrations' in INITIAL_CENTER_SETTINGS, true);
});

test('MockWhatsAppCloudProvider enforces 24-hour customer window and parses status webhooks', async () => {
  const { repos } = makeHarness(UserRole.OWNER);
  const wa = new MockWhatsAppCloudProvider();
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);

  // Outside 24h window -> blocked with 131047
  const outside = await wa.sendText({
    to: '01001122334',
    body: 'رسالة حرة خارج النافذة',
    lastInboundAt: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(),
    nowMs,
  });
  assert.equal(outside.ok, false);
  assert.equal(outside.errorCode, '131047');

  // Inside 24h window -> succeeds
  const inside = await wa.sendText({
    to: '01001122334',
    body: 'أهلاً بك، تم تأكيد الموعد',
    lastInboundAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
    nowMs,
  });
  assert.equal(inside.ok, true);
  assert.ok(inside.messageId);

  // Template works even without inbound message
  const tpl = await wa.sendTemplate({
    to: '01001122334',
    templateName: 'absence_alert_ar',
    language: 'ar',
    variables: { '1': 'يوسف أحمد' },
  });
  assert.equal(tpl.ok, true);

  // Parse failed status webhook & process through webhookHandler
  const signedFail = await wa.buildSignedStatusWebhook({
    messageId: tpl.messageId!,
    recipientPhone: '01001122334',
    status: 'failed',
    errorCode: '131026',
    timestamp: new Date(nowMs).toISOString(),
  });
  const parsed = wa.parseStatusWebhook(signedFail.payload);
  assert.equal(parsed?.status, 'failed');
  assert.ok(parsed?.errorAr?.includes('131026'));

  const processed = await processIncomingWebhook(
    repos,
    (body, sig) => wa.verifyWebhook(body, sig),
    {
      centerId: DEFAULT_CENTER_ID,
      provider: 'whatsapp',
      rawBody: signedFail.rawBody,
      signature: signedFail.signature,
      nowMs,
    }
  );
  assert.equal(processed.ok, true);
  assert.equal(processed.status, 'processed');
});

test('JobScheduler registers jobs, runs due jobs on schedule, and executes runNow manually', async () => {
  const { repos } = makeHarness(UserRole.OWNER);
  const scheduler = new JobScheduler();
  let runs = 0;

  scheduler.registerJob({
    name: 'test-digest',
    label: 'اختبار فحص دوري',
    scheduleLabel: 'كل 10 دقائق',
    intervalMs: 10 * 60 * 1000,
    handler: () => {
      runs += 1;
      return { summary: `تنفيذ رقم ${runs}` };
    },
  });

  const t0 = Date.UTC(2026, 10, 15, 10, 0, 0);
  const initialJobs = scheduler.listJobs(repos, DEFAULT_CENTER_ID, t0);
  assert.equal(initialJobs.length, 1);
  assert.equal(initialJobs[0].runCount, 0);

  // Not due yet at t0 + 1 min
  const dueEarly = await scheduler.runDueJobs(repos, DEFAULT_CENTER_ID, t0 + 60 * 1000);
  assert.equal(dueEarly.length, 0);
  assert.equal(runs, 0);

  // Due at t0 + 11 min
  const dueLater = await scheduler.runDueJobs(repos, DEFAULT_CENTER_ID, t0 + 11 * 60 * 1000);
  assert.equal(dueLater.length, 1);
  assert.equal(dueLater[0].status, 'success');
  assert.equal(runs, 1);

  // Manual runNow executes immediately and logs activity
  const manual = await scheduler.runNow(repos, 'test-digest', DEFAULT_CENTER_ID, {
    actorName: 'مالك السنتر',
    nowMs: t0 + 12 * 60 * 1000,
    manual: true,
  });
  assert.equal(manual.status, 'success');
  assert.equal(manual.record.runCount, 2);
  assert.equal(runs, 2);
});

test('PrototypeStorageProvider enforces file size and MIME/extension limits and blocks unauthorized roles', async () => {
  const { repos, setActor } = makeHarness(UserRole.OWNER);
  const storageProvider = new PrototypeStorageProvider();

  // Reject oversized (> 5 MB)
  const tooBig = await storageProvider.uploadFile(repos, {
    centerId: DEFAULT_CENTER_ID,
    name: 'large-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 6 * 1024 * 1024,
    category: 'report',
    uploadedBy: 'u1',
  });
  assert.equal(tooBig.ok, false);

  // Reject unsafe extension (.exe)
  const badExt = await storageProvider.uploadFile(repos, {
    centerId: DEFAULT_CENTER_ID,
    name: 'script.exe',
    mimeType: 'application/x-msdownload',
    sizeBytes: 1024,
    category: 'other',
    uploadedBy: 'u1',
  });
  assert.equal(badExt.ok, false);

  // Accept valid PDF
  const okPdf = await storageProvider.uploadFile(repos, {
    centerId: DEFAULT_CENTER_ID,
    name: 'homework-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 256 * 1024,
    category: 'assignment',
    uploadedBy: 'u1',
  });
  assert.equal(okPdf.ok, true);
  assert.equal(repos.fileAssets.list().length, 1);

  // Receptionist cannot view webhookEvents or scheduledJobRuns (returns []) or write them
  setActor({ userId: 'u4', role: UserRole.RECEPTIONIST, centerId: DEFAULT_CENTER_ID });
  assert.equal(repos.scheduledJobRuns.list().length, 0);
  assert.throws(() =>
    repos.webhookEvents.create({
      centerId: DEFAULT_CENTER_ID,
      eventId: 'x',
      provider: 'paymob',
      eventType: 'test',
      signatureValid: true,
      status: 'processed',
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      summary: 'test',
    })
  );
});
