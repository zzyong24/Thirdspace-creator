'use strict';
// 只加载正式合同；本模块没有session、网络、数据库或任务装配。
const path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const repo=path.resolve(__dirname,'../../../../..'),req=createRequire(path.join(repo,'frontend/package.json'));
let endpoints;
function catalog(){if(!endpoints){req('tsx/cjs');endpoints=new Map(Object.values(req('@creatoros/contract').ENDPOINTS).map(e=>[e.id,e]));}return endpoints;}
function operation(id){const e=catalog().get(id);assert(e,'CONTRACT_OPERATION_REQUIRED '+id);return e;}
function validate(id,input={}){const e=operation(id);for(const k of ['params','query','body'])if(e[k])e[k].parse(input[k]??{});return e;}
function validateResponse(id,data){const e=operation(id);if(e.isList){assert(Array.isArray(data),'PUBLIC_LIST_REQUIRED '+id);data.forEach(x=>e.response.parse(x));}else e.response.parse(data);return data;}
module.exports={repo,req,catalog,operation,validate,validateResponse};
