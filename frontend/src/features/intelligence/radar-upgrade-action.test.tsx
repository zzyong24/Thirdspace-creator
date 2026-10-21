import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {RadarUpgradeAction} from './radar-upgrade-action';
afterEach(cleanup);
it('未升级时只有真实升级按钮，提交中禁重复点击',()=>{const onUpgrade=vi.fn();const {rerender}=render(<RadarUpgradeAction submitting={false} onUpgrade={onUpgrade}/>);fireEvent.click(screen.getByRole('button',{name:'升级为项目'}));expect(onUpgrade).toHaveBeenCalledOnce();rerender(<RadarUpgradeAction submitting onUpgrade={onUpgrade}/>);expect(screen.getByRole('button')).toBeDisabled();});
it.each([false,true])('有项目时仅显示真实项目与准备概况，准备中=%s',preparing=>{render(<RadarUpgradeAction state={{projectId:'p 1',preparing}} submitting={false} onUpgrade={vi.fn()}/>);expect(screen.getByRole('link',{name:'查看项目'})).toHaveAttribute('href','/projects/p%201');expect(screen.getByText(preparing?'准备中':'项目已创建')).toBeInTheDocument();expect(screen.queryByRole('button')).toBeNull();expect(screen.queryByRole('list')).toBeNull();expect(screen.queryByText(/转写正文|补全资料|取消/)).toBeNull();});

it('准备读取失败仍保留真实项目链接并如实提示',()=>{render(<RadarUpgradeAction state={{projectId:'p',readError:'读取失败'}} submitting={false}/>);expect(screen.getByText('状态暂时无法读取')).toBeVisible();expect(screen.getByRole('link',{name:'查看项目'})).toHaveAttribute('href','/projects/p');});
it.each(['failed','blocked','unknown_result'])('准备%s显示需处理且不开放雷达工程操作',status=>{render(<RadarUpgradeAction state={{projectId:'p',preparation:{steps:[{status}]} as import('@creatoros/contract').ProjectPreparationResource}} submitting={false}/>);expect(screen.getByText('已建项目·准备需处理')).toBeVisible();expect(screen.queryByRole('button')).toBeNull();});
