import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const evidenceDir=fileURLToPath(new URL('.',import.meta.url));
const repoRoot=resolve(evidenceDir,'../../../..');
const dependencies=join(repoRoot,'frontend/node_modules');
export default {
  root:evidenceDir,
  cacheDir:join('/tmp','t1071-front-evidence-vite'),
  resolve:{alias:{
    '@':join(repoRoot,'frontend/src'),
    ...Object.fromEntries(['react','react-dom','next','@testing-library/react','@ai-sdk/react','@creatoros/contract','vitest'].map(name=>[name,join(dependencies,name)]))
  }},
  test:{include:['*.test.tsx'],environment:'jsdom',testTimeout:120000,hookTimeout:120000,retry:0}
};
