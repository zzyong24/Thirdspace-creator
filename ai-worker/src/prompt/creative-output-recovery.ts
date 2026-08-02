import type { z } from "zod";

type MutableRecord = Record<string, unknown>;

function recordOf(value: unknown): MutableRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MutableRecord)
    : null;
}

function cloneJson(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function parentAtPath(
  root: unknown,
  path: readonly PropertyKey[],
): { parent: MutableRecord | unknown[]; key: PropertyKey } | null {
  if (path.length === 0) return null;
  let current: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (
      !current ||
      typeof current !== "object" ||
      !(key in (current as MutableRecord))
    ) {
      return null;
    }
    current = (current as MutableRecord)[key as string];
  }
  if (!current || typeof current !== "object") return null;
  return {
    parent: current as MutableRecord | unknown[],
    key: path[path.length - 1]!,
  };
}

function removeInvalidValue(root: unknown, path: readonly PropertyKey[]): boolean {
  const target = parentAtPath(root, path);
  if (!target) return false;
  if (Array.isArray(target.parent) && typeof target.key === "number") {
    if (target.key < 0 || target.key >= target.parent.length) return false;
    target.parent.splice(target.key, 1);
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(target.parent, target.key)) {
    delete (target.parent as MutableRecord)[target.key as string];
    return true;
  }
  return false;
}

function removeContainingArrayItem(
  root: unknown,
  path: readonly PropertyKey[],
): boolean {
  const numericIndex = path.findIndex((key) => typeof key === "number");
  if (numericIndex < 0) return false;
  return removeInvalidValue(root, path.slice(0, numericIndex + 1));
}

/**
 * 创作候选的局部恢复：只删除 schema 已明确判坏的字段/数组项，让 Zod 自己的 default
 * 接管非关键字段。缺失的关键内容不会被补造；删完仍不满足 schema 时，调用方照常失败。
 */
export function recoverCreativeZodOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
): unknown {
  let candidate = cloneJson(value);
  for (let round = 0; round < 24; round += 1) {
    const result = schema.safeParse(candidate);
    if (result.success) return result.data;

    let changed = false;
    // 先删深层/高下标，避免数组 splice 后后续路径错位。
    const issues = [...result.error.issues].sort((left, right) => {
      const leftIndex = left.path.find((key) => typeof key === "number");
      const rightIndex = right.path.find((key) => typeof key === "number");
      return Number(rightIndex ?? -1) - Number(leftIndex ?? -1);
    });
    for (const issue of issues) {
      const path = issue.path as PropertyKey[];
      if (path.length === 0) continue;
      if (removeInvalidValue(candidate, path)) {
        changed = true;
        continue;
      }
      // 数组项缺必填字段时，字段本身不存在；丢掉这一条候选，不能拖垮整批。
      if (removeContainingArrayItem(candidate, path)) changed = true;
    }
    if (!changed) break;
  }
  return candidate;
}

/** 原 schema 仍是最终裁判；这个列表只声明哪些 skill 属于“用户可编辑的创作候选”。 */
export type OutputRecoveryMode = "strict" | "creative-partial";

/** 提供商常见协议包装；仅作为候选逐个交回原 schema 校验，不会绕过业务契约。 */
export function structuredProtocolCandidates(value: unknown): unknown[] {
  const candidates: unknown[] = [];
  const seen = new Set<unknown>();
  const wrapperKeys = ["result", "data", "output", "response", "content"];
  const visit = (current: unknown, depth: number) => {
    if (depth > 6 || seen.has(current)) return;
    seen.add(current);
    const record = recordOf(current);
    if (!record) {
      candidates.push(current);
      return;
    }
    const known = wrapperKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
      .map((key) => record[key]);
    const nested = known.length > 0
      ? known
      : Object.keys(record).length === 1
        ? Object.values(record)
        : [];
    for (const item of nested.slice(0, 6)) {
      let parsed = item;
      if (typeof item === "string") {
        try {
          parsed = JSON.parse(item);
        } catch {
          continue;
        }
      }
      if (parsed && typeof parsed === "object") visit(parsed, depth + 1);
    }
    // 包装层从最内层向外层尝试，防止带 default 的 schema 把外层误判成“合法空对象”。
    candidates.push(current);
  };
  visit(value, 0);
  return candidates;
}
