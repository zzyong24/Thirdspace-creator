import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb,projects,aiConversations,aiMessages,aiTasks,eq,type Db} from '@creatoros/backend';
import {createAiRepository} from './ai.repository';

let db:Db,close:()=>Promise<void>,seq=0;
const stamp='2026-10-25T00:00:00.000Z';
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();
 await db.insert(projects).values([
  {id:'scope-own',userId:'scope-u',accountId:'scope-a',title:'本项目'},
  {id:'scope-other-project',userId:'scope-u',accountId:'scope-a',title:'另一项目'},
  {id:'scope-other-workspace',userId:'scope-u',accountId:'scope-b',title:'另一工作区'},
  {id:'scope-other-user',userId:'scope-v',accountId:'scope-a',title:'另一用户'},
 ].map(row=>({...row,creationMode:'free',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp})));
},120000);
afterAll(async()=>close?.(),120000);
const repo=(userId='scope-u',accountId='scope-a')=>createAiRepository(db,{userId,accountId,now:()=>new Date(Date.parse(stamp)+seq).toISOString(),nextId:prefix=>`${prefix}-scope-${++seq}`});

it('T1406 项目列表读取原legacy会话ID并保分页与所有权；不迁移或新造消息任务',async()=>{
 const own=repo(),old=await own.createConversation({title:'旧准备会话',projectId:'scope-own',scope:'project'});
 const modern=await own.createConversation({title:'新稿面会话',projectId:'scope-own',scope:'project:scope-own'});
 await own.createConversation({title:'另一项目旧准备',projectId:'scope-other-project',scope:'project'});
 await repo('scope-u','scope-b').createConversation({title:'另一工作区',projectId:'scope-other-workspace',scope:'project'});
 await repo('scope-v').createConversation({title:'另一用户',projectId:'scope-other-user',scope:'project'});
 const before={conversations:await db.select().from(aiConversations),messages:await db.select().from(aiMessages),tasks:await db.select().from(aiTasks)};
 const all=await own.listConversations({scope:'project:scope-own',limit:100,offset:0});
 expect(all.total).toBe(2);expect(new Set(all.rows.map(r=>r.id))).toEqual(new Set([old.id,modern.id]));
 const first=await own.listConversations({scope:'project:scope-own',limit:1,offset:0}),second=await own.listConversations({scope:'project:scope-own',limit:1,offset:1});
 expect(first.total).toBe(2);expect(second.total).toBe(2);expect(new Set([...first.rows,...second.rows].map(r=>r.id)).size).toBe(2);
 expect((await repo('scope-u','scope-b').listConversations({scope:'project:scope-own',limit:100,offset:0})).rows).toEqual([]);
 expect((await repo('scope-v').listConversations({scope:'project:scope-own',limit:100,offset:0})).rows).toEqual([]);
 expect((await own.listConversations({scope:'global',limit:100,offset:0})).rows).toEqual([]);
 expect(await db.select().from(aiConversations)).toEqual(before.conversations);expect(await db.select().from(aiMessages)).toEqual(before.messages);expect(await db.select().from(aiTasks)).toEqual(before.tasks);
 expect((await own.requireConversation(old.id)).scope).toBe('project');
});

it('T1406 legacy兼容不绕过父项目现归属',async()=>{
 const own=repo(),old=await own.createConversation({title:'父项目已移走的旧会话',projectId:'scope-own',scope:'project'});
 await db.update(projects).set({accountId:'scope-b'}).where(eq(projects.id,'scope-own'));
 expect((await own.listConversations({scope:'project:scope-own',limit:100,offset:0})).rows).not.toContainEqual(expect.objectContaining({id:old.id}));
});

it('T1406 无平台账号的真实账号组仍严格隔离原项目会话',async()=>{
 const {accountGroups}=await import('../../schema/account-groups');
 await db.insert(accountGroups).values(['scope-group-a','scope-group-b'].map(id=>({id,userId:'scope-group-user',name:id,status:'active',version:1,createdAt:stamp,updatedAt:stamp})));
 await db.insert(projects).values({id:'scope-group-project',userId:'scope-group-user',groupId:'scope-group-a',accountId:null,title:'组内项目',creationMode:'free',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
 const groupRepo=(groupId:string)=>createAiRepository(db,{userId:'scope-group-user',groupId,accountId:null,now:()=>stamp,nextId:prefix=>`${prefix}-group-scope-${++seq}`});
 const original=await groupRepo('scope-group-a').createConversation({title:'组内历史准备',projectId:'scope-group-project',scope:'project'});
 expect((await groupRepo('scope-group-a').listConversations({scope:'project:scope-group-project',limit:10,offset:0})).rows.map(row=>row.id)).toEqual([original.id]);
 expect((await groupRepo('scope-group-b').listConversations({scope:'project:scope-group-project',limit:10,offset:0})).rows).toEqual([]);
 await db.update(projects).set({groupId:'scope-group-b'}).where(eq(projects.id,'scope-group-project'));
 expect((await groupRepo('scope-group-a').listConversations({scope:'project:scope-group-project',limit:10,offset:0})).rows).toEqual([]);
});
