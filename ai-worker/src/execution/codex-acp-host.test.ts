import {describe,it,expect} from 'vitest';
const hostModule='./codex-acp-host';

describe('Codex ACP 回环 MCP 环境',()=>{
 it('同时保留原大小写绕过配置和远程代理，并只追加回环地址',async()=>{
  const host=await import(hostModule);
  const source={HTTPS_PROXY:'http://proxy.invalid:8080',HTTP_PROXY:'http://proxy.invalid:8080',NO_PROXY:'corp.invalid',no_proxy:'internal.invalid',PATH:'/fixture/bin'};
  const before={...source};
  const env=host.codexAcpRuntimeEnvironment(source);
  expect(env).toMatchObject({HTTPS_PROXY:source.HTTPS_PROXY,HTTP_PROXY:source.HTTP_PROXY,PATH:source.PATH});
  expect(env.NO_PROXY).toBe('corp.invalid,internal.invalid,127.0.0.1,localhost,::1');
  expect(env.no_proxy).toBe(env.NO_PROXY);
  expect(source).toEqual(before);
 });
 it('没有原绕过配置时仅加入回环，不扩大为全网绕过',async()=>{
  const host=await import(hostModule);
  const env=host.codexAcpRuntimeEnvironment({HTTPS_PROXY:'http://proxy.invalid:8080'});
  expect(env.NO_PROXY).toBe('127.0.0.1,localhost,::1');
  expect(env.no_proxy).toBe(env.NO_PROXY);
  expect(env.HTTPS_PROXY).toBe('http://proxy.invalid:8080');
 });
 it('继续沿原环境白名单，不传递额外 Agent 配置或无关变量',async()=>{
  const host=await import(hostModule);
  const env=host.codexAcpRuntimeEnvironment({HOME:'/fixture/home',CODEX_HOME:'/fixture/codex',APP_SERVER_LOGS:'/fixture/log',MODEL_PROVIDER:'fixture-override',UNRELATED:'fixture-value',NO_PROXY:''});
  expect(env).toMatchObject({HOME:'/fixture/home',CODEX_HOME:'/fixture/codex'});
  expect(env).not.toHaveProperty('APP_SERVER_LOGS');
  expect(env).not.toHaveProperty('MODEL_PROVIDER');
  expect(env).not.toHaveProperty('UNRELATED');
  expect(env.NO_PROXY).toBe('127.0.0.1,localhost,::1');
 });
});
