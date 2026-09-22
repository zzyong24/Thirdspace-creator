import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {diagnoseWorkbenchHtml,workbenchRendererDiagnostics} from './workbench-html-diagnostics';
const hash=(html:string)=>createHash('sha256').update(html).digest('hex');
it('只计数真实 HTML 元素和资源引用，忽略注释、正文及脚本中的伪标签，不执行脚本',()=>{
 const html=`<!-- <script src="https://fake.test/a"></script> --><p>&lt;img src="https://fake.test/a"&gt;</p>
 <script src="https://cdn.test/chart.js"></script><script>globalThis.__diagnosticExecuted=true; const s='<svg></svg>'</script>
 <link rel="stylesheet" href="//cdn.test/style.css"><img src="https://cdn.test/image.png">
 <img src="chart.png"><svg><rect width="100" height="20"/></svg><table><tr><td>0</td></tr></table>
 <a href="https://source.test">来源</a><style>/* url(https://fake.test/a) */ .a{background:url('https://cdn.test/bg.png')} .b{content:'url(https://fake.test/a)'}</style>`;
 expect(diagnoseWorkbenchHtml(Buffer.from(html))).toMatchObject({schemaVersion:1,status:'analyzed',sourceHash:hash(html),scriptCount:2,externalResourceCount:4,staticSvgCount:1,staticTableCount:1,staticImgCount:2,degraded:true});
 expect((globalThis as Record<string,unknown>).__diagnosticExecuted).toBeUndefined();
});
it('CSS import、转义 URL、srcset 和 SVG 外部引用逐次计数，重复地址不去重',()=>{
 const html=String.raw`<style>@import "https://cdn.test/a.css";.a{background:url(\68 ttps://cdn.test/a.png)} .b{fill:url(#local)}</style>
 <img srcset="https://cdn.test/a.png 1x, //cdn.test/a.png 2x"><svg><use href="https://cdn.test/icon.svg#x"/></svg>`;
 expect(diagnoseWorkbenchHtml(Buffer.from(html)).externalResourceCount).toBe(5);
});
it('静态结构不能被推断为动态图表已完整后备；非 HTML 不适用，诊断失败不冒充已分析',()=>{
 const html='<h1>报告</h1><svg></svg><table><tr><td>0</td></tr></table>';
 expect(diagnoseWorkbenchHtml(Buffer.from(html))).toMatchObject({degraded:false,scriptCount:0,externalResourceCount:0,staticSvgCount:1,staticTableCount:1});
 expect(workbenchRendererDiagnostics('text/csv',hash(html))).toMatchObject({rendererPolicy:'static-offline-v1',diagnostics:{status:'not_applicable',degraded:false}});
 expect(workbenchRendererDiagnostics('text/html',hash(html))).toMatchObject({diagnostics:{status:'unavailable',degraded:false,sourceHash:hash(html)}});
 expect(diagnoseWorkbenchHtml(Buffer.from('<script></script><svg/>')).repairAdvice.join('')).toMatch(/保留原版[\s\S]*下一版本/);
});

it('普通属性中的 URL 不算资源，CSS 转义函数与 SVG 资源仍计数',()=>{
 const html=String.raw`<div src="https://unused.test/a" data="https://unused.test/a" title="https://unused.test/a"></div><style>.a{background:u\72l('https://cdn.test/a')}</style><svg><image href="//cdn.test/a.png"/></svg>`;
 expect(diagnoseWorkbenchHtml(Buffer.from(html))).toMatchObject({externalResourceCount:2,scriptCount:0,degraded:true});
});
