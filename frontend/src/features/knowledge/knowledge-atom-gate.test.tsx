import type * as React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({refresh:vi.fn(),read:vi.fn(),adopt:vi.fn(),ordinary:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:state.refresh})}));
vi.mock('@/lib/contract-client',()=>({client:{getKnowledgeDistillReceipt:(...args:unknown[])=>state.read(...args),adoptKnowledgeDistill:(...args:unknown[])=>state.adopt(...args),createKnowledge:state.ordinary}}));
import {KnowledgeAtomGate,archiveTitleOf} from './knowledge-atom-gate';
const source={conversationId:'persisted-conv',sourceMessageId:'persisted-message',toolCallId:'persisted-call'};
const atoms=[{type:'claim' as const,title:'观点一',note:'上下文',sourceNote:''},{type:'quote' as const,title:'金句二',note:'',sourceNote:'原作者'}];
const receipt={source,taskId:'actual-task',callId:'actual-call',knowledgeIds:['k1','k2'],atomCount:2,archiveKnowledgeId:'archive1',createdAt:'2026-10-25T00:00:00Z'};
const renderGate=(props:Partial<React.ComponentProps<typeof KnowledgeAtomGate>>={})=>render(<KnowledgeAtomGate atoms={atoms} source={source} originalText={'第一行\n完整原文'} suggestedTags={['主题']} {...props}/>);
const ready=async()=>{let button!:HTMLElement;await waitFor(()=>{button=screen.getByRole('button',{name:/采纳选中/});expect((button as HTMLButtonElement).disabled).toBe(false);});return button;};
beforeEach(()=>{vi.clearAllMocks();state.read.mockResolvedValue({receipt:null});state.adopt.mockResolvedValue(receipt);});afterEach(()=>cleanup());
it('存档标题仍取首个非空行并截60字',()=>{expect(archiveTitleOf('\n  第一行\n第二行')).toBe('第一行');expect(archiveTitleOf('长'.repeat(80))).toHaveLength(60);});
it('有来源先读持久回执，默认全选及原文存档，来源未就绪禁采纳',async()=>{
 const first=renderGate();expect(screen.getAllByRole('checkbox').every(box=>(box as HTMLInputElement).checked)).toBe(true);await ready();expect(state.read).toHaveBeenCalledWith({params:undefined,query:undefined,body:{source}});first.unmount();
 renderGate({source:null});expect((screen.getByRole('button',{name:/采纳选中/}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole('alert').textContent).toContain('来源尚未就绪');
});
it('编辑/勾选只发送真实索引与编辑字段的一次采纳，客户端不发送原文或循环create',async()=>{
 const rendered=renderGate();const button=await ready();fireEvent.change(rendered.container.querySelector('[data-slot="knowledge-atom-title"]')!,{target:{value:'人改标题'}});fireEvent.change(rendered.container.querySelector('[data-slot="knowledge-atom-type"]')!,{target:{value:'evidence'}});fireEvent.click(screen.getByRole('checkbox',{name:'采纳第 2 条'}));fireEvent.click(button);
 await waitFor(()=>expect(state.adopt).toHaveBeenCalledOnce());expect(state.adopt.mock.calls[0]![0].body).toEqual({source,atoms:[{index:0,type:'evidence',title:'人改标题',note:'上下文',sourceNote:''}],archiveOriginal:true});expect(state.ordinary).not.toHaveBeenCalled();await screen.findByText(/已采纳 2 条/);expect(state.refresh).toHaveBeenCalledOnce();
});
it('取消原文存档只发送false；原文显示空时也不请求存档',async()=>{
 const first=renderGate();let button=await ready();fireEvent.click(first.container.querySelector('[data-slot="knowledge-distill-archive"]')!);fireEvent.click(button);await waitFor(()=>expect(state.adopt).toHaveBeenCalledOnce());expect(state.adopt.mock.calls[0]![0].body.archiveOriginal).toBe(false);first.unmount();state.adopt.mockClear();renderGate({originalText:''});button=await ready();fireEvent.click(button);await waitFor(()=>expect(state.adopt).toHaveBeenCalledOnce());expect(state.adopt.mock.calls[0]![0].body.archiveOriginal).toBe(false);
});
it('刷新重挂载已有receipt直接呈收尾态，依receipt显示真正存档结果',async()=>{
 state.read.mockResolvedValue({receipt:{...receipt,archiveKnowledgeId:null}});renderGate();await screen.findByText(/已采纳 2 条/);expect(screen.queryByRole('button',{name:/采纳选中/})).toBeNull();expect(screen.getByText(/已采纳 2 条/).textContent).not.toContain('原文已同时存档');expect(state.adopt).not.toHaveBeenCalled();
});
it('响应丢失后一次回读已提交receipt，不再次adopt',async()=>{
 state.read.mockResolvedValueOnce({receipt:null}).mockResolvedValue({receipt});state.adopt.mockRejectedValueOnce(Error('响应断开'));renderGate();fireEvent.click(await ready());await screen.findByText(/已采纳 2 条/);expect(state.adopt).toHaveBeenCalledOnce();expect(state.read).toHaveBeenCalledTimes(2);
});
it('事务失败且无receipt保留候选和明确错误，允许重新点采纳',async()=>{
 state.adopt.mockRejectedValueOnce(Error('后端连接失败'));renderGate();fireEvent.click(await ready());await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toContain('后端连接失败');expect(state.refresh).not.toHaveBeenCalled();expect((await ready()).textContent).toContain('采纳选中');
});
it('换组使未完成请求过期，旧返回不能把新范围卡标为已采纳',async()=>{
 let finish!:(value:typeof receipt)=>void;state.adopt.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));renderGate();fireEvent.click(await ready());await waitFor(()=>expect(state.adopt).toHaveBeenCalledOnce());window.dispatchEvent(new CustomEvent('creatoros:accounts-changed',{detail:{source:'switch',routeRefreshScheduled:false}}));await ready();finish(receipt);await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));expect(screen.queryByText(/已采纳 2 条/)).toBeNull();expect(state.refresh).not.toHaveBeenCalled();
});
