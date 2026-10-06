import {describe,expect,it} from "vitest";
import {MIN_EXECUTION_TIMEOUT_MS, executionTimeoutMs, completionWaitMs, remainingDeadlineMs} from "../src/timeout-policy";
describe("全系统执行超时策略",()=>{
 it("正数单次等待最低两分钟并保留更长预算",()=>{
  expect(MIN_EXECUTION_TIMEOUT_MS).toBe(120000);
  expect(executionTimeoutMs(30000)).toBe(120000);
  expect(executionTimeoutMs(undefined)).toBe(120000);
  expect(executionTimeoutMs(1800000)).toBe(1800000);
 });
 it("拒绝没有声明禁用语义的零值及非法定时器",()=>{
  for(const value of [0,-1,NaN,Infinity,0.5,2147483648])expect(()=>executionTimeoutMs(value)).toThrow();
 });
 it("串行外层覆盖全部内层与关闭余量",()=>{
  expect(completionWaitMs([120000,120000,180000])).toBeGreaterThan(420000);
  expect(completionWaitMs([1])).toBeGreaterThan(120000);
  expect(()=>completionWaitMs([2147483647])).toThrow();
 });
 it("原任务绝对deadline耗尽时立即生效，continuous保持无总期限",()=>{
  expect(remainingDeadlineMs(null,1000)).toBeUndefined();
  expect(remainingDeadlineMs(900,1000)).toBe(0);
  expect(remainingDeadlineMs(51000,1000)).toBe(50000);
 });
});
