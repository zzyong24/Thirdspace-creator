type Schema = Record<string, unknown>;
type Issue = {path: readonly PropertyKey[]; code: string};
const types = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const object = (value: unknown): Schema | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Schema : null;
const label = (path: readonly PropertyKey[]) => path.map(String).join('.').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160) || '根参数';

// SEMANTIC_BOUNDARY_ALLOW: 仅解释原冻结协议的类型、字段及缺失事实，不决定内容、选择分支或修正实参。
function variants(raw: unknown, depth = 0): Schema[] | null {
 const schema = object(raw);
 if (!schema || depth > 12 || ['$ref', 'allOf', 'if', 'then', 'else', 'not', 'dependentSchemas'].some(key => Object.hasOwn(schema, key))) return null;
 const union = schema.anyOf ?? schema.oneOf;
 if (union !== undefined) {
  if (schema.type !== undefined || schema.anyOf !== undefined && schema.oneOf !== undefined || !Array.isArray(union) || union.length === 0 || union.length > 8) return null;
  const result: Schema[] = [];
  for (const branch of union) {
   const nested = variants(branch, depth + 1);
   if (!nested || result.length + nested.length > 8) return null;
   result.push(...nested);
  }
  return result;
 }
 const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
 if (!declared.length || declared.length > 7 || declared.some(type => typeof type !== 'string' || !types.has(type))) return null;
 return [schema];
}
function declaredTypes(nodes: Schema[]): string[] {
 return [...new Set(nodes.flatMap(node => Array.isArray(node.type) ? node.type as string[] : [node.type as string]))];
}
function received(raw: unknown, path: readonly PropertyKey[]): string {
 let value = raw;
 for (const key of path) {
  if (typeof key === 'symbol' || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return '缺失';
  value = (value as Record<PropertyKey, unknown>)[key];
 }
 return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}
function describe(nodes: Schema[]): string {
 const names = declaredTypes(nodes);
 const requirements = nodes.filter(node => declaredTypes([node]).includes('object')).map(node => {
  const properties = object(node.properties);
  if (!Array.isArray(node.required) || !properties) return [];
  return node.required.filter((key): key is string => typeof key === 'string' && Object.hasOwn(properties, key)).slice(0, 8).map(key => label([key]));
 });
 const same = requirements.length > 0 && requirements.every(row => JSON.stringify(row) === JSON.stringify(requirements[0]));
 return names.join(' | ') + (same && requirements[0]!.length ? `（object 必填子字段：${requirements[0]!.join(', ')}）` : '');
}
function locate(schema: unknown, path: readonly PropertyKey[]) {
 let nodes = variants(schema), required: boolean | null = null;
 const nullableParents: Array<{path: readonly PropertyKey[]; required: boolean}> = [];
 if (!nodes || path.length > 32) return null;
 for (let index = 0; index < path.length; index++) {
  const key = path[index]!;
  if (typeof key === 'symbol') return null;
  const children: Schema[] = [], requirements: boolean[] = [];
  for (const node of nodes) {
   const names = declaredTypes([node]);
   if (names.every(name => name === 'null')) continue;
   let child: unknown;
   if (typeof key === 'number' && Number.isInteger(key) && key >= 0 && names.every(name => name === 'array' || name === 'null')) {
    child = node.items;requirements.push(true);
   } else if (typeof key === 'string' && names.every(name => name === 'object' || name === 'null')) {
    const properties = object(node.properties);
    if (!properties || !Object.hasOwn(properties, key) || node.required !== undefined && !Array.isArray(node.required)) return null;
    child = properties[key];requirements.push(Array.isArray(node.required) && node.required.includes(key));
   } else return null;
   const branch = variants(child);
   if (!branch || children.length + branch.length > 8) return null;
   children.push(...branch);
  }
  if (!children.length || !requirements.length || requirements.some(value => value !== requirements[0])) return null;
  required = requirements[0]!;nodes = children;
  if (index < path.length - 1 && declaredTypes(nodes).includes('null')) nullableParents.push({path:path.slice(0, index + 1),required});
 }
 return {nodes,required,nullableParents};
}

/** 有界机械说明；含糊 schema 降级为原路径/错误码，不展示实际值或执行任何 schema 内容。 */
export function explainToolParameterIssues(schema: unknown, raw: unknown, issues: readonly Issue[]): string {
 return issues.slice(0, 20).map(issue => {
  const base = `${label(issue.path)} (${issue.code})`, found = locate(schema, issue.path);
  if (!found) return base;
  const nullable = declaredTypes(found.nodes).includes('null');
  const parents = found.nullableParents.map(parent => `${label(parent.path)}${parent.required ? '必填' : '可省略'}，允许 null（保留字段，不编造对象或 ID）`).join('；');
  return `${base}：${found.required === null ? '根参数' : found.required ? '字段必填' : '字段可省略'}；声明类型 ${describe(found.nodes)}；收到 ${received(raw, issue.path)}${nullable ? '；允许 null（保留字段，不编造对象或 ID）' : ''}${parents ? `；${parents}` : ''}`;
 }).join('；').slice(0, 8000);
}
