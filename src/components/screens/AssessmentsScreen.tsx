import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  EyeOff,
  FileQuestion,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import { useEduflow } from '../../context/EduflowContext';
import {
  Assessment,
  AssessmentType,
  AssignmentSubmission,
  OnlineExamQuestion,
} from '../../types/eduflow';
import { can } from '../../permissions/permissions';
import { Can } from '../../permissions/Can';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  InitialAvatar,
  ListStateSwitcher,
  Modal,
  SelectInput,
  StatusChip,
  TableSkeleton,
  TextInput,
} from '../ui/Primitives';
import {
  computeAssessmentSummary,
  formatDateDDMMYYYY,
  formatNumber,
  validateAssessmentScore,
} from '../../utils/eduflowLogic';

// 16) Assessments, Lessons, Online Exams & Assignments Screen
export const AssessmentsScreen: React.FC = () => {
  const {
    currentActor,
    assessments,
    groups,
    teachers,
    students,
    lessons,
    onlineExams,
    examAttempts,
    assignments,
    assignmentSubmissions,
    listStateMode,
    setListStateMode,
    createAssessment,
    updateAssessmentGrades,
    createLesson,
    toggleLessonPublished,
    deleteLesson,
    createOnlineExam,
    toggleOnlineExamPublished,
    createAssignment,
    toggleAssignmentStatus,
    gradeAssignmentSubmission,
    showToast,
  } = useEduflow();

  const [sectionTab, setSectionTab] = useState<
    'traditional' | 'lessons' | 'online_exams' | 'assignments'
  >('traditional');

  const canEnterAssessments = can(currentActor, 'enter_assessments', 'assessments');
  const canManageLessons = can(currentActor, 'create', 'lessons');
  const canManageExams = can(currentActor, 'create', 'onlineExams');
  const canManageAssignments = can(currentActor, 'create', 'assignments');
  const canGradeAssignments = can(currentActor, 'update', 'assignmentSubmissions');

  // Traditional Assessments State
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<AssessmentType>('امتحان');
  const [groupId, setGroupId] = useState(groups[0]?.id || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [maxScore, setMaxScore] = useState('50');
  const [formErr, setFormErr] = useState('');

  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving'>('saved');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Lessons State
  const [lessonDrawerOpen, setLessonDrawerOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonGroupId, setLessonGroupId] = useState(groups[0]?.id || '');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonVideoUrl, setLessonVideoUrl] = useState('');
  const [lessonLiveUrl, setLessonLiveUrl] = useState('');
  const [lessonLiveSchedule, setLessonLiveSchedule] = useState('');
  const [lessonAttachment, setLessonAttachment] = useState('');
  const [lessonDuration, setLessonDuration] = useState('35');
  const [lessonPublished, setLessonPublished] = useState(true);

  // Online Exam Builder State
  const [examDrawerOpen, setExamDrawerOpen] = useState(false);
  const [examTitle, setExamTitle] = useState('');
  const [examGroupId, setExamGroupId] = useState(groups[0]?.id || '');
  const [examDuration, setExamDuration] = useState('20');
  const [examPassingScore, setExamPassingScore] = useState('10');
  const [examPublished, setExamPublished] = useState(true);
  const [examQuestions, setExamQuestions] = useState<OnlineExamQuestion[]>([
    {
      id: 'q-init-1',
      prompt: 'اختر الإجابة الصحيحة: Je ___ au lycée.',
      type: 'mcq',
      options: ['vais', 'vas', 'va', 'allons'],
      correctIndex: 0,
      points: 5,
    },
  ]);

  // Assignments State
  const [assignmentDrawerOpen, setAssignmentDrawerOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState('');
  const [assignGroupId, setAssignGroupId] = useState(groups[0]?.id || '');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignDueDate, setAssignDueDate] = useState(() =>
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  );
  const [assignMaxScore, setAssignMaxScore] = useState('20');

  const [gradingModalSub, setGradingModalSub] = useState<AssignmentSubmission | null>(null);
  const [gradeScoreInput, setGradeScoreInput] = useState('');
  const [gradeFeedbackInput, setGradeFeedbackInput] = useState('');

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const activeAssessment: Assessment | null =
    assessments.find((a) => a.id === selectedAssessmentId) || null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormErr('يرجى كتابة عنوان التقييم.');
      return;
    }
    const max = Number(maxScore);
    if (!max || max <= 0) {
      setFormErr('النهاية العظمى يجب أن تكون أكبر من صفر.');
      return;
    }
    const created = createAssessment({
      title: title.trim(),
      type,
      groupId,
      date,
      maxScore: max,
    });
    setTitle('');
    setFormErr('');
    setCreateDrawerOpen(false);
    setSelectedAssessmentId(created.id);
  };

  const handleCreateLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle.trim()) return;
    const grp = groupMap.get(lessonGroupId) || groups[0];
    const teacherId = grp?.teacherId || teachers[0]?.id || 't1';
    const created = createLesson({
      title: lessonTitle.trim(),
      groupId: grp?.id || lessonGroupId,
      teacherId,
      description: lessonDesc.trim(),
      videoUrl: lessonVideoUrl.trim() || undefined,
      liveUrl: lessonLiveUrl.trim() || undefined,
      liveScheduleLabel: lessonLiveSchedule.trim() || undefined,
      attachmentName: lessonAttachment.trim() || undefined,
      durationMinutes: Math.max(1, Number(lessonDuration) || 30),
      published: lessonPublished,
    });
    if (created) {
      setLessonDrawerOpen(false);
      setLessonTitle('');
      setLessonDesc('');
      setLessonVideoUrl('');
      setLessonLiveUrl('');
      setLessonLiveSchedule('');
      setLessonAttachment('');
    }
  };

  const handleAddExamQuestion = (qType: 'mcq' | 'tf') => {
    setExamQuestions((prev) => [
      ...prev,
      {
        id: `q-${Date.now()}-${prev.length + 1}`,
        prompt: '',
        type: qType,
        options: qType === 'tf' ? ['صحيح', 'خطأ'] : ['الخيار أ', 'الخيار ب', 'الخيار ج', 'الخيار د'],
        correctIndex: 0,
        points: 5,
      },
    ]);
  };

  const handleCreateOnlineExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim() || examQuestions.length === 0) return;
    const validQuestions = examQuestions.filter((q) => q.prompt.trim().length > 0);
    if (validQuestions.length === 0) {
      showToast('أضف نص سؤال واحد على الأقل قبل الحفظ', 'error');
      return;
    }
    const grp = groupMap.get(examGroupId) || groups[0];
    const teacherId = grp?.teacherId || teachers[0]?.id || 't1';
    const created = createOnlineExam({
      title: examTitle.trim(),
      groupId: grp?.id || examGroupId,
      teacherId,
      durationMinutes: Math.max(5, Number(examDuration) || 20),
      passingScore: Math.max(1, Number(examPassingScore) || 5),
      published: examPublished,
      questions: validQuestions,
    });
    if (created) {
      setExamDrawerOpen(false);
      setExamTitle('');
    }
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTitle.trim()) return;
    const grp = groupMap.get(assignGroupId) || groups[0];
    const teacherId = grp?.teacherId || teachers[0]?.id || 't1';
    const created = createAssignment({
      title: assignTitle.trim(),
      description: assignDesc.trim(),
      groupId: grp?.id || assignGroupId,
      teacherId,
      dueDate: assignDueDate,
      maxScore: Math.max(1, Number(assignMaxScore) || 20),
    });
    if (created) {
      setAssignmentDrawerOpen(false);
      setAssignTitle('');
      setAssignDesc('');
    }
  };

  const handleSubmitGrading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingModalSub) return;
    const updated = gradeAssignmentSubmission({
      submissionId: gradingModalSub.id,
      score: Math.max(0, Number(gradeScoreInput) || 0),
      feedback: gradeFeedbackInput.trim() || undefined,
    });
    if (updated) {
      setGradingModalSub(null);
    }
  };

  if (activeAssessment) {
    const grp = groups.find((g) => g.id === activeAssessment.groupId);
    const canEditThisAssessment = can(
      currentActor,
      'enter_assessments',
      'assessments',
      { groupId: activeAssessment.groupId, groups }
    );
    const summary = computeAssessmentSummary(
      activeAssessment.grades,
      activeAssessment.maxScore
    );
    const maxBucketCount = Math.max(...summary.distribution.map((d) => d.count), 1);

    const handleScoreChange = (studentId: string, rawVal: string) => {
      if (!canEditThisAssessment) return;
      const parsed = rawVal === '' ? null : Number(rawVal);
      const check = validateAssessmentScore(parsed, activeAssessment.maxScore, false);
      if (!check.valid) {
        setRowErrors((prev) => ({ ...prev, [studentId]: check.error || 'قيمة خاطئة' }));
        return;
      }
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      setAutosaveStatus('saving');
      const nextGrades = activeAssessment.grades.map((g) =>
        g.studentId === studentId ? { ...g, score: parsed, absent: false } : g
      );
      updateAssessmentGrades(activeAssessment.id, nextGrades);
      setTimeout(() => setAutosaveStatus('saved'), 300);
    };

    const handleAbsentToggle = (studentId: string, absent: boolean) => {
      if (!canEditThisAssessment) return;
      setAutosaveStatus('saving');
      const nextGrades = activeAssessment.grades.map((g) =>
        g.studentId === studentId
          ? { ...g, absent, score: absent ? null : g.score }
          : g
      );
      updateAssessmentGrades(activeAssessment.id, nextGrades);
      setTimeout(() => setAutosaveStatus('saved'), 250);
    };

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedAssessmentId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B6B80] hover:text-[#0F2A4A] cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لقائمة التقييمات</span>
          </button>

          {canEditThisAssessment ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D1FAE5] text-[#065F46] text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {autosaveStatus === 'saving'
                  ? 'جاري الحفظ التلقائي...'
                  : 'تم الحفظ التلقائي للدرجات'}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold">
              <span>وضع العرض فقط — إدخال الدرجات متاح للمدرس أو الإدارة</span>
            </div>
          )}
        </div>

        {/* Assessment Header & Summary Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7 p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusChip tone="navy" label={activeAssessment.type} />
                <span className="text-xs text-[#5B6B80] tabular-nums">
                  {activeAssessment.date}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#0F2A4A] mt-1.5">
                {activeAssessment.title}
              </h2>
              <p className="text-xs text-[#5B6B80]">{grp?.name}</p>
            </div>

            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-[#E2E8F0]">
              <div>
                <span className="text-xs text-[#5B6B80] block">النهاية العظمى</span>
                <span className="text-lg font-bold text-[#0F2A4A] tabular-nums">
                  {activeAssessment.maxScore}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#5B6B80] block">متوسط المجموعة</span>
                <span className="text-lg font-bold text-[#0F766E] tabular-nums">
                  {summary.average}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#5B6B80] block">أعلى درجة</span>
                <span className="text-lg font-bold text-[#065F46] tabular-nums">
                  {summary.highest}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#5B6B80] block">أقل درجة</span>
                <span className="text-lg font-bold text-[#991B1B] tabular-nums">
                  {summary.lowest}
                </span>
              </div>
            </div>
          </Card>

          {/* Score Distribution Bar Chart */}
          <Card className="lg:col-span-5 p-5">
            <h3 className="text-sm font-bold text-[#0F2A4A] mb-3">توزيع درجات الطلاب</h3>
            <div className="space-y-2.5">
              {summary.distribution.map((bucket) => (
                <div key={bucket.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#5B6B80] font-medium">{bucket.label}</span>
                    <span className="font-bold text-[#1E293B] tabular-nums">
                      {bucket.count} طالب
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-[#0F766E] rounded-full transition-all"
                      style={{ width: `${(bucket.count / maxBucketCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Grade Entry Roster */}
        <Card padding="p-0" className="overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-[#E2E8F0] flex items-center justify-between text-xs font-bold text-[#5B6B80]">
            <span>رصد درجات الطلاب (النهاية العظمى: {activeAssessment.maxScore})</span>
            <span>يتم التحقق تلقائياً من عدم تجاوز الدرجة القصوى</span>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {activeAssessment.grades.map((gr) => {
              const st = students.find((s) => s.id === gr.studentId);
              if (!st) return null;
              const errMsg = rowErrors[st.id];

              return (
                <div
                  key={st.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <InitialAvatar name={st.name} size="sm" />
                    <div>
                      <p className="text-sm font-bold text-[#1E293B]">{st.name}</p>
                      {errMsg && (
                        <p className="text-xs font-bold text-[#991B1B] mt-0.5">{errMsg}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B6B80] cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEditThisAssessment}
                        checked={gr.absent}
                        onChange={(e) => handleAbsentToggle(st.id, e.target.checked)}
                        className="w-4 h-4 accent-[#DC2626]"
                      />
                      <span>غائب</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`درجة ${st.name}`}
                        disabled={gr.absent || !canEditThisAssessment}
                        min={0}
                        max={activeAssessment.maxScore}
                        placeholder="—"
                        value={gr.score === null ? '' : gr.score}
                        onChange={(e) => handleScoreChange(st.id, e.target.value)}
                        className={`w-24 h-11 px-3 rounded-[8px] border text-center text-base font-bold tabular-nums focus:outline-none ${
                          errMsg
                            ? 'border-[#DC2626] bg-red-50 text-[#991B1B]'
                            : 'border-[#E2E8F0] bg-white text-[#0F2A4A] focus:border-[#0F766E]'
                        } disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                      <span className="text-xs font-bold text-[#5B6B80] tabular-nums">
                        / {activeAssessment.maxScore}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-[#E2E8F0] p-1 rounded-[10px]">
          {(
            [
              {
                id: 'traditional',
                label: `الدرجات الحضورية (${formatNumber(assessments.length)})`,
                icon: <ClipboardCheck className="w-3.5 h-3.5" />,
              },
              {
                id: 'lessons',
                label: `الدروس والبث المباشر (${formatNumber(lessons.length)})`,
                icon: <Video className="w-3.5 h-3.5" />,
              },
              {
                id: 'online_exams',
                label: `الامتحانات الأونلاين (${formatNumber(onlineExams.length)})`,
                icon: <FileQuestion className="w-3.5 h-3.5" />,
              },
              {
                id: 'assignments',
                label: `الواجبات والتصحيح (${formatNumber(assignments.length)})`,
                icon: <BookOpen className="w-3.5 h-3.5" />,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSectionTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                sectionTab === t.id
                  ? 'bg-[#0F2A4A] text-white'
                  : 'text-[#5B6B80] hover:text-[#0F2A4A]'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sectionTab === 'traditional' && (
            <Can action="enter_assessments" resource="assessments">
              <Button onClick={() => setCreateDrawerOpen(true)} icon={<Plus className="w-4 h-4" />}>
                إنشاء تقييم أو امتحان
              </Button>
            </Can>
          )}
          {sectionTab === 'lessons' && canManageLessons && (
            <Button onClick={() => setLessonDrawerOpen(true)} icon={<Plus className="w-4 h-4" />}>
              إضافة درس / حصة مباشرة
            </Button>
          )}
          {sectionTab === 'online_exams' && canManageExams && (
            <Button onClick={() => setExamDrawerOpen(true)} icon={<Plus className="w-4 h-4" />}>
              إنشاء امتحان أونلاين
            </Button>
          )}
          {sectionTab === 'assignments' && canManageAssignments && (
            <Button
              onClick={() => setAssignmentDrawerOpen(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              إضافة واجب إلكتروني
            </Button>
          )}
          <ListStateSwitcher mode={listStateMode} onChange={setListStateMode} />
        </div>
      </div>

      {listStateMode === 'loading' ? (
        <TableSkeleton rows={4} />
      ) : listStateMode === 'error' ? (
        <ErrorState onRetry={() => setListStateMode('ready')} />
      ) : sectionTab === 'traditional' ? (
        listStateMode === 'empty' || assessments.length === 0 ? (
          <EmptyState
            title="لا توجد تقييمات أو امتحانات بعد"
            description="أنشئ امتحانات شهرية أو كويزات سريعة لرصد درجات الطلاب ومشاركتها مع أولياء الأمور."
            actionLabel={canEnterAssessments ? 'إنشاء أول امتحان' : undefined}
            onAction={canEnterAssessments ? () => setCreateDrawerOpen(true) : undefined}
          />
        ) : (
          <Card padding="p-0" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-xs font-bold text-[#5B6B80]">
                    <th className="py-3.5 px-4">عنوان التقييم</th>
                    <th className="py-3.5 px-4">المجموعة</th>
                    <th className="py-3.5 px-4">التاريخ</th>
                    <th className="py-3.5 px-4">النهاية العظمى</th>
                    <th className="py-3.5 px-4">متوسط الدرجات</th>
                    <th className="py-3.5 px-4">الحالة</th>
                    <th className="py-3.5 px-4 text-left">الرصد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-sm">
                  {assessments.map((as) => {
                    const grp = groups.find((g) => g.id === as.groupId);
                    const sum = computeAssessmentSummary(as.grades, as.maxScore);
                    return (
                      <tr key={as.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-[#0F2A4A] block">{as.title}</span>
                          <span className="text-xs text-[#5B6B80]">{as.type}</span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[#5B6B80]">{grp?.name}</td>
                        <td className="py-3.5 px-4 tabular-nums text-xs">{as.date}</td>
                        <td className="py-3.5 px-4 tabular-nums font-bold">{as.maxScore}</td>
                        <td className="py-3.5 px-4 tabular-nums font-bold text-[#0F766E]">
                          {sum.average} / {as.maxScore}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusChip
                            tone={as.status === 'graded' ? 'success' : 'warning'}
                            label={as.status === 'graded' ? 'مكتمل الرصد' : 'جاري الرصد'}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedAssessmentId(as.id)}
                          >
                            رصد / النتائج
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : sectionTab === 'lessons' ? (
        listStateMode === 'empty' || lessons.length === 0 ? (
          <EmptyState
            title="لا توجد دروس مسجلة أو روابط بث مباشر"
            description="أضف دروس الفيديو وروابط البث المباشر والمذكرات لتظهر فوراً في منصة الطالب."
            actionLabel={canManageLessons ? 'إضافة أول درس' : undefined}
            onAction={canManageLessons ? () => setLessonDrawerOpen(true) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lessons.map((lesson) => {
              const grp = groupMap.get(lesson.groupId);
              const watches = lesson.watchedByStudentIds?.length || 0;
              return (
                <Card key={lesson.id} className="flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <StatusChip
                        tone={lesson.published ? 'success' : 'neutral'}
                        label={lesson.published ? 'منشور للطلاب' : 'مسودة مخفية'}
                      />
                      <span className="text-xs text-[#64748B] tabular-nums">
                        {formatNumber(watches)} مشاهدة
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#0F2A4A]">{lesson.title}</h3>
                    <p className="text-xs text-[#0F766E] font-semibold">
                      {grp?.name || 'مجموعة'} · {lesson.durationMinutes || 30} دقيقة
                    </p>
                    <p className="text-xs text-[#64748B] line-clamp-2">{lesson.description}</p>
                    {lesson.liveUrl && (
                      <div className="text-xs text-sky-700 bg-sky-50 px-2.5 py-1.5 rounded-lg flex items-center justify-between">
                        <span>بث مباشر: {lesson.liveScheduleLabel || 'مجدول'}</span>
                        <a
                          href={lesson.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold inline-flex items-center gap-1 underline"
                        >
                          فتح <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {canManageLessons && (
                    <div className="flex items-center gap-2 pt-3 border-t border-[#E2E8F0]">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        icon={
                          lesson.published ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )
                        }
                        onClick={() => toggleLessonPublished(lesson.id)}
                      >
                        {lesson.published ? 'إخفاء عن الطلاب' : 'نشر للطلاب'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="حذف الدرس"
                        onClick={() => deleteLesson(lesson.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      ) : sectionTab === 'online_exams' ? (
        listStateMode === 'empty' || onlineExams.length === 0 ? (
          <EmptyState
            title="لا توجد امتحانات أونلاين بعد"
            description="أنشئ امتحانات اختيار من متعدد أو صح/خطأ مع تصحيح آلي فوري للطلاب."
            actionLabel={canManageExams ? 'إنشاء امتحان أونلاين' : undefined}
            onAction={canManageExams ? () => setExamDrawerOpen(true) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {onlineExams.map((exam) => {
              const grp = groupMap.get(exam.groupId);
              const attempts = examAttempts.filter((a) => a.examId === exam.id);
              const totalPoints = exam.questions.reduce((s, q) => s + q.points, 0);
              return (
                <Card key={exam.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusChip
                          tone={exam.published ? 'success' : 'neutral'}
                          label={exam.published ? 'متاح للطلاب' : 'مسودة'}
                        />
                        <span className="text-xs text-[#64748B] tabular-nums">
                          {exam.questions.length} سؤال · {exam.durationMinutes} دقيقة
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#0F2A4A] mt-2">{exam.title}</h3>
                      <p className="text-xs text-[#0F766E]">{grp?.name}</p>
                    </div>
                    <div className="text-left text-xs text-[#64748B] tabular-nums">
                      <div>الدرجة الكلية: {totalPoints}</div>
                      <div>النجاح من: {exam.passingScore}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
                    <span className="text-xs text-[#64748B] tabular-nums">
                      عدد المحاولات المكتملة: <strong>{formatNumber(attempts.length)}</strong>
                    </span>
                    {canManageExams && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleOnlineExamPublished(exam.id)}
                      >
                        {exam.published ? 'إلغاء النشر' : 'نشر الامتحان'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : listStateMode === 'empty' || assignments.length === 0 ? (
        <EmptyState
          title="لا توجد واجبات إلكترونية بعد"
          description="أنشئ واجبات للمجموعات ليقوم الطلاب بتسليمها وتصحيحها إلكترونياً."
          actionLabel={canManageAssignments ? 'إضافة واجب إلكتروني' : undefined}
          onAction={canManageAssignments ? () => setAssignmentDrawerOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-4">
          {assignments.map((assign) => {
            const grp = groupMap.get(assign.groupId);
            const subs = assignmentSubmissions.filter((s) => s.assignmentId === assign.id);
            return (
              <Card key={assign.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusChip
                        tone={assign.status === 'open' ? 'success' : 'neutral'}
                        label={assign.status === 'open' ? 'مفتوح للتسليم' : 'مغلق'}
                      />
                      <span className="text-xs text-[#64748B] tabular-nums">
                        آخر موعد: {formatDateDDMMYYYY(assign.dueDate)} · النهاية العظمى:{' '}
                        {assign.maxScore}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#0F2A4A] mt-2">{assign.title}</h3>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {grp?.name} — {assign.description}
                    </p>
                  </div>

                  {canManageAssignments && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggleAssignmentStatus(assign.id)}
                    >
                      {assign.status === 'open' ? 'إغلاق التسليم' : 'إعادة الفتح'}
                    </Button>
                  )}
                </div>

                <div className="border-t border-[#E2E8F0] pt-3">
                  <div className="text-xs font-bold text-[#0F2A4A] mb-2">
                    تسليمات الطلاب ({formatNumber(subs.length)})
                  </div>
                  {subs.length === 0 ? (
                    <p className="text-xs text-[#64748B]">لم يقم أي طالب بتسليم هذا الواجب بعد.</p>
                  ) : (
                    <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl overflow-hidden">
                      {subs.map((sub) => {
                        const st = studentMap.get(sub.studentId);
                        return (
                          <div
                            key={sub.id}
                            className="p-3 bg-white flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="text-sm font-bold text-[#0F2A4A]">
                                {st?.name || 'طالب'} ({st?.code})
                              </div>
                              <div className="text-xs text-[#475569]">{sub.answerText}</div>
                              <div className="text-[11px] text-[#64748B] tabular-nums">
                                سُلّم: {formatDateDDMMYYYY(sub.submittedAt)}
                                {sub.attachmentName ? ` · مرفق: ${sub.attachmentName}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {sub.status === 'graded' ? (
                                <StatusChip
                                  tone="success"
                                  label={`مُصحح: ${sub.score}/${assign.maxScore}`}
                                />
                              ) : (
                                <StatusChip tone="warning" label="بانتظار التصحيح" />
                              )}
                              {canGradeAssignments && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => {
                                    setGradingModalSub(sub);
                                    setGradeScoreInput(String(sub.score ?? assign.maxScore));
                                    setGradeFeedbackInput(sub.feedback || 'أحسنت، إجابة ممتازة');
                                  }}
                                >
                                  {sub.status === 'graded' ? 'تعديل الدرجة' : 'تصحيح ورصد'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Assessment Drawer */}
      <Drawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="إنشاء تقييم جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreate}>إنشاء وبدء رصد الدرجات</Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formErr && (
            <div className="p-3 rounded-[8px] bg-[#FEE2E2] text-[#991B1B] text-xs font-bold">
              {formErr}
            </div>
          )}
          <Field label="عنوان الامتحان / التقييم" htmlFor="as-title" required>
            <TextInput
              id="as-title"
              placeholder="مثال: امتحان الشهر الأول"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="النوع" htmlFor="as-type" required>
              <SelectInput
                id="as-type"
                value={type}
                onChange={(e) => setType(e.target.value as AssessmentType)}
              >
                <option value="امتحان">امتحان</option>
                <option value="كويز">كويز</option>
                <option value="واجب">واجب</option>
              </SelectInput>
            </Field>

            <Field label="النهاية العظمى" htmlFor="as-max" required>
              <TextInput
                id="as-max"
                type="number"
                min="5"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="tabular-nums font-bold"
              />
            </Field>
          </div>

          <Field label="المجموعة" htmlFor="as-group" required>
            <SelectInput
              id="as-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="تاريخ التقييم" htmlFor="as-date" required>
            <TextInput
              id="as-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tabular-nums"
            />
          </Field>
        </form>
      </Drawer>

      {/* Create Lesson Drawer */}
      <Drawer
        open={lessonDrawerOpen}
        onClose={() => setLessonDrawerOpen(false)}
        title="إضافة درس فيديو أو بث مباشر"
      >
        <form onSubmit={handleCreateLesson} className="space-y-4">
          <Field label="عنوان الدرس" required>
            <TextInput
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              placeholder="مثال: الدرس الثالث - أدوات الاستفهام والضمائر"
              required
            />
          </Field>
          <Field label="المجموعة المستهدفة" required>
            <SelectInput value={lessonGroupId} onChange={(e) => setLessonGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="وصف الدرس وما سيتعلمه الطالب">
            <textarea
              rows={3}
              value={lessonDesc}
              onChange={(e) => setLessonDesc(e.target.value)}
              className="w-full p-3 rounded-[8px] border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
            />
          </Field>
          <Field label="رابط الفيديو (YouTube / Vimeo / MP4 - اختياري)">
            <TextInput
              value={lessonVideoUrl}
              onChange={(e) => setLessonVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="رابط بث مباشر (Zoom/Meet)">
              <TextInput
                value={lessonLiveUrl}
                onChange={(e) => setLessonLiveUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </Field>
            <Field label="موعد البث المباشر">
              <TextInput
                value={lessonLiveSchedule}
                onChange={(e) => setLessonLiveSchedule(e.target.value)}
                placeholder="الجمعة 8 مساءً"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم المذكرة المرفقة">
              <TextInput
                value={lessonAttachment}
                onChange={(e) => setLessonAttachment(e.target.value)}
                placeholder="ملخص-الدرس-الثالث.pdf"
              />
            </Field>
            <Field label="المدة بالدقائق">
              <TextInput
                type="number"
                min="1"
                value={lessonDuration}
                onChange={(e) => setLessonDuration(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2A4A]">
            <input
              type="checkbox"
              checked={lessonPublished}
              onChange={(e) => setLessonPublished(e.target.checked)}
              className="w-4 h-4 accent-[#0F766E]"
            />
            <span>نشر الدرس فوراً للطلاب في منصة الطالب</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setLessonDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit">
              حفظ الدرس
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Create Online Exam Drawer */}
      <Drawer
        open={examDrawerOpen}
        onClose={() => setExamDrawerOpen(false)}
        title="إنشاء امتحان إلكتروني أونلاين"
        wide
      >
        <form onSubmit={handleCreateOnlineExam} className="space-y-4">
          <Field label="عنوان الامتحان" required>
            <TextInput
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="مثال: اختبار تفاعلي - الوحدة الثانية"
              required
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="المجموعة" required>
              <SelectInput value={examGroupId} onChange={(e) => setExamGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="المدة (دقيقة)">
              <TextInput
                type="number"
                min="5"
                value={examDuration}
                onChange={(e) => setExamDuration(e.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="درجة النجاح">
              <TextInput
                type="number"
                min="1"
                value={examPassingScore}
                onChange={(e) => setExamPassingScore(e.target.value)}
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="space-y-3 pt-2 border-t border-[#E2E8F0]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#0F2A4A]">
                الأسئلة ({examQuestions.length})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAddExamQuestion('mcq')}
                >
                  + سؤال اختيارات
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleAddExamQuestion('tf')}>
                  + سؤال صح/خطأ
                </Button>
              </div>
            </div>

            {examQuestions.map((q, qIdx) => (
              <div
                key={q.id}
                className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0F766E]">
                    السؤال {qIdx + 1} ({q.type === 'tf' ? 'صح / خطأ' : 'اختيار من متعدد'})
                  </span>
                  <div className="flex items-center gap-2">
                    <TextInput
                      type="number"
                      min="1"
                      value={q.points}
                      onChange={(e) =>
                        setExamQuestions((prev) =>
                          prev.map((item, idx) =>
                            idx === qIdx ? { ...item, points: Number(e.target.value) || 1 } : item
                          )
                        )
                      }
                      className="w-20 h-9 text-xs tabular-nums"
                      aria-label="درجة السؤال"
                    />
                    {examQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExamQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                        }
                        className="text-red-600 text-xs font-bold cursor-pointer"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>

                <TextInput
                  placeholder="نص السؤال..."
                  value={q.prompt}
                  onChange={(e) =>
                    setExamQuestions((prev) =>
                      prev.map((item, idx) =>
                        idx === qIdx ? { ...item, prompt: e.target.value } : item
                      )
                    )
                  }
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={q.correctIndex === oIdx}
                        onChange={() =>
                          setExamQuestions((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx ? { ...item, correctIndex: oIdx } : item
                            )
                          )
                        }
                        className="accent-[#0F766E]"
                      />
                      <TextInput
                        value={opt}
                        onChange={(e) =>
                          setExamQuestions((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx
                                ? {
                                    ...item,
                                    options: item.options.map((o, oi) =>
                                      oi === oIdx ? e.target.value : o
                                    ),
                                  }
                                : item
                            )
                          )
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2A4A]">
            <input
              type="checkbox"
              checked={examPublished}
              onChange={(e) => setExamPublished(e.target.checked)}
              className="w-4 h-4 accent-[#0F766E]"
            />
            <span>نشر الامتحان فوراً للطلاب</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setExamDrawerOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit">
              حفظ الامتحان الأونلاين
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Create Assignment Drawer */}
      <Drawer
        open={assignmentDrawerOpen}
        onClose={() => setAssignmentDrawerOpen(false)}
        title="إضافة واجب إلكتروني جديد"
      >
        <form onSubmit={handleCreateAssignment} className="space-y-4">
          <Field label="عنوان الواجب" required>
            <TextInput
              value={assignTitle}
              onChange={(e) => setAssignTitle(e.target.value)}
              placeholder="مثال: حل تمارين الوثيقة الأولى"
              required
            />
          </Field>
          <Field label="المجموعة" required>
            <SelectInput value={assignGroupId} onChange={(e) => setAssignGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="تعليمات وتفاصيل الواجب" required>
            <textarea
              rows={3}
              value={assignDesc}
              onChange={(e) => setAssignDesc(e.target.value)}
              className="w-full p-3 rounded-[8px] border border-[#E2E8F0] text-sm focus:outline-none focus:border-[#0F766E]"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="آخر موعد للتسليم" required>
              <TextInput
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
                required
              />
            </Field>
            <Field label="الدرجة القصوى" required>
              <TextInput
                type="number"
                min="1"
                value={assignMaxScore}
                onChange={(e) => setAssignMaxScore(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setAssignmentDrawerOpen(false)}
            >
              إلغاء
            </Button>
            <Button variant="primary" type="submit">
              نشر الواجب
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Grade Submission Modal */}
      <Modal
        open={Boolean(gradingModalSub)}
        onClose={() => setGradingModalSub(null)}
        title="تصحيح واجب الطالب ورصد الدرجة"
      >
        {gradingModalSub && (
          <form onSubmit={handleSubmitGrading} className="space-y-4">
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm">
              <div className="font-bold text-[#0F2A4A]">
                {studentMap.get(gradingModalSub.studentId)?.name || 'طالب'}
              </div>
              <p className="text-xs text-[#475569] mt-1">{gradingModalSub.answerText}</p>
            </div>
            <Field label="الدرجة المستحقة" required>
              <TextInput
                type="number"
                min="0"
                value={gradeScoreInput}
                onChange={(e) => setGradeScoreInput(e.target.value)}
                className="tabular-nums"
                required
              />
            </Field>
            <Field label="ملاحظة وتوجيه للطالب">
              <TextInput
                value={gradeFeedbackInput}
                onChange={(e) => setGradeFeedbackInput(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setGradingModalSub(null)}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit">
                اعتماد الدرجة ومنح نقاط التحفيز
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

