"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  NotebookPen,
  Route,
  Sparkles,
  Target,
} from "lucide-react";

import {
  BUILT_IN_IP_COURSE,
  type BuiltInCourseLessonMeta,
} from "./built-in-ip-course";
import type { BuiltInCourseLesson } from "./built-in-ip-course.server";

const PROGRESS_KEY = `${BUILT_IN_IP_COURSE.courseId}:${BUILT_IN_IP_COURSE.version}:progress`;

interface CourseProgress {
  readonly completedLessonIds: ReadonlyArray<string>;
  readonly lastLessonId: string | null;
  readonly currentPointByLesson: Readonly<Record<string, number>>;
}

const EMPTY_PROGRESS: CourseProgress = {
  completedLessonIds: [],
  lastLessonId: null,
  currentPointByLesson: {},
};

function parseProgress(raw: string | null): CourseProgress {
  try {
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<CourseProgress>;
    const knownIds = new Set(BUILT_IN_IP_COURSE.lessons.map((lesson) => lesson.id));
    const completedLessonIds = Array.isArray(parsed.completedLessonIds)
      ? parsed.completedLessonIds.filter(
          (id): id is string => typeof id === "string" && knownIds.has(id),
        )
      : [];
    const lastLessonId =
      typeof parsed.lastLessonId === "string" && knownIds.has(parsed.lastLessonId)
        ? parsed.lastLessonId
        : null;
    const currentPointByLesson =
      typeof parsed.currentPointByLesson === "object" &&
      parsed.currentPointByLesson !== null
        ? Object.fromEntries(
            Object.entries(parsed.currentPointByLesson).filter(
              ([lessonId, index]) =>
                knownIds.has(lessonId) &&
                typeof index === "number" &&
                Number.isInteger(index) &&
                index >= 0,
            ),
          )
        : {};
    return { completedLessonIds, lastLessonId, currentPointByLesson };
  } catch {
    return EMPTY_PROGRESS;
  }
}

const PROGRESS_EVENT = "creatoros:built-in-course-progress";

function getProgressSnapshot(): string {
  return window.localStorage.getItem(PROGRESS_KEY) ?? "";
}

function subscribeProgress(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === PROGRESS_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PROGRESS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PROGRESS_EVENT, onStoreChange);
  };
}

function lessonHref(lessonId: string): string {
  return `/knowledge?view=course&lesson=${encodeURIComponent(lessonId)}`;
}

function moduleLessons(moduleId: string): ReadonlyArray<BuiltInCourseLessonMeta> {
  return BUILT_IN_IP_COURSE.lessons.filter((lesson) => lesson.moduleId === moduleId);
}

export interface KnowledgeCourseReaderProps {
  readonly lesson: BuiltInCourseLesson | null;
}

export function KnowledgeCourseReader({ lesson }: KnowledgeCourseReaderProps) {
  const progressSnapshot = useSyncExternalStore(
    subscribeProgress,
    getProgressSnapshot,
    () => "",
  );
  const progress = useMemo(
    () => parseProgress(progressSnapshot),
    [progressSnapshot],
  );

  const completed = useMemo(
    () => new Set(progress.completedLessonIds),
    [progress.completedLessonIds],
  );

  const mutateProgress = useCallback(
    (transform: (previous: CourseProgress) => CourseProgress): void => {
      const next = transform(parseProgress(getProgressSnapshot()));
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(PROGRESS_EVENT));
    },
    [],
  );

  const markComplete = (lessonId: string): void => {
    mutateProgress((previous) => {
      const nextCompleted = new Set(previous.completedLessonIds);
      nextCompleted.add(lessonId);
      return {
        ...previous,
        completedLessonIds: [...nextCompleted],
        lastLessonId: lessonId,
      };
    });
  };

  useEffect(() => {
    if (!lesson) return;
    mutateProgress((previous) =>
      previous.lastLessonId === lesson.meta.id
        ? previous
        : { ...previous, lastLessonId: lesson.meta.id },
    );
  }, [lesson, mutateProgress]);

  if (!lesson) {
    return (
      <CourseHome
        completed={completed}
        lastLessonId={progress.lastLessonId}
      />
    );
  }

  return (
    <CourseLesson
      lesson={lesson}
      completed={completed}
      onComplete={markComplete}
      activePointIndex={progress.currentPointByLesson[lesson.meta.id] ?? 0}
      onPointChange={(index) =>
        mutateProgress((previous) => ({
          ...previous,
          lastLessonId: lesson.meta.id,
          currentPointByLesson: {
            ...previous.currentPointByLesson,
            [lesson.meta.id]: index,
          },
        }))
      }
    />
  );
}

function CourseHome({
  completed,
  lastLessonId,
}: {
  readonly completed: ReadonlySet<string>;
  readonly lastLessonId: string | null;
}) {
  const completedCount = completed.size;
  const percent = Math.round(
    (completedCount / BUILT_IN_IP_COURSE.stats.lessonCount) * 100,
  );
  const nextLessonId =
    lastLessonId ??
    BUILT_IN_IP_COURSE.lessons.find((lesson) => !completed.has(lesson.id))?.id ??
    BUILT_IN_IP_COURSE.lessons[0]!.id;

  return (
    <div className="space-y-8" data-slot="built-in-course-home">
      <section className="overflow-hidden rounded-[28px] border border-stone-200 bg-[#171A17] text-white shadow-[0_18px_50px_rgba(27,31,25,0.12)]">
        <div className="grid gap-10 px-6 py-9 md:px-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-14 lg:py-14">
          <div className="max-w-3xl">
            <div className="mb-8 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-[#B8D8B9]">
              <span className="grid size-9 place-items-center rounded-full border border-[#B8D8B9]/35 bg-[#B8D8B9]/10">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              内置课程
            </div>
            <h1 className="max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
              {BUILT_IN_IP_COURSE.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-stone-300 sm:text-lg">
              {BUILT_IN_IP_COURSE.description} 不从术语开始，而是沿着一次真实创作的顺序，把定位、选题、脚本、表现和变现串成一条路。
            </p>
            <p className="mt-3 text-sm text-stone-500">{BUILT_IN_IP_COURSE.subtitle}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={lessonHref(nextLessonId)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#D9F99D] px-5 text-sm font-semibold text-[#172014] transition hover:bg-[#E7FFB8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9F99D]"
              >
                {completedCount > 0 ? "继续学习" : "从第一课开始"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm text-stone-300">
                <Clock3 className="size-4" aria-hidden="true" />
                适合边做边学
              </span>
            </div>
          </div>

          <aside className="self-end rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-stone-400">你的进度</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">{percent}%</p>
              </div>
              <p className="text-sm text-stone-400">
                {completedCount}/{BUILT_IN_IP_COURSE.stats.lessonCount} 节
              </p>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#D9F99D] transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-center">
              <div>
                <dt className="text-xl font-semibold">{BUILT_IN_IP_COURSE.stats.moduleCount}</dt>
                <dd className="mt-1 text-xs text-stone-400">模块</dd>
              </div>
              <div>
                <dt className="text-xl font-semibold">{BUILT_IN_IP_COURSE.stats.lessonCount}</dt>
                <dd className="mt-1 text-xs text-stone-400">课程</dd>
              </div>
              <div>
                <dt className="text-xl font-semibold">{BUILT_IN_IP_COURSE.stats.knowledgePointCount}</dt>
                <dd className="mt-1 text-xs text-stone-400">知识点</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-stone-400" data-slot="built-in-course-attribution">
        课程说明：{BUILT_IN_IP_COURSE.source.attribution}
      </p>

      <section aria-labelledby="course-roadmap-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700">学习路径</p>
            <h2 id="course-roadmap-title" className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
              沿着一条作品的诞生顺序学习
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-500">
            每节课拆成可阅读、可回答、可练习的知识点。课程完成状态只保存在本机，不会修改你的个人知识。
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {BUILT_IN_IP_COURSE.modules.map((module, moduleIndex) => {
            const lessons = moduleLessons(module.id);
            const done = lessons.filter((item) => completed.has(item.id)).length;
            return (
              <article key={module.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_8px_30px_rgba(28,25,23,0.045)] sm:p-6">
                <div className="flex gap-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#EEF4E8] text-sm font-bold text-emerald-800">
                    {String(moduleIndex + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold text-stone-900">{module.title}</h3>
                      <span className="text-xs text-stone-500">{done}/{lessons.length} 节完成</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">{module.knowledgePointCount} 个知识点</p>
                  </div>
                </div>
                <ol className="mt-5 space-y-1 border-t border-stone-100 pt-3">
                  {lessons.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={lessonHref(item.id)}
                        className="group flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                      >
                        {completed.has(item.id) ? (
                          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="已完成" />
                        ) : (
                          <Circle className="size-5 shrink-0 text-stone-300" aria-label="未完成" />
                        )}
                        <span className="min-w-0 flex-1 text-sm leading-5 text-stone-700 group-hover:text-stone-950">
                          <span className="mr-2 font-medium text-stone-400">{item.number}.</span>
                          {item.title}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-600" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CourseLesson({
  lesson,
  completed,
  onComplete,
  activePointIndex: requestedPointIndex,
  onPointChange,
}: {
  readonly lesson: BuiltInCourseLesson;
  readonly completed: ReadonlySet<string>;
  readonly onComplete: (lessonId: string) => void;
  readonly activePointIndex: number;
  readonly onPointChange: (index: number) => void;
}) {
  const activePointIndex = Math.min(
    Math.max(0, requestedPointIndex),
    Math.max(0, lesson.points.length - 1),
  );
  const allLessons = BUILT_IN_IP_COURSE.lessons;
  const lessonIndex = allLessons.findIndex((item) => item.id === lesson.meta.id);
  const previous = lessonIndex > 0 ? allLessons[lessonIndex - 1] : null;
  const next = lessonIndex < allLessons.length - 1 ? allLessons[lessonIndex + 1] : null;
  const activePoint = lesson.points[activePointIndex] ?? lesson.points[0];
  const isComplete = completed.has(lesson.meta.id);

  return (
    <div className="space-y-5" data-slot="built-in-course-lesson">
      <header className="rounded-3xl border border-stone-200 bg-white px-5 py-6 shadow-[0_8px_30px_rgba(28,25,23,0.045)] sm:px-7">
        <Link href="/knowledge?view=course" className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900">
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回课程目录
        </Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-emerald-700">
              <span>{lesson.meta.module}</span>
              <span className="text-stone-300">/</span>
              <span>第 {lesson.meta.number} 节</span>
            </div>
            <h1 className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] text-stone-950 sm:text-3xl">
              {lesson.meta.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              本节包含 {lesson.points.length} 个知识点。先读懂核心，再展开案例和易错点，最后用问题与练习检验自己。
            </p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#F3F7EF] px-4 py-3">
                <dt className="text-xs font-semibold tracking-[0.08em] text-emerald-700">学完你会</dt>
                <dd className="mt-1.5 text-sm leading-6 text-emerald-950">{lesson.meta.learningGoal}</dd>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <dt className="text-xs font-semibold tracking-[0.08em] text-stone-500">这一节要交付</dt>
                <dd className="mt-1.5 text-sm leading-6 text-stone-800">{lesson.meta.deliverable}</dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={() => onComplete(lesson.meta.id)}
            disabled={isComplete}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#172014] px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 disabled:cursor-default disabled:bg-emerald-50 disabled:text-emerald-700"
          >
            {isComplete ? <Check className="size-4" aria-hidden="true" /> : <ListChecks className="size-4" aria-hidden="true" />}
            {isComplete ? "本节已完成" : "标记本节完成"}
          </button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="rounded-3xl border border-stone-200 bg-white p-3 xl:sticky xl:top-5" aria-label="本节知识点">
          <div className="px-3 pb-2 pt-2 text-xs font-semibold tracking-[0.14em] text-stone-400">本节目录</div>
          <nav className="space-y-1">
            {lesson.points.map((point, index) => (
              <button
                key={point.id ?? `${lesson.meta.id}-${index}`}
                type="button"
                onClick={() => {
                  onPointChange(index);
                }}
                aria-current={index === activePointIndex ? "step" : undefined}
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left text-sm leading-5 transition ${
                  index === activePointIndex
                    ? "bg-[#EEF4E8] font-medium text-emerald-950"
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${index === activePointIndex ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-500"}`}>
                  {index + 1}
                </span>
                <span>{point.title ?? `知识点 ${index + 1}`}</span>
              </button>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_8px_30px_rgba(28,25,23,0.045)] sm:p-8">
          {activePoint ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">知识点 {activePointIndex + 1}/{lesson.points.length}</span>
                {activePoint.difficulty ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{activePoint.difficulty}</span> : null}
              </div>
              <h2 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.02em] text-stone-950">{activePoint.title}</h2>
              {activePoint.oneLine ? (
                <div className="mt-6 rounded-2xl border-l-4 border-emerald-600 bg-[#F3F7EF] px-5 py-4 text-base font-medium leading-7 text-emerald-950">
                  {activePoint.oneLine}
                </div>
              ) : null}
              {activePoint.core ? <ReadableText title="核心方法" icon={<BookOpen className="size-5" />} content={activePoint.core} /> : null}
              {activePoint.examples ? <Disclosure title="案例拆解" icon={<Lightbulb className="size-5" />} content={activePoint.examples} /> : null}
              {activePoint.misconceptions ? <Disclosure title="常见误区" icon={<Target className="size-5" />} content={activePoint.misconceptions} tone="warning" /> : null}
            </>
          ) : null}
        </article>

        <aside className="space-y-4 lg:col-start-2 xl:col-start-auto xl:sticky xl:top-5">
          {activePoint?.socratic.length ? (
            <section className="rounded-3xl border border-stone-200 bg-[#FCFBF7] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <MessageCircleQuestion className="size-5 text-emerald-700" aria-hidden="true" />
                先自测，再看提示
              </div>
              <div className="mt-4 space-y-3">
                {activePoint.socratic.map((question, index) => (
                  <details key={`${question.q}-${index}`} className="group rounded-2xl border border-stone-200 bg-white p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium leading-6 text-stone-800 marker:hidden">
                      Q{index + 1}. {question.q}
                    </summary>
                    <div className="mt-3 border-t border-stone-100 pt-3 text-sm leading-6 text-stone-600">
                      {question.hint ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">提示：{question.hint}</p> : null}
                      {question.keyPoints.length ? (
                        <ul className="mt-3 space-y-1.5">
                          {question.keyPoints.map((point) => <li key={point} className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-emerald-600" />{point}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {activePoint?.practiceTask ? (
            <section className="rounded-3xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <NotebookPen className="size-5 text-emerald-700" aria-hidden="true" />
                现在就做
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{activePoint.practiceTask}</p>
            </section>
          ) : null}

          {activePoint && Object.values(activePoint.rubric).some(Boolean) ? (
            <section className="rounded-3xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Route className="size-5 text-emerald-700" aria-hidden="true" />
                掌握标准
              </div>
              <div className="mt-4 space-y-3">
                <RubricRow score="60" label="懂了" text={activePoint.rubric.grade60} />
                <RubricRow score="80" label="做了" text={activePoint.rubric.grade80} />
                <RubricRow score="95" label="精通" text={activePoint.rubric.grade95} />
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200 bg-white p-4">
        {previous ? <Link href={lessonHref(previous.id)} className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-stone-600 hover:bg-stone-100"><ArrowLeft className="size-4" />上一节</Link> : <span />}
        {next ? <Link href={lessonHref(next.id)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800">下一节<ArrowRight className="size-4" /></Link> : <Link href="/knowledge?view=course" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-700 px-4 text-sm font-medium text-white">完成课程<Check className="size-4" /></Link>}
      </footer>
    </div>
  );
}

function ReadableText({ title, icon, content }: { readonly title: string; readonly icon: ReactNode; readonly content: string }) {
  return (
    <section className="mt-8">
      <h3 className="flex items-center gap-2 text-base font-semibold text-stone-900">{icon}{title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-stone-700">{content}</p>
    </section>
  );
}

function Disclosure({ title, icon, content, tone = "neutral" }: { readonly title: string; readonly icon: ReactNode; readonly content: string; readonly tone?: "neutral" | "warning" }) {
  return (
    <details className={`group mt-6 rounded-2xl border p-5 ${tone === "warning" ? "border-amber-200 bg-amber-50/60" : "border-stone-200 bg-stone-50/60"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-stone-900 marker:hidden">{icon}{title}<ChevronRight className="ml-auto size-4 transition group-open:rotate-90" /></summary>
      <p className="mt-4 whitespace-pre-wrap border-t border-current/10 pt-4 text-sm leading-7 text-stone-700">{content}</p>
    </details>
  );
}

function RubricRow({ score, label, text }: { readonly score: string; readonly label: string; readonly text?: string }) {
  if (!text) return null;
  return <div className="grid grid-cols-[44px_1fr] gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#EEF4E8] text-sm font-bold text-emerald-800">{score}</span><div><p className="text-xs font-semibold text-stone-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-600">{text}</p></div></div>;
}
