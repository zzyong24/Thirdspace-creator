import {afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import CreatorDatePickerAntd from "./creator-date-picker-antd";
beforeAll(()=>{Object.defineProperty(window,"matchMedia",{writable:true,value:vi.fn(()=>({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()}))});});
afterEach(()=>vi.useRealTimers());
describe("真实中文Ant日历",()=>{
 it("选择自然周得到周一到周日，选择自然月覆盖真实月末",async()=>{const onChange=vi.fn();const view=render(<CreatorDatePickerAntd mode="week" value={{startDate:"2026-09-07",endDate:"2026-09-13"}} onChange={onChange} open onOpenChange={()=>{}}/>);fireEvent.click(await screen.findByTitle("2026-09-16"));await waitFor(()=>expect(onChange).toHaveBeenCalledWith({startDate:"2026-09-14",endDate:"2026-09-20"}));view.unmount();onChange.mockClear();render(<CreatorDatePickerAntd mode="month" value={{startDate:"2024-01-01",endDate:"2024-01-31"}} onChange={onChange} open onOpenChange={()=>{}}/>);fireEvent.click(await screen.findByTitle("2024-02"));await waitFor(()=>expect(onChange).toHaveBeenCalledWith({startDate:"2024-02-01",endDate:"2024-02-29"}));});
 it("单天模式可真实选择日期，中文月份与周一起始可见",async()=>{const onChange=vi.fn();render(<CreatorDatePickerAntd value="2026-09-13" onChange={onChange} open onOpenChange={()=>{}}/>);expect(await screen.findByText("9月")).toBeInTheDocument();const head=document.querySelector(".ant-picker-content thead tr");expect(head?.firstElementChild?.textContent).toBe("一");fireEvent.click(screen.getByTitle("2026-09-18"));await waitFor(()=>expect(onChange).toHaveBeenCalledWith("2026-09-18"));});
 it("自定义日期范围选择完整首尾后才提交",async()=>{const onChange=vi.fn();render(<CreatorDatePickerAntd mode="range" value={{startDate:"2026-09-07",endDate:"2026-09-13"}} onChange={onChange} open onOpenChange={()=>{}}/>);fireEvent.focus(screen.getByPlaceholderText("开始日期"));fireEvent.click((await screen.findAllByTitle("2026-09-09"))[0]);expect(onChange).not.toHaveBeenCalled();fireEvent.click(screen.getAllByTitle("2026-09-20")[0]);await waitFor(()=>expect(onChange).toHaveBeenCalledWith({startDate:"2026-09-09",endDate:"2026-09-20"}));});
 it("日历今天高亮也使用北京时间，不随浏览器当地日期偏移",()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-13T18:00:00Z"));render(<CreatorDatePickerAntd value={null} onChange={()=>{}} open onOpenChange={()=>{}}/>);expect(document.querySelector(".ant-picker-cell-today")?.getAttribute("title")).toBe("2026-09-14");});
 it("空字符串代表未选日期，以北京时间当天作为面板锚点，不渲染 Invalid Date",async()=>{render(<CreatorDatePickerAntd value="" onChange={()=>{}} open onOpenChange={()=>{}}/>);expect(await screen.findByText("9月")).toBeInTheDocument();expect(document.body.textContent).not.toContain("Invalid Date");});
 it.each([
  {mode:"month" as const,startDate:"2026-09-06",endDate:"2026-09-12",cell:"2026-09",expected:{startDate:"2026-09-01",endDate:"2026-09-30"}},
  {mode:"week" as const,startDate:"2026-09-08",endDate:"2026-09-12",cell:"2026-09-08",expected:{startDate:"2026-09-07",endDate:"2026-09-13"}},
 ])("非完整$mode范围选原日期所在周期仍提交完整区间",async({mode,startDate,endDate,cell,expected})=>{
  const onChange=vi.fn();
  render(<CreatorDatePickerAntd mode={mode} value={{startDate,endDate}} onChange={onChange} open onOpenChange={()=>{}}/>);
  fireEvent.click(await screen.findByTitle(cell));
  await waitFor(()=>expect(onChange).toHaveBeenCalledWith(expected));
 });

});
