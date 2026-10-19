import {describe,it,expect} from 'vitest';
import {noteRelayLayout} from '../src/resources/noterelay-layout';
import {articleNativeLayout} from '../src/resources/articles';
import {graphicPostDocument} from '../src/resources/graphic-posts';
const layout={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'moyu-green',authorName:'',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
describe('NoteRelay 可持久化版式',()=>{
 it('文章和图文沿原合同接收同一版式',()=>{expect(articleNativeLayout.parse(layout)).toEqual(layout);expect(graphicPostDocument.parse({schemaVersion:1,title:'稿',body:'正文',summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null,nativeLayout:layout}).nativeLayout).toEqual(layout);});
 it('保留 Doocs 旧版式',()=>{expect(articleNativeLayout.parse({schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'default',themeSettings:{},customCss:'',exportOptions:{useIndent:false,useJustify:false}}).editor).toBe('doocs-md');});
 it.each([{editorVersion:'unknown'},{fontSize:33},{splitHeading:3},{templateId:'fake'},{imageWidths:{x:29}},{imageRadii:{x:33}},{variables:Object.fromEntries(Array.from({length:33},(_,i)=>[String(i),'v']))},{authorName:'字'.repeat(121)},{variables:{x:'字'.repeat(2001)}},{extra:true}])('拒绝超范围或未知字段 %j',patch=>expect(noteRelayLayout.safeParse({...layout,...patch}).success).toBe(false));
 it('变量限制按 UTF8 字节',()=>expect(noteRelayLayout.safeParse({...layout,variables:Object.fromEntries(Array.from({length:10},(_,i)=>[String(i),'字'.repeat(1000)]))}).success).toBe(false));
});
