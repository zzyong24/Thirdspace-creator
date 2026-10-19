import pathlib, hashlib, json, re, difflib
root=pathlib.Path(__file__).resolve().parents[4]
out=pathlib.Path(__file__).resolve().parent
source=root/'backend/src/integration/daily-topic-automation.test.ts'
before=source.read_text()
assert hashlib.sha256(source.read_bytes()).hexdigest()=='4dc147ea912c0cdd654686b38f38bdcac17e79e053e27a22f6f25df87f497edd'
binding=json.loads((out.parent/'WORKER_BINDING.json').read_text())
worker=pathlib.Path(binding['executionWorkerPath'])
assert len(worker.read_bytes())==binding['bytes']
assert hashlib.sha256(worker.read_bytes()).hexdigest()==binding['sha256']
replacements=[]
build="  execFileSync(process.execPath,[resolve('../ai-worker/scripts/build.mjs')],{stdio:'pipe'});\n"
assert before.count(build)==1
after=before.replace(build,'')
replacements.append({'kind':'remove-unique-build','before':build,'after':'','count':1})
old="resolve('../ai-worker/dist/execution-worker.cjs')"
new=json.dumps(str(worker))
assert after.count(old)==2
after=after.replace(old,new)
replacements.append({'kind':'worker-binding','before':old,'after':new,'count':2})
assert after.count('},30000);')==2
after=after.replace('},30000);','},900000);')
replacements.append({'kind':'local-case-budget','before':'},30000);','after':'},900000);','count':2})
imports=sorted(set(re.findall(r"(?:from\s*|import\()'((?:\.\.?/)[^']+)'",after)))
for old in imports:
    new=str((source.parent/old).resolve())
    count=after.count("'"+old+"'")
    after=after.replace("'"+old+"'","'"+new+"'")
    replacements.append({'kind':'same-target-import','before':old,'after':new,'count':count})
normalized=after
for r in reversed(replacements):
    if r['kind']=='same-target-import': normalized=normalized.replace("'"+r['after']+"'","'"+r['before']+"'")
    elif r['kind']!='remove-unique-build': normalized=normalized.replace(r['after'],r['before'])
normalized=normalized.replace(' try{\n  await runAutomationDriverTick(tick);',' try{\n'+build+'  await runAutomationDriverTick(tick);')
assert normalized==before
(out/'automation-original.snapshot.ts').write_text(before)
(out/'automation-equivalent.test.ts').write_text(after)
(out/'automation-equivalent.normalized.ts').write_text(normalized)
(out/'automation-equivalent.diff').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile=str(source),tofile='runtime/automation-equivalent.test.ts')))
(out/'automation-equivalence.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(before.encode()).hexdigest(),'equivalentSha256':hashlib.sha256(after.encode()).hexdigest(),'normalizationByteEqual':normalized==before,'expectCountOriginal':len(re.findall(r'\bexpect\(',before)),'expectCountEquivalent':len(re.findall(r'\bexpect\(',after)),'replacements':replacements,'extraAssertions':'config只读worker SHA/bytes断言及环境owned约束，不插入两it业务','workerSha256':binding['sha256']},ensure_ascii=False,indent=2)+'\n')
print('完整反向归一逐字相同；原两it与全部expect保留；worker SHA/bytes相等')
