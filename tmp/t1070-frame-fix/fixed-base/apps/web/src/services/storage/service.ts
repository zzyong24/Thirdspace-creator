// CreatorOS embed: upstream engine owns editing; backend owns persisted documents/Assets.
// Only transient state lives here. No IndexedDB/OPFS or second project store.
import type { TProject, TProjectMetadata } from '@/project/types';
import type { MediaAsset } from '@/media/types';
import type { SerializedProject, MediaAssetData } from './types';
import type { SavedSoundsData } from '@/sounds/types';
import { getRegisteredMediaId } from '@/embedded/media-registration';
function cloneSerializable(value:unknown){return JSON.parse(JSON.stringify(value,(key,value)=>{
 if(['file','url','thumbnailUrl','thumbnail','buffer'].includes(key))return undefined;
 if(value instanceof Blob || value instanceof AudioBuffer)return undefined;
 if(typeof value==='string' && value.startsWith('blob:'))return undefined;
 return value;
}));}
// SEMANTIC_BOUNDARY_ALLOW: deterministic structural equality only suppresses
// duplicate persistence notifications. It does not classify or choose content.
function stableStructure(value:unknown):unknown {
 if(Array.isArray(value))return value.map(stableStructure);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableStructure((value as Record<string,unknown>)[key])]));
 return value;
}
function contentFingerprint(project:TProject|null,media:Map<string,MediaAsset>){
 const document=project?cloneSerializable(project):null;
 // These are upstream autosave timestamps, not an editorial change.
 if(document){delete document.metadata.updatedAt;for(const scene of document.scenes??[])delete scene.updatedAt;}
 const mediaMetadata=[...media.values()].map(a=>({mediaId:a.id,name:a.name,type:a.type,size:a.file.size,lastModified:a.file.lastModified,width:a.width,height:a.height,duration:a.duration,fps:a.fps,hasAudio:a.hasAudio})).sort((a,b)=>a.mediaId.localeCompare(b.mediaId));
 return JSON.stringify(stableStructure({document,mediaMetadata}));
}
export class StorageService {
 private project:TProject|null=null;
 private media=new Map<string,MediaAsset>();
 private loading=true;
 private lastContentFingerprint:string|null=null;
 hostReset(){this.loading=true;this.lastContentFingerprint=null;this.project=null;for(const a of this.media.values())if(a.url?.startsWith('blob:'))URL.revokeObjectURL(a.url);this.media.clear();}
 hostLoaded(){this.lastContentFingerprint=contentFingerprint(this.project,this.media);this.loading=false;}
 private changed(){
  if(this.loading)return;
  const fingerprint=contentFingerprint(this.project,this.media);
  if(fingerprint===this.lastContentFingerprint)return;
  this.lastContentFingerprint=fingerprint;
  window.dispatchEvent(new Event('creatoros-reference-changed'));
 }
 async canStoreFile({size}:{size:number}){if(!Number.isSafeInteger(size)||size<0)throw new Error('素材文件大小无效。');return {canStore:true as const,reason:'estimate-unavailable' as const,availableBytes:null};}
 isQuotaExceededError(_?:unknown){return false;}
 async saveProject({project}:{project:TProject}){this.project=project;this.changed();}
 async loadProject({id}:{id:string}){return this.project?.metadata.id===id?{project:this.project}:null;}
 async loadAllProjects(){return this.project?[this.project]:[];}
 async loadAllProjectsMetadata(){return this.project?[this.project.metadata]:[];}
 async deleteProject({id}:{id:string}){if(this.project?.metadata.id===id){this.project=null;this.changed();}}
 async saveMediaAsset({projectId,mediaAsset}:{projectId:string,mediaAsset:MediaAsset}){if(this.project?.metadata.id!==projectId)throw new Error('素材不属于当前作品。');if(getRegisteredMediaId(mediaAsset.file)!==mediaAsset.id)throw new Error('素材ID不匹配。');this.media.set(mediaAsset.id,mediaAsset);this.changed();}
 async loadMediaAsset({projectId,id}:{projectId:string,id:string}){if(this.project?.metadata.id!==projectId)throw new Error('素材不属于当前作品。');return this.media.get(id)||null;}
 async loadAllMediaAssets({projectId}:{projectId:string}){if(this.project?.metadata.id!==projectId)throw new Error('素材不属于当前作品。');return [...this.media.values()];}
 async deleteMediaAsset({projectId,id}:{projectId:string,id:string}){if(this.project?.metadata.id!==projectId)throw new Error('素材不属于当前作品。');this.media.delete(id);this.changed();}
 async deleteProjectMedia({projectId}:{projectId:string}){if(this.project?.metadata.id!==projectId)throw new Error('作品已切换。');this.media.clear();this.changed();}
 async clearAllData(){this.hostReset();}
 async getStorageInfo(){return {projects:this.project?1:0,isOPFSSupported:false,isIndexedDBSupported:false};}
 async getProjectStorageInfo(_?:unknown){return {mediaItems:this.media.size};}
 async loadSavedSounds():Promise<SavedSoundsData>{return {sounds:[],lastModified:new Date().toISOString()};}
 async saveSoundEffect(_?:unknown){throw new Error('请从作品素材中选择音频。');}
 async removeSavedSound(_?:unknown){}
 async isSoundSaved(_?:unknown){return false;}
 async clearSavedSounds(){}
 isOPFSSupported(){return false;}
 isIndexedDBSupported(){return false;}
 isFullySupported(){return true;}
 snapshot(){if(!this.project)throw new Error('尚未加载作品。');return {document:cloneSerializable(this.project) as SerializedProject,mediaMetadata:[...this.media.values()].map(a=>({mediaId:a.id,name:a.name,type:a.type,size:a.file.size,lastModified:a.file.lastModified,width:a.width,height:a.height,duration:a.duration,fps:a.fps,hasAudio:a.hasAudio}))};}
}
export const storageService = new StorageService();
