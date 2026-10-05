import {afterEach,it,expect,vi} from "vitest";
import {cleanup,render,screen,fireEvent,waitFor} from "@testing-library/react";
import {productionPlanV2} from "@creatoros/contract";
import {ProductionMediaSlotPanel} from "./production-media-slot-panel";
const plan=()=>productionPlanV2.parse({editorVersion:2,mainTrack:{sources:[],clips:[]},overlayDraft:{meta:{title:"真实稿面"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[],extension:{keep:true}});
afterEach(cleanup);
it("明确场景和时间后保存真实空图片位置，未选择文件不生成媒体项",async()=>{
 const onSave=vi.fn().mockResolvedValue(undefined);render(<ProductionMediaSlotPanel plan={plan()} duration={8} disabled={false} onSave={onSave}/>);fireEvent.click(screen.getByText("图片、视频与画布材料位置"));
 fireEvent.change(await screen.findByLabelText("材料位置名称"),{target:{value:"开头示意图"}});fireEvent.change(screen.getByLabelText("图片所在场景"),{target:{value:"new"}});fireEvent.change(screen.getByLabelText("材料开始时间（成片秒）"),{target:{value:"1"}});fireEvent.change(screen.getByLabelText("材料结束时间（成片秒）"),{target:{value:"4"}});fireEvent.click(screen.getByRole("button",{name:"保存空图片位置"}));
 await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());const saved=productionPlanV2.parse(onSave.mock.calls[0][0]);expect(saved.overlayDraft.mediaSlots).toEqual([{id:expect.any(String),role:"image-card",sceneId:saved.overlayDraft.scenes[0].id,label:"开头示意图",anchor:{kind:"timeline",startUs:1000000,endUs:4000000}}]);expect(saved.overlayDraft.scenes[0].cards).toEqual([]);expect(saved.extension).toEqual({keep:true});
});
it("保存视频位置只落实用户时间，错误仍保留输入且不凭空采用文件",async()=>{
 const onSave=vi.fn().mockRejectedValue(Error("版本冲突，原选择保留"));render(<ProductionMediaSlotPanel plan={plan()} duration={8} disabled={false} onSave={onSave}/>);fireEvent.click(screen.getByText("图片、视频与画布材料位置"));fireEvent.change(await screen.findByLabelText("材料位置名称"),{target:{value:"结尾现场"}});fireEvent.click(screen.getByRole("button",{name:"保存空视频位置"}));await screen.findByRole("alert");expect(screen.getByLabelText("材料位置名称")).toHaveValue("结尾现场");expect(onSave.mock.calls[0][0].overlayDraft.mediaSlots[0]).toMatchObject({role:"broll",label:"结尾现场"});expect(onSave.mock.calls[0][0].overlayDraft.broll).toEqual([]);
});

it("真实一微秒边界按十进制精确保存，不因浮点误差拒绝位置",async()=>{
 const onSave=vi.fn().mockResolvedValue(undefined);render(<ProductionMediaSlotPanel plan={plan()} duration={1.000001} disabled={false} onSave={onSave}/>);fireEvent.click(screen.getByText("图片、视频与画布材料位置"));fireEvent.change(await screen.findByLabelText("材料位置名称"),{target:{value:"精确范围"}});fireEvent.click(screen.getByRole("button",{name:"保存空视频位置"}));await waitFor(()=>expect(onSave).toHaveBeenCalledOnce());expect(onSave.mock.calls[0][0].overlayDraft.mediaSlots[0].anchor).toEqual({kind:"timeline",startUs:0,endUs:1000001});
});
