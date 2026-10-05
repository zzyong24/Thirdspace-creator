import {describe,it,expect} from 'vitest';
import {referenceEditorDocument,graphicPostDocument,productionEditorSaveBody} from '../src/index';
const design={editor:'kuaitu',revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',nativeDocument:{version:'5',objects:[{type:'image',src:'creatoros-media://image-a',data:{creatorosMediaId:'image-a'}}]},mediaRefs:[{mediaId:'image-a',assetId:'asset-a',assetFileId:'file-a'}]};
describe('完整开源工作台原生文档合同',()=>{
 it('保留完整图层，媒体ID精确对应引用，拒绝未绑定图像及重复身份',()=>{
  expect(referenceEditorDocument.parse(design)).toEqual(design);
  expect(referenceEditorDocument.safeParse({...design,mediaRefs:[]}).success).toBe(false);
  expect(referenceEditorDocument.safeParse({...design,mediaRefs:[...design.mediaRefs,...design.mediaRefs]}).success).toBe(false);
  expect(referenceEditorDocument.safeParse({...design,nativeDocument:{objects:[{type:'image',src:'blob:expired'}]}}).success).toBe(false);
 });
 it('图文图卡按真实cardId保存，保留旧稿兼容',()=>{
  const doc={schemaVersion:1,title:'首稿',body:'正文',summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null};
  expect(graphicPostDocument.parse(doc)).toEqual(doc);
  const next={...doc,cardBriefs:[{cardId:'card-a',title:'第一卡',body:'正文',sourceRefs:[]}],designs:[{target:{kind:'card',cardId:'card-a'},document:design}]};
  expect(graphicPostDocument.parse(next)).toEqual(next);
  expect(graphicPostDocument.safeParse({...next,designs:[...next.designs,...next.designs]}).success).toBe(false);
 });
 it('编辑器替换必须为可选明确选择，不向旧请求补默认值',()=>{
  const old={expectedRevision:0,requestId:'request-original-001',plan:{editorVersion:2}};
  expect(productionEditorSaveBody.parse(old)).toEqual({...old,source:'manual'});
  expect(productionEditorSaveBody.parse({...old,replaceEditor:true}).replaceEditor).toBe(true);
 });
});
