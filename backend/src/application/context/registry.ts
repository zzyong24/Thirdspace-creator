import type {ContextDeps as CreativeContextDeps} from "../../modules/ai-runtime";
export function resolveContextDeps(
  requirements: readonly string[] | undefined,
  registry: Partial<CreativeContextDeps>,
): Partial<CreativeContextDeps> {
  const deps: Partial<CreativeContextDeps> = {};
  const reg = registry as Record<string, unknown>;
  const out = deps as Record<string, unknown>;
  for (const key of requirements ?? []) {
    const reader = reg[key];
    if (reader !== undefined) out[key] = reader;
  }
  return deps;
}
