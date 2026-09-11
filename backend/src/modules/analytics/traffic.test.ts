import {describe,it,expect} from 'vitest';
import {parseTrafficTables} from './traffic-parser';
describe('流量来源页面解析',()=>{
 it('读真实表格列，保留真零、未知来源及舍入后的比例',()=>{
  expect(parseTrafficTables([{rows:[['抖音 App','来源占比','对比7日'],['推荐页','95.7%','+8.2%'],['新入口','0%','-']]}])).toEqual({app:'抖音 App',windowLabel:null,complete:true,entries:[{label:'推荐页',percentage:95.7},{label:'新入口',percentage:0}]});
 });
 it('缺失不是零；拒绝抓错表和越界百分数',()=>{
  expect(()=>parseTrafficTables([{rows:[['来源','播放量'],['推荐页','95']]}])).toThrow();
  expect(()=>parseTrafficTables([{rows:[['抖音 App','来源占比'],['推荐页','101%']]}])).toThrow();
  expect(parseTrafficTables([{rows:[['抖音 App','来源占比'],['推荐页','--']]}]).entries[0]?.percentage).toBeNull();
 });
});
