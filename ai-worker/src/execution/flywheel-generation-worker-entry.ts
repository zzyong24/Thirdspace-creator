import {createExecutionWorker} from './worker-runtime';
import {generateFlywheelInWorker} from './flywheel-generation-worker';
if(!process.send)throw new Error('飞轮Worker只能由宿主私有IPC启动');
const worker=createExecutionWorker({capabilities:['model.structured'],generateStructured:generateFlywheelInWorker,send(message){if(process.connected)process.send!(message);},async generate(){throw new Error('FLYWHEEL_CAPABILITY_INVALID');}});
process.on('message',message=>worker.receive(message));
const shutdown=()=>{worker.close();process.exit(0);};
process.on('disconnect',shutdown);process.on('SIGTERM',shutdown);worker.ready();
