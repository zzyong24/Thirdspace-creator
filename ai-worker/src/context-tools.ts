import type {
  AiTaskReferenceRecord,
  CapturedCandidate,
  ContextTools,
  DomainReadPort,
  ToolInvocation,
  ToolSpec,
} from "./ports";

const SERVER = "creatoros";

export interface ContextToolsInput {
  read: DomainReadPort;
  references: AiTaskReferenceRecord[];
}

export function createContextTools(input: ContextToolsInput): ContextTools {
  const { read, references } = input;
  const audit: ToolInvocation[] = [];
  let captured: CapturedCandidate | null = null;

  const inScope = (entityType: string, entityId: string) =>
    references.some((r) => r.entityType === entityType && r.entityId === entityId);

  const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

  const text = (value: unknown) => JSON.stringify(value);

  const toolSpecs: ToolSpec[] = [
    {
      name: "get_current_artifact_version",
      description:
        "Read the current version body of an artifact in this task's scope. Call before rewriting.",
      inputSchema: { artifactId: "string" },
      async handler(args) {
        const artifactId = String(args.artifactId ?? "");
        if (!inScope("artifact", artifactId)) {
          audit.push({ tool: "get_current_artifact_version", ok: false });
          return err(`artifact ${artifactId} is not in this task's references`);
        }
        const version = await read.getCurrentArtifactVersion(artifactId);
        audit.push({ tool: "get_current_artifact_version", ok: true });
        if (!version) return err(`no current version for ${artifactId}`);
        return ok(text(version));
      },
    },
    {
      name: "list_knowledge_items",
      description: "Read knowledge items referenced by this task for context.",
      inputSchema: { ids: "string[]" },
      async handler(args) {
        const requested = Array.isArray(args.ids) ? (args.ids as string[]).map(String) : [];
        const allowed = requested.filter((id) => inScope("knowledge_item", id));
        const items = await read.listKnowledgeItems(allowed);
        audit.push({ tool: "list_knowledge_items", ok: true });
        return ok(text(items));
      },
    },
    {
      name: "submit_candidate",
      description:
        "Submit your proposed result as a CANDIDATE. This is the only way to finish. " +
        "Provide resultType (e.g. 'artifact_version') and resultData. The result is NOT applied " +
        "until a human confirms it.",
      inputSchema: { resultType: "string", resultData: "object" },
      async handler(args) {
        captured = {
          resultType: String(args.resultType ?? ""),
          resultData: (args.resultData ?? {}) as Record<string, unknown>,
        };
        audit.push({ tool: "submit_candidate", ok: true });
        return ok("candidate recorded; awaiting human confirmation");
      },
    },
  ];

  return {
    toolSpecs,
    allowedTools: toolSpecs.map((t) => `mcp__${SERVER}__${t.name}`),
    submitCandidate(value) {
      captured = value;
      audit.push({ tool: "submit_candidate", ok: true });
    },
    getCaptured() {
      return captured;
    },
    getAudit() {
      return audit;
    },
  };
}

export const CONTEXT_SERVER_NAME = SERVER;
