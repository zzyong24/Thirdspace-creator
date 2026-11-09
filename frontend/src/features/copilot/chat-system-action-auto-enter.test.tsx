/** 批次2-2（月明 2026-11-10）：对话里说「就做这条」→ 建项目候选直接建成并进入，不再多点「采用」「打开项目」。 */
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {assistantActionCandidateSchema} from '@creatoros/contract';
import {createCreationWorkspace} from '@/lib/creation-workspace-scope';
import type {ReactElement} from 'react';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {ChatSystemActionCard} from './chat-system-action-card';
const push=vi.fn();
const router={push,refresh:vi.fn(),replace:vi.fn(),back:vi.fn(),forward:vi.fn(),prefetch:vi.fn()};
const withRouter=(ui:ReactElement)=><AppRouterContext.Provider value={router}>{ui}</AppRouterContext.Provider>;
afterEach(()=>{cleanup();push.mockReset();localStorage.clear();});
const source={taskId:'task-live',callId:'call-1',toolCallId:'tool-1',candidateDigest:`sha256:${'b'.repeat(64)}`};
const project={id:'project-new',title:'就做这条'};
function fixture(){
 let saved:unknown=null;const requests:string[]=[];
 const fetchApi=vi.fn(async(_u:RequestInfo|URL,init?:RequestInit)=>{
  const request=JSON.parse(String(init?.body));requests.push(request.id);let data:unknown;
  if(request.id==='ai.assistantActions.receipt')data={receipt:saved};
  else if(request.id==='ai.assistantActions.adopt'){saved={source,status:'adopted',operationId:'projects.create',result:project,adoptedAt:'2026-11-10T01:00:00.000Z'};data=saved;}
  else data=project;
  return new Response(JSON.stringify({data,meta:{requestId:'t'}}));
 });
 return {operations:createCreationWorkspace({groupId:'g',accountId:'a'},{isCurrent:()=>true,fetchApi}),requests,setSaved:(v:unknown)=>{saved=v;}};
}
const proposal=assistantActionCandidateSchema.parse({schemaVersion:1,kind:'system.action.proposal',source,observations:{},request:{action:{kind:'project.create',title:'就做这条'}}});
it('本轮对话刚提出的建项目候选：自动建成并直接进入项目',async()=>{
 const f=fixture();render(withRouter(<ChatSystemActionCard result={proposal} operations={f.operations} autoEnter/>));
 await waitFor(()=>expect(push).toHaveBeenCalledWith('/projects/project-new'));
 expect(f.requests.filter(id=>id==='ai.assistantActions.adopt')).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'采用此改动'})).not.toBeInTheDocument();
});
it('历史里的候选（非本轮）不自动建，也不跳转',async()=>{
 const f=fixture();render(withRouter(<ChatSystemActionCard result={proposal} operations={f.operations}/>));
 await screen.findByRole('button',{name:'采用此改动'});
 expect(f.requests).not.toContain('ai.assistantActions.adopt');expect(push).not.toHaveBeenCalled();
});
it('已建过（有回执）再挂载不重复写入、不再跳转',async()=>{
 const f=fixture();f.setSaved({source,status:'adopted',operationId:'projects.create',result:project,adoptedAt:'2026-11-10T01:00:00.000Z'});
 render(withRouter(<ChatSystemActionCard result={proposal} operations={f.operations} autoEnter/>));
 await screen.findByRole('link',{name:'打开项目'});
 expect(f.requests).not.toContain('ai.assistantActions.adopt');expect(push).not.toHaveBeenCalled();
});
