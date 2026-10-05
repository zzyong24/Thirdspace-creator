import urllib.request,urllib.error,urllib.parse,json,uuid,datetime,pathlib
base='http://127.0.0.1:4318';account='acct-ef4eab23-41';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));report={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'实际本地 HTTP；隔离 PGlite；没有浏览器或模型调用','rpc':[]}
def rpc(op,params=None,body=None,query=None,expected=200):
 payload={'id':op,'input':{k:v for k,v in [('params',params),('body',body),('query',query)] if v is not None}}
 req=urllib.request.Request(base+'/api/v1/dispatch',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','x-account-id':account},method='POST')
 try:res=opener.open(req,timeout=60);status=res.status;data=json.load(res)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 report['rpc'].append({'operation':op,'status':status});assert status==expected,(op,status,data);return data.get('data',data)
def token():return 't1055-'+str(uuid.uuid4())
p=rpc('projects.create',body={'title':'脚本衍生 · 信息透传验证','brief':'本地验证稿：脚本主内容只读，衍生稿独立编辑保存。'});pid=p['id'];report['projectId']=pid
video=rpc('projects.outputs.create',params={'projectId':pid},body={'title':'主脚本载体','contentType':'video','clientRequestId':token()})
script=rpc('artifacts.create',params={'projectId':pid},body={'title':'确定的主稿','artifactType':'master_script','stage':'script'})
sv=rpc('artifacts.versions.create',params={'artifactId':script['id']},body={'contentText':'# 已确定脚本\n先确定内容，再基于脚本生成衍生稿并二次编辑。','changeSummary':'HTTP 脚本来源验证'})
pub=rpc('outputs.publications.create',params={'outputId':video['id']},body={'platform':'douyin','accountReference':account})
rev=rpc('publications.revisions.create',params={'publicationId':pub['id']},body={'title':'脚本阶段标题','description':'脚本阶段简介','platformTags':['脚本标签','内容创作']})
source={'kind':'publication_revision','projectId':pid,'sourceOutputId':video['id'],'publicationId':pub['id'],'revisionId':rev['id']}
outputs={}
for kind,prefix in [('article','articles'),('image','graphicPosts')]:
 out=rpc('projects.outputs.create',params={'projectId':pid},body={'title':'文章验证稿' if kind=='article' else '图文验证稿','contentType':kind,'clientRequestId':token()});oid=out['id'];outputs[kind]=oid
 state=rpc(prefix+'.get',params={'outputId':oid});ctx=state['scriptContext'];assert ctx['state']=='ready';assert ctx['scriptRef']=={'kind':'project_script','id':script['id'],'versionId':sv['id']};assert ctx['metadata']=={'title':'脚本阶段标题','summary':'脚本阶段简介','tags':['脚本标签','内容创作']};assert ctx['metadataSource']==source
 doc=state['current'];doc.update({'title':ctx['metadata']['title'],'summary':ctx['metadata']['summary'],'tags':ctx['metadata']['tags'],'metadataSource':source})
 if kind=='article':doc['sections']=[{'sectionId':'http-section','order':0,'heading':'用户二次编辑','headingLevel':2,'body':'这是用户手工编辑后的衍生正文，不是模型结果。','sourceRefs':[ctx['scriptRef']]}]
 else:doc['body']='用户手工编辑的图文正文。'
 body={'document':doc,'expectedCurrentVersionId':state['currentVersionId'],'clientRequestId':token()};saved=rpc(prefix+'.versions.create',params={'outputId':oid},body=body)
 assert rpc(prefix+'.get',params={'outputId':oid})['current']==doc;assert rpc(prefix+'.versions.get',params={'outputId':oid,'versionId':saved['versionId']})['document']==doc
 assert rpc(prefix+'.versions.create',params={'outputId':oid},body=body)['versionId']==saved['versionId'];rpc(prefix+'.versions.create',params={'outputId':oid},body={**body,'clientRequestId':token()},expected=409)
 report[kind]={'outputId':oid,'versionId':saved['versionId'],'metadataSameSource':True,'manualEditSaveReadback':True,'historyReadback':True,'idempotency':True,'staleCasRejected':True}
# 更新主稿与发布元数据，旧衍生稿保持独立；再次保存沿用真实历史出处。
rev2=rpc('publications.revisions.create',params={'publicationId':pub['id']},body={'title':'新版脚本标题','description':'新版简介','platformTags':['新标签']})
sv2=rpc('artifacts.versions.create',params={'artifactId':script['id']},body={'contentText':'新版主脚本正文','changeSummary':'确认衍生稿独立'})
for kind,prefix in [('article','articles'),('image','graphicPosts')]:
 state=rpc(prefix+'.get',params={'outputId':outputs[kind]});assert state['scriptContext']['metadata']['title']=='新版脚本标题';assert state['scriptContext']['scriptRef']['versionId']==sv2['id'];assert state['current']['title']=='脚本阶段标题';assert state['current']['metadataSource']==source
 doc=state['current'];doc['summary']='用户独立修改简介';saved=rpc(prefix+'.versions.create',params={'outputId':outputs[kind]},body={'document':doc,'expectedCurrentVersionId':state['currentVersionId'],'clientRequestId':token()});assert saved['document']['metadataSource']==source
 report[kind]['laterScriptDoesNotOverwrite']=True;report[kind]['historicalSourcePreserved']=True
report['pages']=[]
for route in [f'/projects/{pid}/article?outputId={outputs["article"]}',f'/projects/{pid}/outputs/{outputs["image"]}/image','/settings?tab=models&highlight=assistant-engine']:
 res=opener.open(urllib.request.Request(base+route,headers={'Cookie':'creatoros_current_account='+account}),timeout=60);data=res.read();assert res.status==200;report['pages'].append({'route':route,'status':200,'bytes':len(data)})
report['unverified']=['浏览器真实像素和最小视口','真实模型生成/配图质量','系统剪贴板与公众号粘贴'];pathlib.Path('docs/verification/t1055/http-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'projectId':pid,'outputs':outputs,'rpcCount':len(report['rpc']),'pages':len(report['pages'])},ensure_ascii=False))
