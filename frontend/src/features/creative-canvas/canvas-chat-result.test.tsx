import '@testing-library/jest-dom/vitest';
import {it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {CanvasChatResult} from './canvas-chat-result';
it('原proposal结果只显示候选并链接真实Canvas，不给聊天直接apply假按钮',()=>{render(<CanvasChatResult result={{kind:'canvas.propose',canvasId:'actual/canvas',baseRevision:7,operations:[{type:'moveNode'}],error:null}}/>);expect(screen.getByText(/1 项候选；应用后才改变画布/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'回到画布检查并应用'})).toHaveAttribute('href','/canvases/actual%2Fcanvas');expect(screen.queryByRole('button')).toBeNull();});
it('权限或原owner冲突如实显示，不显示已保存候选和可应用链接',()=>{render(<CanvasChatResult result={{kind:'canvas.propose',canvasId:null,operations:[],error:'画布已在其他窗口更新'}}/>);expect(screen.getByRole('alert')).toHaveTextContent('画布已在其他窗口更新');expect(screen.queryByRole('link')).toBeNull();});
