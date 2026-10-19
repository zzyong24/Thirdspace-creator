import urllib.request, urllib.parse, urllib.error, json, hashlib, pathlib, datetime
base='http://127.0.0.1:4318'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
manifest=json.loads(pathlib.Path('reference-editors/manifest.json').read_text())
report={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verification':'真实HTTP字节与本地冻结清单；没有浏览器执行或像素检查','editors':[]}
for editor in ['noterelay','doocs-md','kuaitu','opencut-classic']:
    native=manifest[editor]['native']; count=0; placeholders=[]
    for name, expected in native['bundleFiles'].items():
        target='/reference-editors/'+editor+'/native/'+name
        if pathlib.PurePosixPath(name).name=='.gitkeep':
            assert expected==hashlib.sha256(b'').hexdigest(), '只允许排除空源码目录占位文件'
            try: opener.open(base+urllib.parse.quote(target,safe='/'),timeout=40); raise AssertionError('源码目录占位文件不应公开服务')
            except urllib.error.HTTPError as error:
                assert error.code in [400,403,404],(target,error.code)
                placeholders.append({'file':name,'status':error.code,'scope':'空源码目录占位，不是运行期资源'})
            continue
        try: response=opener.open(base+urllib.parse.quote(target,safe='/'),timeout=40)
        except urllib.error.HTTPError as error: raise AssertionError((target,error.code)) from error
        actual=response.read()
        assert response.status==200 and hashlib.sha256(actual).hexdigest()==expected, (editor,name,response.status)
        count+=1
    report['editors'].append({'editor':editor,'nativeFiles':count,'allBytesMatch':True,'nonRuntimePlaceholders':placeholders})
    source=opener.open(base+'/reference-editors/'+native['sourceArchive'],timeout=40).read()
    assert hashlib.sha256(source).hexdigest()==native['sourceArchiveSha256'],editor+' source'
pathlib.Path('docs/verification/t1053/resume-20261005/native-http-resources.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
