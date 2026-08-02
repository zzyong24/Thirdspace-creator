import "server-only";

import lesson01 from "../../../public/courses/xuehui-ip-practical-course/lessons/01.json";
import lesson02 from "../../../public/courses/xuehui-ip-practical-course/lessons/02.json";
import lesson03 from "../../../public/courses/xuehui-ip-practical-course/lessons/03.json";
import lesson04 from "../../../public/courses/xuehui-ip-practical-course/lessons/04.json";
import lesson05 from "../../../public/courses/xuehui-ip-practical-course/lessons/05.json";
import lesson06 from "../../../public/courses/xuehui-ip-practical-course/lessons/06.json";
import lesson07 from "../../../public/courses/xuehui-ip-practical-course/lessons/07.json";
import lesson08 from "../../../public/courses/xuehui-ip-practical-course/lessons/08.json";
import lesson09 from "../../../public/courses/xuehui-ip-practical-course/lessons/09.json";
import lesson10 from "../../../public/courses/xuehui-ip-practical-course/lessons/10.json";
import lesson11 from "../../../public/courses/xuehui-ip-practical-course/lessons/11.json";
import lesson12 from "../../../public/courses/xuehui-ip-practical-course/lessons/12.json";
import lesson13 from "../../../public/courses/xuehui-ip-practical-course/lessons/13.json";
import lesson14 from "../../../public/courses/xuehui-ip-practical-course/lessons/14.json";
import lesson15 from "../../../public/courses/xuehui-ip-practical-course/lessons/15.json";
import lesson16 from "../../../public/courses/xuehui-ip-practical-course/lessons/16.json";
import lesson17 from "../../../public/courses/xuehui-ip-practical-course/lessons/17.json";
import lesson18 from "../../../public/courses/xuehui-ip-practical-course/lessons/18.json";
import lesson19 from "../../../public/courses/xuehui-ip-practical-course/lessons/19.json";
import lesson20 from "../../../public/courses/xuehui-ip-practical-course/lessons/20.json";
import lesson21 from "../../../public/courses/xuehui-ip-practical-course/lessons/21.json";
import lesson22 from "../../../public/courses/xuehui-ip-practical-course/lessons/22.json";

import { parseLessonPoints, type LessonPoint } from "./knowledge-lesson-content";
import {
  BUILT_IN_IP_COURSE,
  findBuiltInCourseLesson,
  type BuiltInCourseLessonMeta,
} from "./built-in-ip-course";

interface LessonAsset {
  readonly raw: string;
}

const LESSON_ASSETS: ReadonlyArray<LessonAsset> = [
  lesson01,
  lesson02,
  lesson03,
  lesson04,
  lesson05,
  lesson06,
  lesson07,
  lesson08,
  lesson09,
  lesson10,
  lesson11,
  lesson12,
  lesson13,
  lesson14,
  lesson15,
  lesson16,
  lesson17,
  lesson18,
  lesson19,
  lesson20,
  lesson21,
  lesson22,
];

export interface BuiltInCourseLesson {
  readonly meta: BuiltInCourseLessonMeta;
  readonly raw: string;
  readonly points: ReadonlyArray<LessonPoint>;
}

export function getBuiltInCourseLessonRaw(lessonNumber: number): string | null {
  return LESSON_ASSETS[lessonNumber - 1]?.raw ?? null;
}

export function getAllBuiltInCourseLessons(): ReadonlyArray<BuiltInCourseLesson> {
  return BUILT_IN_IP_COURSE.lessons.flatMap((meta) => {
    const raw = getBuiltInCourseLessonRaw(meta.number);
    const points = raw ? parseLessonPoints(raw) : null;
    return raw && points ? [{ meta, raw, points }] : [];
  });
}

export function getBuiltInCourseLesson(
  lessonId: string | null | undefined,
): BuiltInCourseLesson | null {
  const meta = findBuiltInCourseLesson(lessonId);
  if (!meta) return null;
  const raw = getBuiltInCourseLessonRaw(meta.number);
  if (!raw) return null;
  const points = parseLessonPoints(raw);
  return points ? { meta, raw, points } : null;
}

