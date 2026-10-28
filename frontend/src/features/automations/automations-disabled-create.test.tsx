import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {CreateJobDialog} from './automations-island';
afterEach(()=>cleanup());

it('新建先明确保持停用，默认提交false而不启动计划',async()=>{
 const onCreate=vi.fn(async(_input:unknown)=>{});
 render(<CreateJobDialog open onOpenChange={vi.fn()} onCreate={onCreate} prefill={{name:'合成停用任务',sourceKind:'topic.daily'}}/>);
 expect(screen.getByRole('switch',{name:'创建后启用'})).toHaveAttribute('aria-checked','false');
 expect(screen.getByText('保存后保持停用，启用后才按计划运行。')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
 await waitFor(()=>expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({enabled:false})));
});

it('用户明确选择启用才提交true，关闭后重开恢复安全默认值',async()=>{
 const onCreate=vi.fn(async(_input:unknown)=>{});
 const props={open:true,onOpenChange:vi.fn(),onCreate,prefill:{name:'合成启用任务',sourceKind:'topic.daily' as const}};
 const view=render(<CreateJobDialog {...props}/>);
 fireEvent.click(screen.getByRole('switch',{name:'创建后启用'}));
 expect(screen.getByText('保存后按计划运行。')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
 await waitFor(()=>expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({enabled:true})));
 view.rerender(<CreateJobDialog {...props} open={false}/>);
 view.rerender(<CreateJobDialog {...props}/>);
 expect(screen.getByRole('switch',{name:'创建后启用'})).toHaveAttribute('aria-checked','false');
});
