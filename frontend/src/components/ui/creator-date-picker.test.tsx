import {expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {CreatorDatePicker} from "./creator-date-picker";
const imported=vi.hoisted(()=>vi.fn());
vi.mock("./creator-date-picker-antd",()=>{imported();return {default:({onChange,open}:any)=><button aria-label="已加载中文日历" onClick={()=>onChange("2026-09-12")}>{open?"日历已打开":"日历已关闭"}</button>};});
it("首屏和禁用点击均不加载Ant，用户首次打开才加载并透传选择",async()=>{const onChange=vi.fn();const view=render(<CreatorDatePicker value="2026-09-13" onChange={onChange} disabled/>);expect(imported).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"选择日期"}));expect(imported).not.toHaveBeenCalled();view.rerender(<CreatorDatePicker value="2026-09-13" onChange={onChange}/>);fireEvent.click(screen.getByRole("button",{name:"选择日期"}));expect(await screen.findByRole("button",{name:"已加载中文日历"})).toHaveTextContent("日历已打开");expect(imported).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"已加载中文日历"}));expect(onChange).toHaveBeenCalledWith("2026-09-12");});
