import {describe,expect,it} from "vitest";
import {SettingsReturnController} from "./settings-return-context";
const url=(path:string)=>new URL(path,"http://localhost");
describe("设置返回真实提交状态",()=>{
 it("直达含blank历史只回首页，重复消费不二次导航",()=>{const c=new SettingsReturnController("http://localhost");c.commit(url("/settings"),"none");expect(c.consume()).toEqual({href:"/",generation:1});expect(c.consume()).toBeNull();});
 it("实际站内提交保完整query/hash，同entry refresh与highlight不覆盖来源",()=>{const c=new SettingsReturnController("http://localhost");c.commit(url("/projects/p/video?outputId=x&copilot=1&filter=a%20b#draft"),"g:a");c.commit(url("/settings"),"g:a");c.commit(url("/settings?highlight=models"),"g:a");expect(c.generation).toBe(1);expect(c.consume()?.href).toBe("/projects/p/video?outputId=x&copilot=1&filter=a%20b#draft");});
 it("范围事件当场失效，A到B到A不能复活原来源",()=>{const c=new SettingsReturnController("http://localhost");c.commit(url("/accounts"),"g:a");c.commit(url("/settings"),"g:a");c.invalidate();c.invalidate();expect(c.consume()?.href).toBe("/");});
 it("capture不是路由提交，跨域和修改键候选不得授予来源",()=>{const c=new SettingsReturnController("http://localhost");c.commit(url("/accounts"),"none");c.capture("/settings",null,1);expect(c.consume()).toBeNull();c.commit(new URL("https://invalid.example/settings"),"none");expect(c.consume()).toBeNull();c.commit(url("/settings"),"none");expect(c.consume()?.href).toBe("/accounts");});
 it("每个真实重入有新generation，旧close不复用来源",()=>{const c=new SettingsReturnController("http://localhost");c.commit(url("/accounts"),"none");c.commit(url("/settings"),"none");expect(c.consume()?.generation).toBe(1);c.commit(url("/accounts"),"none");c.commit(url("/settings"),"none");expect(c.consume()).toEqual({href:"/accounts",generation:2});});
});
