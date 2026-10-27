import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ComponentProps} from 'react';
const state=vi.hoisted(()=>({receipt:null as null|{knowledgeIds:string[];atomCount:number;archiveKnowledgeId:null},creates:vi.fn(async()=>({id:'ordinary-new-row'})),adopt:vi.fn(async()=>{state.receipt={knowledgeIds:['adopted-atom'],atomCount:1,archiveKnowledgeId:null};return state.receipt;})}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/lib/contract-client',()=>({client:{createKnowledge:state.creates,getKnowledgeDistillReceipt:vi.fn(async()=>({receipt:state.receipt})),adoptKnowledgeDistill:state.adopt}}));
import {ChatDistillCard} from './chat-distill-card';
afterEach(()=>cleanup());
it('remounting the same persisted distill card restores its receipt and never creates another batch',async()=>{
 const props:ComponentProps<typeof ChatDistillCard>={source:{conversationId:'conversation-owned',sourceMessageId:'message-owned',toolCallId:'tool-owned'},result:{atoms:[{type:'claim',title:'测试观点',note:'',sourceNote:''}],suggestedTags:[],originalText:'',error:null,suggestSwitchModel:false}};
 const first=render(<ChatDistillCard {...props}/>);
 const button=screen.getByRole('button',{name:'采纳选中 1 条'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
 await screen.findByText(/已采纳 1 条进知识库/);first.unmount();
 render(<ChatDistillCard {...props}/>);
 await screen.findByText(/已采纳 1 条进知识库/);
 expect(state.adopt).toHaveBeenCalledTimes(1);expect(state.creates).not.toHaveBeenCalled();
});
