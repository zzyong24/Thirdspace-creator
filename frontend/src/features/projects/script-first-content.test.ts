import {describe,it,expect} from 'vitest';
import {inheritArticleScript,inheritGraphicScript} from './script-first-content';
import {articleDocument,graphicPostDocument,type ProjectScriptContext} from '@creatoros/contract';
const context:ProjectScriptContext={state:'ready',scriptRef:{kind:'project_script',id:'script',versionId:'v1'},scriptText:'第一段原话。\n\n第二段保留换行。',metadata:{title:'原稿',summary:'',tags:[]}};
const article=()=>articleDocument.parse({schemaVersion:1,title:'',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]});
const graphic=()=>graphicPostDocument.parse({schemaVersion:1,title:'',body:'',summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null});
describe('脚本默认承接与平台隔离',()=>{
 it('公众号逐字承接一个真实来源段，原输入不变且投影可重复',()=>{const source=article();const next=inheritArticleScript(source,context);expect(next.sections).toHaveLength(1);expect(next.sections[0]).toMatchObject({body:context.scriptText,sourceRefs:[context.scriptRef]});expect(articleDocument.safeParse(next).success).toBe(true);expect(source.sections).toEqual([]);expect(inheritArticleScript(next,{...context,scriptText:'更新原稿'})).toBe(next);});
 it('图文承接正文和来源，不自动拆卡',()=>{const next=inheritGraphicScript(graphic(),context);expect(next.body).toBe(context.scriptText);expect(next.sourceRefs).toContainEqual(context.scriptRef);expect(next.cardBriefs??[]).toEqual([]);expect(graphicPostDocument.safeParse(next).success).toBe(true);});
 it('已有分段或图卡即使正文为空也保留；独立成稿不覆写',()=>{const a={...article(),title:'平台标题',sections:[{sectionId:'s',order:0,heading:'保留',headingLevel:2,body:'',sourceRefs:[]}]};const g={...graphic(),cardBriefs:[{cardId:'c',title:'保留',body:'',sourceRefs:[]}]};expect(inheritArticleScript(a,context)).toBe(a);expect(inheritGraphicScript(g,context)).toBe(g);const existing={...graphic(),body:'平台调整'};expect(inheritGraphicScript(existing,context)).toBe(existing);});
 it('空脚本、读失败、无不可变版本均不制造正文',()=>{for(const c of [undefined,{...context,state:'empty' as const},{...context,state:'unavailable' as const},{...context,scriptText:'   '},{...context,scriptRef:null}]){const a=article(),g=graphic();expect(inheritArticleScript(a,c).sections).toEqual([]);expect(inheritGraphicScript(g,c).body).toBe('');}});
});
