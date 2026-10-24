import * as React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
import {DeferredReadError} from './draft-workbench-deferred';
afterEach(cleanup);
it('发布错误明确可重读，保留同页未保存输入而不执行整页跳转',()=>{
  render(<><textarea aria-label="当前脚本" defaultValue="原稿"/><DeferredReadError message="发布信息暂时无法读取"/></>);
  const script=screen.getByRole('textbox',{name:'当前脚本'});
  fireEvent.change(script,{target:{value:'尚未保存的新稿'}});
  expect(screen.getByRole('alert')).toHaveTextContent('暂时无法读取');
  fireEvent.click(screen.getByRole('button',{name:'重新读取发布信息'}));
  expect(refresh).toHaveBeenCalledOnce();expect(screen.getByDisplayValue('尚未保存的新稿')).toBe(script);
});
