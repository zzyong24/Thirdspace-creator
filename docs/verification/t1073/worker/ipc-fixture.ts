import { createExecutionWorker } from '../../../../ai-worker/src/execution/worker-runtime';
import type { WorkerMessage } from '../../../../contract/src/internal/execution-worker';

let lastCall: WorkerMessage | undefined, replayed = false, ackCount = 0;
const worker = createExecutionWorker({
  generate: async () => { throw Error('不运行模型'); },
  runTranscribe: async (_input, signal, call) => {
    if (_input.awemeIds[0] === 'synthetic-concurrent') {
      // 较早的一个真实端口调用挂起，不得阻挡后面已消费的大回执释放。
      void call('heartbeat', {}, signal).catch(() => {});
      await Promise.all(Array.from({length: 100}, async (_, index) => {
        const reply = await call('readTranscribeAudio', {awemeId: `parallel-${index}`}, signal) as {bytes: Uint8Array};
        if (reply.bytes.byteLength !== 512 * 1024) throw Error('音频不可截断');
      }));
      process.send!({version:1,type:'progress',requestId:'progress',execution:(lastCall as Extract<WorkerMessage,{type:'call'}>).execution,seq:100,text:'100'});
      return await new Promise<never>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    }
    for (let count = 1; count <= 100; count++) {
      const reply = await call('readTranscribeAudio', {awemeId: `synthetic-${count}`}, signal) as {bytes: Uint8Array};
      if (reply.bytes.byteLength !== 512 * 1024) throw Error('音频不可截断');
      if (count % 25 === 0) {
        process.send!({version: 1, type: 'progress', requestId: 'progress', execution: (lastCall as Extract<WorkerMessage, {type: 'call'}>).execution, seq: count, text: String(count)});
        if (count < 100) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return await new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  },
  send(message) {
    if (message.type === 'call') {
      lastCall = message;
      process.send!(message);
      // 同一个在途 request 重投，真实 supervisor 只能 invoke 一次。
      if (message.port === 'readTranscribeAudio') process.send!(message);
    } else if ((message as {type: string}).type === 'consumed') {
      const ack = message as unknown as {throughSeq: number; execution: object};
      // 丢弃半数确认；下一条累计水位仍应释放之前的历史回执。
      if (++ackCount % 2 === 0) process.send!(message);
      if (!replayed && ack.throughSeq >= 4 && lastCall) {
        replayed = true;
        process.send!({...message, execution: {...ack.execution, fenceToken: 'stale'}});
        process.send!(lastCall);
      }
    } else process.send!(message);
  },
});
process.on('message', message => worker.receive(message));
process.on('disconnect', () => {worker.close(); process.exit(0);});
process.on('SIGTERM', () => {worker.close(); process.exit(0);});
worker.ready();
