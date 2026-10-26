import {it,expect} from 'vitest';
import type {GraphicPostDocument,ArticleDocument} from '@creatoros/contract';
import {projectGraphic,projectArticle,assetSource} from './projection';
const image=(id:string,role:'cover'|'card',order:number,cardId?:string)=>({assetId:id,assetFileId:`file-${id}`,role,order,...(cardId?{cardId}:{})});
it('图文按封面、原卡片顺序、剩余素材投影，发布配文独立保留',()=>{
 const doc:GraphicPostDocument={schemaVersion:1,title:'确定的稿',body:'正文',summary:'',tags:[],imageUses:[image('last','card',5),image('card','card',1,'c2'),image('cover','cover',0)],cardBriefs:[{cardId:'c1',title:'第一卡',body:'一',sourceRefs:[]},{cardId:'c2',title:'第二卡',body:'二',sourceRefs:[]}],sourceRefs:[],ruleSnapshotRef:null};const before=JSON.stringify(doc);const p=projectGraphic(doc);expect(p.markdown.indexOf(assetSource(doc.imageUses[2]!))).toBeLessThan(p.markdown.indexOf('第一卡'));expect(p.markdown.indexOf('第一卡')).toBeLessThan(p.markdown.indexOf('第二卡'));expect(p.markdown.indexOf(assetSource(doc.imageUses[1]!))).toBeLessThan(p.markdown.indexOf(assetSource(doc.imageUses[0]!)));expect(p.images).toHaveLength(3);expect(JSON.stringify(doc)).toBe(before);
});
it('正文已有精确引用不重复，未登记图片不进入投影',()=>{
 const use=image('one','card',0);const doc:GraphicPostDocument={schemaVersion:1,title:'',body:`![保留](${assetSource(use)})\n![未知](creatoros-asset:fake:file)`,summary:'',tags:[],imageUses:[use],sourceRefs:[],ruleSnapshotRef:null};const p=projectGraphic(doc);expect(p.markdown.split(assetSource(use))).toHaveLength(2);expect(p.markdown).not.toContain('creatoros-asset:fake');
});
it('文章去除内部标记并接入精确图片，不重排段落 ID',()=>{
 const doc:ArticleDocument={schemaVersion:1,title:'主稿',summary:'',sections:[{sectionId:'s',order:0,heading:'一',headingLevel:2,body:'正文',sourceRefs:[]}],imageUses:[{sectionId:'s',assetId:'asset',assetFileId:'file',sourceKind:'existing',reviewState:'selected'}],visualBriefs:[],factItems:[]};const p=projectArticle(doc);expect(p.markdown).toContain('![图片](creatoros-asset:asset:file)');expect(p.markdown).not.toContain('creatoros-section');expect(doc.sections[0]?.sectionId).toBe('s');
});
it('同一精确图片可按用户选择同时用于封面和图卡，allowlist 下载一次',()=>{const use=image('same','card',1,'c');const doc:GraphicPostDocument={schemaVersion:1,title:'稿',body:'正文',summary:'',tags:[],imageUses:[{...use,role:'cover',order:0},use],cardBriefs:[{cardId:'c',title:'卡',body:'正文',sourceRefs:[]}],sourceRefs:[],ruleSnapshotRef:null};const p=projectGraphic(doc);expect(p.images).toHaveLength(1);expect(p.markdown.split(assetSource(use))).toHaveLength(3);});
it('代码块和行内代码的图片示例保持原文，不被当成可下载图片',()=>{
 const code='```markdown\n![示例](https://example.test/image.png)\n<img src="https://example.test/image.png">\n<!-- creatoros-section:example -->\n```\n\n`![行内](https://example.test/inline.png)`';
 const doc:GraphicPostDocument={schemaVersion:1,title:'',body:code,summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null};
 expect(projectGraphic(doc).markdown).toBe(code);
});
it('正文中的文字引用或代码引用不吞掉已选择的正式素材',()=>{
 const use=image('one','card',0);const body=`精确引用为 ${assetSource(use)}\n\n\`![代码](${assetSource(use)})\``;
 const doc:GraphicPostDocument={schemaVersion:1,title:'',body,summary:'',tags:[],imageUses:[use],sourceRefs:[],ruleSnapshotRef:null};
 expect(projectGraphic(doc).markdown).toBe(`${body}\n\n---\n\n![图片](${assetSource(use)})`);
});

it('已规划图片页不会再把发布配文铺成额外长图',()=>{
 const doc:GraphicPostDocument={schemaVersion:1,title:'发布标题',body:'这是独立发布配文，不是图片页文字。',summary:'',tags:[],imageUses:[],cardBriefs:[{cardId:'a',title:'第一张',body:'一页一个内容点',sourceRefs:[]},{cardId:'b',title:'第二张',body:'接着说明方法',sourceRefs:[]}],sourceRefs:[],ruleSnapshotRef:null};
 const before=structuredClone(doc),projection=projectGraphic(doc);expect(projection.markdown).not.toContain(doc.body);expect(projection.markdown).not.toContain('# 发布标题');expect(projection.markdown).toBe('## 第一张\n\n一页一个内容点\n\n---\n\n## 第二张\n\n接着说明方法');expect(doc).toEqual(before);
});
