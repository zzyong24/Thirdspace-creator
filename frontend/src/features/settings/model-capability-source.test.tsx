import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {modelRoutingResourceSchema,type ModelRoutingChoices,type ModelRoutingResource} from '@creatoros/contract';
import '@testing-library/jest-dom/vitest';
const choices:ModelRoutingChoices={text:'self',vision:'codex',image:'official',video:'self',audio:'local',embed:'self'};
const envelope=(data:unknown)=>new Response(JSON.stringify({data,meta:{requestId:'controlled-ui'}}),{status:200,headers:{'content-type':'application/json'}});
function resource(revision=1,selected:ModelRoutingChoices|null=choices):ModelRoutingResource{return modelRoutingResourceSchema.parse({schemaVersion:1,revision,choices:selected,legacyExecutionEngine:'codex',effectiveChoices:selected??{text:'codex',vision:'codex',image:'codex',video:'self',audio:'local',embed:'self'},capabilities:[
 {capability:'copilot.assist',mode:'text',source:selected?.text??'codex',status:'not_configured',reasonCode:'MODEL_NOT_CONFIGURED'},
 {capability:'copilot.assist',mode:'vision',source:selected?.vision??'codex',status:'ready',reasonCode:null},
 {capability:'image.generate',mode:'image',source:selected?.image??'codex',status:'ready',reasonCode:null},
 {capability:'image.edit',mode:'image',source:selected?.image??'codex',status:'unverified',reasonCode:'MODEL_CAPABILITY_UNVERIFIED'},
 ]});}
beforeEach(()=>{vi.resetModules();localStorage.clear();});afterEach(()=>{cleanup();vi.restoreAllMocks();});
type Request={id:string;input:{body?:{schemaVersion:number;choices:ModelRoutingChoices;expectedRevision:number}}};
function http(initial=resource(),put?:(request:Request)=>Promise<Response>|Response){
 let current=initial;const requests:Request[]=[];
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  if(String(_url)==='/api/chat/engines')return new Response(JSON.stringify({engines:[{engine:'codex',installed:false,available:false,version:null,loginStatus:'unchecked',errorCode:'CODEX_STATUS_UNAVAILABLE'}]}),{status:200});
  const request=JSON.parse(String(options?.body)) as Request;requests.push(request);
  if(request.id==='settings.modelRouting.get')return envelope(current);
  if(request.id==='settings.modelRouting.put'){
   if(put)return put(request);
   expect(request.input.body?.expectedRevision).toBe(current.revision);
   current=resource(current.revision+1,request.input.body!.choices);return envelope(current);
  }
  throw Error(`不允许额外调用 ${request.id}`);
 });return {fetch,requests,current:()=>current,set:(next:ModelRoutingResource)=>{current=next;}};
}
async function mount(){const {ModelCapabilitySource}=await import('./model-capability-source');render(<ModelCapabilitySource/>);await waitFor(()=>expect(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'})).toBeEnabled(),{timeout:120_000});}
describe('T1278 真实 contract client / HTTP adapter 的来源表单',()=>{
 it('六槽合法选项来自严格枚举，图片生成与编辑分别显示，旧 global engine 不出现',{timeout:180_000,retry:0},async()=>{
  const f=http();await mount();
  const expected={'文本创作与结构化':['','official','self','codex'],'图片理解':['','official','self','codex'],'图片生成与编辑':['','official','self','codex'],'视频生成':['','official','self'],'语音转文字':['','official','self','local'],'检索向量':['','official','self']};
  for(const [name,options] of Object.entries(expected)){const select=screen.getByRole('combobox',{name:`${name}模型来源`}) as HTMLSelectElement;expect(Array.from(select.options).map(option=>option.value)).toEqual(options);}
  expect(screen.getByText('生成：可用；编辑：未核实')).toBeInTheDocument();expect(screen.queryByRole('combobox',{name:'编导引擎'})).toBeNull();
  expect(f.requests.map(request=>request.id)).toEqual(['settings.modelRouting.get']);
 });
 it('choices=null 只显示后端 effectiveChoices，首次显式保存才写全六槽',{timeout:180_000,retry:0},async()=>{
  const f=http(resource(0,null));await mount();expect(screen.getAllByText(/沿用原设置/)).toHaveLength(6);expect(f.requests.filter(request=>request.id.includes('put'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'保存模型来源'}));await screen.findByText('已保存并读回当前设置',{}, {timeout:120_000});
  expect(f.requests.map(request=>request.id)).toEqual(['settings.modelRouting.get','settings.modelRouting.put','settings.modelRouting.get']);
  expect(f.requests[1]!.input.body).toEqual({schemaVersion:1,choices:{text:'codex',vision:'codex',image:'codex',video:'self',audio:'local',embed:'self'},expectedRevision:0});
 });
 it('一次来源修改走 PUT 原 revision 再 GET；卸载再进入读服务值',{timeout:180_000,retry:0},async()=>{
  const f=http();await mount();fireEvent.change(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'}),{target:{value:'codex'}});fireEvent.change(screen.getByRole('combobox',{name:'图片生成与编辑模型来源'}),{target:{value:'self'}});
  expect(document.querySelector('[data-slot="model-source-current-text"]')).toHaveTextContent('当前使用：自配模型');expect(f.requests).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'保存模型来源'}));await screen.findByText('已保存并读回当前设置',{}, {timeout:120_000});
  expect(f.requests[1]!.input.body).toEqual({schemaVersion:1,choices:{...choices,text:'codex',image:'self'},expectedRevision:1});
  cleanup();const module=await import('@/features/copilot/assistant-engine');await act(async()=>module.loadModelRouting(true));await mount();expect(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'})).toHaveValue('codex');expect(f.current().revision).toBe(2);
 });
 it('CAS 冲突保草稿，读回其它窗口值后须显式核对才能按新 revision 再保存',{timeout:180_000,retry:0},async()=>{
  let attempts=0;const f=http(resource(),request=>{if(++attempts===1)return new Response(JSON.stringify({error:{code:'ConflictError',message:'revision changed'}}),{status:409});const next=resource(3,request.input.body!.choices);f.set(next);return envelope(next);});
  await mount();fireEvent.change(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'}),{target:{value:'codex'}});fireEvent.click(screen.getByRole('button',{name:'保存模型来源'}));await screen.findByRole('alert',{}, {timeout:120_000});expect(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'})).toHaveValue('codex');
  f.set(resource(2,{...choices,text:'official'}));fireEvent.click(screen.getByRole('button',{name:'重新读取当前设置'}));await screen.findByRole('button',{name:'已核对，保留草稿继续编辑'}, {timeout:120_000});expect(screen.getByRole('button',{name:'保存模型来源'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'已核对，保留草稿继续编辑'}));expect(screen.getByRole('button',{name:'保存模型来源'})).toBeEnabled();
  // 不自动重试 PUT；下一次保存必须来自用户动作。
  expect(attempts).toBe(1);expect(f.requests.filter(request=>request.id==='settings.modelRouting.put')[0]!.input.body!.expectedRevision).toBe(1);
  fireEvent.click(screen.getByRole('button',{name:'保存模型来源'}));await screen.findByText('已保存并读回当前设置',{}, {timeout:120_000});expect(attempts).toBe(2);expect(f.requests.filter(request=>request.id==='settings.modelRouting.put')[1]!.input.body!.expectedRevision).toBe(2);
 });
 it('保存中禁重复，PUT已受理但GET失败不能说已保存，原草稿保留',{timeout:180_000,retry:0},async()=>{
  let release!:(value:Response)=>void,reads=0;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{const request=JSON.parse(String(options?.body)) as Request;if(request.id==='settings.modelRouting.get'){if(++reads>1)throw Error('readback unavailable');return envelope(resource());}return new Promise(resolve=>{release=resolve;});});
  await mount();fireEvent.change(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'}),{target:{value:'codex'}});fireEvent.click(screen.getByRole('button',{name:'保存模型来源'}));expect(screen.getByRole('button',{name:'正在保存…'})).toBeDisabled();expect(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'})).toBeDisabled();
  await act(async()=>release(envelope(resource(2,{...choices,text:'codex'}))));await screen.findByRole('alert',{}, {timeout:120_000});expect(screen.getByRole('alert')).toHaveTextContent('保存已受理');expect(screen.queryByText('已保存并读回当前设置')).toBeNull();expect(screen.getByRole('combobox',{name:'文本创作与结构化模型来源'})).toHaveValue('codex');expect(fetch).toHaveBeenCalledTimes(3);
 });
 it('scope 改变清旧状态，旧 GET 晚回执不能反写当前组',{timeout:180_000,retry:0},async()=>{
  const pending:Array<(response:Response)=>void>=[];vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
  const {useAssistantEngine}=await import('@/features/copilot/use-assistant-engine');const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(pending).toHaveLength(1),{timeout:120_000});
  act(()=>{localStorage.setItem('creatoros:current-group','new-group');window.dispatchEvent(new Event('creatoros:accounts-changed'));});await waitFor(()=>expect(pending).toHaveLength(2),{timeout:120_000});expect(result.current.routing.resource).toBeNull();
  await act(async()=>pending[1]!(envelope(resource(9,{...choices,text:'official'}))));await act(async()=>pending[0]!(envelope(resource(1))));expect(result.current.routing.resource?.revision).toBe(9);expect(result.current.routing.resource?.choices?.text).toBe('official');
 });
 it('text 未配置与 vision 可用各自传给聊天消费者，图片编辑未核实不伪成可用',{timeout:180_000,retry:0},async()=>{
  http();const {useAssistantEngine}=await import('@/features/copilot/use-assistant-engine');const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(result.current.routing.ready).toBe(true),{timeout:120_000});expect(result.current).toMatchObject({v2:true,textAvailable:false,visionAvailable:true,imageGeneration:{status:'ready'},imageEditing:{status:'unverified'}});
 });
 it('用途状态缺失不伪造可用，也不代替宿主准入阻断合法提交',{timeout:180_000,retry:0},async()=>{
  http({...resource(),capabilities:[]});const {useAssistantEngine}=await import('@/features/copilot/use-assistant-engine');const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(result.current.routing.ready).toBe(true),{timeout:120_000});expect(result.current).toMatchObject({textAvailable:false,visionAvailable:false,canSubmitText:true,canSubmitVision:true,status:'文本状态未核实'});
 });
});
