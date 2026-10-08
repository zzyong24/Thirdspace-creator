// Deterministic edit lifecycle; not a content/creative decision.
let exporting=false;
let epoch=0;
const importedAssets=new WeakMap<object,number>();
const blockedEvents=['pointerdown','pointerup','mousedown','mouseup','click','dblclick','keydown','keyup','beforeinput','input','change','paste','cut','drop','dragstart','contextmenu','wheel','blur','focusout'];
export function isExportLocked(){return exporting;}
export function currentEditEpoch(){return epoch;}
export function advanceEditEpoch(){epoch++;}
export function assertEditable(){if(exporting)throw new Error('正在导出当前稿，请完成后再编辑。');}
export function assertImportEpoch(captured:number){if(exporting||captured!==epoch)throw new Error('导出前未完成的素材导入已暂停，请导出后重新加入。');}
export function stampImportedAsset(asset:object,captured:number){assertImportEpoch(captured);importedAssets.set(asset,captured);}
export function assertImportedAssetCurrent(asset:object){assertEditable();const captured=importedAssets.get(asset);if(captured!==undefined)assertImportEpoch(captured);}
export function beginExportLock(){
 assertEditable();exporting=true;epoch++;
 const stop=(event:Event)=>{if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();};
 for(const type of blockedEvents)window.addEventListener(type,stop,{capture:true,passive:false});
 const body=typeof document!=='undefined'?document.body:null;
 const originalInert=body?.inert;
 if(body)body.inert=true;
 window.dispatchEvent(new CustomEvent('creatoros-reference-export-lock',{detail:true}));
 let released=false;
 return ()=>{if(released)return;released=true;exporting=false;epoch++;for(const type of blockedEvents)window.removeEventListener(type,stop,true);if(body)body.inert=originalInert??false;window.dispatchEvent(new CustomEvent('creatoros-reference-export-lock',{detail:false}));};
}
