import { isPiAgenticRuntimeAvailable } from "../runtime/agentic/pi-engine";
import { runAgenticInWorker } from "./agentic-worker-run";
import { createExecutionWorker } from "./worker-runtime";
import { createResearchWorkerTools } from "./research-worker-tools";

async function main() {
  if (!process.send) throw new Error("AGENTIC_WORKER_REQUIRES_IPC");
  // 探测沿用引擎实际 loader，失败不输出依赖路径、原始错误或伪 ready。
  if (!await isPiAgenticRuntimeAvailable()) {
    process.stderr.write("PI_RUNTIME_UNAVAILABLE\n");
    process.exit(78);
  }
  const resources=new Set<ReturnType<typeof createResearchWorkerTools>>();
  const worker=createExecutionWorker({
    capabilities:["agentic.run"],runAgentic:async(input,model,signal,call,onText)=>{
      const tools=createResearchWorkerTools({call,signal});resources.add(tools);
      try{return await runAgenticInWorker(input,model,signal,call,onText,tools);}
      finally{await tools.close();resources.delete(tools);}
    },
    generate:async()=>{throw new Error("MODEL_WORKER_CAPABILITY_UNAVAILABLE");},
    send(message){if(process.connected)process.send!(message);},
  });
  process.on("message",message=>worker.receive(message));
  let shuttingDown=false;
  const shutdown=async()=>{if(shuttingDown)return;shuttingDown=true;worker.close();await Promise.all([...resources].map(resource=>resource.close()));process.exit(0);};
  process.on("disconnect",()=>{void shutdown();});
  process.on("SIGTERM",()=>{void shutdown();});
  worker.ready();
}
void main().catch(()=>{process.stderr.write("AGENTIC_WORKER_START_FAILED\n");process.exit(78);});
