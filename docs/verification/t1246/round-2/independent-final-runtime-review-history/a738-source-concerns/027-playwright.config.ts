import { createHash } from "node:crypto";
import { mkdirSync,readFileSync,readdirSync,realpathSync } from "node:fs";
import { isAbsolute,relative,resolve,dirname } from "node:path";
// 原配置由Playwright自己的TS loader实际读取；单独副本在frontend同宿主使用。
const frontend=process.cwd();const root=resolve(frontend,"..");
const original=require(resolve(frontend,"playwright.config.ts")).default;
const listing=process.argv.includes("--list");const bindingPath=process.env.CREATOROS_T1246_ORIGINAL_BINDING;
const manifest=JSON.parse(readFileSync(bindingPath??resolve(__dirname,"manifest.json"),"utf8"));
if(!Array.isArray(manifest.unresolved)||manifest.unresolved.length)throw Error("UNRESOLVED_DECLARED_CONSUMER_REQUIRED_REVIEW");
const runtime=!!bindingPath;const generated=runtime?manifest.runtimeTestRoot:resolve(root,manifest.generatedTestRoot);
if(runtime&&realpathSync(root)!==realpathSync(manifest.runtimeRoot))throw Error("OWNED_RUNTIME_CWD_REQUIRED");
if(!runtime&&manifest.sourceRoot!==root)throw Error("SOURCE_LIST_CWD_REQUIRED");
if(!listing&&(!runtime||process.env.CREATOROS_T1246_TOOL_REVIEWED!=="1"||process.env.CREATOROS_T1246_FROZEN_CANDIDATE!==manifest.candidate))throw Error("REVIEWED_FINAL_RUNTIME_REQUIRED");
const run=process.env.CREATOROS_T1246_RUN_DIR;if(!run||!isAbsolute(run))throw Error("EXACT_OWNED_RUN_ROOT_REQUIRED");
if(runtime&&run!==manifest.runRoot)throw Error("RUNTIME_EVIDENCE_ROOT_MISMATCH");
mkdirSync(run,{recursive:true});
const hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
const inventory=(d:string):string[]=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?inventory(resolve(d,e.name)):[resolve(d,e.name)]).sort();
for(const [dir,files]of [[resolve(root,"frontend/tests"),manifest.allOriginalTestFiles],[generated,manifest.allGeneratedTestFiles]] as const){
 const actual=inventory(dir).map(p=>relative(dir,p)).filter(p=>dir===generated||!manifest.excludedNewReadonlyInputs.includes("frontend/tests/"+p)).sort();
 if(JSON.stringify(actual)!==JSON.stringify(files.map((f:{file:string})=>f.file).sort()))throw Error("EXACT_ORIGINAL_GENERATED100_INVENTORY_DRIFT");
 for(const f of files)if(hash(resolve(dir,f.file))!==f.sha256)throw Error("ORIGINAL_GENERATED_BYTE_DRIFT:"+f.file);
}
if(hash(resolve(frontend,"playwright.config.ts"))!==manifest.configOriginalSha256)throw Error("ORIGINAL_CONFIG_DRIFT");
for(const suffix of manifest.outputSuffixes){const p=resolve(run,"original-output",suffix);mkdirSync(/\.[a-z0-9]+$/i.test(suffix)?dirname(p):p,{recursive:true});}
mkdirSync(resolve(run,"scenario"),{recursive:true});
const outer=Math.max(180000,...manifest.budgets.map((b:{effectiveTestMs:number})=>b.effectiveTestMs));
export default {...original,testDir:generated,projects:original.projects.filter((p:{name:string})=>p.name==="e2e"),globalSetup:resolve(generated,"visual/__setup__.ts"),globalTeardown:resolve(generated,"visual/__teardown__.ts"),outputDir:resolve(run,"test-results"),workers:1,retries:0,globalTimeout:0,timeout:outer,expect:{...original.expect,timeout:120000},use:{...original.use,actionTimeout:120000,navigationTimeout:120000,trace:"on",screenshot:"on"},webServer:undefined,reporter:listing?[["list"]]:[["line"],["json",{outputFile:resolve(run,"results.json")}],["html",{open:"never",outputFolder:resolve(run,"html")}]]};
