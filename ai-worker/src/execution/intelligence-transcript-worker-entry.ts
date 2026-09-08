import {createExecutionWorker} from './worker-runtime';
import {runBoundAsrStageInWorker} from './bound-asr-stage-worker';
if(!process.send)throw new Error('情报转写 Worker 只能经私有 IPC 启动');
const worker=createExecutionWorker({
 capabilities:['transcribe.douyin'],
 runTranscribe:runBoundAsrStageInWorker,
 send(message){if(process.connected)process.send!(message);},
 async generate(){throw new Error('INTELLIGENCE_TRANSCRIPT_MODE_INVALID');},
});
process.on('message',message=>worker.receive(message));
const shutdown=()=>{worker.close();process.exit(0);};
process.on('disconnect',shutdown);process.on('SIGTERM',shutdown);worker.ready();
