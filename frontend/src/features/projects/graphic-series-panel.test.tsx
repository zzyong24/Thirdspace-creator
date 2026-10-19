import * as React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import type {GraphicPostDocument} from '@creatoros/contract';
import {GraphicSeriesPanel} from './graphic-series-panel';
vi.mock('@/lib/contract-client',()=>({client:{getAssetFileDownloadUrl:vi.fn(async()=>({url:'http://example.test/exact.png'}))}}));
const doc:GraphicPostDocument={schemaVersion:1,title:'标题',body:'正文',summary:'',tags:[],sourceRefs:[],ruleSnapshotRef:null,imageUses:[],cardBriefs:[{cardId:'a',title:'第一页',body:'第一',sourceRefs:[]},{cardId:'b',title:'第二页',body:'第二',sourceRefs:[]}]};
it('网格显示真实空页，只编辑选中页，并按真实ID进入画布',()=>{
 const onChange=vi.fn(),onOpenCanvas=vi.fn(),onSelect=vi.fn();
 render(<GraphicSeriesPanel document={doc} onChange={onChange} selectedCardId="b" selectedCardIds={['b']} onSelect={onSelect} onSelectionChange={vi.fn()} assets={[]} disabled={false} onOpenCanvas={onOpenCanvas} onOpenDesign={vi.fn()}/>);
 expect(screen.getAllByText('尚未出图')).toHaveLength(2);
 expect(screen.queryByRole('textbox',{name:'图卡1正文'})).toBeNull();
 expect(screen.getByRole('textbox',{name:'图卡2正文'})).toHaveValue('第二');
 fireEvent.click(screen.getByRole('button',{name:'进入画布制作这一页'}));expect(onOpenCanvas).toHaveBeenCalledWith('b');
 fireEvent.click(screen.getByRole('button',{name:'查看第 1 页：第一页'}));expect(onSelect).toHaveBeenCalledWith('a');
});
it('删除前明确确认图与设计，取消不改变稿面',()=>{
 const onChange=vi.fn();
 render(<GraphicSeriesPanel document={doc} onChange={onChange} selectedCardId="b" selectedCardIds={['b']} onSelect={vi.fn()} onSelectionChange={vi.fn()} assets={[]} disabled={false} onOpenCanvas={vi.fn()} onOpenDesign={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'删除这一页'}));expect(onChange).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'取消删除'}));expect(onChange).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'删除这一页'}));fireEvent.click(screen.getByRole('button',{name:'删除页和绑定图片'}));
 expect(onChange.mock.calls[0][0].cardBriefs.map((card:{cardId:string})=>card.cardId)).toEqual(['a']);
});
