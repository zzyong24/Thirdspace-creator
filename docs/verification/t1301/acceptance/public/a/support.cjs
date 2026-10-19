'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {test,expect,session,binding,dispatch}=require('../../candidate/driver/public-fixture.cjs');
const root=path.join(binding.sourceRoot,'docs/verification/t1301/acceptance/runs',process.env.T1300_RUN_NAME,'a');fs.mkdirSync(root,{recursive:true,mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const uuid=()=>crypto.randomUUID();
async function owned(page){
 let value;try{value=read('owned');}catch{
  const group=await dispatch(page,'accountGroups.create',{body:{name:'T1301-A-'+uuid(),idempotencyKey:uuid()}});
  value={task:'T-1300',sourceHead:binding.sourceHead,candidateBinding:session.candidateBinding,baseURL:session.baseURL,groupId:group.id};save('owned',value);
 }
 expect(value.sourceHead).toBe(binding.sourceHead);expect(value.baseURL).toBe(session.baseURL);
 await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(value.groupId),url:session.baseURL}]);
 await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},value.groupId);
 return value;
}
async function rpc(page,id,input={}){return dispatch(page,id,input,read('owned').groupId);}
async function capture(page,info,name){const file=info.outputPath(name+'.png');await page.screenshot({path:file,fullPage:true,animations:'disabled',caret:'hide',timeout:120000});await info.attach(name,{path:file,contentType:'image/png'});return file;}
function opId(request){try{if(new URL(request.url()).pathname!=='/api/v1/dispatch'||request.method()!=='POST')return null;return request.postDataJSON()?.id??null;}catch{return null;}}
module.exports={test,expect,session,binding,dispatch,root,save,read,uuid,owned,rpc,capture,opId};
