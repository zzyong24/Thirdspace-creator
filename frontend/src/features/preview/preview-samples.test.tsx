import * as React from "react";
import {render,screen,within,cleanup} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,describe,it,expect,vi} from "vitest";
import {PreviewSamples} from "./preview-samples";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("明确标注的本地模拟内容",()=>{
 it("选择与切换详情会更新内容，且不向后端发送请求",async()=>{
  const request=vi.fn();vi.stubGlobal("fetch",request);render(<PreviewSamples kind="radar"/>);
  expect(screen.getByText("模拟内容")).toBeVisible();
  await userEvent.click(screen.getByRole("button",{name:/让知识库真正参与一次创作/}));
  const detail=screen.getByRole("article",{name:"模拟作品详情"});
  expect(within(detail).getByRole("heading",{name:"让知识库真正参与一次创作"})).toBeVisible();
  await userEvent.click(screen.getByRole("button",{name:"逐字稿"}));
  expect(within(detail).getByText(/收藏前，先写一句为什么保存它/)).toBeVisible();
  expect(within(screen.getByRole("region",{name:"改写创作"})).getByRole("link",{name:/打开模拟作品/})).toHaveAttribute("href",expect.stringContaining("output-e50804d8-1760"));
  expect(request).not.toHaveBeenCalled();
 });
 it("过滤器只显示对应模拟作品，并保留可用详情",async()=>{
  render(<PreviewSamples kind="publishing"/>);
  await userEvent.click(screen.getByRole("button",{name:"已发布（模拟）"}));
  const list=screen.getByRole("group",{name:"模拟作品列表"});expect(within(list).getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("复盘时，给下一次留一个问题");
  await userEvent.click(screen.getByText("模拟说明"));
  expect(screen.getByText(/未执行采集、AI 生成或发布/)).toBeVisible();
 });
 it("图表有完整数字名称，切换作品后数值与图表一致",async()=>{
  render(<PreviewSamples kind="analytics"/>);
  expect(screen.getByText("12,840")).toBeVisible();
  await userEvent.click(screen.getByRole("button",{name:/复盘时，给下一次留一个问题/}));
  expect(screen.getByText("7,240")).toBeVisible();
  expect(screen.getByRole("img",{name:"模拟趋势指数：32、48、39、62、54、80、61"})).toBeVisible();
 });
 it("雷达按来源、筛选、阅读、创作排列，筛选后两区同步更新",async()=>{
  render(<PreviewSamples kind="radar"/>);
  const steps=screen.getByRole("navigation",{name:"内容雷达操作步骤"});
  expect(within(steps).getAllByRole("link").map(link=>link.textContent)).toEqual(["01来源与采集","02挑选内容","03阅读核对","04改写创作"]);
  await userEvent.click(screen.getByRole("button",{name:"图文"}));
  expect(within(screen.getByRole("group",{name:"模拟作品列表"})).getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("复盘时，给下一次留一个问题");
  const create=screen.getByRole("region",{name:"改写创作"});
  expect(create).toHaveTextContent("目标 / 反馈 / 实验");
  expect(within(create).getByRole("link",{name:/打开模拟作品/})).toHaveAttribute("href",expect.stringContaining("output-e50804d8-1833"));
 });
 it("真实来源首次展开才挂载，收起后保留配置区状态",async()=>{
  const mounted=vi.fn();
  function SourceFixture(){React.useEffect(()=>{mounted();},[]);return <input aria-label="测试来源名称"/>;}
  render(<PreviewSamples kind="radar" radarSources={<SourceFixture/>}/>);
  expect(mounted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("管理真实来源"));
  const input=await screen.findByRole("textbox",{name:"测试来源名称"});
  await userEvent.type(input,"保留中的来源");
  await userEvent.click(screen.getByText("管理真实来源"));
  await userEvent.click(screen.getByText("管理真实来源"));
  expect(screen.getByRole("textbox",{name:"测试来源名称"})).toHaveValue("保留中的来源");
  expect(mounted).toHaveBeenCalledTimes(1);
 });

});
