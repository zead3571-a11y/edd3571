import {
  ActivityLogEntry,
  AppNotification,
  Assessment,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  AttendanceSession,
  CashRegisterShift,
  Center,
  CenterSettings,
  ConsentRecord,
  DiscountRecord,
  Expense,
  FaceTemplateRecord,
  FileAssetRecord,
  GamificationPointEntry,
  Group,
  Guardian,
  InstallmentPlan,
  InventoryItem,
  InventoryTransaction,
  Invoice,
  LessonItem,
  MessageTemplate,
  OnlineExam,
  OnlineExamAttempt,
  OutboxMessage,
  PaymentRecord,
  RegistrationLead,
  Room,
  ScheduledJobRunRecord,
  SettlementRecord,
  StaffAttendanceRecord,
  StaffPayrollRecord,
  Student,
  StudentDeviceSession,
  StudentGuardianLink,
  StudentPortalAccount,
  SystemUser,
  Teacher,
  UserRole,
  WebhookEventRecord,
} from '../types/eduflow';
import { DEFAULT_CENTER_ID } from './seedData';
import { LocalStorageAdapter } from './localStorageAdapter';
import { EntityCollectionsMap, EntityKey, StorageAdapter } from './storageAdapter';
import {
  assertCan,
  can,
  normalizePhoneDigits,
  PermissionAction,
  PermissionActor,
  PermissionContext,
  PermissionError,
  PermissionResource,
} from '../permissions/permissions';

export interface BaseEntity {
  id: string;
  centerId?: string;
}

export type FilterFn<T> = (item: T) => boolean;

export interface ListFilter<T> {
  centerId?: string;
  where?: Partial<T> | FilterFn<T>;
}

export interface Repository<T extends BaseEntity> {
  list(filters?: ListFilter<T>): T[];
  get(id: string): T | undefined;
  create(data: Omit<T, 'id'> & { id?: string }): T;
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
  replaceAll(items: T[]): void;
}

// Module-level active permission actor synced from EduflowContext + scoped system bypass for auth/onboarding
let activeActor: PermissionActor | null = null;
let systemDepth = 0;

export function setActivePermissionActor(actor: PermissionActor | null): void {
  activeActor = actor;
}

export function getActivePermissionActor(): PermissionActor | null {
  if (systemDepth > 0) {
    return { role: 'system', centerId: DEFAULT_CENTER_ID };
  }
  return activeActor;
}

export function runWithSystemActor<T>(fn: () => T): T {
  systemDepth += 1;
  try {
    return fn();
  } finally {
    systemDepth = Math.max(0, systemDepth - 1);
  }
}

export async function runWithSystemActorAsync<T>(fn: () => Promise<T>): Promise<T> {
  systemDepth += 1;
  try {
    return await fn();
  } finally {
    systemDepth = Math.max(0, systemDepth - 1);
  }
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function matchesFilter<T extends BaseEntity>(item: T, filters?: ListFilter<T>): boolean {
  if (!filters) return true;
  if (filters.centerId && item.centerId && item.centerId !== filters.centerId) {
    return false;
  }
  if (!filters.where) return true;
  if (typeof filters.where === 'function') {
    return filters.where(item);
  }
  return Object.entries(filters.where).every(([key, value]) => {
    if (value === undefined) return true;
    return (item as Record<string, unknown>)[key] === value;
  });
}

export interface CreateRepositoriesOptions {
  getActor?: () => PermissionActor | null;
  enforcePermissions?: boolean;
}

const ENTITY_TO_RESOURCE: Record<EntityKey, PermissionResource> = {
  centers: 'centers',
  users: 'users',
  guardians: 'guardians',
  studentGuardians: 'studentGuardians',
  students: 'students',
  teachers: 'teachers',
  groups: 'groups',
  sessions: 'sessions',
  attendanceRecords: 'attendanceRecords',
  invoices: 'invoices',
  payments: 'payments',
  discounts: 'discounts',
  expenses: 'expenses',
  settlements: 'settlements',
  messages: 'messages',
  assessments: 'assessments',
  activityLog: 'activityLog',
  consents: 'consents',
  faceTemplates: 'faceTemplates',
  rooms: 'rooms',
  notifications: 'notifications',
  studentAccounts: 'studentAccounts',
  studentSessions: 'studentSessions',
  webhookEvents: 'webhookEvents',
  scheduledJobRuns: 'scheduledJobs',
  fileAssets: 'fileAssets',
  lessons: 'lessons',
  onlineExams: 'onlineExams',
  examAttempts: 'examAttempts',
  assignments: 'assignments',
  assignmentSubmissions: 'assignmentSubmissions',
  cashShifts: 'cashShifts',
  inventoryItems: 'inventoryItems',
  inventoryTransactions: 'inventoryTransactions',
  leads: 'leads',
  staffAttendance: 'staffAttendance',
  staffPayrolls: 'staffPayrolls',
  installmentPlans: 'installmentPlans',
  pointEntries: 'pointEntries',
};

function buildPermissionContextForItem(
  adapter: StorageAdapter,
  entityKey: EntityKey,
  item?: unknown
): PermissionContext {
  const groups = adapter.getCollection('groups');
  const students = adapter.getCollection('students');
  const sessions = adapter.getCollection('sessions');
  const rec = (item || {}) as Record<string, unknown>;

  const ctx: PermissionContext = {
    groups,
    students,
  };

  if (entityKey === 'teachers') {
    ctx.teacherId = rec.id as string | undefined;
  } else if (entityKey === 'groups') {
    ctx.groupId = rec.id as string | undefined;
    ctx.groupTeacherId = rec.teacherId as string | undefined;
  } else if (entityKey === 'students') {
    ctx.studentId = rec.id as string | undefined;
    ctx.studentGroupIds = Array.isArray(rec.groupIds)
      ? (rec.groupIds as string[])
      : undefined;
    ctx.parentPhone = rec.parentPhone as string | undefined;
    ctx.guardianIds = Array.isArray(rec.guardianIds)
      ? (rec.guardianIds as string[])
      : undefined;
    ctx.guardianUserIds = Array.isArray(rec.guardianUserIds)
      ? (rec.guardianUserIds as string[])
      : undefined;
  } else if (entityKey === 'guardians') {
    ctx.guardianId = rec.id as string | undefined;
  } else if (entityKey === 'studentGuardians') {
    ctx.guardianId = rec.guardianId as string | undefined;
    ctx.studentId = rec.studentId as string | undefined;
  } else if (
    entityKey === 'sessions' ||
    entityKey === 'assessments' ||
    entityKey === 'lessons' ||
    entityKey === 'onlineExams' ||
    entityKey === 'assignments'
  ) {
    const groupId = rec.groupId as string | undefined;
    ctx.groupId = groupId;
    if (groupId) {
      ctx.groupTeacherId = groups.find((g) => g.id === groupId)?.teacherId;
    }
  } else if (entityKey === 'attendanceRecords') {
    const sessionId = rec.sessionId as string | undefined;
    const sess = sessionId ? sessions.find((s) => s.id === sessionId) : undefined;
    if (sess) {
      ctx.groupId = sess.groupId;
      ctx.groupTeacherId = groups.find((g) => g.id === sess.groupId)?.teacherId;
    }
    ctx.studentId = rec.studentId as string | undefined;
  } else if (entityKey === 'settlements') {
    ctx.teacherId = rec.teacherId as string | undefined;
  } else if (entityKey === 'users') {
    ctx.targetUserRole = rec.role as UserRole | undefined;
  } else if (
    entityKey === 'studentAccounts' ||
    entityKey === 'studentSessions' ||
    entityKey === 'examAttempts' ||
    entityKey === 'assignmentSubmissions' ||
    entityKey === 'installmentPlans' ||
    entityKey === 'pointEntries' ||
    entityKey === 'payments'
  ) {
    ctx.studentId = rec.studentId as string | undefined;
  }

  return ctx;
}

function filterItemsForActor<T>(
  adapter: StorageAdapter,
  entityKey: EntityKey,
  items: T[],
  actor: PermissionActor | null
): T[] {
  if (!actor) return [];
  if (
    actor.role === 'system' ||
    actor.role === UserRole.OWNER ||
    actor.role === UserRole.ADMIN
  ) {
    return items;
  }

  const resource = ENTITY_TO_RESOURCE[entityKey];
  if (!can(actor, 'view', resource)) {
    return [];
  }

  if (actor.role === UserRole.ACCOUNTANT) {
    if (entityKey === 'users') {
      return items.filter((u) => (u as unknown as SystemUser).id === actor.userId);
    }
    return items;
  }

  if (actor.role === UserRole.RECEPTIONIST) {
    if (entityKey === 'users') {
      return items.filter((u) => (u as unknown as SystemUser).id === actor.userId);
    }
    return items;
  }

  if (actor.role === UserRole.TEACHER) {
    const allGroups = adapter.getCollection('groups');
    const teacherGroups = allGroups.filter((g) => g.teacherId === actor.teacherId);
    const teacherGroupIds = new Set(teacherGroups.map((g) => g.id));

    if (entityKey === 'groups') {
      return items.filter((g) => (g as unknown as Group).teacherId === actor.teacherId);
    }
    if (entityKey === 'students') {
      return items.filter((s) =>
        (s as unknown as Student).groupIds.some((gid) => teacherGroupIds.has(gid))
      );
    }
    if (entityKey === 'teachers') {
      return items.filter((t) => (t as unknown as Teacher).id === actor.teacherId);
    }
    if (entityKey === 'sessions') {
      return items.filter((s) => {
        const sess = s as unknown as AttendanceSession;
        return teacherGroupIds.has(sess.groupId) || sess.teacherId === actor.teacherId;
      });
    }
    if (entityKey === 'attendanceRecords') {
      const teacherSessionIds = new Set(
        adapter
          .getCollection('sessions')
          .filter((s) => teacherGroupIds.has(s.groupId) || s.teacherId === actor.teacherId)
          .map((s) => s.id)
      );
      return items.filter((r) =>
        teacherSessionIds.has((r as unknown as AttendanceRecord).sessionId)
      );
    }
    if (
      entityKey === 'assessments' ||
      entityKey === 'lessons' ||
      entityKey === 'onlineExams' ||
      entityKey === 'assignments'
    ) {
      return items.filter((a) =>
        teacherGroupIds.has((a as unknown as { groupId: string }).groupId)
      );
    }
    if (entityKey === 'examAttempts') {
      const ownExamIds = new Set(
        adapter
          .getCollection('onlineExams')
          .filter((e) => teacherGroupIds.has(e.groupId))
          .map((e) => e.id)
      );
      return items.filter((a) => ownExamIds.has((a as unknown as OnlineExamAttempt).examId));
    }
    if (entityKey === 'assignmentSubmissions') {
      const ownAssignmentIds = new Set(
        adapter
          .getCollection('assignments')
          .filter((a) => teacherGroupIds.has(a.groupId))
          .map((a) => a.id)
      );
      return items.filter((s) =>
        ownAssignmentIds.has((s as unknown as AssignmentSubmission).assignmentId)
      );
    }
    if (entityKey === 'settlements') {
      return items.filter((s) => (s as unknown as SettlementRecord).teacherId === actor.teacherId);
    }
    if (entityKey === 'users') {
      return items.filter((u) => (u as unknown as SystemUser).id === actor.userId);
    }
    if (entityKey === 'notifications') {
      return items.filter((n) => (n as unknown as AppNotification).category === 'attendance');
    }
    return items;
  }

  if (actor.role === UserRole.PARENT) {
    const cleanPhone = normalizePhoneDigits(actor.parentPhone);
    const hasValidPhone = cleanPhone.length >= 8;
    const links = adapter.getCollection('studentGuardians');
    const linkedStudentIds = new Set(
      links
        .filter(
          (l) =>
            (actor.guardianId && l.guardianId === actor.guardianId) ||
            (actor.userId && l.guardianUserId === actor.userId)
        )
        .map((l) => l.studentId)
    );

    const myChildren = adapter.getCollection('students').filter((st) => {
      if (linkedStudentIds.has(st.id)) return true;
      if (actor.guardianId && st.guardianIds?.includes(actor.guardianId)) return true;
      if (actor.userId && st.guardianUserIds?.includes(actor.userId)) return true;
      if (!hasValidPhone) return false;
      const p1 = normalizePhoneDigits(st.parentPhone);
      const p2 = normalizePhoneDigits(st.parent?.phone);
      return (p1.length >= 8 && p1 === cleanPhone) || (p2.length >= 8 && p2 === cleanPhone);
    });
    const childIds = new Set(myChildren.map((c) => c.id));
    const childGroupIds = new Set<string>();
    myChildren.forEach((c) => c.groupIds.forEach((gid) => childGroupIds.add(gid)));

    if (entityKey === 'guardians') {
      return items.filter(
        (g) =>
          (actor.guardianId && (g as unknown as Guardian).id === actor.guardianId) ||
          (actor.userId && (g as unknown as Guardian).userId === actor.userId)
      );
    }
    if (entityKey === 'studentGuardians') {
      return items.filter(
        (l) =>
          (actor.guardianId && (l as unknown as StudentGuardianLink).guardianId === actor.guardianId) ||
          (actor.userId && (l as unknown as StudentGuardianLink).guardianUserId === actor.userId)
      );
    }
    if (entityKey === 'students') {
      return items.filter((s) => childIds.has((s as unknown as Student).id));
    }
    if (entityKey === 'groups') {
      return items.filter((g) => childGroupIds.has((g as unknown as Group).id));
    }
    if (entityKey === 'sessions') {
      return items.filter((s) => childGroupIds.has((s as unknown as AttendanceSession).groupId));
    }
    if (entityKey === 'attendanceRecords') {
      return items.filter((r) => childIds.has((r as unknown as AttendanceRecord).studentId));
    }
    if (entityKey === 'invoices') {
      return items.filter((inv) => childIds.has((inv as unknown as Invoice).studentId));
    }
    if (entityKey === 'payments') {
      return items.filter((p) => childIds.has((p as unknown as PaymentRecord).studentId));
    }
    if (entityKey === 'assessments') {
      return items.filter((a) => {
        const ass = a as unknown as Assessment;
        return childGroupIds.has(ass.groupId) || ass.grades.some((g) => childIds.has(g.studentId));
      });
    }
    if (entityKey === 'users') {
      return items.filter((u) => (u as unknown as SystemUser).id === actor.userId);
    }
    if (entityKey === 'lessons' || entityKey === 'assignments') {
      return items.filter((i) => childGroupIds.has((i as unknown as { groupId: string }).groupId));
    }
    if (entityKey === 'assignmentSubmissions' || entityKey === 'installmentPlans' || entityKey === 'pointEntries') {
      return items.filter((i) => childIds.has((i as unknown as { studentId: string }).studentId));
    }
    return [];
  }

  if (actor.role === UserRole.STUDENT) {
    const sid = actor.studentId || '';
    const me = adapter.getCollection('students').find((s) => s.id === sid);
    const myGroupIds = new Set<string>(me?.groupIds || []);

    if (entityKey === 'students') {
      return items.filter((s) => (s as unknown as Student).id === sid);
    }
    if (entityKey === 'groups') {
      return items.filter((g) => myGroupIds.has((g as unknown as Group).id));
    }
    if (entityKey === 'sessions') {
      return items.filter((s) => myGroupIds.has((s as unknown as AttendanceSession).groupId));
    }
    if (entityKey === 'attendanceRecords') {
      return items.filter((r) => (r as unknown as AttendanceRecord).studentId === sid);
    }
    if (entityKey === 'invoices') {
      return items.filter((inv) => (inv as unknown as Invoice).studentId === sid);
    }
    if (entityKey === 'assessments') {
      return items
        .filter((a) => {
          const ass = a as unknown as Assessment;
          return myGroupIds.has(ass.groupId) || ass.grades.some((g) => g.studentId === sid);
        })
        .map((a) => {
          const ass = a as unknown as Assessment;
          return {
            ...ass,
            grades: ass.grades.filter((g) => g.studentId === sid),
          } as unknown as T;
        });
    }
    if (entityKey === 'lessons') {
      return items.filter((l) => {
        const lesson = l as unknown as LessonItem;
        return lesson.published && myGroupIds.has(lesson.groupId);
      });
    }
    if (entityKey === 'onlineExams') {
      return items.filter((e) => {
        const exam = e as unknown as OnlineExam;
        return exam.published && myGroupIds.has(exam.groupId);
      });
    }
    if (entityKey === 'assignments') {
      return items.filter((a) => myGroupIds.has((a as unknown as Assignment).groupId));
    }
    if (entityKey === 'examAttempts' || entityKey === 'assignmentSubmissions') {
      return items.filter((i) => (i as unknown as { studentId: string }).studentId === sid);
    }
    if (entityKey === 'pointEntries') {
      // Allow students to see all point entries to render center leaderboard totals cleanly (names resolved from students or entry)
      return items;
    }
    if (entityKey === 'studentSessions') {
      return items.filter((s) => (s as unknown as StudentDeviceSession).studentId === sid);
    }
    return [];
  }

  return items;
}

function createEntityRepository<K extends EntityKey, T extends BaseEntity>(
  adapter: StorageAdapter,
  entityKey: K,
  idPrefix: string,
  normalizeOnWrite?: (item: T, existingItems: T[]) => T,
  options?: CreateRepositoriesOptions
): Repository<T> {
  const getItems = (): T[] => adapter.getCollection(entityKey) as unknown as T[];
  const saveItems = (items: T[]): void =>
    adapter.setCollection(entityKey, items as unknown as EntityCollectionsMap[K]);

  const checkWritePermission = (action: PermissionAction, targetItem?: unknown) => {
    if (!options?.enforcePermissions) return;
    const actor = options.getActor ? options.getActor() : null;
    const resource = ENTITY_TO_RESOURCE[entityKey];
    const ctx = buildPermissionContextForItem(adapter, entityKey, targetItem);
    assertCan(actor, action, resource, ctx);
  };

  return {
    list(filters?: ListFilter<T>): T[] {
      const all = getItems();
      const visible =
        options?.enforcePermissions && options.getActor
          ? filterItemsForActor(adapter, entityKey, all, options.getActor())
          : all;
      if (!filters) return [...visible];
      return visible.filter((item) => matchesFilter(item, filters));
    },

    get(id: string): T | undefined {
      const found = getItems().find((item) => item.id === id);
      if (!found) return undefined;
      if (options?.enforcePermissions && options.getActor) {
        const visible = filterItemsForActor(adapter, entityKey, [found], options.getActor());
        return visible[0];
      }
      return found;
    },

    create(data: Omit<T, 'id'> & { id?: string }): T {
      checkWritePermission('create', data);
      const current = getItems();
      const raw: T = {
        ...data,
        id: data.id || generateId(idPrefix),
        centerId: data.centerId || DEFAULT_CENTER_ID,
      } as T;
      const normalized = normalizeOnWrite ? normalizeOnWrite(raw, current) : raw;
      saveItems([normalized, ...current]);
      return normalized;
    },

    update(id: string, patch: Partial<T>): T | undefined {
      const current = getItems();
      const existing = current.find((item) => item.id === id);
      if (!existing) return undefined;

      // Enforce permission against BOTH existing item AND patched target (e.g., role escalation to Owner)
      checkWritePermission('update', existing);
      const mergedPreview = { ...existing, ...patch, id: existing.id };
      checkWritePermission('update', mergedPreview);

      let updatedItem: T | undefined;
      const next = current.map((item) => {
        if (item.id !== id) return item;
        const merged = {
          ...item,
          ...patch,
          id: item.id,
          centerId: patch.centerId || item.centerId || DEFAULT_CENTER_ID,
        } as T;
        updatedItem = normalizeOnWrite ? normalizeOnWrite(merged, current) : merged;
        return updatedItem;
      });
      if (!updatedItem) return undefined;
      saveItems(next);
      return updatedItem;
    },

    remove(id: string): boolean {
      const current = getItems();
      const existing = current.find((item) => item.id === id);
      if (!existing) return false;
      checkWritePermission('delete', existing);
      const filtered = current.filter((item) => item.id !== id);
      saveItems(filtered);
      return true;
    },

    replaceAll(items: T[]): void {
      if (options?.enforcePermissions) {
        const actor = options.getActor ? options.getActor() : null;
        if (!actor || actor.role !== 'system') {
          if (!can(actor, 'manage_backup', 'backup')) {
            throw new PermissionError('manage_backup', 'backup');
          }
        }
      }
      saveItems(items);
    },
  };
}

function generateNextStudentCode(existing: Student[], centerId: string): string {
  let maxNum = 100;
  for (const st of existing) {
    if ((st.centerId || DEFAULT_CENTER_ID) !== centerId) continue;
    const match = /^S-(\d+)$/.exec(st.code || '');
    if (match) {
      const parsed = Number(match[1]);
      if (parsed > maxNum) maxNum = parsed;
    }
  }
  return `S-${String(maxNum + 1).padStart(6, '0')}`;
}

export interface EduflowRepositories {
  adapter: StorageAdapter;
  centers: Repository<Center>;
  users: Repository<SystemUser>;
  guardians: Repository<Guardian>;
  studentGuardians: Repository<StudentGuardianLink>;
  students: Repository<Student>;
  teachers: Repository<Teacher>;
  groups: Repository<Group>;
  sessions: Repository<AttendanceSession>;
  attendanceRecords: Repository<AttendanceRecord>;
  invoices: Repository<Invoice>;
  payments: Repository<PaymentRecord>;
  discounts: Repository<DiscountRecord>;
  expenses: Repository<Expense>;
  settlements: Repository<SettlementRecord>;
  messages: Repository<OutboxMessage>;
  assessments: Repository<Assessment>;
  activityLog: Repository<ActivityLogEntry>;
  consents: Repository<ConsentRecord>;
  faceTemplates: Repository<FaceTemplateRecord>;
  rooms: Repository<Room>;
  notifications: Repository<AppNotification>;
  studentAccounts: Repository<StudentPortalAccount>;
  studentSessions: Repository<StudentDeviceSession>;
  webhookEvents: Repository<WebhookEventRecord>;
  scheduledJobRuns: Repository<ScheduledJobRunRecord>;
  fileAssets: Repository<FileAssetRecord>;
  lessons: Repository<LessonItem>;
  onlineExams: Repository<OnlineExam>;
  examAttempts: Repository<OnlineExamAttempt>;
  assignments: Repository<Assignment>;
  assignmentSubmissions: Repository<AssignmentSubmission>;
  cashShifts: Repository<CashRegisterShift>;
  inventoryItems: Repository<InventoryItem>;
  inventoryTransactions: Repository<InventoryTransaction>;
  leads: Repository<RegistrationLead>;
  staffAttendance: Repository<StaffAttendanceRecord>;
  staffPayrolls: Repository<StaffPayrollRecord>;
  installmentPlans: Repository<InstallmentPlan>;
  pointEntries: Repository<GamificationPointEntry>;
  meta: {
    getStages(): string[];
    setStages(stages: string[]): void;
    getTemplates(): MessageTemplate[];
    setTemplates(templates: MessageTemplate[]): void;
    getCenterSettings(): CenterSettings;
    setCenterSettings(settings: CenterSettings): void;
  };
}

export function createRepositories(
  adapter: StorageAdapter,
  options?: CreateRepositoriesOptions
): EduflowRepositories {
  const checkMetaWrite = (action: PermissionAction, resource: PermissionResource) => {
    if (!options?.enforcePermissions) return;
    const actor = options.getActor ? options.getActor() : null;
    assertCan(actor, action, resource);
  };

  return {
    adapter,
    centers: createEntityRepository<'centers', Center>(
      adapter,
      'centers',
      'center',
      undefined,
      options
    ),
    users: createEntityRepository<'users', SystemUser>(
      adapter,
      'users',
      'u',
      undefined,
      options
    ),
    guardians: createEntityRepository<'guardians', Guardian>(
      adapter,
      'guardians',
      'g',
      undefined,
      options
    ),
    studentGuardians: createEntityRepository<'studentGuardians', StudentGuardianLink>(
      adapter,
      'studentGuardians',
      'sg',
      undefined,
      options
    ),
    students: createEntityRepository<'students', Student>(
      adapter,
      'students',
      's',
      (st, existing) => {
        const centerId = st.centerId || DEFAULT_CENTER_ID;
        const fullName = st.fullName || st.name;
        const parentName = st.parent?.name || st.parentName || '';
        const parentPhone = st.parent?.phone || st.parentPhone || '';
        const code =
          st.code && st.code.trim().length > 0
            ? st.code
            : generateNextStudentCode(existing, centerId);
        return {
          ...st,
          centerId,
          code,
          fullName,
          name: fullName,
          parent: { name: parentName, phone: parentPhone },
          parentName,
          parentPhone,
          createdAt: st.createdAt || new Date().toISOString(),
        };
      },
      options
    ),
    teachers: createEntityRepository<'teachers', Teacher>(
      adapter,
      'teachers',
      't',
      (t) => ({
        ...t,
        centerId: t.centerId || DEFAULT_CENTER_ID,
        compensation:
          t.compensation ||
          (t.compensationType === 'fixed_rent'
            ? { type: 'rent', rentAmount: t.compensationValue }
            : t.compensationType === 'per_session'
              ? { type: 'per_session', perSessionAmount: t.compensationValue }
              : { type: 'percent', centerPercent: Math.max(0, 100 - t.compensationValue) }),
      }),
      options
    ),
    groups: createEntityRepository<'groups', Group>(
      adapter,
      'groups',
      'g',
      (g) => {
        const rooms = adapter.getCollection('rooms');
        const roomObj = rooms.find((r) => r.id === g.roomId);
        return {
          ...g,
          centerId: g.centerId || DEFAULT_CENTER_ID,
          room: g.room || roomObj?.name || g.roomId,
        };
      },
      options
    ),
    sessions: createEntityRepository<'sessions', AttendanceSession>(
      adapter,
      'sessions',
      'sess',
      (s) => ({
        ...s,
        centerId: s.centerId || DEFAULT_CENTER_ID,
        type: s.type || 'regular',
      }),
      options
    ),
    attendanceRecords: createEntityRepository<'attendanceRecords', AttendanceRecord>(
      adapter,
      'attendanceRecords',
      'att',
      undefined,
      options
    ),
    invoices: createEntityRepository<'invoices', Invoice>(
      adapter,
      'invoices',
      'inv',
      (inv) => {
        const number = inv.number || inv.invoiceNumber;
        const netAmount = typeof inv.netAmount === 'number' ? inv.netAmount : inv.total;
        return {
          ...inv,
          centerId: inv.centerId || DEFAULT_CENTER_ID,
          number,
          invoiceNumber: number,
          baseAmount: typeof inv.baseAmount === 'number' ? inv.baseAmount : netAmount,
          discountLines: Array.isArray(inv.discountLines) ? inv.discountLines : [],
          netAmount,
          total: netAmount,
          createdAt: inv.createdAt || new Date().toISOString(),
        };
      },
      options
    ),
    payments: createEntityRepository<'payments', PaymentRecord>(
      adapter,
      'payments',
      'pay',
      undefined,
      options
    ),
    discounts: createEntityRepository<'discounts', DiscountRecord>(
      adapter,
      'discounts',
      'disc',
      undefined,
      options
    ),
    expenses: createEntityRepository<'expenses', Expense>(
      adapter,
      'expenses',
      'exp',
      undefined,
      options
    ),
    settlements: createEntityRepository<'settlements', SettlementRecord>(
      adapter,
      'settlements',
      'stl',
      undefined,
      options
    ),
    messages: createEntityRepository<'messages', OutboxMessage>(
      adapter,
      'messages',
      'msg',
      undefined,
      options
    ),
    assessments: createEntityRepository<'assessments', Assessment>(
      adapter,
      'assessments',
      'as',
      undefined,
      options
    ),
    activityLog: createEntityRepository<'activityLog', ActivityLogEntry>(
      adapter,
      'activityLog',
      'act',
      undefined,
      options
    ),
    consents: createEntityRepository<'consents', ConsentRecord>(
      adapter,
      'consents',
      'con',
      undefined,
      options
    ),
    faceTemplates: createEntityRepository<'faceTemplates', FaceTemplateRecord>(
      adapter,
      'faceTemplates',
      'face',
      undefined,
      options
    ),
    rooms: createEntityRepository<'rooms', Room>(
      adapter,
      'rooms',
      'r',
      undefined,
      options
    ),
    notifications: createEntityRepository<'notifications', AppNotification>(
      adapter,
      'notifications',
      'not',
      undefined,
      options
    ),
    studentAccounts: createEntityRepository<'studentAccounts', StudentPortalAccount>(
      adapter,
      'studentAccounts',
      'stacc',
      undefined,
      options
    ),
    studentSessions: createEntityRepository<'studentSessions', StudentDeviceSession>(
      adapter,
      'studentSessions',
      'stsess',
      undefined,
      options
    ),
    webhookEvents: createEntityRepository<'webhookEvents', WebhookEventRecord>(
      adapter,
      'webhookEvents',
      'whk',
      undefined,
      options
    ),
    scheduledJobRuns: createEntityRepository<'scheduledJobRuns', ScheduledJobRunRecord>(
      adapter,
      'scheduledJobRuns',
      'job',
      undefined,
      options
    ),
    fileAssets: createEntityRepository<'fileAssets', FileAssetRecord>(
      adapter,
      'fileAssets',
      'file',
      undefined,
      options
    ),
    lessons: createEntityRepository<'lessons', LessonItem>(
      adapter,
      'lessons',
      'lsn',
      undefined,
      options
    ),
    onlineExams: createEntityRepository<'onlineExams', OnlineExam>(
      adapter,
      'onlineExams',
      'exm',
      undefined,
      options
    ),
    examAttempts: createEntityRepository<'examAttempts', OnlineExamAttempt>(
      adapter,
      'examAttempts',
      'exa',
      undefined,
      options
    ),
    assignments: createEntityRepository<'assignments', Assignment>(
      adapter,
      'assignments',
      'asg',
      undefined,
      options
    ),
    assignmentSubmissions: createEntityRepository<'assignmentSubmissions', AssignmentSubmission>(
      adapter,
      'assignmentSubmissions',
      'asub',
      undefined,
      options
    ),
    cashShifts: createEntityRepository<'cashShifts', CashRegisterShift>(
      adapter,
      'cashShifts',
      'csh',
      undefined,
      options
    ),
    inventoryItems: createEntityRepository<'inventoryItems', InventoryItem>(
      adapter,
      'inventoryItems',
      'invt',
      undefined,
      options
    ),
    inventoryTransactions: createEntityRepository<'inventoryTransactions', InventoryTransaction>(
      adapter,
      'inventoryTransactions',
      'invx',
      undefined,
      options
    ),
    leads: createEntityRepository<'leads', RegistrationLead>(
      adapter,
      'leads',
      'lead',
      undefined,
      options
    ),
    staffAttendance: createEntityRepository<'staffAttendance', StaffAttendanceRecord>(
      adapter,
      'staffAttendance',
      'satt',
      undefined,
      options
    ),
    staffPayrolls: createEntityRepository<'staffPayrolls', StaffPayrollRecord>(
      adapter,
      'staffPayrolls',
      'spay',
      undefined,
      options
    ),
    installmentPlans: createEntityRepository<'installmentPlans', InstallmentPlan>(
      adapter,
      'installmentPlans',
      'inst',
      undefined,
      options
    ),
    pointEntries: createEntityRepository<'pointEntries', GamificationPointEntry>(
      adapter,
      'pointEntries',
      'pts',
      undefined,
      options
    ),
    meta: {
      getStages: () => adapter.getMeta('stages'),
      setStages: (stages) => {
        checkMetaWrite('update', 'stages');
        adapter.setMeta('stages', stages);
      },
      getTemplates: () => adapter.getMeta('templates'),
      setTemplates: (templates) => {
        checkMetaWrite('update', 'messageTemplates');
        adapter.setMeta('templates', templates);
      },
      getCenterSettings: () => adapter.getMeta('centerSettings'),
      setCenterSettings: (settings) => {
        const prev = adapter.getMeta('centerSettings');
        if (prev.currentPlanId !== settings.currentPlanId) {
          checkMetaWrite('change_plan', 'subscription');
        } else if (
          Boolean(prev.biometricFaceEnabled) !== Boolean(settings.biometricFaceEnabled)
        ) {
          checkMetaWrite('enable_biometrics', 'biometrics');
        } else {
          checkMetaWrite('update', 'settings');
        }
        adapter.setMeta('centerSettings', settings);
      },
    },
  };
}

export const defaultStorageAdapter = new LocalStorageAdapter();
export const repositories = createRepositories(defaultStorageAdapter, {
  getActor: getActivePermissionActor,
  enforcePermissions: true,
});
