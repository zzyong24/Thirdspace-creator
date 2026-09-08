import {z} from 'zod';
import {createExecutionWorker} from './worker-runtime';
import {runTranscribeAsrInWorker} from './transcribe-asr-run';
import {createTranscribeAsrRegistry} from './transcribe-asr-registry';
import {GenerationFailure} from './generation-error';
if(!process.send)throw new Error('情报转写 Worker 只能经私有 IPC 启动');
const worker=createExecutionWorker({
 capabilities:['transcribe.douyin'],
 async runTranscribe(input,signal,call){
  if(input.awemeIds.length!==1)throw new GenerationFailure('failed','INTELLIGENCE_TRANSCRIPT_INPUT_INVALID');
  const awemeId=input.awemeIds[0]!;
  const source=z.object({skippedReason:z.string().nullable()}).strict().parse(await call('prepareTranscribeItem',{awemeId},signal));
  if(!source.skippedReason){
   try{await runTranscribeAsrInWorker(awemeId,signal,call,createTranscribeAsrRegistry());}
   catch(error){if(error instanceof Error&&error.name==='AsrExecutionInterruption')throw new GenerationFailure('unknown_result','INTELLIGENCE_ASR_RESULT_UNKNOWN');throw error;}
  }
  signal.throwIfAborted();
  return z.object({status:z.literal('succeeded')}).strict().parse(await call('completeTranscribeTask',{},signal));
 },
 send(message){if(process.connected)process.send!(message);},
 async generate(){throw new Error('INTELLIGENCE_TRANSCRIPT_MODE_INVALID');},
});
process.on('message',message=>worker.receive(message));
const shutdown=()=>{worker.close();process.exit(0);};
process.on('disconnect',shutdown);process.on('SIGTERM',shutdown);worker.ready();
