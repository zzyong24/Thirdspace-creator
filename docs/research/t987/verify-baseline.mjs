import fs from 'node:fs';
import assert from 'node:assert/strict';
const b=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));
if(process.argv[2]==='timing'){
 assert.equal(b.accountId,'acct-ae1a8346-9');
 for(const times of Object.values(b.routeMeasurementsMs))assert.ok(times.length>=2&&times.every(n=>n>0));
 assert.ok(b.notVerified.includes('原生WebView点击耗时'));
}else{
 assert.ok(Object.values(b.diagnosis).every(Boolean));
 assert.ok(fs.readFileSync('docs/features/t987-page-navigation-performance.md','utf8').includes('日历及用户时区每次实时读取'));
}
console.log('已验证诊断证据的范围与完整性；不是修复验收。');
