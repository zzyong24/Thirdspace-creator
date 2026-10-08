import {test,expect,beforeAll} from 'bun:test';
let protocol:typeof import('../protocol');let StorageService:typeof import('../../services/storage/service').StorageService;let register:typeof import('../media-registration');
let changedEvents=0;const host={postMessage(){}};const listeners=new Map<string,Function>();
beforeAll(async()=>{Object.assign(globalThis,{location:{origin:'http://localhost:4193',href:'http://localhost:4193/index.html#/?session=test',hash:'#/?session=test'},window:{parent:host,addEventListener:(type:string,fn:Function)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type),dispatchEvent:(event:Event)=>{if(event.type==='creatoros-reference-changed')changedEvents++;return true;}},AudioBuffer:class {},indexedDB:new Proxy({},{get(){throw new Error('No browser database permitted');}})});protocol=await import('../protocol');register=await import('../media-registration');({StorageService}=await import('../../services/storage/service'));});
function event(overrides:Record<string,unknown>={}){return {source:host,origin:'http://localhost:4193',data:{type:'creatoros.reference-editor',version:1,session:'test',requestId:'request-1',operation:'snapshot'},...overrides} as MessageEvent;}
test('bridge accepts only exact same-origin parent/session/protocol',()=>{expect(protocol.validMessage(event())).toBe(true);expect(protocol.validMessage(event({origin:'https://external.example'}))).toBe(false);expect(protocol.validMessage(event({source:{}}))).toBe(false);for(const data of [{...event().data,session:'other'},{...event().data,version:2},{...event().data,type:'unknown'},{...event().data,requestId:''}])expect(protocol.validMessage(event({data}))).toBe(false);});
test('storage holds one current output and snapshots without runtime binaries/URLs',async()=>{const storage=new StorageService();const file=new File(['fixture'],'a.png',{type:'image/png'});register.rememberMediaFile(file,'asset-one');await storage.saveProject({project:{metadata:{id:'output-one',name:'稿件',createdAt:new Date(),updatedAt:new Date(),thumbnail:'blob:temporary'},scenes:[{tracks:{audio:[{elements:[{buffer:new AudioBuffer()}]}]}}],settings:{},version:31} as any});expect(await storage.loadProject({id:'other-output'})).toBeNull();await storage.saveMediaAsset({projectId:'output-one',mediaAsset:{id:'asset-one',file,name:'a.png',type:'image',url:'blob:temporary',thumbnailUrl:'blob:thumbnail'}});await expect(storage.saveMediaAsset({projectId:'wrong-output',mediaAsset:{id:'asset-one',file,name:'a.png',type:'image'}})).rejects.toThrow('不属于');await expect(storage.saveMediaAsset({projectId:'output-one',mediaAsset:{id:'wrong-asset',file,name:'a.png',type:'image'}})).rejects.toThrow('不匹配');const snapshot=storage.snapshot(),json=JSON.stringify(snapshot);expect(json).not.toContain('blob:');expect(json).not.toContain('thumbnail');expect(json).not.toContain('buffer');expect(json).not.toContain('"file"');expect(snapshot.mediaMetadata[0].mediaId).toBe('asset-one');storage.hostReset();expect(await storage.loadProject({id:'output-one'})).toBeNull();});


test('export returns the exact frozen render document and rejects delayed imported edits',async()=>{
 const lock=await import('../edit-lock');
 const {exportFrozenSnapshot}=await import('../frozen-export');
 const {storageService}=await import('../../services/storage/service');
 storageService.hostReset();
 const project={metadata:{id:'output-freeze',name:'冻结标题',createdAt:new Date(),updatedAt:new Date()},scenes:[{id:'scene-one',tracks:{main:{elements:[{id:'clip-one',name:'冻结剪辑'}]},audio:[],overlay:[]},createdAt:new Date(),updatedAt:new Date()}],currentSceneId:'scene-one',settings:{fps:{numerator:30,denominator:1}},version:31};
 await storageService.saveProject({project:project as any});
 const imported={};const beforeEpoch=lock.currentEditEpoch();lock.stampImportedAsset(imported,beforeEpoch);
 let frozen:any;let finish!:(result:any)=>void;
 const deferred=new Promise(resolve=>finish=resolve);
 const editor={playback:{pause(){}},save:{pause(){},resume(){},async flush(){}},timeline:{getTotalDuration(){return 5000000;}},media:{getAssets(){return [];}},renderer:{exportProject(args:any){frozen=args.frozen;return deferred;}}};
 const pending=exportFrozenSnapshot(editor as any,'mp4');
 await Promise.resolve();await Promise.resolve();
 expect(lock.isExportLocked()).toBe(true);expect(()=>lock.assertEditable()).toThrow('正在导出');expect(()=>lock.assertImportedAssetCurrent(imported)).toThrow();
 project.metadata.name='晚到标题';project.scenes[0].tracks.main.elements[0].name='晚到剪辑';
 expect(frozen.project.metadata.name).toBe('冻结标题');expect(frozen.tracks.main.elements[0].name).toBe('冻结剪辑');
 finish({success:true,buffer:new ArrayBuffer(4)});
 const result=await pending;
 expect(result.document.metadata.name).toBe('冻结标题');expect(result.document.scenes[0].tracks.main.elements[0].name).toBe('冻结剪辑');expect(result.fileName).toBe('冻结标题.mp4');expect(result.blob.size).toBe(4);expect(lock.isExportLocked()).toBe(false);expect(()=>lock.assertImportedAssetCurrent(imported)).toThrow('未完成');
});
test('failed export releases editing and pending import replies cannot write during the freeze',async()=>{
 const lock=await import('../edit-lock');const {exportFrozenSnapshot}=await import('../frozen-export');
 const upload=register.registerMediaFile(new File(['x'],'pending.png',{type:'image/png'}));
 const observedUpload=upload.catch(error=>error);
 const editor={playback:{pause(){}},save:{pause(){},resume(){},async flush(){}},timeline:{getTotalDuration(){return 1;}},media:{getAssets(){return [];}},renderer:{async exportProject(){return {success:false,error:'真实渲染失败'};}}};
 await expect(exportFrozenSnapshot(editor as any,'mp4')).rejects.toThrow('真实渲染失败');expect((await observedUpload).message).toContain('导出');expect(lock.isExportLocked()).toBe(false);expect(()=>lock.assertEditable()).not.toThrow();
});


test('load baseline suppresses autosave timestamps and identical snapshots but preserves editorial changes',async()=>{
 const storage=new StorageService();
 const project={metadata:{id:'output-clean',name:'原稿',createdAt:new Date(0),updatedAt:new Date(0)},scenes:[{id:'scene-clean',createdAt:new Date(0),updatedAt:new Date(0),tracks:{main:{elements:[{id:'text-one',content:'正文'}]},audio:[],overlay:[]}}],settings:{background:{type:'color',color:'#000000'}},version:31};
 const before=changedEvents;
 await storage.saveProject({project:project as any});storage.hostLoaded();
 expect(changedEvents).toBe(before);
 const timestampOnly=structuredClone(project);timestampOnly.metadata.updatedAt=new Date(1000);timestampOnly.scenes[0].updatedAt=new Date(2000);
 await storage.saveProject({project:timestampOnly as any});
 // Object key insertion order is not a document edit either.
 await storage.saveProject({project:{version:31,settings:timestampOnly.settings,scenes:timestampOnly.scenes,metadata:timestampOnly.metadata} as any});
 expect(changedEvents).toBe(before);
 timestampOnly.scenes[0].tracks.main.elements[0].content='真实改稿';
 await storage.saveProject({project:timestampOnly as any});expect(changedEvents).toBe(before+1);
 await storage.saveProject({project:timestampOnly as any});expect(changedEvents).toBe(before+1);
 timestampOnly.settings.background.color='#ffffff';
 await storage.saveProject({project:timestampOnly as any});expect(changedEvents).toBe(before+2);
 const file=new File(['asset'],'clean.png',{type:'image/png'});register.rememberMediaFile(file,'asset-clean');
 const asset={id:'asset-clean',file,name:'clean.png',type:'image' as const,url:'blob:temp-one'};
 await storage.saveMediaAsset({projectId:'output-clean',mediaAsset:asset});expect(changedEvents).toBe(before+3);
 await storage.saveMediaAsset({projectId:'output-clean',mediaAsset:{...asset,url:'blob:temp-two'}});expect(changedEvents).toBe(before+3);
 await storage.deleteMediaAsset({projectId:'output-clean',id:'asset-clean'});expect(changedEvents).toBe(before+4);
});
