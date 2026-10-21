import {expect,it} from 'vitest';
import {createCurrentArtifactReader,readArtifactVersionTruth} from './current-artifact';
import type {RequestContext} from '@creatoros/contract';
import type {ArtifactRow,ArtifactVersionRow} from '../../modules/artifacts';
const ctx:RequestContext={userId:'user',accountId:'account',requestId:'test',source:'user'};
it('T1382 创作上下文跳过准备来源而显式来源读取仍保留原文',async()=>{
 const rows=[{id:'source',projectId:'project',artifactType:'output_script',currentVersionId:'source-v1'},{id:'draft',projectId:'project',artifactType:'output_script',currentVersionId:'draft-v1'}] as ArtifactRow[];
 const versions=[{id:'source-v1',artifactId:'source',contentText:'来源原文',contentData:{purpose:'project_preparation_source'},versionNumber:1},{id:'draft-v1',artifactId:'draft',contentText:'',contentData:{},versionNumber:1}] as ArtifactVersionRow[];
 const artifactsService={listProjectArtifacts:async()=>rows,listVersions:async(_c:RequestContext,id:string)=>versions.filter(v=>v.artifactId===id),getScriptSections:async()=>[]};
 const read=createCurrentArtifactReader({projectsService:{getProject:async()=>({id:'project'})} as never,artifactsService});
 expect(await read(ctx,'project','output_script')).toMatchObject({artifactId:'draft',fullText:''});
 rows.pop();expect(await read(ctx,'project','output_script')).toBeNull();
 expect(await readArtifactVersionTruth(ctx,rows[0]!,versions[0]!,artifactsService)).toMatchObject({fullText:'来源原文'});
});
