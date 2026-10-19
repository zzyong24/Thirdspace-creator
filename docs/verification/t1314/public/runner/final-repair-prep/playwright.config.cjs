"use strict";
const {loadBinding} = require('./binding.cjs');
const {binding} = loadBinding();
module.exports = {
  testDir: __dirname,
  testMatch: binding.caseId.endsWith('-vision') ? 'vision.spec.cjs' : 'ordinary.spec.cjs',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 7200000,
  globalTimeout: 86400000,
  expect: {timeout: 120000},
  reporter: [['line']],
  outputDir: require('node:path').join(binding.outputDirectory, 'playwright-artifacts'),
};
