import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {setTimeout as cleanupDelay} from 'node:timers/promises';
import {createInterface} from "node:readline";

const ALLOWED = new Set(['initialize','account/read','config/read','thread/start','thread/read','turn/start','turn/interrupt','mcpServerStatus/list','modelProvider/capabilities/read','model/list']);
export class CodexHostError extends Error {
  constructor(readonly code:string) {super(code);this.name='CodexHostError';}
}
export type RpcFrame={id?:number|string;method?:string;params?:unknown;result?:unknown;error?:unknown};

/** Never log RPC frames: config/account responses may contain private metadata. */
export class CodexRpcSession {
  private sequence=0;
  private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private closed=false;
  private chain:Promise<void>=Promise.resolve();
  private child:ChildProcessWithoutNullStreams;
  onNotification?: (method:string,params:unknown)=>void|Promise<void>;
  onRequest?: (method:string,params:unknown)=>unknown|Promise<unknown>;
  onFailure?: (error:Error)=>void;
  onAbort?:()=>Promise<void>;
  private detachAbort?:()=>void;
  constructor(binary:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv;signal?:AbortSignal}) {
    this.child=spawn(binary,args,{cwd:options.cwd,env:options.env,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    this.child.stderr.resume(); // Drain without recording provider logs or secrets.
    createInterface({input:this.child.stdout}).on('line',line=>{
      if(Buffer.byteLength(line)>48_000_000){this.fail(new CodexHostError('CODEX_PROTOCOL_FRAME_TOO_LARGE'));return;}
      let frame:RpcFrame;
      try {frame=JSON.parse(line) as RpcFrame;} catch {this.fail(new CodexHostError('CODEX_PROTOCOL_INVALID'));return;}
      if(!frame || typeof frame!=="object" || Array.isArray(frame)){this.fail(new CodexHostError("CODEX_PROTOCOL_INVALID"));return;}
      if(frame.id!==undefined && !frame.method){
        const request=typeof frame.id==='number'?this.pending.get(frame.id):undefined;
        if(!request)return;
        clearTimeout(request.timer);this.pending.delete(frame.id as number);
        if(frame.error)request.reject(new CodexHostError('CODEX_RPC_REJECTED'));else request.resolve(frame.result);
        return;
      }
      this.chain=this.chain.then(async()=>{
        if(this.closed||!frame.method)return;
        if(frame.id!==undefined){
          try {if(!this.onRequest)throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');this.write({id:frame.id,result:await this.onRequest(frame.method,frame.params)});}
          catch {this.write({id:frame.id,error:{code:-32601,message:'CREATOROS_INTERACTION_UNSUPPORTED'}});}
        }else await this.onNotification?.(frame.method,frame.params);
      }).catch(()=>this.fail(new CodexHostError('CODEX_EVENT_REJECTED')));
    });
    this.child.once('error',()=>this.fail(new CodexHostError('CODEX_RUNTIME_UNAVAILABLE')));
    this.child.once('exit',()=>this.fail(new CodexHostError('CODEX_PROCESS_EXITED')));
    this.child.stdin.on('error',()=>this.fail(new CodexHostError('CODEX_PROCESS_EXITED')));
    const abort=()=>{void (async()=>{try{await this.onAbort?.();}finally{await this.close();}})();};
    options.signal?.addEventListener('abort',abort,{once:true});
    this.detachAbort=()=>options.signal?.removeEventListener('abort',abort);
    if(options.signal?.aborted)abort();
  }
  private write(value:RpcFrame){if(this.closed)throw new CodexHostError('CODEX_PROCESS_CLOSED');this.child.stdin.write(JSON.stringify(value)+'\n');}
  request(method:string,params:unknown,timeoutMs=120_000):Promise<unknown>{
    if(!ALLOWED.has(method))return Promise.reject(new CodexHostError('CODEX_RPC_NOT_ALLOWED'));
    if(this.closed)return Promise.reject(new CodexHostError('CODEX_PROCESS_CLOSED'));
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new CodexHostError('CODEX_RPC_TIMEOUT'));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try {this.write({id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  initialized(){this.write({method:'initialized',params:{}});}
  private fail(error:Error){
    if(this.closed)return;
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();
    try{this.onFailure?.(error);}finally{void this.close();}
  }
  async close():Promise<void>{
    if(this.closed)return;this.closed=true;this.detachAbort?.();
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new CodexHostError('CODEX_PROCESS_CLOSED'));}this.pending.clear();
    const pid=this.child.pid;
    if(!pid)return;
    if(process.platform==='win32'){
      const killer=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
      await new Promise<void>(resolve=>{killer.once('exit',()=>resolve());killer.once('error',()=>{this.child.kill();resolve();});});
    }else {try {process.kill(-pid,'SIGTERM');}catch {this.child.kill();}
      // 仅SIGTERM后的取消清理宽限，正执行/请求仍由原deadline和两分钟RPC预算控制。
      const cleanup=new AbortController();
      void cleanupDelay(1000,undefined,{ref:false,signal:cleanup.signal}).then(()=>{try{process.kill(-pid,'SIGKILL');}catch{/* Already stopped. */}}).catch(()=>{});
      this.child.once('exit',()=>cleanup.abort());
    }
  }
}
