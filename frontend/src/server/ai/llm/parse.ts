import "server-only";

// Robustly pull a JSON value (object OR array) out of model text: strip ``` fences /
// leading prose / trailing notes, then slice the outermost {...} or [...] and JSON.parse.
// Returns undefined when nothing parses — callers fall back to their own handling.
export function parseJsonLoose(text: string): unknown {
  if (!text) return undefined;
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const candidates: Array<[number, number]> = [];
  const obj: [number, number] = [body.indexOf("{"), body.lastIndexOf("}")];
  const arr: [number, number] = [body.indexOf("["), body.lastIndexOf("]")];
  if (obj[0] !== -1 && obj[1] > obj[0]) candidates.push(obj);
  if (arr[0] !== -1 && arr[1] > arr[0]) candidates.push(arr);
  // Prefer whichever delimiter appears first in the text.
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [start, end] of candidates) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      /* try next */
    }
  }
  return undefined;
}

// Concatenate the `text` blocks of an Anthropic Messages response (ignore tool_use etc).
export function extractText(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        !!b &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("");
}

// Compose the system prompt: caller system + (when a schema is requested) a terse
// "JSON only" instruction. We DON'T rely on provider-native structured output — many
// OpenAI/Anthropic-compatible endpoints (e.g. MiniMax) don't support strict mode.
export function buildSystem(
  system: string | undefined,
  schema: unknown | undefined,
): string | undefined {
  const parts: string[] = [];
  if (system && system.trim()) parts.push(system.trim());
  if (schema !== undefined) {
    parts.push("只输出符合所需结构的 JSON,不要解释、不要代码块包裹。");
  }
  return parts.length ? parts.join("\n\n") : undefined;
}
