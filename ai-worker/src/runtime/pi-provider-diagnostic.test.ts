import {it,expect} from 'vitest';
import {piProviderDiagnostic} from './pi-provider-diagnostic';
const spec={apiFormat:'anthropic' as const,model:'private-model',baseUrl:'https://private.example',token:'credential-with-no-standard-prefix'};
it('保留可定位的状态与断流原因，剔除凭据及地址',()=>{
 const result=piProviderDiagnostic(spec,`connection reset: ${spec.token} at ${spec.baseUrl}`,{statusCode:200,output:true});
 expect(result).toContain('status=200');expect(result).toContain('connection reset');expect(result).toContain('output=true');
 expect(result).not.toContain(spec.token);expect(result).not.toContain(spec.baseUrl);
});
it('托管模型不在日志泄露供应商正文',()=>{
 const result=piProviderDiagnostic({...spec,displayModelKey:'channel-managed'},'upstream private-model internal refusal',{statusCode:502,output:false});
 expect(result).not.toContain('private-model');expect(result).not.toContain('internal refusal');expect(result).toContain('status=502');
});
