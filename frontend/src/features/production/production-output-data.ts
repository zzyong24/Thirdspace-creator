import type { ScriptDataClient } from "@/features/script/script-editor-data";

export interface ProductionOutputRef {id:string;contentType:string;title?:string}
// SEMANTIC_BOUNDARY_ALLOW: 仅按已声明类型/真实 ID 定位用户选定作品，不推断创作意图。
export function selectProductionOutput(outputs:ReadonlyArray<ProductionOutputRef>,requestedId?:string) {
  const videos=outputs.filter(o=>o.contentType==="video");
  if(requestedId)return {videos,output:videos.find(o=>o.id===requestedId)??null,invalid:!videos.some(o=>o.id===requestedId)};
  return {videos,output:videos.length===1?videos[0]!:null,invalid:false};
}

export async function resolveProductionScriptArtifactId(client:ScriptDataClient,projectId:string,outputId:string,legacyFallback:boolean):Promise<string|null> {
  if(!client.listArtifacts)return null;
  const seen=new Set<string>();let fallback:string|null=null;
  for(let page=1;;page++) {
    const listed=await client.listArtifacts({params:{projectId},query:{page,pageSize:100},body:undefined});
    const rows=Array.isArray(listed)?listed as Array<{id:string;artifactType:string;contentOutputId?:string|null}>:[];
    const fresh=rows.filter(r=>!seen.has(r.id));rows.forEach(r=>seen.add(r.id));
    const own=rows.find(r=>r.artifactType==="output_script" && r.contentOutputId===outputId);
    if(own)return own.id;
    if(legacyFallback && !fallback)fallback=rows.find(r=>r.artifactType==="master_script" || (r.artifactType==="output_script" && !r.contentOutputId))?.id??null;
    if(rows.length<100 || fresh.length===0)break;
  }
  return fallback;
}
