import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import base from '../../../../../frontend/vitest.config';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../../../..');
export default {...base,resolve:{...base.resolve,alias:[
 {find:/^react(\/.*)?$/,replacement:resolve(root,'frontend/node_modules/react')+'$1'},
 {find:/^react-dom(\/.*)?$/,replacement:resolve(root,'frontend/node_modules/react-dom')+'$1'},
 {find:'@testing-library/react',replacement:resolve(root,'frontend/node_modules/@testing-library/react')},
 {find:'@',replacement:resolve(root,'frontend/src')},
]},test:{...base.test,include:[resolve(here,'adapter-frontend-review.test.tsx')],retry:0}};
