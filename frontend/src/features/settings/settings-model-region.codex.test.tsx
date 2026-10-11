import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({getPreferences:vi.fn(),patchPreferences:vi.fn(),putModel:vi.fn(),putChannelModelCredential:vi.fn(),testModelConnection:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn(),replace:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
import {loadAssistantEngine} from '@/features/copilot/assistant-engine';
import {buildSettingsViewModel} from '@/fixtures/selectors/settings';
import {SettingsModelRegion} from './settings-model-region';
import {sanitizeModelAuthorityForClient,type ModelAuthorityState} from './settings-page';
const preference=(engine:'pi'|'codex')=>({assistantExecutionEngine:engine});
function status(loginStatus='authenticated',imageGeneration=true){return new Response(JSON.stringify({engines:[{engine:'codex',installed:true,available:loginStatus==='authenticated',version:'0.159.3',loginStatus,capabilities:{text:loginStatus==='authenticated',imageUnderstanding:loginStatus==='authenticated',imageGeneration}}]}),{status:200});}
function viewModel(){const base=buildSettingsViewModel();return {...base,model:{...base.model,modelName:'saved-pi-text',hasSecret:true},multimodalModels:{...base.multimodalModels,image:{...base.multimodalModels.image,modelName:'saved-pi-image',hasSecret:true},audio:{...base.multimodalModels.audio,modelName:'saved-asr',hasSecret:true},video:{...base.multimodalModels.video,modelName:'saved-video',hasSecret:true}}};}
function authority():ModelAuthorityState{
 const cap=(capability:'default'|'transcribe.audio'|'image.generate'|'video.generate',serviceId:string)=>({capability,authority:'channel' as const,serviceId,serviceName:'同名服务',provider:'fixture',modelName:'已保存模型',baseUrl:null,hasSecret:false});
 return {authority:'channel',outcome:'configured',action:'沿原服务配置',capabilities:{default:cap('default','text-id'),'image.generate':cap('image.generate','image-id'),'transcribe.audio':cap('transcribe.audio','media-id'),'video.generate':cap('video.generate','shared-id')},services:['text-id','image-id','media-id','shared-id'].map(serviceId=>({serviceId,serviceName:'同名服务',hasSecret:false,credentialSource:'user_input' as const,portalUrl:null,purchaseUrl:null,rechargeUrl:null,helpUrl:null}))};
}
beforeEach(async()=>{api.getPreferences.mockReset().mockResolvedValue(preference('codex'));api.patchPreferences.mockReset().mockImplementation(async({body})=>preference(body.assistantExecutionEngine));api.putModel.mockReset();await loadAssistantEngine(true);vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());});
describe('T-1238 模型设置区域按已保存引擎显示原配置',()=>{
 it.each(['pi','codex'] as const)('服务偏好未取得时不先显示Pi文本/图片卡或配模型手册，读回%s后沿原配置显示',{timeout:180_000,retry:0},async engine=>{
  vi.resetModules();let resolve!:(value:ReturnType<typeof preference>)=>void;const pending=new Promise<ReturnType<typeof preference>>(r=>{resolve=r;});
  api.getPreferences.mockClear().mockReturnValue(pending);const {SettingsModelRegion:PendingRegion}=await import('./settings-model-region');
  const model=viewModel();model.model.hasSecret=false;const {container}=render(<PendingRegion viewModel={model} highlight="image-model"/>);
  try{
   await waitFor(()=>expect(api.getPreferences).toHaveBeenCalled());
   expect(screen.getByRole('status')).toHaveTextContent('正在读取引擎设置');
   expect(container.querySelector('[data-highlight="text-model"]')).toBeNull();expect(container.querySelector('[data-highlight="image-model"]')).toBeNull();
   expect(screen.queryByRole('button',{name:'打开模型配置手册'})).toBeNull();expect(container.querySelector('[data-slot="model-authority-status"]')).toBeNull();
   expect(container.querySelector('[data-highlight="asr-model"]')).not.toBeNull();expect(container.querySelector('[data-highlight="video-model"]')).not.toBeNull();
   expect(api.putModel).not.toHaveBeenCalled();expect(api.testModelConnection).not.toHaveBeenCalled();expect(api.patchPreferences).not.toHaveBeenCalled();
  }finally{await act(async()=>{resolve(preference(engine));await pending;});}
  if(engine==='pi'){
   expect(container.querySelector('#model-name')).toHaveValue('saved-pi-text');expect(container.querySelector('#multimodal-image-model')).toHaveValue('saved-pi-image');expect(screen.getByRole('button',{name:'打开模型配置手册'})).toBeInTheDocument();
  }else{
   expect(container.querySelector('[data-highlight="text-model"]')).toBeNull();expect(container.querySelector('[data-highlight="image-model"]')).toBeNull();expect(screen.queryByRole('button',{name:'打开模型配置手册'})).toBeNull();expect(screen.getByText('文本创作、图片理解和生图由本地 Codex 执行')).toBeInTheDocument();
  }
 });
 it.each(['pi','codex'] as const)('pending只保留实际ASR/video serviceId凭证，读回%s后不猜服务名称',{timeout:180_000,retry:0},async engine=>{
  vi.resetModules();let resolve!:(value:ReturnType<typeof preference>)=>void;const pending=new Promise<ReturnType<typeof preference>>(r=>{resolve=r;});api.getPreferences.mockClear().mockReturnValue(pending);
  const {SettingsModelRegion:PendingRegion}=await import('./settings-model-region'),state=authority();state.capabilities!.default={...state.capabilities!.default!,serviceId:'shared-id'};
  const {container}=render(<PendingRegion viewModel={viewModel()} modelAuthority={sanitizeModelAuthorityForClient(state)} highlight="video-model"/>),ids=()=>[...container.querySelectorAll('[data-slot="channel-model-service-credential"]')].map(node=>node.getAttribute('data-service-id'));
  try{await waitFor(()=>expect(api.getPreferences).toHaveBeenCalled());expect(ids()).toEqual(['media-id','shared-id']);expect(api.putChannelModelCredential).not.toHaveBeenCalled();expect(api.testModelConnection).not.toHaveBeenCalled();}finally{await act(async()=>{resolve(preference(engine));await pending;});}
  expect(ids()).toEqual(engine==='pi'?['text-id','image-id','media-id','shared-id']:['media-id','shared-id']);
 });
 it('Codex不呈现text/image配置卡或密钥要求，ASR/video仍真实渲染',{timeout:120_000,retry:0},async()=>{
  const {container}=render(<SettingsModelRegion viewModel={viewModel()} highlight="video-model"/>);await screen.findByText('本地 Codex 已连接 · 0.159.3 · 文本与生图可用');
  expect(container.querySelector('[data-highlight="text-model"]')).toBeNull();expect(container.querySelector('[data-highlight="image-model"]')).toBeNull();expect(container.querySelector('#model-name')).toBeNull();expect(container.querySelector('#multimodal-image-model')).toBeNull();expect(screen.getByText('文本创作、图片理解和生图由本地 Codex 执行')).toBeInTheDocument();expect(screen.getByText(/无需填写文本或生图模型密钥/)).toBeInTheDocument();
  expect(container.querySelector('[data-highlight="asr-model"]')).not.toBeNull();expect(container.querySelector('[data-highlight="video-model"]')).not.toBeNull();expect(container.querySelector('#multimodal-audio-model')).toHaveValue('saved-asr');expect(container.querySelector('#multimodal-video-model')).toHaveValue('saved-video');expect(api.putModel).not.toHaveBeenCalled();
 });
 it('保存Pi后读回原text/image配置；切换不删除配置或改写媒体设置',{timeout:120_000,retry:0},async()=>{
  const {container}=render(<SettingsModelRegion viewModel={viewModel()} highlight="video-model"/>);fireEvent.change(screen.getByRole('combobox',{name:'编导引擎'}),{target:{value:'pi'}});await waitFor(()=>expect(container.querySelector('#model-name')).toHaveValue('saved-pi-text'));
  expect(container.querySelector('#multimodal-image-model')).toHaveValue('saved-pi-image');expect(container.querySelector('#multimodal-audio-model')).toHaveValue('saved-asr');expect(container.querySelector('#multimodal-video-model')).toHaveValue('saved-video');expect(container.querySelector('[data-slot="codex-model-capabilities"]')).toBeNull();expect(api.patchPreferences).toHaveBeenCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'pi'}});expect(api.putModel).not.toHaveBeenCalled();
 });
 it('切换保存失败保留Codex免text/image配置区域，失败反馈可见',{timeout:120_000,retry:0},async()=>{
  api.patchPreferences.mockRejectedValueOnce(Error('service-save-failed'));const {container}=render(<SettingsModelRegion viewModel={viewModel()} highlight="video-model"/>);fireEvent.change(screen.getByRole('combobox',{name:'编导引擎'}),{target:{value:'pi'}});await screen.findByText('引擎保存失败，请重试');expect(screen.getByRole('combobox',{name:'编导引擎'})).toHaveValue('codex');expect(container.querySelector('[data-highlight="text-model"]')).toBeNull();expect(container.querySelector('[data-highlight="image-model"]')).toBeNull();expect(api.putModel).not.toHaveBeenCalled();
 });
 it.each([{loginStatus:'unauthenticated',imageGeneration:false,message:'本地 Codex 尚未登录，请先在 Codex 中登录'},{loginStatus:'authenticated',imageGeneration:false,message:'本地 Codex 已连接 · 0.159.3 · 文本可用，生图能力当前不可用'}])('真实状态%s不引导另配文本或生图API',{timeout:120_000,retry:0},async test=>{
  vi.mocked(fetch).mockImplementation(async()=>status(test.loginStatus,test.imageGeneration));const {container}=render(<SettingsModelRegion viewModel={viewModel()} highlight="video-model"/>);await screen.findByText(test.message);expect(container.querySelector('[data-highlight="text-model"]')).toBeNull();expect(container.querySelector('[data-highlight="image-model"]')).toBeNull();expect(container.querySelector('[data-highlight="asr-model"]')).not.toBeNull();expect(container.querySelector('[data-highlight="video-model"]')).not.toBeNull();
 });
 it('后端Pi已经保存时保留原完整四类配置卡',{timeout:120_000,retry:0},async()=>{
  api.getPreferences.mockResolvedValue(preference('pi'));await act(async()=>loadAssistantEngine(true));const {container}=render(<SettingsModelRegion viewModel={viewModel()} highlight="image-model"/>);for(const key of ['text-model','image-model','asr-model','video-model'])expect(container.querySelector(`[data-highlight="${key}"]`)).not.toBeNull();expect(container.querySelector('#model-name')).toHaveValue('saved-pi-text');expect(container.querySelector('#multimodal-image-model')).toHaveValue('saved-pi-image');
 });
});
