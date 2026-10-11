import {writeFile,mkdir} from 'node:fs/promises';
import {generateCodexImage} from '../../../ai-worker/src/execution/codex-image-generation';
async function main(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),600000);
 const bindings:Record<string,unknown>={};
 try{
  const result=await generateCodexImage({prompt:'生成一张白色背景的蓝色圆形图标，极简，无文字。',aspectRatio:'1:1'},'t1238-native-image-probe',controller.signal,async(port,raw)=>{
   if(port==='bindCodexCall'){Object.assign(bindings,raw);return bindings;}
   if(port==='readCodexCall')return bindings;
   throw Error(port);
  });
  await mkdir('docs/verification/t1238',{recursive:true});await writeFile('docs/verification/t1238/native-image.png',result.assetBytes);
  console.log(JSON.stringify({status:'PASS',bytes:result.assetBytes.length,...result.native,path:'docs/verification/t1238/native-image.png'}));
 }catch(error){console.log(JSON.stringify({status:'FAIL',bindings,error:error instanceof Error?error.message:'UNKNOWN'}));process.exitCode=1;}
 finally{clearTimeout(timer);}
}
void main();
