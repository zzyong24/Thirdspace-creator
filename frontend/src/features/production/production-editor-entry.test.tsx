import * as React from "react";
import {cleanup,render,screen,waitFor,fireEvent} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({getProductionEditor:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
vi.mock("./production-workbench",()=>({ProductionWorkbench:()=> <p>备料</p>}));
vi.mock("./rough-cut-workbench",()=>({RoughCutWorkbench:({initial}:{initial:{outputId:string}})=> <p>粗剪 {initial.outputId}</p>}));
vi.mock("./production-visual-editor",()=>({ProductionVisualEditor:()=> <p>旧剪辑</p>}));
vi.mock("./production-conversion-panel",()=>({ProductionConversionPanel:()=> <p>转换</p>}));
vi.mock("@/features/reference-editors/video-reference-workbench",()=>({VideoReferenceWorkbench:({initial,onOriginal}:{initial:{outputId:string};onOriginal:()=>void})=><div><p>开源剪辑 {initial.outputId}</p><button onClick={onOriginal}>原方案与粗剪</button></div>}));
import {ProductionEditorEntry} from "./production-editor-entry";
const props={projectId:"project-a",projectTitle:"验收",scriptText:null,outputId:"output-a",initialStatus:null,initialSegmentCount:0};
afterEach(()=>{cleanup();api.getProductionEditor.mockReset();});
it("切换作品立即隐藏旧工程，新作品读取失败显示错误",async()=>{api.getProductionEditor.mockResolvedValueOnce({outputId:"output-a",state:"empty",revision:0,plan:null});const view=render(<ProductionEditorEntry {...props}/>);await screen.findByText("开源剪辑 output-a");let reject!:(value:Error)=>void;api.getProductionEditor.mockImplementation(()=>new Promise((_r,j)=>{reject=j;}));view.rerender(<ProductionEditorEntry {...props} outputId="output-b"/>);expect(screen.queryByText("开源剪辑 output-a")).not.toBeInTheDocument();await waitFor(()=>expect(api.getProductionEditor).toHaveBeenCalledTimes(2));reject(Error("新作品读取失败"));await screen.findByRole("alert");expect(screen.getByRole("alert")).toHaveTextContent("新作品读取失败");});

it("开源工作台默认打开且原粗剪与返回入口可达",async()=>{api.getProductionEditor.mockResolvedValue({outputId:"output-a",state:"empty",revision:0,plan:null});render(<ProductionEditorEntry {...props}/>);await screen.findByText("开源剪辑 output-a");fireEvent.click(screen.getByRole("button",{name:"原方案与粗剪"}));await screen.findByText("粗剪 output-a");fireEvent.click(screen.getByRole("button",{name:"返回剪辑工作台"}));await screen.findByText("开源剪辑 output-a");});
