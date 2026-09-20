import {expect,it} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {WorkbenchPlanCard} from "./workbench-plan-card";

it("按真实保存状态展示进度，长计划只在用户展开后渲其余步骤",()=>{
 const steps=Array.from({length:8},(_,index)=>({stepId:`s-${index}`,title:`步骤 ${index+1}`,dependsOn:[],
  status:index===0?"succeeded" as const:"pending" as const,operationRefs:index===0?["op-1"]:[],artifactRefs:[]}));
 render(<WorkbenchPlanCard plan={{planRevision:3,steps}}/>);
 expect(screen.getByText("已完成 1/8 步")).toBeTruthy();
 expect(screen.getByText("已核对 1 项操作、0 份产物")).toBeTruthy();
 expect(screen.queryByText("步骤 8")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"查看全部 8 步"}));
 expect(screen.getByText("步骤 8")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"收起步骤"}));
 expect(screen.queryByText("步骤 8")).toBeNull();
});
