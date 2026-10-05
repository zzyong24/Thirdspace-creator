import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {visualTemplateResource} from "@creatoros/contract";
import {builtinVisualTemplates} from "./visual-template.catalog";
const publicRoot=fileURLToPath(new URL("../../../../frontend/public",import.meta.url));
it("交付目录每项有真实PNG预览、唯一ID、有效配方且不夹带私人参考",()=>{
 expect(new Set(builtinVisualTemplates.map(t=>t.id)).size).toBe(builtinVisualTemplates.length);
 for(const t of builtinVisualTemplates){
  expect(visualTemplateResource.safeParse(t).success,t.id).toBe(true);
  expect(t.references,t.id).toEqual([]);
  expect(t.previewPath,t.id).toMatch(/^\/visual-templates\/[a-z0-9-]+\.png$/);
  expect(readFileSync(publicRoot+t.previewPath).subarray(0,8).toString("hex"),t.id).toBe("89504e470d0a1a0a");
  if(t.visualMode==="real_person")expect(t.requiredIdentity,t.id).toBe(true);
  if(t.libraryKind==="xhs"){expect(t.pageRecipes[0]?.role,t.id).toBe("cover");expect(t.pageRecipes.slice(1).every(p=>p.role==="body"),t.id).toBe(true);}
 }
});
it("GitHub样图与实际生成图的交付摘要可核验，完整MIT许可随包保留",()=>{
 const sources=JSON.parse(readFileSync(publicRoot+"/visual-templates/T1025-SOURCES.json","utf8")) as {generated:{file:string;sha256:string}[];github:{license:string;commit:string;images:{filename:string;sha256:string}[]}};
 expect(sources.github.license).toBe("MIT");expect(sources.github.commit).toMatch(/^[a-f0-9]{40}$/);
 for(const image of [...sources.generated,...sources.github.images.map(t=>({file:"github-"+t.filename,sha256:t.sha256}))]){
  expect(createHash("sha256").update(readFileSync(publicRoot+"/visual-templates/"+image.file)).digest("hex")).toBe(image.sha256);
 }
 expect(readFileSync(publicRoot+"/visual-templates/LIEFLAT-LICENSE","utf8")).toContain("Permission is hereby granted");
});
