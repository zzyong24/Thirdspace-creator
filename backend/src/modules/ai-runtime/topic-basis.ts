const TOPIC_BASES = new Set(["positioning", "comments", "knowledge", "trend"]);
type Basis = "positioning" | "comments" | "knowledge" | "trend";
export function normalizeTopicTaskBasis(raw: unknown): Basis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as Basis)
    : "positioning";
}

