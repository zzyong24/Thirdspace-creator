import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {setTimeout as cleanupDelay} from 'node:timers/promises';
import {createInterface} from "node:readline";

const ALLOWED = new Set(['initialize','account/read','config/read','thread/start','thread/read','turn/start','turn/interrupt','mcpServerStatus/list','modelProvider/capabilities/read','model/list']);
export class CodexHostError extends Error {
  readonly rpcMethod?:string;
  readonly rpcCode?:number;
  constructor(readonly code:string,diagnostic?:{rpcMethod:string;rpcCode:unknown}) {
    super(code);this.name='CodexHostError';
    // SEMANTIC_BOUNDARY_ALLOW: 只保协议方法与整数错误码，不解释内容或保存原始错误帧。
    if(diagnostic&&ALLOWED.has(diagnostic.rpcMethod))this.rpcMethod=diagnostic.rpcMethod;
    if(typeof diagnostic?.rpcCode==='number'&&Number.isSafeInteger(diagnostic.rpcCode)&&diagnostic.rpcCode>=-2147483648&&diagnostic.rpcCode<=2147483647)this.rpcCode=diagnostic.rpcCode;
  }
}
export type RpcFrame={id?:number|string;method?:string;params?:unknown;result?:unknown;error?:unknown};

/** Never log RPC frames: config/account responses may contain private metadata. */
export class CodexRpcSession {
  private sequence=0;
  private pending=new Map<number,{method:string;resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private closed=false;
  private chain:Promise<void>=Promise.resolve();
  private child:ChildProcessWithoutNullStreams;
  private childClosed:Promise<void>;
  private closing?:Promise<void>;
  onNotification?: (method:string,params:unknown)=>void|Promise<void>;
  onRequest?: (method:string,params:unknown)=>unknown|Promise<unknown>;
  onFailure?: (error:Error)=>void;
  onAbort?:()=>Promise<void>;
  private detachAbort?:()=>void;
  constructor(binary:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv;signal?:AbortSignal}) {
    this.child=spawn(binary,args,{cwd:options.cwd,env:options.env,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    this.childClosed=new Promise(resolve=>this.child.once('close',()=>resolve()));
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
        if(frame.error){
          const rpcCode=typeof frame.error==='object'&&frame.error!==null&&!Array.isArray(frame.error)?(frame.error as {code?:unknown}).code:undefined;
          request.reject(new CodexHostError('CODEX_RPC_REJECTED',{rpcMethod:request.method,rpcCode}));
        }else request.resolve(frame.result);
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
      this.pending.set(id,{method,resolve,reject,timer});
      try {this.write({id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  initialized(){this.write({method:'initialized',params:{}});}
  private fail(error:Error){
    if(this.closed)return;
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();
    try{this.onFailure?.(error);}finally{void this.close();}
  }
  close():Promise<void>{
    if(this.closing)return this.closing;
    this.closed=true;this.detachAbort?.();
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new CodexHostError('CODEX_PROCESS_CLOSED'));}this.pending.clear();
    this.closing=this.closeChild();return this.closing;
  }
  private async closeChild():Promise<void>{
    const pid=this.child.pid;
    if(!pid){await this.childClosed;return;}
    if(process.platform==='win32'){
      const killer=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
      await new Promise<void>(resolve=>{killer.once('exit',code=>{if(code!==0)this.child.kill();resolve();});killer.once('error',()=>{this.child.kill();resolve();});});
      await this.childClosed;
    }else{
      const cleanup=new AbortController();
      try{
        try{process.kill(-pid,'SIGTERM');}catch{this.child.kill();}
        // 只为已开始关闭的owned进程树保留原1秒清理宽限，不缩短任何正执行预算。
        void cleanupDelay(1000,undefined,{ref:false,signal:cleanup.signal}).then(()=>{try{process.kill(-pid,'SIGKILL');}catch{/* Already stopped. */}}).catch(()=>{});
        await this.childClosed;
      }finally{cleanup.abort();}
    }
  }
}
