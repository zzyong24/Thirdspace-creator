import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {ChatLearningsCard} from "./chat-result-cards";
const createLearning=vi.hoisted(()=>vi.fn(async()=>({id:"learning"})));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/contract-client",()=>({client:{createLearning}}));
it("没有经验也显示完整报告，绝不自动采纳",()=>{
 createLearning.mockClear();render(<ChatLearningsCard items={[]} observations={["只有稿件，未采集指标"]} hypotheses={["开头可能缺少具体收益"]} nextExperiment="仅将演示前移" insufficientReason="缺少同窗口对照" />);
 expect(screen.getByText("只有稿件，未采集指标")).toBeTruthy();expect(screen.getByText("开头可能缺少具体收益")).toBeTruthy();expect(screen.getByText(/仅将演示前移/)).toBeTruthy();expect(screen.getByText(/缺少同窗口对照/)).toBeTruthy();expect(screen.queryByText("采纳")).toBeNull();expect(createLearning).not.toHaveBeenCalled();
});
it("用户采纳携带真实项目及来源条件",async()=>{
 createLearning.mockClear();render(<ChatLearningsCard projectId="project" items={[{title:"演示先行",insight:"待验证",source:"当前稿第二段",applicability:"有实测素材"}]} />);
 expect(createLearning).not.toHaveBeenCalled();fireEvent.click(screen.getByText("采纳"));await waitFor(()=>expect(createLearning).toHaveBeenCalledWith({params:undefined,query:undefined,body:{title:"演示先行",insight:"待验证",projectId:"project",source:"当前稿第二段",applicability:"有实测素材"}}));
});
