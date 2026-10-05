import {ENDPOINTS,type WorkMemberRef,type WorkMaterialTarget,type WorkOwnerVersion,type WorkAssetFile} from '@creatoros/contract';
import {client} from '@/lib/contract-client';
export type MaterialCommand={compositionId:string;operation:'attach'|'replace'|'detach';body:unknown};
export type MaterialSlot={id:string;label:string;member:WorkMemberRef;target:WorkMaterialTarget;version:WorkOwnerVersion;files:WorkAssetFile[];occupiedUnknown?:boolean;mediaType?:"image"|"video"};
export function parseMaterialCommand(raw:unknown,compositionId:string):MaterialCommand|null{
 if(!raw||typeof raw!=='object')return null;
 const value=raw as MaterialCommand;if(value.compositionId!==compositionId)return null;
 const schema=value.operation==='attach'?ENDPOINTS.attachWorkCompositionMaterial.body:value.operation==='replace'?ENDPOINTS.replaceWorkCompositionMaterial.body:value.operation==='detach'?ENDPOINTS.detachWorkCompositionMaterial.body:null;
 const result=schema?.safeParse(value.body);return result?.success?{compositionId,operation:value.operation,body:result.data}:null;
}
export async function executeMaterial(command:MaterialCommand){const params={compositionId:command.compositionId};
 if(command.operation==='attach')return client.attachWorkCompositionMaterial({params,query:undefined,body:ENDPOINTS.attachWorkCompositionMaterial.body!.parse(command.body)});
 if(command.operation==='replace')return client.replaceWorkCompositionMaterial({params,query:undefined,body:ENDPOINTS.replaceWorkCompositionMaterial.body!.parse(command.body)});
 return client.detachWorkCompositionMaterial({params,query:undefined,body:ENDPOINTS.detachWorkCompositionMaterial.body!.parse(command.body)});
}
export async function readMaterialSlots(member:WorkMemberRef):Promise<MaterialSlot[]>{
 if(member.kind==='moments'){const row=await client.getMoments({params:{momentsId:member.momentsId},query:undefined,body:undefined});return[{id:'moments',label:'朋友圈配图（追加）',member,target:{kind:'moments_images',momentsId:member.momentsId},version:{kind:'artifact',artifactId:row.artifactId,versionId:row.currentVersionId},files:row.current.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId}))}];}
 if(member.kind==='article'){const row=await client.getArticle({params:{outputId:member.outputId},query:undefined,body:undefined}),version:WorkOwnerVersion={kind:'artifact',artifactId:row.artifactId,versionId:row.currentVersionId};return[{id:'cover',label:'公众号封面',member,target:{kind:'article_cover',outputId:member.outputId},version,files:row.current.coverImageUse?[row.current.coverImageUse]:[]},...row.current.sections.map(section=>({id:section.sectionId,label:`正文配图：${section.heading}`,member,target:{kind:'article_image' as const,outputId:member.outputId,sectionId:section.sectionId},version,files:row.current.imageUses.filter(file=>file.sectionId===section.sectionId)}))];}
 if(member.kind==='image'){const row=await client.getGraphicPost({params:{outputId:member.outputId},query:undefined,body:undefined}),version:WorkOwnerVersion={kind:'artifact',artifactId:row.artifactId,versionId:row.currentVersionId};return[{id:'cover',label:'图文封面',member,target:{kind:'image_cover',outputId:member.outputId},version,files:row.current.imageUses.filter(file=>file.role==='cover')},...(row.current.cardBriefs??[]).map(card=>({id:card.cardId,label:`图卡：${card.title}`,member,target:{kind:'image_card' as const,outputId:member.outputId,cardId:card.cardId},version,files:row.current.imageUses.filter(file=>file.role==='card'&&file.cardId===card.cardId)}))];}
 // 视频只读原正式slot；occupied alias不会被解释为真实文件。
 const row=await client.getProductionEditor({params:{outputId:member.outputId},query:undefined,body:undefined});
 const {productionPlanV2}=await import('@creatoros/contract');const plan=productionPlanV2.safeParse(row.plan);
 if(!plan.success)return[];
 const slots=parseVideoSlots(plan.data.overlayDraft.mediaSlots??[]);
 const empty=slots.map(slot=>({id:slot.id,label:slot.label,mediaType:slot.role==='broll'?'video' as const:'image' as const,member,target:{kind:'video_material' as const,outputId:member.outputId,itemId:slot.id},version:{kind:'production' as const,outputId:member.outputId,revision:row.revision},files:[],occupiedUnknown:slot.role==='image-card'?plan.data.overlayDraft.scenes.some(scene=>scene.cards.some(card=>card.id===slot.id)):plan.data.overlayDraft.broll.some(item=>item.id===slot.id)}));
 const occupied:Array<{id:string;label:string;mediaType:'image'|'video'}>=[...plan.data.overlayDraft.scenes.flatMap(scene=>scene.cards.filter(card=>card.kind==='image'&&card.hidden!==true).map(card=>({id:card.id,label:card.kind==='image'?card.label:'图片位置',mediaType:'image' as const}))),...plan.data.overlayDraft.broll.filter(item=>item.hidden!==true).map(item=>({id:item.id,label:item.label,mediaType:'video' as const}))];
 return [...empty,...occupied.map(item=>({id:item.id,label:item.label,mediaType:item.mediaType,member,target:{kind:'video_material' as const,outputId:member.outputId,itemId:item.id},version:{kind:'production' as const,outputId:member.outputId,revision:row.revision},files:[],occupiedUnknown:true}))];
}

export async function readPublicationSlot(member:Exclude<WorkMemberRef,{kind:'moments'}>,publicationId:string):Promise<MaterialSlot>{
 const pub=await client.getPublication({params:{publicationId},query:undefined,body:undefined});
 if(pub.contentOutputId!==member.outputId||!pub.currentRevisionId)throw Error('发布稿不属于明确选择的作品或尚未保存');
 for(let page=1;;page++){const rows=ENDPOINTS.listPublicationRevisions.response.array().parse(await client.listPublicationRevisions({params:{publicationId},query:{page,pageSize:100},body:undefined}));const revision=rows.find(row=>row.id===pub.currentRevisionId);
 if(revision)return{id:`publication:${publicationId}`,label:'所选发布稿封面',member,target:{kind:'publication_cover',outputId:member.outputId,publicationId},version:{kind:'publication',publicationId,revisionId:revision.id},files:revision.coverAssetId&&revision.coverAssetFileId?[{assetId:revision.coverAssetId,assetFileId:revision.coverAssetFileId}]:[],occupiedUnknown:!!revision.coverAssetId&&!revision.coverAssetFileId};
 if(rows.length<100)throw Error('真实当前发布版本暂不可读取');}
}

// SEMANTIC_BOUNDARY_ALLOW: 只读取明确公开媒体槽位ID和类型，不匹配场景或选择素材。
function parseVideoSlots(raw:unknown):Array<{id:string;label:string;role:'image-card'|'broll'}>{
 if(!Array.isArray(raw))throw Error('媒体位置协议不合法');const ids=new Set<string>();
 return raw.map(value=>{if(!value||typeof value!=='object')throw Error('媒体位置协议不合法');const row=value as Record<string,unknown>;
 if(typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.label!=='string'||(row.role!=='image-card'&&row.role!=='broll')||!('anchor'in row))throw Error('媒体位置ID或类型不合法');ids.add(row.id);return{id:row.id,label:row.label,role:row.role};});
}
