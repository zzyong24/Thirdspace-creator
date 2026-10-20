import * as React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const router=vi.hoisted(()=>({replace:vi.fn(),push:vi.fn(),back:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>router,usePathname:()=>window.location.pathname,useSearchParams:()=>new URLSearchParams(window.location.search)}));
vi.mock("@/lib/contract-client",()=>({client:{
 getRedfox:vi.fn().mockResolvedValue({configured:false}),
 getPreferences:vi.fn().mockResolvedValue({assistantExecutionEngine:"codex"}),
 getReportingStatus:vi.fn().mockResolvedValue({consentVersion:1,diagnostics:{scope:"diagnostics",accountId:null,accountLabel:null,platform:null,accountActive:true,enabled:false,needsReconsent:false,consentEpoch:0,changedAt:null,queuedCount:0},accounts:[],preparationAvailable:true,uploadAvailable:false}),
}}));
import {SettingsReturnProvider} from "@/components/shell/settings-return-context";
import {buildSettingsViewModel} from "@/fixtures/selectors/settings";
import {SettingsDialog} from "./settings-interactive-region";
const model=buildSettingsViewModel();
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();window.history.replaceState(null,"","/settings");});
afterEach(cleanup);
function tree(show=true){return <SettingsReturnProvider>{show?<SettingsDialog viewModel={model}/>:<h1>真实来源页</h1>}</SettingsReturnProvider>;}
it.each(["close","escape"])("直达设置%s只replace首页一次，拒绝history.length推断",async action=>{
 render(tree());const dialog=await screen.findByRole("dialog",{},{timeout:120000});
 if(action==="escape")fireEvent.keyDown(dialog,{key:"Escape"});else fireEvent.click(screen.getByRole("button",{name:"关闭"}));
 await waitFor(()=>expect(router.replace).toHaveBeenCalledTimes(1),{timeout:120000});
 expect(router.replace).toHaveBeenCalledWith("/",{scroll:false});expect(router.back).not.toHaveBeenCalled();expect(router.push).not.toHaveBeenCalled();
});
it("实际来源完整地址只消费一次，同宿主新一次进入重新打开",async()=>{
 window.history.replaceState(null,"","/accounts?filter=a%20b#current");const view=render(tree(false));
 window.history.replaceState(null,"","/settings");view.rerender(tree());
 fireEvent.click(await screen.findByRole("button",{name:"关闭"},{timeout:120000}));
 expect(router.replace).toHaveBeenCalledWith("/accounts?filter=a%20b#current",{scroll:false});
 window.history.replaceState(null,"","/accounts?filter=a%20b#current");view.rerender(tree(false));
 window.history.replaceState(null,"","/settings");view.rerender(tree());
 expect(await screen.findByRole("dialog",{},{timeout:120000})).toBeVisible();
 fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});expect(router.replace).toHaveBeenCalledTimes(2);
});

it("设置标签页方向键切换焦点和内容，Home/End 可到达两端且不保存配置",async()=>{
 render(tree());
 const account=await screen.findByRole("tab",{name:"账户"});
 account.focus();fireEvent.keyDown(account,{key:"ArrowRight"});
 expect(screen.getByRole("tab",{name:"偏好"})).toHaveFocus();
 expect(screen.getByRole("tabpanel",{name:"偏好"})).toBeVisible();
 fireEvent.keyDown(document.activeElement!,{key:"End"});
 expect(screen.getByRole("tab",{name:"存储"})).toHaveFocus();
 fireEvent.keyDown(document.activeElement!,{key:"Home"});
 expect(account).toHaveFocus();expect(account).toHaveAttribute("aria-selected","true");
 expect(router.replace).not.toHaveBeenCalled();expect(router.push).not.toHaveBeenCalled();
});
