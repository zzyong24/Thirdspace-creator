import { send, validMessage } from './protocol';
import {assertEditable,isExportLocked} from './edit-lock';
let files = new WeakMap<File,string>();
const pending = new Map<string,{resolve:(id:string)=>void,reject:(e:Error)=>void,timer:ReturnType<typeof setTimeout>}>();
export function cancelPendingMediaImports(reason:string){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(reason));}pending.clear();}
export function resetMediaRegistration(){cancelPendingMediaImports('作品已切换，请重新加入素材。');files=new WeakMap();}
export function rememberMediaFile(file:File,id:string){if(!(file instanceof File)||!id)throw new Error('素材文件或真实ID缺失。');files.set(file,id);}
export function getRegisteredMediaId(file:File){const id=files.get(file);if(!id)throw new Error('素材尚未保存至作品。');return id;}
export async function registerMediaFile(file:File):Promise<string>{assertEditable();const known=files.get(file);if(known)return known;const requestId=crypto.randomUUID();const id=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('保存素材超时，请重试。'));},60000);pending.set(requestId,{resolve,reject,timer});send('import-media',{file},requestId);});rememberMediaFile(file,id);return id;}
window.addEventListener('message',(event)=>{if(!validMessage(event))return;const m=event.data,p=pending.get(m.requestId);if(!p||isExportLocked())return;if(m.operation==='result'&&m.payload?.operation==='import-media'&&typeof m.payload.mediaId==='string'&&m.payload.mediaId){clearTimeout(p.timer);pending.delete(m.requestId);p.resolve(m.payload.mediaId);}else if(m.operation==='error'){clearTimeout(p.timer);pending.delete(m.requestId);p.reject(new Error(m.payload?.message||'保存素材失败。'));}});
