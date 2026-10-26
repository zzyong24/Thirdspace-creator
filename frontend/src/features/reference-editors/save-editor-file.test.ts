import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {saveEditorFile} from './save-editor-file';
const h=vi.hoisted(()=>({desktop:true,invoke:vi.fn()}));
vi.mock('@/lib/desktop-updater',()=>({isDesktopRuntimeClient:()=>h.desktop}));
vi.mock('@tauri-apps/api/core',()=>({invoke:h.invoke}));
beforeEach(()=>{h.desktop=true;h.invoke.mockReset();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['saved','cancelled'] as const)('桌面原样交付HTML/PNG/ZIP字节，诚实返回%s',async outcome=>{
 for(const [mime,name] of [['text/html','文章.html'],['image/png','图.png'],['application/zip','图文.zip']]){
  h.invoke.mockResolvedValueOnce(outcome);const blob=new Blob(['中文\x00\xff'],{type:mime});const valid=vi.fn();
  expect(await saveEditorFile(blob,name!,valid)).toBe(outcome);expect(valid).toHaveBeenCalledTimes(2);
  const args=h.invoke.mock.calls.at(-1)![1];expect(args).toMatchObject({mime,suggestedName:name});
  expect(Uint8Array.from(atob(args.bytesBase64),c=>c.charCodeAt(0))).toEqual(new Uint8Array(await blob.arrayBuffer()));
 }
});
it('读取字节期间换稿不打开保存面板',async()=>{
 let finish!:(value:ArrayBuffer)=>void;const blob=new Blob(['旧稿'],{type:'text/html'});vi.spyOn(blob,'arrayBuffer').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 let current=true;const promise=saveEditorFile(blob,'文章.html',()=>{if(!current)throw Error('稿件已改变');});current=false;finish(new ArrayBuffer(2));
 await expect(promise).rejects.toThrow('稿件已改变');expect(h.invoke).not.toHaveBeenCalled();
});
it('并发保存被拦截，取消或拒绝后释放槽位；无效回执不报成功',async()=>{
 let finish!:(value:string)=>void;h.invoke.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const blob=new Blob(['zip'],{type:'application/zip'});
 const first=saveEditorFile(blob,'图文.zip',()=>{});await vi.waitFor(()=>expect(h.invoke).toHaveBeenCalledOnce());
 await expect(saveEditorFile(blob,'第二.zip',()=>{})).rejects.toThrow('已有保存面板');finish('cancelled');await expect(first).resolves.toBe('cancelled');
 h.invoke.mockRejectedValueOnce(Error('保存失败'));await expect(saveEditorFile(blob,'图文.zip',()=>{})).rejects.toThrow('保存失败');
 h.invoke.mockResolvedValueOnce('unknown');await expect(saveEditorFile(blob,'图文.zip',()=>{})).rejects.toThrow('保存回执无效');
 h.invoke.mockResolvedValueOnce('saved');await expect(saveEditorFile(blob,'图文.zip',()=>{})).resolves.toBe('saved');
});
it('原生格式和大小边界在读取字节前拒绝',async()=>{
 await expect(saveEditorFile(new Blob(['exe'],{type:'application/octet-stream'}),'程序.exe',()=>{})).rejects.toThrow('不支持');
 const blob=new Blob(['zip'],{type:'application/zip'});Object.defineProperty(blob,'size',{value:100*1024*1024+1});
 await expect(saveEditorFile(blob,'图文.zip',()=>{})).rejects.toThrow('大小限制');expect(h.invoke).not.toHaveBeenCalled();
});
it('网页保留下载，不冒充本机已保存',async()=>{
 h.desktop=false;const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:export'),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const blob=new Blob(['zip'],{type:'application/zip'});expect(await saveEditorFile(blob,'图文.zip',()=>{})).toBe('download-started');expect(create).toHaveBeenCalledWith(blob);expect(click).toHaveBeenCalledOnce();expect(h.invoke).not.toHaveBeenCalled();
});
