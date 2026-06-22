import { z } from "zod";

const artifactVersionData = z.object({
  artifactId: z.string().min(1),
  body: z.string().min(1),
  summary: z.string().default(""),
});

const advisoryData = z.object({
  message: z.string().min(1),
});

const CANDIDATE_SCHEMAS = {
  artifact_version: artifactVersionData,
  advisory: advisoryData,
} as const;

export const RESULT_TYPES = Object.keys(CANDIDATE_SCHEMAS) as Array<
  keyof typeof CANDIDATE_SCHEMAS
>;

export type ResultType = keyof typeof CANDIDATE_SCHEMAS;

export function formalizes(resultType: string): boolean {
  // advisory results never become a domain entity; they skip awaiting_confirmation
  return resultType !== "advisory" && resultType in CANDIDATE_SCHEMAS;
}

export interface CandidateInput {
  resultType: string;
  resultData: unknown;
}

export type ParseResult =
  | { ok: true; resultType: ResultType; resultData: Record<string, unknown> }
  | { ok: false; error: string };

export function parseCandidate(input: CandidateInput): ParseResult {
  const schema = (CANDIDATE_SCHEMAS as Record<string, z.ZodTypeAny>)[input.resultType];
  if (!schema) {
    return { ok: false, error: `unknown result type: ${input.resultType}` };
  }
  const parsed = schema.safeParse(input.resultData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return {
    ok: true,
    resultType: input.resultType as ResultType,
    resultData: parsed.data as Record<string, unknown>,
  };
}
