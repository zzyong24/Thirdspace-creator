'use strict';
// 离线只加载真实合同；无session/网络/SDK运行。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
let repo=__dirname;while(!fs.existsSync(path.join(repo,'frontend/package.json'))){const parent=path.dirname(repo);assert(parent!==repo);repo=parent;}
const req=createRequire(path.join(repo,'frontend/package.json'));let endpoints;
function catalog(){if(!endpoints){req('tsx/cjs');endpoints=new Map(Object.values(req('@creatoros/contract').ENDPOINTS).map(x=>[x.id,x]));}return endpoints;}
function operation(id){const v=catalog().get(id);assert(v,'PUBLIC_CONTRACT_REQUIRED '+id);return v;}
function validate(id,input={}){const v=operation(id);for(const k of ['params','query','body'])if(v[k])v[k].parse(input[k]??{});return v;}
function response(id,data){const v=operation(id);if(v.isList){assert(Array.isArray(data));data.forEach(x=>v.response.parse(x));}else v.response.parse(data);return data;}
module.exports={repo,req,catalog,operation,validate,response};
