#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const DEFAULT_ASSET_ROOT = resolve(
  import.meta.dirname,
  "../public/courses/xuehui-ip-practical-course",
);

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fail(message) {
  throw new Error(`[built-in-course] ${message}`);
}

export function verifyBuiltInCourse(assetRoot = DEFAULT_ASSET_ROOT) {
  const root = resolve(assetRoot);
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) fail(`缺少 manifest: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== "creatoros-built-in-course/v1") {
    fail(`schemaVersion 不支持: ${manifest.schemaVersion ?? "<空>"}`);
  }
  const lessons = Array.isArray(manifest.lessons) ? manifest.lessons : [];
  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  if (modules.length !== 6) fail(`模块数应为 6，实际 ${modules.length}`);
  if (lessons.length !== 22) fail(`课时数应为 22，实际 ${lessons.length}`);

  let knowledgePointCount = 0;
  const packageLines = [];
  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index];
    const expectedNumber = index + 1;
    if (lesson.number !== expectedNumber) {
      fail(`课时顺序断裂: index=${index} number=${lesson.number}`);
    }
    const assetPath = join(root, lesson.asset ?? "");
    if (!existsSync(assetPath)) fail(`缺少课时资产: ${lesson.asset}`);
    const payload = JSON.parse(readFileSync(assetPath, "utf8"));
    const raw = typeof payload.raw === "string" ? payload.raw : "";
    if (raw.trim().length === 0) fail(`第 ${lesson.number} 课正文为空`);
    const actualHash = sha256(raw);
    if (actualHash !== lesson.contentHash) {
      fail(`第 ${lesson.number} 课 checksum 不一致: ${actualHash} != ${lesson.contentHash}`);
    }
    const actualPoints = [...raw.matchAll(/^\- id:\s*KP-/gm)].length;
    if (actualPoints !== lesson.knowledgePointCount) {
      fail(`第 ${lesson.number} 课知识点数不一致: ${actualPoints} != ${lesson.knowledgePointCount}`);
    }
    knowledgePointCount += actualPoints;
    packageLines.push(`${String(lesson.number).padStart(2, "0")}.md:${actualHash}`);
  }
  if (knowledgePointCount !== 119) {
    fail(`知识点总数应为 119，实际 ${knowledgePointCount}`);
  }
  const packageHash = sha256(`${packageLines.join("\n")}\n`);
  if (packageHash !== manifest.source?.packageSha256) {
    fail(`课程包组合 checksum 不一致: ${packageHash} != ${manifest.source?.packageSha256 ?? "<空>"}`);
  }
  return {
    assetRoot: root,
    courseId: manifest.courseId,
    version: manifest.version,
    moduleCount: modules.length,
    lessonCount: lessons.length,
    knowledgePointCount,
    packageSha256: packageHash,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = verifyBuiltInCourse(arg("--asset-root") ?? DEFAULT_ASSET_ROOT);
  console.log(`[built-in-course] PASS ${JSON.stringify(result)}`);
}

