import { createWorkerSupervisor } from '../../../../backend/src/modules/execution/worker-supervisor';
const weak: WeakRef<Buffer>[] = [], wake = new Map<number, () => void>();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const parallel = process.argv[3] === 'parallel';
const completionOrder:number[]=[];
let releaseBlocked!: () => void;
const blocked = new Promise<void>(resolve => {releaseBlocked=resolve;});
async function sample(label: string) {
  for (let index = 0; index < 4; index++) {global.gc!(); await delay(10);}
  const live = weak.filter(ref => ref.deref()).length;
  return {label, returnedBuffers: weak.length, liveBuffers: live, retainedMiB: live * 0.5, externalMiB: +(process.memoryUsage().external / 1024 / 1024).toFixed(2),...(parallel?{firstCompletedAudio:completionOrder[0],lastCompletedAudio:completionOrder.at(-1)}:{})};
}
const supervisor = createWorkerSupervisor({entryPath: process.argv[2]!, ports: {
  async validate() {},
  async invoke(_execution, port,raw) {
    if (port === 'readTaskContext') return {kind: 'transcribe.douyin', awemeIds: [parallel?'synthetic-concurrent':'synthetic'], language: 'zh', configuration: {kind: 'audio', provider: 'whisper-local', model: 'small', baseUrl: null}};
    if (parallel && port === 'heartbeat') {await blocked;return {};}
    if (port === 'readTranscribeAudio') {
      if(parallel){const index=Number((raw as {awemeId:string}).awemeId.split('-').at(-1));await delay((100-index)*3);completionOrder.push(index);}
      const bytes = Buffer.alloc(512 * 1024, weak.length % 256); weak.push(new WeakRef(bytes)); return {status: 'ready', bytes};
    }
    return {};
  },
}, onText(_execution, text) {wake.get(Number(text))?.();}});
const execution = {executionTaskId: 'synthetic-memory-fix', attempt: 1, fenceToken: 'synthetic'};
async function main() {
  const rows = [await sample('baseline')];
  const counts=parallel?[100]:[25,50,75,100];
  const phases = counts.map(count => new Promise<void>(resolve => wake.set(count, resolve)));
  const running = supervisor.run(execution, Date.now() + 120000);
  try {
    for (let index = 0; index < phases.length; index++) {await phases[index]; rows.push(await sample(`running-${counts[index]}`));}
    supervisor.cancel(execution); releaseBlocked(); await running;
    rows.push(await sample('after-stopped'));
  } finally {releaseBlocked();await supervisor.stop();}
  console.log(JSON.stringify(rows));
}
void main().catch(error => {console.error(error); process.exitCode = 1;});
