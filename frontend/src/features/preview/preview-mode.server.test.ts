import {describe,it,expect} from "vitest";
import {isIsolatedUiPreview} from "./preview-mode.server";
const enabled={NODE_ENV:"development",CREATOROS_DEV_MODE:"1",CREATOROS_UI_PREVIEW:"1",CREATOROS_DISABLE_SCHEDULER:"1",CREATOROS_APP_DATA_DIR:"/tmp/task/work/preview-data",PGLITE_DATA_DIR:"/tmp/task/work/preview-data/db"} as NodeJS.ProcessEnv;
describe("模拟展示的独立预览边界",()=>{
 it("只有显式独立数据目录的开发预览显示模拟内容",()=>expect(isIsolatedUiPreview(enabled)).toBe(true));
 it.each([
  {NODE_ENV:"production"}, {CREATOROS_DEV_MODE:"0"}, {CREATOROS_UI_PREVIEW:undefined},
  {CREATOROS_DISABLE_SCHEDULER:"0"},{CREATOROS_APP_DATA_DIR:"/tmp/task/user-data"},
  {PGLITE_DATA_DIR:"/tmp/another/db"},
 ])("不满足边界时不展示模拟内容 %j",override=>expect(isIsolatedUiPreview({...enabled,...override})).toBe(false));
});
