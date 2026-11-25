import { z } from "zod";
import {
  everyInfraHostSchema, everyInfraQuerySchema,
  type everyInfraToolObservationSchema,
} from "@creatoros/contract/internal/everyinfra";
import { agenticToolOutcomeSchema, type WorkerPort } from "@creatoros/contract/execution-worker";
import { EveryInfraClient, EveryInfraError } from "./everyinfra-client";

const preparation = z.strictObject({
  input: everyInfraQuerySchema,
  credential: z.strictObject({ apiKey: z.string(), baseUrl: everyInfraHostSchema }).nullable(),
});

export async function runChatEveryInfraInWorker(
  callId: string,
  signal: AbortSignal,
  call: (port: WorkerPort, input: unknown, signal?: AbortSignal) => Promise<unknown>,
) {
  const raw = await call("prepareChatEveryInfra", { callId }, signal);
  const prepared = preparation.safeParse(raw);
  signal.throwIfAborted();
  let observation: z.infer<typeof everyInfraToolObservationSchema>;
  if (!prepared.success) {
    observation = { status: "error", code: "EVERYINFRA_RESPONSE_SHAPE" };
  } else if (!prepared.data.credential) {
    observation = { status: "error", code: "EVERYINFRA_NOT_CONFIGURED" };
  } else {
    try {
      const client = new EveryInfraClient(prepared.data.credential);
      const result = await client.query(prepared.data.input, { idempotencyKey: callId, signal });
      observation = { status: "ok", result };
    } catch (error) {
      signal.throwIfAborted();
      observation = error instanceof EveryInfraError
        ? { status: "error", code: error.code, ...(error.automaticReplayBlocked ? { automaticReplayBlocked: true } : {}) }
        : { status: "error", code: "EVERYINFRA_UPSTREAM" };
    }
  }
  const receipt = { callId, observation };
  return agenticToolOutcomeSchema.parse(await call("settleChatEveryInfra", receipt)
    .catch(() => call("settleChatEveryInfra", receipt)));
}
