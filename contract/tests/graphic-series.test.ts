import {describe,it,expect} from 'vitest';
import {graphicPostDocument} from '../src/resources/graphic-posts';
import {creativeResultsOperations} from '../src/operations/creative-results';
import {canvasDocumentSchema} from '../src/resources/creative-canvas';
const legacy={schemaVersion:1,title:'标题',body:'正文',summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null};
describe('组图合同向后兼容与精确文件',()=>{
 it('旧稿不需要组图配置',()=>expect(graphicPostDocument.parse(legacy)).toEqual(legacy));
 it('保存页说明、画幅与不可变参考',()=>{
  const doc={...legacy,cardBriefs:[{cardId:'page-1',title:'起因',body:'先说明',visualBrief:'同一人物',sourceRefs:[]}],seriesProfile:{visualDirection:'纸上铅笔',aspectRatio:'3:4',referenceImage:{assetId:'asset-1',assetFileId:'file-old'}}};
  expect(graphicPostDocument.parse(doc)).toEqual(doc);
  expect(graphicPostDocument.safeParse({...doc,seriesProfile:{...doc.seriesProfile,referenceImage:{assetId:'asset-1'}}}).success).toBe(false);
 });
 it('画布持久精确参考文件，不能把无asset的file或文生参考存下',()=>{
  const doc={schemaVersion:1,viewport:{x:0,y:0,zoom:1},edges:[],nodes:[{id:'node-1',type:'image_generation',position:{x:0,y:0},label:'第1页',prompt:'生成',mode:'image_to_image',referenceAssetId:'asset-1',referenceFileId:'file-old'}]};
  expect(canvasDocumentSchema.parse(doc)).toEqual(doc);
  expect(canvasDocumentSchema.safeParse({...doc,nodes:[{...doc.nodes[0],referenceAssetId:undefined}]}).success).toBe(false);
  expect(canvasDocumentSchema.safeParse({...doc,nodes:[{...doc.nodes[0],mode:'text_to_image'}]}).success).toBe(false);
 });
});

it('采用公共契约保留真实页ID，旧无绑定图继续有效',()=>{const body={expected:{owner:'graphic_post',versionId:'version-1'},editedValue:[{assetId:'asset-1',assetFileId:'file-1',role:'card',order:0,cardId:'page-1'}],clientRequestId:'adopt-page-original'};expect(creativeResultsOperations.adoptResult.body.parse(body)).toEqual(body);expect(creativeResultsOperations.adoptResult.body.safeParse({...body,expected:{owner:'wechat_article',versionId:'v1'}}).success).toBe(false);expect(creativeResultsOperations.adoptResult.body.safeParse({...body,editedValue:[{assetId:'asset-1',assetFileId:'file-1',role:'card',order:0}]}).success).toBe(true);});
