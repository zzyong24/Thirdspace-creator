import manifestJson from "../../../public/courses/xuehui-ip-practical-course/manifest.json";

export interface BuiltInCourseLessonMeta {
  readonly id: string;
  readonly number: number;
  readonly moduleId: string;
  readonly module: string;
  readonly title: string;
  readonly knowledgePointCount: number;
  readonly knowledgePointTitles: ReadonlyArray<string>;
  readonly learningGoal: string;
  readonly deliverable: string;
  readonly contentHash: string;
  readonly asset: string;
}

export interface BuiltInCourseModuleMeta {
  readonly id: string;
  readonly title: string;
  readonly lessonIds: ReadonlyArray<string>;
  readonly knowledgePointCount: number;
}

export interface BuiltInCourseManifest {
  readonly schemaVersion: "creatoros-built-in-course/v1";
  readonly courseId: string;
  readonly version: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly source: {
    readonly name: string;
    readonly skillInstructionSha256: string;
    readonly indexSha256: string;
    readonly packageSha256: string;
    readonly originalPackageSha256: string;
    readonly editorialVersion: string;
    readonly attribution: string;
    readonly editorialSources: ReadonlyArray<string>;
  };
  readonly stats: {
    readonly moduleCount: number;
    readonly lessonCount: number;
    readonly knowledgePointCount: number;
  };
  readonly modules: ReadonlyArray<BuiltInCourseModuleMeta>;
  readonly lessons: ReadonlyArray<BuiltInCourseLessonMeta>;
}

export const BUILT_IN_IP_COURSE = manifestJson as BuiltInCourseManifest;

export function normalizeBuiltInLessonId(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const match = /^(?:lesson-)?(\d{1,2})$/.exec(raw);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 22) return null;
  return `lesson-${String(number).padStart(2, "0")}`;
}

export function findBuiltInCourseLesson(
  lessonId: string | null | undefined,
): BuiltInCourseLessonMeta | null {
  const normalized = normalizeBuiltInLessonId(lessonId);
  if (!normalized) return null;
  return BUILT_IN_IP_COURSE.lessons.find((lesson) => lesson.id === normalized) ?? null;
}
