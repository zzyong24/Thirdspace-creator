import {expect,it,vi} from 'vitest';
import {createSelfCollector} from './self';

it('T1212 原self采集将实际导出子阶段写原report，未知输入不泄密',async()=>{
 const progress:unknown[]=[];let entered=false,release!:()=>void;const hold=new Promise<void>(r=>release=r);let notify:((phase:string)=>void)|undefined;
 const collector=createSelfCollector({ingestionService:{ensureDouyinSource:async()=> 'isolated-source'},readMetrics:async()=>({records:[],identity:{}}),readExport:async(_ctx:unknown,onProgress?:typeof notify)=>{entered=true;notify=onProgress;await hold;throw Error('ISOLATED_EXPORT_STOP');},now:()=> '2026-10-11T03:00:00Z',checkScheduledSignal:()=>{},configuration:{}} as never);
 const warning=vi.spyOn(console,'error').mockImplementation(()=>{});const ctx={userId:'isolated-u',groupId:'isolated-g',accountId:'isolated-a',requestId:'isolated-r',source:'user' as const};
 const result=collector(ctx,{__skipHeavyBackfill:true},p=>progress.push(p)).catch(e=>e);
 try{await vi.waitFor(()=>expect(entered).toBe(true));expect(typeof notify).toBe('function');notify!('browser');notify!('download_finish');notify!('PRIVATE_UNTRUSTED_MESSAGE');notify!('constructor');
  expect(progress).toContainEqual({stage:'export_browser',processed:0,total:null,message:'等待采集浏览器与账号会话'});
  expect(progress).toContainEqual({stage:'export_download_finish',processed:0,total:null,message:'等待导出文件下载完成'});
  expect(JSON.stringify(progress)).not.toMatch(/PRIVATE_UNTRUSTED|constructor/);
 }finally{release();expect((await result).message).toBe('ISOLATED_EXPORT_STOP');warning.mockRestore();}
},120000);
