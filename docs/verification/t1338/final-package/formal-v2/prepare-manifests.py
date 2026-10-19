from pathlib import Path
import json,hashlib,difflib
root=Path(__file__).resolve().parent
parent=root.parent
handoff=json.loads((parent/'CLOSED_WITNESS_HANDOFF.json').read_text())
def proof(file):
    file=Path(file).resolve()
    raw=file.read_bytes()
    return {'path':str(file),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
for task,label,kind in [('T1338','graphic-ready-v2','content-ui'),('T1339','calibration-public-v3','content-fixture')]:
    row=next(x for x in handoff['closedCopies'] if x['task']==task.lower())
    controller=parent/'runtime'/f'controller-{task.lower()}-v1'
    ready_pointer=json.loads((controller/'READY.json').read_text())
    ready=json.loads(Path(ready_pointer['readyReceipt']).read_text())
    run=parent/'runtime'/label
    business=run/('GRAPHIC_READY_RESULT.json' if task=='T1338' else 'PUBLIC_CALIBRATION_RESULT.json')
    receipts={
        'controllerStop':proof(controller/'RESULT.json'),
        'originalReady':proof(Path(ready_pointer['readyReceipt'])),
        'previousSourceAfter':row['sourceAfter'],
        'uiExecution':proof(run/'EXECUTION_RESULT.json'),
        'uiOuter':proof(parent/'runtime'/f'outer-{label}-{kind}'/'RESULT.json'),
        'browserCleanup':proof(run/'CLEANUP.json'),
        'businessSnapshot':proof(business),
        'originalCopy':proof(Path(ready['completedOwnedFixture']['copyReceipt'])),
        'previousFixture':proof(parent/'preparation'/f'{task}_COMPLETED_FIXTURE.json'),
    }
    manifest={
        'schema':'creatoros-completed-owned-ui-fixture/v1','task':task,
        'sourceRoot':row['actualCompletedOwnedRoot'],'keyPath':row['applicationKeyReference'],
        'originalAgenticUnknown':False,'noConcurrentSourceProcess':True,
        'meaning':'仅最新已关闭完整owned测试库，含本批实际新增成稿/pub；非原只读source库，不冒stop为flush。原key只内存stdin。',
        'receipts':receipts,
    }
    (root/f'{task}_COMPLETED_FIXTURE.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
old=(parent/'runner/owned-fixture.mjs').read_text()
new=(root/'runner/owned-fixture.mjs').read_text()
(root/'CONTROLLER_ACTUAL.diff').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='original-RO-owned-fixture.mjs',tofile='formal-v2/runner/owned-fixture.mjs')))
(root/'OFFLINE_MANIFEST_PREPARATION_FAILURE.json').write_text(json.dumps({'beforeService':True,'failures':['TypeError: PosixPath + PosixPath','SyntaxError: path-expression quote','following Node precheck ENOENT because manifest not produced'],'cause':'生成manifest路径表达式错误','UI':0,'modelRoots':0,'corrected':'明确run/business Path变量，独立语法核后生成'},ensure_ascii=False,indent=2)+'\n')
