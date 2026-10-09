import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {AssetPicker} from "./asset-picker";
import {assetChoice} from "./asset-picker.types";
const one=assetChoice({id:"photo",currentFileId:"version-one",name:"本人照片.png",assetType:"image"});
const two=assetChoice({id:"photo",currentFileId:"version-two",name:"本人照片新版.png",assetType:"image"});
const source={kind:"bounded" as const,key:"photos",label:"当前作品素材",allowedTypes:["image" as const],items:[one,two],completeness:"complete" as const};
beforeEach(()=>{window.localStorage.removeItem("creatoros:current-group");window.localStorage.setItem("creatoros:current-account","fixture-account");});
afterEach(()=>{window.localStorage.removeItem("creatoros:current-account");});
// 只替换媒体文件读取端口，选择/范围/对话框操作走实际组件。
vi.mock("./asset-media-preview",()=>({AssetMediaPreview:({assetId,fileId}:{assetId:string;fileId:string})=><div data-testid="preview" data-asset={assetId} data-file={fileId}/> }));
describe("可视素材选择",()=>{
 it("预览模式隐藏已选名称及底部摘要，取消不采用且确认保留精确版本",async()=>{
  const onConfirm=vi.fn();render(<AssetPicker ownerKey="preview-output" label="本人照片" showIdentity={false} source={source} value={one} onConfirm={onConfirm}/>);
  expect(screen.queryByText("本人照片.png")).toBeNull();expect(screen.getByText("已选素材")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"本人照片"}));fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));
  expect(screen.queryByText("本人照片新版.png")).toBeNull();expect(screen.queryByText(/已选：/)).toBeNull();expect(screen.getByText("已选，可预览后使用")).toBeInTheDocument();
  expect(screen.getAllByTestId("preview").some(element=>element.dataset.file==="version-two")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"取消"}));expect(onConfirm).not.toHaveBeenCalled();expect(screen.getByText("已选素材")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"本人照片"}));fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));
  await waitFor(()=>expect(onConfirm).toHaveBeenCalledWith(two));
 });
 it("候选预览不替换原值，取消保留原值；确认精确文件版本",async()=>{
  const onConfirm=vi.fn();render(<AssetPicker ownerKey="output-a" label="本人照片" source={source} value={one} onConfirm={onConfirm}/>);
  fireEvent.click(screen.getByRole("button",{name:"本人照片"}));fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));
  expect(onConfirm).not.toHaveBeenCalled();expect(screen.getAllByTestId("preview").some(element=>element.dataset.file==="version-two")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"取消"}));expect(onConfirm).not.toHaveBeenCalled();expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"本人照片"}));fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));await waitFor(()=>expect(onConfirm).toHaveBeenCalledWith(two));
 });
 it("原文件缺预览仍允许合法选择，不用预览失败阻断",async()=>{
  const onConfirm=vi.fn(),legacy={choiceKey:"legacy",value:"asset-only",identity:null,name:"旧素材"};
  render(<AssetPicker ownerKey="output" label="素材" source={{...source,items:[legacy]}} value={null} onConfirm={onConfirm}/>);
  fireEvent.click(screen.getByRole("button",{name:"素材"}));fireEvent.click(screen.getByRole("button",{name:"预览 旧素材"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));await waitFor(()=>expect(onConfirm).toHaveBeenCalledWith(legacy));
 });
 it("切换作品关闭旧候选，失败不清空输入和原选择",async()=>{
  const onConfirm=vi.fn(()=>{throw Error("采用未完成");});const props={label:"素材",source,value:one,onConfirm};const view=render(<AssetPicker ownerKey="a" {...props}/>);
  fireEvent.click(screen.getByRole("button",{name:"素材"}));fireEvent.change(screen.getByRole("textbox",{name:"搜索素材"}),{target:{value:"新版"}});fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));expect(await screen.findByRole("alert")).toHaveTextContent("采用未完成");expect(screen.getByRole("textbox")).toHaveValue("新版");
  view.rerender(<AssetPicker ownerKey="b" {...props}/>);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(onConfirm).toHaveBeenCalledTimes(1);
 });
});

it("确认在途切作品释放新选择框，旧回执不关闭新候选；双击只确认一次",async()=>{
 let oldResolve!:()=>void,newResolve!:()=>void;
 const onConfirm=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{oldResolve=resolve;})).mockImplementationOnce(()=>new Promise<void>(resolve=>{newResolve=resolve;}));
 const props={label:"素材",source,value:one,onConfirm};const view=render(<AssetPicker ownerKey="old" {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"素材"}));const confirm=screen.getByRole("button",{name:"使用此素材"});fireEvent.click(confirm);fireEvent.click(confirm);expect(onConfirm).toHaveBeenCalledTimes(1);
 view.rerender(<AssetPicker ownerKey="new" {...props}/>);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(screen.getByRole("button",{name:"素材"})).not.toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"素材"}));fireEvent.click(screen.getByRole("button",{name:"预览 本人照片新版.png"}));fireEvent.click(screen.getByRole("button",{name:"使用此素材"}));
 await act(async()=>oldResolve());expect(screen.getByRole("dialog")).toBeInTheDocument();expect(screen.getByRole("button",{name:"正在加入…"})).toBeDisabled();
 await act(async()=>newResolve());await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(onConfirm).toHaveBeenCalledTimes(2);
});
