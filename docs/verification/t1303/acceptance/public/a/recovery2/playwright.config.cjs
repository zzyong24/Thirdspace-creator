'use strict';
const path = require('node:path');
const original = require('../../../candidate/driver/playwright.config.cjs');
module.exports = {
  ...original,
  testDir: __dirname,
  testMatch: 'ui.spec.cjs',
  use: { ...original.use, channel: 'chromium', headless: true },
};
