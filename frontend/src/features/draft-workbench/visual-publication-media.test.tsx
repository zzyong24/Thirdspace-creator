import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {unzipSync,strFromU8} from "fflate";
import {render,screen,fireEvent} from "@testing-library/react";
import {downloadVisualMaterialZip,VisualPublicationMedia} from "./visual-publication-media";
const api=vi.hoisted(()=>({exportPublicationVisualNote:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
let saved:Blob|null;
beforeEach(()=>{vi.clearAllMocks();saved=null;vi.stubGlobal("fetch",vi.fn());vi.stubGlobal("URL",{createObjectURL:vi.fn((blob:Blob)=>{saved=blob;return "blob:zip";}),revokeObjectURL:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it("整套ZIP保留真实图片字节、页序文件名与中文多段配文",async()=>{
 const page1=new Uint8Array([137,80,78,71,13,10,26,10,1]);const page2=new Uint8Array([137,80,78,71,13,10,26,10,2]);
 vi.mocked(fetch).mockResolvedValueOnce(new Response(page1)).mockResolvedValueOnce(new Response(page2));
 await downloadVisualMaterialZip({caption:"第一段配文。\n\n第二段配文。",files:[{assetId:"one",url:"/frozen/1",fileName:"01-cover.png"},{assetId:"two",url:"/frozen/2",fileName:"02-body.png"}]},"图文发布");
 expect(fetch).toHaveBeenNthCalledWith(1,"/frozen/1");expect(fetch).toHaveBeenNthCalledWith(2,"/frozen/2");
 const bytes=await new Promise<Uint8Array>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.readAsArrayBuffer(saved!);});
 const files=unzipSync(bytes);expect(Object.keys(files)).toEqual(["01-cover.png","02-body.png","caption.txt"]);expect(files["01-cover.png"]).toEqual(page1);expect(files["02-body.png"]).toEqual(page2);expect(strFromU8(files["caption.txt"]!)).toBe("第一段配文。\n\n第二段配文。");
});
it("某页读取失败时明确报错，不下载缺页整套文件",async()=>{vi.mocked(fetch).mockResolvedValue(new Response("missing",{status:404}));await expect(downloadVisualMaterialZip({caption:"配文",files:[{assetId:"one",url:"/expired",fileName:"01.png"}]},"图文")).rejects.toThrow("单张下载仍可使用");expect(saved).toBeNull();expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();});

it("整套读取缺页时其它页仍有独立冻结版本下载，单页错误不牵连其它页",async()=>{
 api.exportPublicationVisualNote.mockImplementation(async({body})=>{if(body.pageIndex!==1)throw new Error("第1页文件缺失");return {caption:"配文",files:[{assetId:"two",url:"/frozen/two",fileName:"02-two.png"}]};});
 const visualNote={schemaVersion:1 as const,sourceCanvasId:"canvas",sourceGroupId:"group",sourceCanvasRevision:2,imageMode:"carousel" as const,aspectRatio:"3:4",orderedAssetIds:["one","two"],pageReceipts:[{nodeId:"one",fileId:"f-one",checksum:"c-one"},{nodeId:"two",fileId:"f-two",checksum:"c-two"}]};
 render(<VisualPublicationMedia publicationId="pub" revisionId="revision" visualNote={visualNote} coverAssetId="one" title="图文"/>);
 const second=await screen.findByRole("button",{name:"下载第2页"});expect(screen.getByRole("button",{name:"整套下载"})).toBeDisabled();fireEvent.click(second);await screen.findByAltText("发布第2页");expect(api.exportPublicationVisualNote).toHaveBeenLastCalledWith({params:{publicationId:"pub"},query:undefined,body:{revisionId:"revision",pageIndex:1}});expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();expect(screen.getByRole("button",{name:"下载第1页"})).toBeEnabled();
});
