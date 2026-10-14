import {describe,it,expect} from 'vitest';
import {writingContext} from './resources/work-writing-context';
import {articleAssistedVersionBody,graphicAssistedVersionBody} from './resources/work-candidate-adoption';
import {articlesOperations} from './operations/articles';
import {graphicPostsOperations} from './operations/graphic-posts';
const source={taskId:'task',callId:'call',toolCallId:'tool',candidateDigest:`sha256:${'1'.repeat(64)}`};
const body={adoptionMode:'assistant' as const,expectedCurrentVersionId:'base',assistantSource:source,fieldSelection:['title'],policyVersion:1,clientRequestId:'request-1097',factSelection:{mode:'keep'}};
describe('T1097严格选择与公共采用合同',()=>{
 it('允许中立且无资料，拒绝重复文件与前端正文',()=>{expect(writingContext.parse({schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]})).toEqual({schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]});expect(writingContext.safeParse({schemaVersion:1,brandProfileVersionId:null,sourceAssets:[{assetId:'a',assetFileId:'f'},{assetId:'a',assetFileId:'f'}]}).success).toBe(false);expect(writingContext.safeParse({schemaVersion:1,brandProfileVersionId:null,sourceAssets:[],text:'伪造'}).success).toBe(false);});
 it('采用公开body没有document，普通保存仍为独立严格分支',()=>{expect(articlesOperations.createArticleVersion.body!.parse(body)).toEqual(body);expect(articleAssistedVersionBody.safeParse({...body,document:{}}).success).toBe(false);expect(articleAssistedVersionBody.safeParse({...body,fieldSelection:['title','title']}).success).toBe(false);const {factSelection:_,...graphic}=body;expect(graphicPostsOperations.createGraphicPostVersion.body!.parse(graphic)).toEqual(graphic);expect(graphicAssistedVersionBody.safeParse(body).success).toBe(false);});
});
