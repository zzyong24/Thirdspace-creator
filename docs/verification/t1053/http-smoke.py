import urllib.request,urllib.error,json,uuid,datetime,hashlib,base64,pathlib
base='http://127.0.0.1:4318';account='acct-ef4eab23-41';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));report={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'隔离本地 PGlite 与媒体目录；公共 HTTP；没有浏览器自动化','accountId':account,'rpc':[]}
def rpc(op,params=None,body=None,query=None,expected=200):
 payload={'id':op,'input':{k:v for k,v in [('params',params),('body',body),('query',query)] if v is not None}}
 request=urllib.request.Request(base+'/api/v1/dispatch',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','x-account-id':account},method='POST')
 try:
  response=opener.open(request,timeout=40);status=response.status;data=json.load(response)
 except urllib.error.HTTPError as error:status=error.code;data=json.load(error)
 report['rpc'].append({'operation':op,'status':status});assert status==expected,(op,status,data);return data.get('data',data)
def token():return 't1053-'+str(uuid.uuid4())
project=rpc('projects.create',body={'title':'原生编辑器 · 可编辑验收稿','brief':'测试稿：主脚本保存后，衍生为公众号文章与图文；内容仅用于本地验收。'})
report['projectId']=project['id']
script=rpc('artifacts.create',params={'projectId':project['id']},body={'title':'确定的主脚本','artifactType':'master_script','stage':'script'})
scriptVersion=rpc('artifacts.versions.create',params={'artifactId':script['id']},body={'contentText':'# 确定的主脚本\n先保存脚本，接着扩写衍生文章与图文。\n正文和版式都能独立修改。','changeSummary':'NoteRelay 验收主稿'})
source={'kind':'project_script','id':script['id'],'versionId':scriptVersion['id']}
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=')
upload=rpc('assets.uploads.create',body={'assetType':'image','mimeType':'image/png','fileSize':len(png),'fileName':'t1053-素材验证夹具.png','projectId':project['id']})
url=upload['uploadUrl'];url=base+url if url.startswith('/') else url
assert urllib.parse.urlparse(url).hostname in ['127.0.0.1','localhost'], '隔离素材上传只允许本地'
response=opener.open(urllib.request.Request(url,data=png,headers={'Content-Type':'image/png','x-account-id':account},method='PUT'),timeout=40);assert response.status in [200,201,204]
asset=rpc('assets.uploads.complete',params={'uploadId':upload['uploadId']},body={'name':'NoteRelay 精确图片验证夹具（1像素）'})
report['assetId']=asset['id'];report['assetFileId']=asset['currentFileId']
download=rpc('assets.fileDownloadUrl',params={'assetId':asset['id'],'assetFileId':asset['currentFileId']});url=download['url'];url=base+url if url.startswith('/') else url
actual=opener.open(url,timeout=40).read();assert actual==png;report['exactAssetSha256']=hashlib.sha256(actual).hexdigest()
layout={'schemaVersion':1,'editor':'noterelay','editorVersion':'0.1.8','themeId':'moyu-green','authorName':'本地验收署名','authorBio':'可修改的真实输入','variables':{'栏目名':'创作记录','副标题':'脚本衍生稿'},'fontSize':16,'splitHeading':2,'templateId':'default','imageWidths':{},'imageRadii':{}}
outputs={}
for kind in ['article','image']:
 output=rpc('projects.outputs.create',params={'projectId':project['id']},body={'title':'公众号衍生稿' if kind=='article' else '图文衍生稿','contentType':kind,'clientRequestId':token()});oid=output['id'];outputs[kind]=oid
 prefix='articles' if kind=='article' else 'graphicPosts';state=rpc(prefix+'.get',params={'outputId':oid});document=state['current'];document['title']='确定脚本之后，继续编辑衍生作品';document['nativeLayout']=dict(layout)
 if kind=='article':
  document['sections']=[{'sectionId':'noterelay-section','order':0,'heading':'基于主脚本的衍生正文','headingLevel':2,'body':'这份文章来自确定的脚本。正文可以继续修改，主题和署名会随稿件版本保存。','sourceRefs':[source]}]
  document['imageUses']=[{'sectionId':'noterelay-section','assetId':asset['id'],'assetFileId':asset['currentFileId'],'sourceKind':'existing','reviewState':'selected'}]
 else:
  document['body']='图文也是同一主脚本的衍生品，可以分别修改正文和图卡。';document['sourceRefs']=[source];document['nativeLayout']['themeId']='default'
  document['cardBriefs']=[{'cardId':'card-1','title':'先确定脚本','body':'在原脚本编辑台确定内容。','sourceRefs':[source]},{'cardId':'card-2','title':'继续改衍生稿','body':'图文和公众号可以分别修改。','sourceRefs':[source]}]
  document['imageUses']=[{'assetId':asset['id'],'assetFileId':asset['currentFileId'],'role':'card','order':0,'cardId':'card-1'}]
 body={'document':document,'expectedCurrentVersionId':state['currentVersionId'],'clientRequestId':token()};saved=rpc(prefix+'.versions.create',params={'outputId':oid},body=body);assert saved['document']==document
 read=rpc(prefix+'.get',params={'outputId':oid});assert read['current']==document
 history=rpc(prefix+'.versions.get',params={'outputId':oid,'versionId':saved['versionId']});assert history['document']==document
 replay=rpc(prefix+'.versions.create',params={'outputId':oid},body=body);assert replay['versionId']==saved['versionId']
 rpc(prefix+'.versions.create',params={'outputId':oid},body={**body,'clientRequestId':token()},expected=409)
 report[kind]={'outputId':oid,'versionId':saved['versionId'],'saveReadback':True,'historyReadback':True,'idempotency':True,'staleCasRejected':True}
# 以下只验证原公共服务保存/读回；1像素是精确素材夹具，不是原生PNG捕获。
state=rpc('graphicPosts.get',params={'outputId':outputs['image']});doc=state['current'];mid='fixture-real-image'
doc['designs']=[{'target':{'kind':'card','cardId':'card-1'},'document':{'editor':'kuaitu','revision':'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889','mediaRefs':[{'mediaId':mid,'assetId':asset['id'],'assetFileId':asset['currentFileId']}],'nativeDocument':{'objects':[{'type':'image','src':'creatoros-media://'+mid,'data':{'creatorosMediaId':mid},'left':20,'top':30},{'type':'textbox','text':'保持原图层和真实文件'}]}}}]
saved=rpc('graphicPosts.versions.create',params={'outputId':outputs['image']},body={'document':doc,'expectedCurrentVersionId':state['currentVersionId'],'clientRequestId':token()});read=rpc('graphicPosts.get',params={'outputId':outputs['image']});assert read['current']==doc
report['nativeGraphicPublicService']={'realExactImageRefPreserved':True,'designReadback':True,'versionId':saved['versionId'],'browserEnginePath':'未运行，服务夹具不冒充浏览器编辑/导出'}
state=rpc('articles.get',params={'outputId':outputs['article']});doc=state['current'];doc['nativeLayout']={'schemaVersion':1,'editor':'doocs-md','editorCommit':'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31','themeId':'default','themeSettings':{},'customCss':'','exportOptions':{'useIndent':False,'useJustify':False}}
saved=rpc('articles.versions.create',params={'outputId':outputs['article']},body={'document':doc,'expectedCurrentVersionId':state['currentVersionId'],'clientRequestId':token()});assert rpc('articles.get',params={'outputId':outputs['article']})['current']==doc
report['doocsPublicService']={'oldLayoutAndStableSectionsPreserved':True,'versionId':saved['versionId'],'browserEnginePath':'未运行，服务夹具不冒充原CodeMirror交互'}

report['pages']=[]
for route in [f'/projects/{project["id"]}',f'/projects/{project["id"]}/article?outputId={outputs["article"]}',f'/projects/{project["id"]}/outputs/{outputs["image"]}/image',*[f'/reference-editors/{editor}/native/{name}' for editor in ['noterelay','doocs-md','kuaitu','opencut-classic'] for name in ['native.js','native.css']],'/reference-editors/sources/noterelay/source.zip','/projects/project-ef4eab23-166']:
 req=urllib.request.Request(base+route,headers={'Cookie':'creatoros_current_account='+account});resp=opener.open(req,timeout=40);data=resp.read();assert resp.status==200;report['pages'].append({'path':route,'status':resp.status,'bytes':len(data),'containsLegacyNoteRelayEntry':b'/reference-editors/noterelay/index.html' in data})
report['unverified']=['真实浏览器像素与 PNG 捕获','系统剪贴板写入与公众号粘贴','真实模型生成','平台发布']
pathlib.Path('docs/verification/t1053/http-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'projectId':project['id'],'outputs':outputs,'rpc':len(report['rpc']),'pages':len(report['pages'])},ensure_ascii=False))
