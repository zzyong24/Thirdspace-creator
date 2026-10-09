import {expect,it} from 'vitest';
import {z} from 'zod';
import {explainToolParameterIssues} from './tool-parameter-recovery';

const parameters=z.object({graphic:z.object({ruleSnapshotRef:z.object({versionId:z.string().min(1)}).strict().nullable()}).strict(),duration:z.number()}).strict();
const schema=z.toJSONSchema(parameters);
function explain(raw:unknown){const result=parameters.safeParse(raw);if(result.success)throw Error('本例预期真实严格校验错误');return explainToolParameterIssues(schema,raw,result.error.issues);}

it('空对象说明缺失子字段及允许null的必填父字段，不修正实际输入',()=>{
 const raw={graphic:{ruleSnapshotRef:{}},duration:2},before=JSON.stringify(raw);
 const result=explain(raw);
 expect(result).toContain('graphic.ruleSnapshotRef.versionId');expect(result).toContain('缺失');
 expect(result).toContain('graphic.ruleSnapshotRef');expect(result).toContain('允许 null');expect(result).toContain('必填');
 expect(JSON.stringify(raw)).toBe(before);expect(parameters.safeParse(raw).success).toBe(false);
});
it('字段缺失不能等同null；合法null和合法对象仍由原schema准入',()=>{
 expect(explain({graphic:{},duration:2})).toContain('缺失');expect(explain({graphic:{},duration:2})).toContain('允许 null');
 for(const ruleSnapshotRef of [null,{versionId:'真实版本'}])expect(parameters.parse({graphic:{ruleSnapshotRef},duration:2})).toEqual({graphic:{ruleSnapshotRef},duration:2});
});
it('数字字符串与非nullable的null明确说明类型，不能转值或泄露正文',()=>{
 const raw={graphic:{ruleSnapshotRef:{versionId:null}},duration:'私有正文或密钥'};
 const result=explain(raw);expect(result).toContain('number');expect(result).toContain('string');
 expect(result).not.toContain('私有正文或密钥');expect(parameters.safeParse(raw).success).toBe(false);
 const durationIssue=explainToolParameterIssues(schema,raw,[{path:['duration'],code:'invalid_type'}]);expect(durationIssue).not.toContain('允许 null');
});
it('嵌套数组和nullable分支按真实路径解释；optional不冒充必填',()=>{
 const p=z.object({rows:z.array(z.object({ref:z.object({id:z.string()}).nullable(),label:z.string().optional()}).strict())}).strict();
 const raw={rows:[{ref:{},label:3}]},checked=p.safeParse(raw);expect(checked.success).toBe(false);if(checked.success)throw Error('缺少RED条件');
 const result=explainToolParameterIssues(z.toJSONSchema(p),raw,checked.error.issues);
 expect(result).toContain('rows.0.ref');expect(result).toContain('允许 null');expect(result).toContain('可省略');
});
it('未知路径、远程引用和复杂组合只回退路径及错误码，不执行或捏造约束',()=>{
 for(const complex of [{$ref:'https://private.example/secret'}, {allOf:[{type:'string'}]}, {if:{type:'object'},then:{required:['secret']}}]){
  const result=explainToolParameterIssues(complex,{hidden:'秘密'},[{path:['missing'],code:'invalid_type'}]);
  expect(result).toBe('missing (invalid_type)');expect(result).not.toContain('秘密');expect(result).not.toContain('允许 null');
 }
});
it('有歧义的联合分支不把其中一个分支的required当作整体required',()=>{
 const union={anyOf:[{type:'object',properties:{item:{type:'string'}},required:['item']},{type:'object',properties:{item:{type:'number'}}}]};
 expect(explainToolParameterIssues(union,{item:null},[{path:['item'],code:'invalid_union'}])).toBe('item (invalid_union)');
});
it('纠错说明有界，schema描述、enum值和实参均不进入文案',()=>{
 const raw={secret:'密钥正文'},definition={type:'object',properties:{secret:{type:'string',description:'隐藏提示',enum:['私有枚举值']},rows:{type:'array',items:{type:'string'}}},required:['secret']};
 const issues=Array.from({length:500},(_,i)=>({path:['secret',String(i).repeat(1000)],code:'invalid_type'}));
 const result=explainToolParameterIssues(definition,raw,issues);
 expect(result.length).toBeLessThanOrEqual(8000);
 for(const value of ['密钥正文','隐藏提示','私有枚举值'])expect(result).not.toContain(value);
 const huge={anyOf:Array.from({length:100},()=>({type:'object',properties:{secret:{type:'string'}},required:['secret']}))};
 expect(explainToolParameterIssues(huge,raw,[{path:['secret'],code:'invalid_type'}])).toBe('secret (invalid_type)');
});
