import {AsyncLocalStorage} from 'node:async_hooks';
import type {WorkerPort} from '@creatoros/contract/execution-worker';
export type CodexWorkerCall=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
export const codexWorkerPorts=new AsyncLocalStorage<CodexWorkerCall>();
export const codexCallAuthority=new AsyncLocalStorage<{callId:string;recover:boolean}>();
