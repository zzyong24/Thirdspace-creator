// 报告层计数；不改变 Vitest 原 JSON、用例输入或断言。
module.exports = function countFileResults(testResults) {
  const rawFileStatusCounts = {};
  const skippedWholeFiles = [];
  let passedFiles = 0, failedFiles = 0, skippedFiles = 0, otherFiles = 0;
  for (const file of testResults) {
    rawFileStatusCounts[file.status] = (rawFileStatusCounts[file.status] || 0) + 1;
    const assertions = file.assertionResults || [];
    const wholeFileSkipped = ['pending', 'skipped'].includes(file.status) ||
      (assertions.length > 0 && assertions.every(a => ['pending', 'skipped', 'todo'].includes(a.status)));
    if (file.status === 'failed') failedFiles++;
    else if (wholeFileSkipped) {
      skippedFiles++;
      skippedWholeFiles.push({file: file.name, rawStatus: file.status, assertionStatuses: assertions.map(a => a.status)});
    } else if (file.status === 'passed') passedFiles++;
    else otherFiles++;
  }
  return {passedFiles, failedFiles, skippedFiles, otherFiles, rawFileStatusCounts, skippedWholeFiles};
};
