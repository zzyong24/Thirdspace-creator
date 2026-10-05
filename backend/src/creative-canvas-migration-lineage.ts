import {inspectMigrationConvergence,assertMigrationConverged,CONVERGENCE_WHEN} from './migration-convergence';
import {sql} from 'drizzle-orm';
import type {Db} from './db';
/** SEMANTIC_BOUNDARY_ALLOW: 只核迁移账本/hash/时间/物理schema，不判断创作内容或选择。 */
export const LEGACY_CANVAS_MIGRATION={hash:'6c971231adfc0a1771577f21a6c51a885fb24201f8029cc293ee5195576ab7f2',when:1790553600000} as const;
type QueryDb=Pick<Db,'execute'>;
class CanvasMigrationError extends Error{
 constructor(readonly code:'CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN'|'CREATIVE_CANVAS_MIGRATION_SCHEMA_INCOMPATIBLE',detail:string){super(`${code}: ${detail}`);this.name='CanvasMigrationError';}
}
const unknown=(detail:string):never=>{throw new CanvasMigrationError('CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN',detail);};
const incompatible=(detail:string):never=>{throw new CanvasMigrationError('CREATIVE_CANVAS_MIGRATION_SCHEMA_INCOMPATIBLE',detail);};
type Column={type:'text'|'int4'|'bool'|'jsonb';nullable:boolean;default?:string};
const text:Column={type:'text',nullable:false},int:Column={type:'int4',nullable:false},json:Column={type:'jsonb',nullable:false},optionalText:Column={type:'text',nullable:true},optionalInt:Column={type:'int4',nullable:true},optionalJson:Column={type:'jsonb',nullable:true};
const structures:Record<string,{columns:Record<string,Column>;primary:string[];unique?:string[][]}>={
 reporting_consents:{columns:{user_id:text,scope:text,account_id:{...text,default:"''::text"},enabled:{type:'bool',nullable:false,default:'false'},consent_version:int,consent_epoch:{...int,default:'0'},account_alias:optionalText,changed_at:text},primary:['user_id','scope','account_id']},
 reporting_outbox:{columns:{event_id:text,user_id:text,scope:text,account_id:{...text,default:"''::text"},work_alias:optionalText,consent_epoch:int,encrypted_payload:text,created_at:text,expires_at:text},primary:['event_id']},
 reporting_consent_changes:{columns:{user_id:text,change_id:text,scope:text,account_id:{...text,default:"''::text"},enabled:{type:'bool',nullable:false},changed_at:text},primary:['user_id','change_id']},
 creative_canvases:{columns:{id:text,user_id:text,account_id:text,title:text,project_id:optionalText,document_json:json,revision:{...int,default:'1'},created_at:text,updated_at:text,archived_at:optionalText},primary:['id']},
 canvas_generation_links:{columns:{id:text,user_id:text,account_id:text,canvas_id:text,node_id:text,attempt_id:text,task_id:optionalText,input_revision:int,input_digest:text,input_json:json,reference_file_id:optionalText,reference_checksum:optionalText,result_asset_id:optionalText,created_at:text,updated_at:text},primary:['id'],unique:[['attempt_id'],['task_id']]},
 canvas_agent_proposals:{columns:{id:text,user_id:text,account_id:text,canvas_id:text,base_revision:int,operations_json:json,status:text,applied_revision:optionalInt,applied_canvas_json:optionalJson,created_at:text,expires_at:text},primary:['id']},
};
const indexes:Record<string,{table:string;columns:string[]}>= {
 reporting_outbox_owner_scope:{table:'reporting_outbox',columns:['user_id','scope','account_id','created_at']},
 creative_canvases_owner_updated_idx:{table:'creative_canvases',columns:['user_id','account_id','updated_at']},
 canvas_generation_links_canvas_idx:{table:'canvas_generation_links',columns:['user_id','account_id','canvas_id']},
 canvas_agent_proposals_canvas_idx:{table:'canvas_agent_proposals',columns:['user_id','account_id','canvas_id']},
};
const tableList=Object.keys(structures).map(name=>`'${name}'`).join(',');
const indexList=Object.keys(indexes).map(name=>`'${name}'`).join(',');
async function rows(db:QueryDb,query:string){return(await db.execute(sql.raw(query))).rows as Record<string,unknown>[];}
function identity(hash:unknown,when:unknown){if(typeof hash!=='string'||(typeof when!=='number'&&typeof when!=='string'))unknown('账本身份字段类型不正确');const time=Number(when);if(!Number.isSafeInteger(time)||time<0)unknown('账本时间不是安全整数');return{hash:hash as string,when:time};}
async function ledger(db:QueryDb){const exists=await rows(db,"SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present");if(!exists[0]?.present)return[];const columns=await rows(db,"SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='drizzle' AND table_name='__drizzle_migrations'");for(const [name,type]of [['id','int4'],['hash','text'],['created_at','int8']])if(!columns.some(row=>row.column_name===name&&row.udt_name===type))unknown('迁移账本结构未知，保留原库');return(await rows(db,'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).map(row=>identity(row.hash,row.created_at));}
function sameColumns(value:unknown,expected:string[]){return Array.isArray(value)&&JSON.stringify(value)===JSON.stringify(expected);}
async function assertStructures(db:QueryDb,requireAll:boolean){
 const newVersion=(await ledger(db)).some(item=>item.when===CONVERGENCE_WHEN);
 const columns=await rows(db,`SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableList})`);
 const indexRows=await rows(db,`SELECT t.relname AS table_name,idx.relname AS index_name,i.indisprimary,i.indisunique,i.indisvalid,(i.indpred IS NULL AND i.indexprs IS NULL) AS plain,ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,position) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.position) AS columns FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace JOIN pg_class idx ON idx.oid=i.indexrelid WHERE ns.nspname='public' AND (t.relname IN (${tableList}) OR idx.relname IN (${indexList}))`);
 for(const [table,spec] of Object.entries(structures)){
  const actual=columns.filter(row=>row.table_name===table);if(!actual.length){if(requireAll)incompatible(`正式125后缺表 ${table}`);continue;}
  for(const [name,original]of Object.entries(spec.columns)){
   const canvasGroupVersion=newVersion&&(table.startsWith('canvas_')||table==='creative_canvases');
   const column=canvasGroupVersion&&name==='account_id'?optionalText:original;
   const value=actual.find(row=>row.column_name===name);if(!value||value.udt_name!==column.type||value.is_nullable!==(column.nullable?'YES':'NO')||(column.default!==undefined&&value.column_default!==column.default))incompatible(`不兼容列 ${table}.${name}`);
  }
  const valid=indexRows.filter(row=>row.table_name===table&&row.indisvalid===true&&row.plain===true);
  if(!valid.some(row=>row.indisprimary===true&&sameColumns(row.columns,spec.primary)))incompatible(`主键不兼容 ${table}`);
  for(const unique of spec.unique??[])if(!valid.some(row=>row.indisunique===true&&sameColumns(row.columns,unique)))incompatible(`唯一身份约束不兼容 ${table}.${unique.join(',')}`);
 }
 for(const [name,expected]of Object.entries(indexes)){
  const value=indexRows.find(row=>row.index_name===name);
  if(value&&(!(value.table_name===expected.table&&value.indisvalid===true&&value.plain===true&&value.indisunique===false&&sameColumns(value.columns,expected.columns))))incompatible(`同名索引不兼容 ${name}`);
  if(requireAll&&!value)incompatible(`正式125后缺索引 ${name}`);
 }
 const consent=columns.some(row=>row.table_name==='reporting_consents');
 if(consent){const checks=await rows(db,"SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid JOIN pg_namespace ns ON t.relnamespace=ns.oid WHERE ns.nspname='public' AND t.relname='reporting_consents' AND c.contype='c'");
  const expected="CHECK ((scope = ANY (ARRAY['diagnostics'::text, 'creator'::text])))".replace(/\s/g,'');if(!checks.some(row=>typeof row.definition==='string'&&row.definition.replace(/\s/g,'')===expected))incompatible('报表授权scope约束不兼容');
 }
 return new Set(columns.map(row=>row.table_name)).size;
}
/** 原迁移器之前仅只读检查完整账本、已存在表与约束。绝不重放旧SQL或修改回执。 */
export async function inspectCanvasMigrationLineage(db:QueryDb,folder:string){return inspectMigrationConvergence(db,folder);}
/** 正常migrate后检查新收敛真实回执和全量catalog，并保留原125的六表严格断言；不伪造125回执。 */
export async function assertCanvasMigrationConverged(db:QueryDb,folder:string){await assertMigrationConverged(db,folder);await assertStructures(db,true);}
