import {it,expect,vi,beforeEach} from 'vitest';
const native=vi.hoisted(()=>vi.fn());
vi.mock('./codex-image-generation',()=>({generateCodexImage:native}));
import {runAssetInWorker} from './asset-worker-run';
const input={kind:'asset.generate' as const,engine:'codex' as const,protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,mediaKind:'image' as const,capability:'image.generate' as const,operationKey:'original',prompt:'原描述',mode:'text_to_image' as const};
const receipt={assetId:'owned-asset',fileId:'original-file',assetType:'image',name:'原图',checksum:'sum',byteLength:3,committedAt:'now'};
const bytes=new Uint8Array([1,2,3]);
beforeEach(()=>{native.mockReset();native.mockResolvedValue({assetBytes:bytes});});
it('新Codex图片reserved先启动，只用原生图片transport，不提前恢复或调用API',async()=>{
 const seen:string[]=[],supplier=vi.fn();
 const result=await runAssetInWorker(input,new AbortController().signal,async(port,data)=>{seen.push(port);if(port==='reserveAssetCall')return {callId:'call',status:'reserved'};if(port==='resolveAssetCredential')return {engine:'codex',kind:'image',runtimeVersion:'0.159.3',protocolKind:'codex-app-server'};if(port==='startAssetCall')return {callId:'call',status:'started'};if(port==='saveAssetResult'){expect(data).toEqual({callId:'call',bytes});return receipt;}throw Error('reserved不能恢复');},supplier);
 expect(seen).toEqual(['reserveAssetCall','resolveAssetCredential','startAssetCall','saveAssetResult']);expect(supplier).not.toHaveBeenCalled();expect(native.mock.calls[0]![4]).toBe(false);expect(result.text).toBe(JSON.stringify(receipt));
});
it('未知Codex图片只读原回合，不再次start或调用API',async()=>{
 const seen:string[]=[],supplier=vi.fn();
 await runAssetInWorker(input,new AbortController().signal,async port=>{seen.push(port);if(port==='reserveAssetCall')return {callId:'original-call',status:'unknown'};if(port==='recoverAssetResult')return {status:'missing'};if(port==='resolveAssetCredential')return {engine:'codex',kind:'image',runtimeVersion:'0.159.3',protocolKind:'codex-app-server'};if(port==='saveAssetResult')return receipt;throw Error('禁止重新启动');},supplier);
 expect(native.mock.calls[0]![1]).toBe('original-call');expect(native.mock.calls[0]![4]).toBe(true);expect(seen).not.toContain('startAssetCall');expect(supplier).not.toHaveBeenCalled();
});
it('保存ACK丢失只核对原已提交素材，不重复生图',async()=>{
 let recovery=0;await runAssetInWorker(input,new AbortController().signal,async port=>{if(port==='reserveAssetCall')return {callId:'call',status:'reserved'};if(port==='resolveAssetCredential')return {engine:'codex',kind:'image',runtimeVersion:'0.159.3',protocolKind:'codex-app-server'};if(port==='startAssetCall')return {callId:'call',status:'started'};if(port==='saveAssetResult')throw Error('ACK丢失');if(port==='recoverAssetResult'){recovery++;return {status:'committed',receipt};}throw Error('unexpected');},vi.fn());expect(recovery).toBe(1);expect(native).toHaveBeenCalledTimes(1);
});
it('原图已回收时不再解析凭据、读取参考图或启动Codex',async()=>{
 const supplier=vi.fn();await runAssetInWorker(input,new AbortController().signal,async port=>{if(port==='reserveAssetCall')return {callId:'call',status:'settled'};if(port==='recoverAssetResult')return {status:'committed',receipt};throw Error('不得访问');},supplier);expect(native).not.toHaveBeenCalled();expect(supplier).not.toHaveBeenCalled();
});
it('参考图片读取拒绝时不能启动或降级成纯文生图',async()=>{
 const seen:string[]=[],supplier=vi.fn();const referenced={...input,mode:'image_to_image' as const,capability:'image.edit' as const,reference:{assetId:'ref',fileId:'version',checksum:'a'.repeat(64),mimeType:'image/png'}};
 await expect(runAssetInWorker(referenced,new AbortController().signal,async port=>{seen.push(port);if(port==='reserveAssetCall')return {callId:'call',status:'reserved'};if(port==='resolveAssetCredential')return {engine:'codex',kind:'image',runtimeVersion:'0.159.3',protocolKind:'codex-app-server'};if(port==='readAssetReference')throw Error('参考版本不属于当前组');throw Error('不得启动');},supplier)).rejects.toThrow('参考版本不属于当前组');expect(seen).not.toContain('startAssetCall');expect(native).not.toHaveBeenCalled();expect(supplier).not.toHaveBeenCalled();
});
