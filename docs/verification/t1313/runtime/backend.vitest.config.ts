import original from '../../../../backend/vitest.config';
export default {
  ...original,
  root: new URL('../../../../backend', import.meta.url).pathname,
  cacheDir: new URL('./vite-backend', import.meta.url).pathname,
  test: {
    ...original.test,
    include: ['src/modules/review/work-reviews.service.test.ts', 'src/application/generation/work-review-root.test.ts'],
    retry: 0,
    maxWorkers: 1,
    testTimeout: 3600000,
    hookTimeout: 180000,
  },
};
