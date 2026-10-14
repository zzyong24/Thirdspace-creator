import {createExecutionWorker} from './worker-runtime';
import {runVideoVisualReviewInWorker} from './video-visual-review-worker-run';
if(!process.send)throw Error('成片审核Worker只能由宿主私有IPC启动');
const worker=createExecutionWorker({send(message){if(process.connected)process.send!(message);},generate:runVideoVisualReviewInWorker});
process.on('message',message=>worker.receive(message));
const shutdown=()=>{worker.close();process.exit(0);};
process.on('disconnect',shutdown);process.on('SIGTERM',shutdown);worker.ready();
