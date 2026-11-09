import {describe,expect,it} from 'vitest';
import * as contract from '../src';

const api=()=>{
 const endpoint=(contract.ENDPOINTS as Record<string,any>).getAccountGroupBindingStatus;
 expect(endpoint,'绑定状态必须有真实只读契约，不能用全局能力或active推断').toBeDefined();
 return endpoint;
};
const account={accountId:'a',platform:'douyin',accountHandle:'已核实账号',bindingState:'bound',loginState:'verified',checkedAt:'2026-11-09T04:22:22.419Z',reasonCode:null};
describe('T1447 账号组绑定状态契约',()=>{
 it('只读显式组，声明真实权限，不要求选定平台账号',()=>{
  const e=api();expect(e).toMatchObject({id:'accountGroups.bindingStatus',method:'GET',path:'/account-groups/:groupId/binding-status'});
  expect(e.params.parse({groupId:'g'})).toEqual({groupId:'g'});expect(e.body).toBeUndefined();expect(e.query).toBeUndefined();
  expect((contract.WORKSPACE_OPERATION_SCOPES as Record<string,string>)[e.id]).toBe('user');
 });
 it('同平台多账号分别表达有效、失效和未知，不导出凭据',()=>{
  const e=api(),value={groupId:'g',accounts:[account,{...account,accountId:'b',loginState:'needs_login',reasonCode:'expired'},{...account,accountId:'c',loginState:'unknown',checkedAt:null}]};
  expect(e.response.parse(value)).toEqual(value);
  expect(e.response.safeParse({...value,accounts:[{...account,secretReference:'not-for-ui'}]}).success).toBe(false);
 });
 it('没有验证时间不能宣称有效；隐藏和未验证身份不能假报登录有效',()=>{
  const e=api();
  for(const item of [{...account,checkedAt:null},{...account,bindingState:'unverified'},{...account,bindingState:'hidden'}])
   expect(e.response.safeParse({groupId:'g',accounts:[item]}).success).toBe(false);
  expect(e.response.parse({groupId:'g',accounts:[]})).toEqual({groupId:'g',accounts:[]});
 });
});
