import {spawn} from 'node:child_process';

export function timeoutCheckInvocation(command,args,platform=process.platform,env=process.env){
 if(platform==='win32'&&command==='pnpm'){
  // 仅verify固定清单的pnpm.cmd需要命令解释器。绝不插入用户argv或允许CMD元字符。
  if(!args.every(value=>typeof value==='string'&&/^[a-zA-Z0-9_@./\\:=+-]+$/.test(value)))throw new Error('pnpm检查只接受固定安全参数');
  return {command:env.ComSpec??env.COMSPEC??'cmd.exe',args:['/d','/s','/c',`pnpm.cmd ${args.join(' ')}`]};
 }
 return {command,args};
}

/** 超时门的子进程启动缝；检查清单仍由verify.mjs固定定义。 */
export function spawnTimeoutCheck(command,args,options={}){
 const invocation=timeoutCheckInvocation(command,args,process.platform,options.env??process.env);
 return spawn(invocation.command,invocation.args,{...options,shell:false});
}
