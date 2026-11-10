/** 批次2-1（月明 2026-11-10）：复盘经验默认接受、可撤销；同一次工具结果只自动采纳一次（刷新/重放不再写入）。 */
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const createLearning=vi.hoisted(()=>vi.fn(async(input:{body:{title:string}})=>({id:`learning-${input.body.title}`,createdThisCall:true})));
const evaluateLearning=vi.hoisted(()=>vi.fn(async()=>({id:"learning-演示先行"})));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/contract-client",()=>({client:{createLearning,evaluateLearning}}));
import {ChatLearningsCard} from "./chat-result-cards";
const items=[
 {title:"演示先行",insight:"待验证",source:"当前稿第二段",applicability:"有实测素材"},
 {title:"缺依据",insight:"x"},
];
afterEach(cleanup);
beforeEach(()=>{localStorage.clear();createLearning.mockClear();evaluateLearning.mockClear();});
it("有依据的经验自动采纳一次，可撤销（标为 discarded）；缺依据的不自动采纳",async()=>{
 render(<ChatLearningsCard autoAdoptKey="call-1" projectId="project" items={items}/>);
 await screen.findByText("✓ 已自动采纳");
 expect(createLearning).toHaveBeenCalledTimes(1);
 expect(createLearning.mock.calls[0]![0].body.title).toBe("演示先行");
 fireEvent.click(screen.getByRole("button",{name:"撤销「演示先行」"}));
 await waitFor(()=>expect(evaluateLearning).toHaveBeenCalledWith({params:{learningId:"learning-演示先行"},query:undefined,body:{validationStatus:"discarded"}}));
 expect(await screen.findByText("已撤销")).toBeTruthy();
});
it("同一 toolCallId 重新挂载（历史重放）不再写入，并保留撤销结果",async()=>{
 const first=render(<ChatLearningsCard autoAdoptKey="call-2" projectId="project" items={items}/>);
 await screen.findByText("✓ 已自动采纳");
 fireEvent.click(screen.getByRole("button",{name:"撤销「演示先行」"}));
 await screen.findByText("已撤销");first.unmount();
 render(<ChatLearningsCard autoAdoptKey="call-2" projectId="project" items={items}/>);
 expect(await screen.findByText("已撤销")).toBeTruthy();
 expect(createLearning).toHaveBeenCalledTimes(1);
});

it("复用已有同名经验时撤销不调用 discarded，避免撤掉用户更早的记录",async()=>{
 createLearning.mockImplementationOnce(async(input:{body:{title:string}})=>({id:`learning-${input.body.title}`,createdThisCall:false}));
 render(<ChatLearningsCard autoAdoptKey="call-reuse" projectId="project" items={items}/>);
 await screen.findByText("✓ 已自动采纳");
 fireEvent.click(screen.getByRole("button",{name:"撤销「演示先行」"}));
 await screen.findByText("已撤销");
 expect(evaluateLearning).not.toHaveBeenCalled();
});
