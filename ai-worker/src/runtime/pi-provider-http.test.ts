import {createServer} from 'node:http';
import {it,expect,vi} from 'vitest';
import {createPiProviderModel} from './pi-provider';
it.each([401,'disconnect'] as const)('正式模型适配器记录失败诊断且不自行重发：%s',async status=>{
 let requests=0;const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const server=createServer((req,res)=>{requests++;req.resume();if(status==='disconnect'){req.socket.destroy();return;}res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid fixture-secret'}}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const model=createPiProviderModel({apiFormat:'anthropic',baseUrl,model:'fixture',token:'fixture-secret'});
  await expect(model.doStream({prompt:[{role:'user',content:[{type:'text',text:'test'}]}],maxOutputTokens:128,abortSignal:AbortSignal.timeout(5000)})).rejects.toThrow();
  expect(requests).toBe(1);expect(log).toHaveBeenCalled();expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-secret');
  expect(JSON.stringify(log.mock.calls)).toContain(status===401?'status=401':'output=false');
 }finally{log.mockRestore();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
