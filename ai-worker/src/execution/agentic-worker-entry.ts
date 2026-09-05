import { isPiAgenticRuntimeAvailable } from "../runtime/agentic/pi-engine";
import { runAgenticInWorker } from "./agentic-worker-run";
import { createExecutionWorker } from "./worker-runtime";

async function main() {
  if (!process.send) throw new Error("AGENTIC_WORKER_REQUIRES_IPC");
  // 探测沿用引擎实际 loader，失败不输出依赖路径、原始错误或伪 ready。
  if (!await isPiAgenticRuntimeAvailable()) {
    process.stderr.write("PI_RUNTIME_UNAVAILABLE\n");
    process.exit(78);
  }
  const worker=createExecutionWorker({
    capabilities:["agentic.run"],runAgentic:runAgenticInWorker,
    generate:async()=>{throw new Error("MODEL_WORKER_CAPABILITY_UNAVAILABLE");},
    send(message){if(process.connected)process.send!(message);},
  });
  process.on("message",message=>worker.receive(message));
  process.on("disconnect",()=>{worker.close();process.exit(0);});
  process.on("SIGTERM",()=>{worker.close();process.exit(0);});
  worker.ready();
}
void main().catch(()=>{process.stderr.write("AGENTIC_WORKER_START_FAILED\n");process.exit(78);});
