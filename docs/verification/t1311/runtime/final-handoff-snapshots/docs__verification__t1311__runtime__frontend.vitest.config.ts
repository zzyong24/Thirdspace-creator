import original from '../../../../frontend/vitest.config';
export default {...original,root:new URL('../../../../frontend',import.meta.url).pathname,cacheDir:new URL('./vite-frontend',import.meta.url).pathname,test:{...original.test,include:['src/server/__module_integration__/group-review-completion.persistence-client.test.ts'],retry:0,maxWorkers:1,testTimeout:3600000,hookTimeout:180000}};
