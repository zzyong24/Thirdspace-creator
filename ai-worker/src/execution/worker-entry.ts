import { streamText } from "ai";
import { modelFor } from "../runtime/provider-factory";
import { createExecutionWorker } from "./worker-runtime";
import { generationFailure } from "./generation-error";

if (!process.send) throw new Error("执行 Worker 只能由宿主私有 IPC 启动");
const worker = createExecutionWorker({
  send(message) {if (process.connected) process.send!(message);},
  async generate(input, spec, signal, onText) {
    let streamFailed = false;
    let streamError: unknown;
    const result = streamText({model: modelFor(spec), prompt: input.prompt, system: input.system,
      maxOutputTokens: input.maxOutputTokens, maxRetries: 0, abortSignal: signal,
      onError(event) {streamFailed = true; streamError = event.error;}});
    let text = "";
    try {
      for await (const chunk of result.textStream) {text += chunk; onText(chunk);}
    const usage = await result.totalUsage;
    signal.throwIfAborted();
    if (streamFailed || await result.finishReason === "error" || !text.trim()) {
      throw streamError ?? new Error("MODEL_OUTPUT_UNAVAILABLE");
    }
    return {text, usage};
    } catch (error) {throw generationFailure(streamError ?? error, text.length > 0);}
  },
});
process.on("message", message => worker.receive(message));
process.on("disconnect", () => {worker.close(); process.exit(0);});
process.on("SIGTERM", () => {worker.close(); process.exit(0);});
worker.ready();
