import {describe,it,expect} from 'vitest';
import {workEditorTarget,workEditorReadInput,workEditorProposeInput} from '../src/resources/work-editor';
const digest='sha256:'+ 'a'.repeat(64);
const target={schemaVersion:1,projectId:'project-a',outputId:'output-a',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'artifact-a',versionId:'version-a'},documentDigest:digest,selection:{kind:'article_sections',sectionIds:['section-a'],field:'body',textRange:{startUtf16:0,endUtf16:2,expectedFieldDigest:digest}}};
it('T1300 owner声明只接受本owner完整候选族，拒绝跨owner/base/scope',async()=>{
 const {workEditorOwnerSchemas}=await import('../src/resources/work-editor');
 expect(workEditorOwnerSchemas).toBeDefined();
 const patches={wechat_article:{kind:'typed_patch',owner:'wechat_article',edits:[{type:'patchArticleMetadata',expectedDocumentDigest:digest,patch:{title:'标题'}}]},graphic_post:{kind:'typed_patch',owner:'graphic_post',edits:[{type:'patchGraphicMetadata',expectedDocumentDigest:digest,patch:{title:'标题'}}]},production:{kind:'typed_patch',owner:'production',sceneId:'scene',edits:[{type:'removeNativeElement',trackId:'track',elementId:'element',expectedElementDigest:digest}]}};
 for(const owner of ['wechat_article','graphic_post','production'] as const){
  const schema=workEditorOwnerSchemas(owner),base=owner==='production'?{kind:'production',productionId:'production',revision:1}:target.savedBase;
  const input={base,baseDigest:digest,summary:'合法修改',candidate:patches[owner]};
  expect(schema.propose.safeParse(input).success).toBe(true);
  for(const other of ['wechat_article','graphic_post','production'] as const)if(other!==owner)expect(schema.propose.safeParse({...input,candidate:patches[other]}).success).toBe(false);
  expect(schema.propose.safeParse({...input,base:owner==='production'?target.savedBase:{kind:'production',productionId:'other',revision:1}}).success).toBe(false);
  expect(schema.read.safeParse({view:'selection',scope:{kind:owner==='production'?'article_sections':'native_elements',sectionIds:[],sceneId:'scene',elementRefs:[]}}).success).toBe(false);
 }
});
describe('T1070 strict目标与typed patch',()=>{
 it('目标不得夹带客户端owner权限',()=>{expect(workEditorTarget.parse(target)).toEqual(target);expect(workEditorTarget.safeParse({...target,userId:'fake'}).success).toBe(false);expect(workEditorTarget.safeParse({...target,savedBase:{kind:'production',productionId:'p',revision:1}}).success).toBe(false);});
 it('局部读绑定同目标，合法UTF16 typed range具有完整前值',()=>{
 expect(workEditorReadInput.parse({view:'field_window',fieldWindow:{target:'article_section',id:'section-a',field:'body',offsetUtf16:0,lengthUtf16:100}}).view).toBe('field_window');
 expect(workEditorReadInput.safeParse({view:'field_window'}).success).toBe(false);
 expect(workEditorProposeInput.safeParse({base:target.savedBase,baseDigest:digest,summary:'改选区',candidate:{kind:'typed_patch',owner:'wechat_article',edits:[{type:'replaceArticleTextRange',sectionId:'section-a',field:'body',expectedFieldDigest:digest,startUtf16:2,endUtf16:1,replacementText:'新文'}]}}).success).toBe(false);
 });
});
