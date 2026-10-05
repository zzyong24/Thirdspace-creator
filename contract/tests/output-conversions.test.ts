import {describe, expect, it} from "vitest";
import {outputConversionRequest, outputConversionSourceAnchor, outputConversionReceipt, outputConversionTextRange} from "../src/resources/output-conversions";

const digest = "a".repeat(64);
const whole = {sourceOutputId:"source", sourceVersionId:"version", targetType:"image", mode:"whole", clientRequestId:"request-1043", reuseImages:[]};
const selected = {...whole, mode:"selected", sourceSectionIds:[], sourceFields:[], textRanges:[{field:"body",start:1,end:3,textDigest:digest}], targetFields:["body","cardBriefs"]};
const anchor = {kind:"output_version", sourceOutputId:"source", artifactId:"artifact", versionId:"version", sourceType:"article", selectionDigest:digest, selection:{mode:"whole"}};

describe("待评审的作品转换合同", () => {
  it("整稿请求不接受客户端正文或混入选区", () => {
    expect(outputConversionRequest.safeParse(whole).success).toBe(true);
    expect(outputConversionRequest.safeParse({...whole,sourceText:"客户端自报全文"}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...whole,sourceSectionIds:["s1"]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...whole,clientRequestId:""}).success).toBe(false);
  });
  it("局部请求必须有真实选区和明确目标字段，禁止跨类型字段", () => {
    expect(outputConversionRequest.safeParse(selected).success).toBe(true);
    expect(outputConversionRequest.safeParse({...selected,textRanges:[]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,targetFields:[]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,targetType:"article"}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,targetType:"video",targetFields:["script"]}).success).toBe(true);
    expect(outputConversionRequest.safeParse({...selected,sourceFields:["title","title"]}).success).toBe(false);
  });
  it("范围协议使用完整字段摘要和安全整数 UTF-16 偏移，不接受零长度或模型文本", () => {
    const range={field:"body",start:1,end:3,textDigest:digest};
    expect(outputConversionTextRange.safeParse(range).success).toBe(true);
    for(const bad of [{...range,end:1},{...range,start:-1},{...range,end:2.5},{...range,end:Number.MAX_SAFE_INTEGER+1},{...range,textDigest:"short"},{...range,text:"😀"}])
      expect(outputConversionTextRange.safeParse(bad).success).toBe(false);
  });
  it("重复素材文件或重叠范围不能造成静默多次复用", () => {
    const image={assetId:"asset",assetFileId:"file"};
    expect(outputConversionRequest.safeParse({...whole,reuseImages:[image,image]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,textRanges:[...selected.textRanges,{field:"body",start:2,end:4,textDigest:digest}]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...whole,reuseImages:Array.from({length:101},(_,i)=>({assetId:`asset-${i}`,assetFileId:`file-${i}`}))}).success).toBe(true);
  });
  it("冻结来源必须是作品历史引用，选区不可伪装为 whole", () => {
    expect(outputConversionSourceAnchor.safeParse(anchor).success).toBe(true);
    expect(outputConversionSourceAnchor.safeParse({...anchor,kind:"project"}).success).toBe(false);
    expect(outputConversionSourceAnchor.safeParse({...anchor,selection:{mode:"selected",sourceSectionIds:[],sourceFields:[],textRanges:[]}}).success).toBe(false);
  });
  const item=(targetField:string,status="succeeded",resultId=`result-${targetField}`)=>({targetField,resultId,taskId:`task-${targetField}`,status,errorCode:status==="failed"?"GENERATION_FAILED":null,
    adoption:status==="adopted"?{status:"adopted",versionId:`saved-${targetField}`,clientRequestId:`adoption-${targetField}`}:{status:"not_adopted"}});
  const receipt=()=>({targetOutputId:"target",targetType:"image",resultId:"result-body",taskId:"task-body",bundleId:"bundle",sourceAnchor:anchor,
    requestSummary:whole,targetFields:["title","body","cardBriefs"],items:[item("title"),item("body"),item("cardBriefs")],status:"complete"});
  it("整稿回执覆盖正文和图卡，不能以一个单项成功宣称整稿完成", () => {
    expect(outputConversionReceipt.safeParse(receipt()).success).toBe(true);
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("body")]}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),targetFields:["body"],items:[item("body")]}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),targetFields:["title","body"],items:[item("title"),item("body")]}).success).toBe(false);
  });
  it("选定多个目标字段必须完整回读，不接受额外、重复或跨类型字段", () => {
    const r={...receipt(),requestSummary:selected,sourceAnchor:{...anchor,selection:{mode:"selected",sourceSectionIds:[],sourceFields:[],textRanges:selected.textRanges}},
      targetFields:["body","cardBriefs"],items:[item("body"),item("cardBriefs")]};
    expect(outputConversionReceipt.safeParse(r).success).toBe(true);
    expect(outputConversionReceipt.safeParse({...r,items:[item("body")]}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...r,items:[item("body"),item("body")]}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...r,items:[...r.items,item("script")]}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...r,targetFields:["body"],items:[item("body")]}).success).toBe(false);
  });
  it("primary result 与 task 必须指向实际同一项，bundle 不能冒充 result", () => {
    expect(outputConversionReceipt.safeParse({...receipt(),resultId:"bundle"}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),taskId:"task-title"}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),bundleId:null}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("title"),item("body"),item("cardBriefs","succeeded","result-body")]}).success).toBe(false);
  });
  it("成功候选与采用独立显示，聚合状态与每个真实单项一致", () => {
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("title","adopted"),item("body"),item("cardBriefs")]}).success).toBe(true);
    const mixed=[item("title"),item("body"),item("cardBriefs","failed")];
    expect(outputConversionReceipt.safeParse({...receipt(),items:mixed,status:"complete"}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),items:mixed,status:"partial_completed"}).success).toBe(true);
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("title","queued"),item("body","queued"),item("cardBriefs","queued")],status:"queued"}).success).toBe(true);
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("title","queued"),item("body","queued"),item("cardBriefs","queued")],status:"complete"}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),items:[item("title"),{...item("body"),taskId:null},item("cardBriefs")]}).success).toBe(false);
  });
  it("冻结请求摘要必须与源版本、选区及目标类型一致", () => {
    expect(outputConversionReceipt.safeParse({...receipt(),requestSummary:{...whole,sourceVersionId:"other"}}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),requestSummary:{...whole,sourceOutputId:"other"}}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),sourceAnchor:{...anchor,sourceType:"image"}}).success).toBe(false);
    expect(outputConversionReceipt.safeParse({...receipt(),requestSummary:selected}).success).toBe(false);
  });
  it("六个异类方向均可表示，每类整稿必须覆盖其必要结构", () => {
    const fields={article:["title","sections"],image:["title","body","cardBriefs"],video:["script"]};
    for(const sourceType of ["article","image","video"] as const) for(const targetType of ["article","image","video"] as const) {
      const items=fields[targetType].map(field=>item(field));
      const r={...receipt(),targetType,sourceAnchor:{...anchor,sourceType},requestSummary:{...whole,targetType},targetFields:fields[targetType],
        items,resultId:items[0]!.resultId,taskId:items[0]!.taskId,bundleId:items.length>1?"bundle":null};
      expect(outputConversionReceipt.safeParse(r).success).toBe(sourceType!==targetType);
    }
  });
  it("完整候选不等于已经采用；失败与取消仍保留每项原因和账本", () => {
    const generated=outputConversionReceipt.parse(receipt());
    expect(generated.items.map(value=>value.status)).toEqual(["succeeded","succeeded","succeeded"]);
    const cancelled=receipt().items.map(value=>({...value,status:"cancelled",taskId:null}));
    expect(outputConversionReceipt.safeParse({...receipt(),items:cancelled,taskId:null,status:"cancelled"}).success).toBe(true);
    const failed=receipt().items.map(value=>({...value,status:"failed",errorCode:"MODEL_NOT_CONFIGURED",taskId:null}));
    expect(outputConversionReceipt.safeParse({...receipt(),items:failed,taskId:null,status:"failed"}).success).toBe(true);
    expect(outputConversionReceipt.safeParse({...receipt(),items:failed.map(value=>({...value,errorCode:null})),taskId:null,status:"failed"}).success).toBe(false);
  });
  it("一个结构候选可以同时覆盖正文和图卡，不强制新增请求或 bundle", () => {
    const primary={resultId:"result-structure",taskId:"task-structure",status:"succeeded",errorCode:null,adoption:{status:"not_adopted"}};
    const r={...receipt(),requestSummary:selected,sourceAnchor:{...anchor,selection:{mode:"selected",sourceSectionIds:[],sourceFields:[],textRanges:selected.textRanges}},
      targetFields:["body","cardBriefs"],items:[{...primary,targetField:"body"},{...primary,targetField:"cardBriefs"}],
      resultId:primary.resultId,taskId:primary.taskId,bundleId:null};
    expect(outputConversionReceipt.safeParse(r).success).toBe(true);
    for(const change of [{taskId:"another-task"},{status:"adopted"},{errorCode:"DIFFERENT"}]) {
      expect(outputConversionReceipt.safeParse({...r,items:[r.items[0],{...r.items[1],...change}]}).success).toBe(false);
    }
    expect(outputConversionReceipt.safeParse({...r,items:[r.items[0],{...r.items[1],resultId:"second-result"}]}).success).toBe(false);
  });
  it("一个字段的范围必须绑定同一摘要，且不能再全选该字段", () => {
    expect(outputConversionRequest.safeParse({...selected,sourceFields:["body"]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,textRanges:[...selected.textRanges,{field:"body",start:3,end:4,textDigest:"b".repeat(64)}]}).success).toBe(false);
    expect(outputConversionRequest.safeParse({...selected,textRanges:[...selected.textRanges,{field:"body",start:3,end:4,textDigest:digest}]}).success).toBe(true);
  });
});

it("共享候选的生成完成与单字段采用分开，正文采用不替图卡文字保存",()=>{
  const request={...selected,targetFields:["body","cardBriefs"]};
  const base={targetOutputId:"target",targetType:"image",resultId:"structure",taskId:"task",bundleId:null,
    sourceAnchor:{...anchor,selection:{mode:"selected",sourceSectionIds:[],sourceFields:[],textRanges:selected.textRanges}},
    requestSummary:request,targetFields:["body","cardBriefs"],status:"complete"};
  const body={targetField:"body",resultId:"structure",taskId:"task",status:"succeeded",errorCode:null,
    adoption:{status:"adopted",versionId:"saved-body",clientRequestId:"adopt-body-request"}};
  const cards={...body,targetField:"cardBriefs",adoption:{status:"not_adopted"}};
  const parsed=outputConversionReceipt.parse({...base,items:[body,cards]});
  expect(parsed.items.map(item=>item.adoption.status)).toEqual(["adopted","not_adopted"]);
  expect(outputConversionReceipt.safeParse({...base,items:[{...body,adoption:{status:"adopted"}},cards]}).success).toBe(false);
  expect(outputConversionReceipt.safeParse({...base,items:[{...body,status:"adopted"},{...cards,status:"adopted"}]}).success).toBe(false);
});

it("owner 按保存顺序规范化选区仍是同一请求，不能增加或删去选择",()=>{
 const primary={targetField:"body",resultId:"body-result",taskId:"body-task",status:"succeeded",errorCode:null,adoption:{status:"not_adopted"}};
 const request={...selected,sourceSectionIds:["s2","s1"],sourceFields:["summary","title"],textRanges:[],targetFields:["body"]};
 const selection={mode:"selected",sourceSectionIds:["s1","s2"],sourceFields:["title","summary"],textRanges:[]};
 const receipt={targetOutputId:"target",targetType:"image",resultId:"body-result",taskId:"body-task",bundleId:null,
  sourceAnchor:{...anchor,selection},requestSummary:request,targetFields:["body"],items:[primary],status:"complete"};
 expect(outputConversionReceipt.safeParse(receipt).success).toBe(true);
 expect(outputConversionReceipt.safeParse({...receipt,sourceAnchor:{...anchor,selection:{...selection,sourceSectionIds:["s1"]}}}).success).toBe(false);
 expect(outputConversionReceipt.safeParse({...receipt,sourceAnchor:{...anchor,selection:{...selection,sourceFields:["body","title","summary"]}}}).success).toBe(false);
});

it("公共转换操作使用完整请求与严格回执，恢复按原请求号",async()=>{
 const {ENDPOINTS}=await import("../src/endpoints");
 expect(ENDPOINTS.convertOutput.id).toBe("outputs.conversions.create");
 expect(ENDPOINTS.convertOutput.body.safeParse(whole).success).toBe(true);
 expect(ENDPOINTS.getOutputConversion.params.safeParse({clientRequestId:"request-1043"}).success).toBe(true);
});
