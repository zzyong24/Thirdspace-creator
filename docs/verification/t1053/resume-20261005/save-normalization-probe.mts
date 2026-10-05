// 只读合同夹具：复现页面保存回执比较；不调用模型、不写稿、不执行浏览器。
import assert from 'node:assert/strict';
import {articleDocument} from '../../../../contract/src/resources/articles.ts';

const base = articleDocument.parse({
  schemaVersion: 1, title: '原稿', summary: '', sections: [], factItems: [], visualBriefs: [], imageUses: [],
});
const request = {...base, tags: ['脚本标签']};
const receipt = articleDocument.parse(request);
assert.deepStrictEqual(receipt, request);
assert.notEqual(JSON.stringify(receipt), JSON.stringify(request));

const withLayout = articleDocument.parse({...base, nativeLayout: {
  schemaVersion: 1, editor: 'doocs-md', editorCommit: 'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',
  themeId: 'default', themeSettings: {primary: {color: '#008080', weight: 400}, font: 'serif'},
  customCss: '', exportOptions: {useIndent: false, useJustify: false},
}});
const reorderedLayout = articleDocument.parse({...withLayout, nativeLayout: {
  ...withLayout.nativeLayout,
  themeSettings: {font: 'serif', primary: {weight: 400, color: '#008080'}},
}});
assert.deepStrictEqual(reorderedLayout, withLayout);
assert.notEqual(JSON.stringify(reorderedLayout), JSON.stringify(withLayout));
assert.notDeepStrictEqual({...receipt, title: '不同正文'}, request);

console.log(JSON.stringify({
  verification: '合同解析和同构对象夹具，未执行 ArticleWorkbench 点击或真实浏览器',
  tagsAppendedThenContractParsed: {sameValues: true, currentStringComparisonRejects: true},
  nestedThemeSettingsReordered: {sameValues: true, currentStringComparisonRejects: true},
  productionGuard: 'frontend/src/features/article/article-workbench.tsx:372',
  status: '复现比较缺陷，尚未修复；T-1053 验收保持待验',
}, null, 2));
