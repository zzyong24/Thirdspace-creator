export default {
  resolve: { tsconfigPaths: true },
  cacheDir: '../docs/verification/t1321/runtime/diagnosis-v1/vite-cache',
  test: {
    environment: 'node',
    include: ['src/server/__module_integration__/graphic-reorganization-diagnosis.persistence-client.test.ts'],
    testTimeout: 3600000,
    hookTimeout: 180000,
    retry: 0,
    maxWorkers: 1,
    fileParallelism: false,
    alias: { 'server-only': new URL('../../../../../frontend/src/test/empty-module.ts', import.meta.url).pathname, 'client-only': new URL('../../../../../frontend/src/test/empty-module.ts', import.meta.url).pathname },
  },
};
