// @vitest-environment node
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {expect,it,vi} from 'vitest';
import {PNG} from 'pngjs';
import {PDFParse} from 'pdf-parse';
import {createWorkbenchArtifactRepresentation,WorkbenchArtifactFormatError} from './workbench-artifact-representation';
const ctx={userId:'user',accountId:'account',requestId:'request',source:'user' as const};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function fixture(html:string,mime='text/html'){
 const bytes=Buffer.from(html),metadata={artifactId:'artifact',version:1,mime,size:bytes.length,hash:hash(bytes),relativePath:'report.html',taskId:'task',provenance:[]};
 const port={readAll:vi.fn(async()=>({bytes,metadata})),readRelativeImage:vi.fn(async()=>null)};
 return {bytes,metadata,port};
}
it('四种共用 representation 保持来源 hash；真实 Chromium SVG 像素与 PDF 正文可读',async()=>{
 const {bytes,metadata,port}=fixture('<!doctype html><style>body{margin:0}</style><svg width="120" height="80"><rect width="120" height="80" fill="#df2828"/></svg><h1>Verified report 2026</h1><table><tr><td>Total: 42</td></tr></table>');
 for(const format of ['raw','preview','png','pdf'] as const){
  const result=await createWorkbenchArtifactRepresentation(port,ctx,'task','artifact',1,format);
  const output=Buffer.from(result.data,'base64');
  expect(result).toMatchObject({sourceHash:metadata.hash,rendererPolicy:'static-offline-v1',diagnostics:{sourceHash:metadata.hash,status:'analyzed',degraded:false,staticSvgCount:1,staticTableCount:1}});
  expect(result.hash).toBe(hash(output));
  if(format==='raw')expect(output).toEqual(bytes);
  if(format==='png'){
   const png=PNG.sync.read(output),offset=(20*png.width+20)*4;
   expect([...png.data.subarray(offset,offset+4)]).toEqual([223,40,40,255]);
  }
  if(format==='pdf'){
   const parser=new PDFParse({data:output});
   try{expect((await parser.getText()).text).toMatch(/Verified report 2026[\s\S]*Total: 42/);}finally{await parser.destroy();}
  }
 }
},60_000);
it('旧脚本报告四种输出均标记降级，正文保留；脚本不能改写像素且没有外网请求',async()=>{
 let requests=0;
 const server=createServer((_req,res)=>{requests++;res.end('unexpected');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();if(!address||typeof address==='string')throw new Error('missing address');
  const {bytes,metadata,port}=fixture(`<style>body{margin:0}</style><svg width="120" height="80"><rect width="120" height="80" fill="#df2828"/></svg><h1>Legacy body 42</h1><script src="http://127.0.0.1:${address.port}/chart.js"></script><script>document.body.innerHTML='ERASED'</script><img src="http://127.0.0.1:${address.port}/spy.png">`);
  for(const format of ['raw','preview','png','pdf'] as const){
   const result=await createWorkbenchArtifactRepresentation(port,ctx,'task','artifact',1,format),output=Buffer.from(result.data,'base64');
   expect(result).toMatchObject({sourceHash:metadata.hash,diagnostics:{sourceHash:metadata.hash,scriptCount:2,externalResourceCount:2,degraded:true}});
   if(format==='raw')expect(output).toEqual(bytes);
   if(format==='preview'){expect(output.toString()).toContain('Legacy body 42');expect(output.toString()).not.toContain('<script');}
   if(format==='png'){const png=PNG.sync.read(output),offset=(20*png.width+20)*4;expect([...png.data.subarray(offset,offset+4)]).toEqual([223,40,40,255]);}
   if(format==='pdf'){const parser=new PDFParse({data:output});try{expect((await parser.getText()).text).toContain('Legacy body 42');}finally{await parser.destroy();}}
  }
  expect(requests).toBe(0);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
},60_000);
it('非 HTML raw/preview 仍返回诊断，来源校验继续拒绝错误 hash',async()=>{
 const {port}=fixture('名称,数量\n样本,0','text/csv');
 for(const format of ['raw','preview'] as const)expect(await createWorkbenchArtifactRepresentation(port,ctx,'task','artifact',1,format)).toMatchObject({diagnostics:{status:'not_applicable',degraded:false}});
 await expect(createWorkbenchArtifactRepresentation(port,ctx,'task','artifact',1,'png')).rejects.toBeInstanceOf(WorkbenchArtifactFormatError);
 port.readAll.mockImplementation(async()=>({bytes:Buffer.from('bad'),metadata:fixture('原文').metadata}));
 await expect(createWorkbenchArtifactRepresentation(port,ctx,'task','artifact',1,'raw')).rejects.toThrow();
});
