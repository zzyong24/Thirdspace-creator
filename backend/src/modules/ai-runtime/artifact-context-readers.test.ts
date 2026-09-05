import { describe,it,expect,vi } from "vitest";
import { createArtifactContextReaders } from "./artifact-context-readers";
const ctx={userId:"u",accountId:"a",source:"user" as const,requestId:"r"};
function fixture(){
  const listProjectArtifacts=vi.fn(async()=>[{id:"contract",artifactType:"content_contract",currentVersionId:"chosen",origin:"reconstructed"}] as never);
  const listVersions=vi.fn(async()=>[
    {id:"newer",versionNumber:2,contentData:{cards:[{title:"未选择",body:"新内容"}]}},
    {id:"chosen",versionNumber:1,contentData:{cards:[{title:"已选择",body:"保留该版本"}]}},
  ] as never);
  return {port:{listProjectArtifacts,listVersions},readers:createArtifactContextReaders({listProjectArtifacts,listVersions})};
}
describe("领域版本上下文读取",()=>{
  it("当前指针优先于版本序号，归属上下文原样经过服务端口",async()=>{
    const {port,readers}=fixture();expect(await readers.contractReader.getContractCards(ctx,"p")).toEqual([{title:"已选择",body:"保留该版本"}]);
    expect(port.listProjectArtifacts).toHaveBeenCalledWith(ctx,"p");expect(port.listVersions).toHaveBeenCalledWith(ctx,"contract");
    expect(await readers.artifactOriginReader.getArtifactOrigin(ctx,"p","content_contract")).toBe("reconstructed");
  });
  it("没有对应产物时返回空，不伪造依据",async()=>{
    const {port,readers}=fixture();expect(await readers.outlineReader.getOutline(ctx,"p")).toBeNull();expect(port.listVersions).not.toHaveBeenCalled();
  });
  it("没有adopted标记的历史论点不能作为写稿依据",async()=>{
    const {port,readers}=fixture();port.listProjectArtifacts.mockResolvedValue([{id:"thesis",artifactType:"thesis_tree",currentVersionId:"chosen"}] as never);
    port.listVersions.mockResolvedValue([{id:"chosen",versionNumber:1,contentData:{nodes:[{column:"主张",title:"旧主张",summary:"未采纳"}]}}] as never);
    expect(await readers.thesisReader.getThesisNodes(ctx,"p")).toEqual([]);
  });
});
