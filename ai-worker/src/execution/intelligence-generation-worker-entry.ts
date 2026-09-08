import {createExecutionWorker} from "./worker-runtime";
import {generateIntelligenceInWorker} from "./intelligence-generation-worker";
if(!process.send)throw new Error("生成 Worker 只能由宿主私有 IPC 启动");
const worker=createExecutionWorker({capabilities:["model.structured"],generateStructured:generateIntelligenceInWorker,send(message){if(process.connected)process.send!(message);},async generate(){throw new Error("INTELLIGENCE_MODE_INVALID");}});
process.on("message",message=>worker.receive(message));
const shutdown=()=>{worker.close();process.exit(0);};
process.on("disconnect",shutdown);process.on("SIGTERM",shutdown);worker.ready();
