import {fileURLToPath} from 'node:url';
export default {
  root: fileURLToPath(new URL('../../../../backend/', import.meta.url)),
  resolve: {tsconfigPaths: true},
  cacheDir: fileURLToPath(new URL('./backend-cache/', import.meta.url)),
  test: {
    environment: 'node',
    include: ['src/modules/execution/execution-model-identity.service.test.ts', 'src/modules/execution/execution-cover-series.test.ts'],
    testTimeout: 3600000,
    hookTimeout: 180000,
    maxWorkers: 1,
    fileParallelism: false,
    retry: 0,
  },
};
