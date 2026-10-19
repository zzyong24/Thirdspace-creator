import {createRequire} from "node:module";
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

// 当前共享组件的隔离回放：合成输入；没有服务端、平台、数据库、模型或用户浏览器。
const root=process.cwd(),frontend=path.join(root,"frontend"),base=path.join(root,"docs/verification/t1127");
const baseline=process.argv.includes("--baseline"),phase=baseline?"before":"after";
const require=createRequire(path.join(frontend,"package.json"));
const {build}=require("esbuild"),{chromium,expect}=require("@playwright/test");
const digest=data=>createHash("sha256").update(data).digest("hex");
const sourcePaths=["frontend/src/components/analytics/chart-frame.tsx","frontend/src/components/project/section-card.tsx","frontend/src/components/ui/card.tsx","frontend/src/styles/tokens.css"];
const sourceSha256=Object.fromEntries(sourcePaths.map(p=>[p,digest(readFileSync(path.join(root,p)))]));
const chunkRoot=path.join(frontend,".next/static/chunks");
const chunks=readdirSync(chunkRoot).filter(p=>p.endsWith(".css")).map(p=>({p,text:readFileSync(path.join(chunkRoot,p),"utf8")}));
const css=chunks.filter(c=>c.text.includes("--creatoros-brand")&&c.text.includes("grid-cols-\\[3\\.5rem"));
assert.equal(css.length,1,"必须恰有一份本机实际构建的全局组件CSS；不能用手写布局代签");
const trend=[{label:"2026-10-01",value:null},{label:"2026-10-02",value:null},{label:"2026-10-03",value:379},{label:"2026-10-04",value:null},{label:"2026-10-05",value:null}];
const bundle=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ChartFrame} from './src/components/analytics/chart-frame';console.log(renderToStaticMarkup(<main style={{maxWidth:700,margin:'32px auto',padding:16}}><ChartFrame title="作品播放量" description="最近五天" summary="10月3日播放379次，其余日期没有采集记录。" height={240} trend={${JSON.stringify(trend)}}/></main>));`,resolveDir:frontend,loader:"tsx"},bundle:true,platform:"node",format:"cjs",tsconfig:path.join(frontend,"tsconfig.json"),write:false});
mkdirSync(path.join(base,"screenshots"),{recursive:true});
const temporary=path.join(base,`.chart-${phase}-${process.pid}.cjs`);let markup;
try{writeFileSync(temporary,bundle.outputFiles[0].text);markup=execFileSync(process.execPath,[temporary],{encoding:"utf8",timeout:120000});}finally{rmSync(temporary,{force:true});}
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css[0].text}</style></head><body>${markup}</body></html>`;
writeFileSync(path.join(base,`chart-${phase}.html`),html);
const browser=await chromium.launch({channel:process.env.CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL||"chrome",timeout:120000});
const captures=[];
try{
 for(const viewport of [{width:1366,height:900},{width:900,height:900}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,colorScheme:"light",reducedMotion:"reduce",serviceWorkers:"block"});
  page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);
  await page.route("**/*",route=>route.abort()); // 静态组件回放不允许隐式外部请求。
  await page.setContent(html,{waitUntil:"domcontentloaded",timeout:120000});
  if(viewport.width===900)await page.locator("main").evaluate(el=>{el.style.maxWidth="420px";});
  await expect(page.getByRole("figure",{name:"作品播放量"})).toBeVisible();
  await expect(page.locator('[data-slot="chart-value-axis"]')).toContainText("400");
  await expect(page.locator('[data-slot="chart-date-axis"]')).toContainText("10/01");
  await expect(page.locator('[data-slot="chart-date-axis"]')).toContainText("10/05");
  await expect(page.locator('[data-slot="chart-summary"]')).toContainText("其余日期没有采集记录");
  const point=page.locator(baseline?'[data-slot="chart-frame-svg"] circle':'[data-slot="chart-data-point"]');
  await expect(point).toHaveCount(1);
  const geometry=await point.evaluate(el=>{
   const svg=el.ownerSVGElement,center=svg.createSVGPoint();center.x=Number(el.getAttribute("x1")??el.getAttribute("cx"));center.y=Number(el.getAttribute("y1")??el.getAttribute("cy"));
   const p=center.matrixTransform(el.getScreenCTM()),r=svg.getBoundingClientRect();
   return {tag:el.tagName,center:{x:p.x,y:p.y},svg:{width:r.width,height:r.height},strokeWidth:el.getAttribute("stroke-width"),linecap:el.getAttribute("stroke-linecap"),vectorEffect:el.getAttribute("vector-effect"),title:el.textContent};
  });
  assert.equal(await page.locator('[data-slot="chart-frame-svg"] path').count(),0,"单点不能捏造连续曲线");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"不能横向溢出");
  const screenshot=path.join(base,"screenshots",`${phase}-${viewport.width}.png`);
  await page.screenshot({path:screenshot,scale:"css",timeout:120000});
  const pixels=await page.evaluate(async({encoded,center})=>{
   const img=new Image();img.src="data:image/png;base64,"+encoded;await img.decode();
   const canvas=document.createElement("canvas");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
   const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,pts=[];
   for(let yy=Math.max(0,Math.floor(center.y)-40);yy<Math.min(canvas.height,Math.floor(center.y)+41);yy++)for(let xx=Math.max(0,Math.floor(center.x)-40);xx<Math.min(canvas.width,Math.floor(center.x)+41);xx++){
    const at=(yy*canvas.width+xx)*4,[r,g,b]=rgba.subarray(at,at+3);if(r>=90&&r<=130&&g>=50&&g<=100&&b>=220)pts.push([xx,yy]);
   }
   if(!pts.length)throw Error("没有实际紫色点像素");
   return {width:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0]))+1,height:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))+1,count:pts.length};
  },{encoded:readFileSync(screenshot).toString("base64"),center:geometry.center});
  if(!baseline){assert.equal(geometry.vectorEffect,"non-scaling-stroke");assert.equal(geometry.linecap,"round");assert.equal(geometry.strokeWidth,"6");assert.equal(geometry.title,"2026-10-03：379 次");assert.equal(pixels.width,pixels.height,"实际像素点必须圆形");assert.ok(pixels.width>=5&&pixels.width<=7,"点大小不随窗口拉伸");}
  captures.push({viewport,screenshot:path.relative(root,screenshot),screenshotSha256:digest(readFileSync(screenshot)),geometry,pixels});
  await page.close();
 }
}finally{await browser.close();}
for(const p of sourcePaths)assert.equal(digest(readFileSync(path.join(root,p))),sourceSha256[p],"采证途中源码必须不变");
const report={schema:"creatoros-chart-component-visual/v1",phase,capturedAt:new Date().toISOString(),commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sourceSha256,css:{path:path.relative(root,path.join(chunkRoot,css[0].p)),sha256:digest(css[0].text)},input:{kind:"synthetic-isolated-component",trend},retries:0,modelCalls:0,platformOperations:0,databaseWrites:0,claims:{componentReplay:true,productionPage:false,nativeApp:false,humanViewed:false},captures};
writeFileSync(path.join(base,`visual-${phase}.json`),JSON.stringify(report,null,2)+"\n");
process.stdout.write(JSON.stringify({phase,retries:0,captures:captures.map(c=>({viewport:c.viewport,pixels:c.pixels}))})+"\n");
