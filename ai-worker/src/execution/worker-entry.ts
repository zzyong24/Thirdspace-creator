import {runAssetInWorker} from "./asset-worker-run";
import {closeChatWebReadResources} from "./chat-web-read-resources";
import {closeChatResearchResources} from "./chat-research-worker";
import {runChatInWorker} from "./chat-worker-run";
import {closeTopicWorkerResources} from "./topic-worker-reads";
import { generateStructuredInWorker } from "./structured-worker-generation";
import { streamText } from "ai";
import { modelFor } from "../runtime/provider-factory";
import { createExecutionWorker } from "./worker-runtime";
import { generationFailure } from "./generation-error";

if (!process.send) throw new Error("执行 Worker 只能由宿主私有 IPC 启动");
// 包内 Pi 引擎能力尚待真实产物验证；未装配 runAgentic 时不声明该 capability。
const worker = createExecutionWorker({
  runAsset:runAssetInWorker,
  generateStructured:generateStructuredInWorker,
  runChat:runChatInWorker,
  supportsChatWebRead:true,
  supportsChatHooks:true,
  supportsChatResearch:true,
  supportsChatStructured:true,
  send(message) {if (process.connected) process.send!(message);},
  async generate(input, spec, signal, onText) {
    let streamFailed = false;
    let streamError: unknown;
    const result = streamText({model: modelFor(spec), prompt: input.prompt, system: input.system,
      maxOutputTokens: input.maxOutputTokens, maxRetries: 0, abortSignal: signal,
      onError(event) {streamFailed = true; streamError = event.error;}});
    let text = "";
    try {
      for await (const chunk of result.textStream) {text += chunk; await onText(chunk);}
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
let shuttingDown=false;
const shutdown=async()=>{if(shuttingDown)return;shuttingDown=true;worker.close();await Promise.all([closeTopicWorkerResources(),closeChatResearchResources(),closeChatWebReadResources()]);process.exit(0);};
process.on("disconnect", () => {void shutdown();});
process.on("SIGTERM", () => {void shutdown();});
worker.ready();
