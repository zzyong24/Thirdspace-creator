#!/usr/bin/env python3
"""Read-only Mach-O metadata and bytes. Does not load or execute inspected images."""
import os,sys,json,pathlib,hashlib,subprocess,re,datetime,struct,time
P=pathlib.Path(sys.argv[1]).resolve(); assert str(P).startswith('/private/tmp/') and os.lstat(P).st_uid==os.getuid() and os.lstat(P).st_mode&0o777==0o700; INPUT=P/'PRE_METADATA_INPUT.json'; OTOOL='/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/otool-classic'; born=time.monotonic(); DEADLINE=born+900
C=json.loads(INPUT.read_text()); NODE=C['fixedNode']; rawdir=P/'binary-header-discovery-no-otool';rawdir.mkdir(mode=0o700)
def sha(b):return hashlib.sha256(b).hexdigest()
def budget():
 if time.monotonic()>DEADLINE:raise RuntimeError('READONLY_METADATA_OUTER_900S_EXHAUSTED')
def file_row(p):
 s=os.lstat(p)
 if not pathlib.Path(p).is_file() or pathlib.Path(p).is_symlink():raise RuntimeError('not regular '+p)
 return dict(file=p,sha256=sha(pathlib.Path(p).read_bytes()),size=s.st_size,mode=s.st_mode&0o777,uid=s.st_uid)
def links(p):
 result=[];todo=pathlib.Path(os.path.abspath(p));seen=set()
 while True:
  parts=todo.parts;prefix=pathlib.Path(parts[0]);changed=False
  for n in parts[1:]:
   prefix=prefix/n
   if prefix.is_symlink():
    key=str(prefix)
    if key in seen:raise RuntimeError('symlink loop '+key)
    seen.add(key);target=os.readlink(prefix);s=os.lstat(prefix);resolved=os.path.realpath(key)
    row=dict(file=key,link=target,resolved=resolved,mode=s.st_mode&0o777,uid=s.st_uid,targetKind='directory' if os.path.isdir(resolved) else 'file')
    if row['targetKind']=='file':row.update(size=os.stat(resolved).st_size,sha256=sha(pathlib.Path(resolved).read_bytes()))
    result.append(row);suffix=todo.relative_to(prefix);todo=pathlib.Path(os.path.normpath(str(prefix.parent/target/suffix) if not os.path.isabs(target) else str(pathlib.Path(target)/suffix)));changed=True;break
  if not changed:return result
system=lambda p:p.startswith('/usr/lib/') or p.startswith('/System/Library/')
file_cache={};header_cache={};meta_cache={};allfiles={};alllinks={};rawCommands=[]
def remember(p):
 for r in links(p):alllinks[r['file']]=r
 real=os.path.realpath(p)
 if real not in file_cache:file_cache[real]=file_row(real)
 allfiles[real]=file_cache[real];return real
MAGIC={'feedface':('>',False),'cefaedfe':('<',False),'feedfacf':('>',True),'cffaedfe':('<',True)}
FAT={'cafebabe':('>',False),'bebafeca':('<',False),'cafebabf':('>',True),'bfbafeca':('<',True)}
def headers(file):
 if file in header_cache:return header_cache[file]
 rows=[]
 with open(file,'rb') as f:
  magic=f.read(4).hex(); slices=[]
  if magic in FAT:
   endian,wide=FAT[magic];count=struct.unpack(endian+'I',f.read(4))[0]
   if count<1 or count>32:raise RuntimeError('invalid fat count '+file)
   for _ in range(count):
    data=f.read(32 if wide else 20);vals=struct.unpack(endian+('iiQQII' if wide else 'iiIII'),data);slices.append((vals[2],vals[3]))
  elif magic in MAGIC:slices=[(0,os.stat(file).st_size)]
  else:raise RuntimeError('not Mach-O '+file)
  for offset,size in slices:
   f.seek(offset);magic=f.read(4).hex()
   if magic not in MAGIC:raise RuntimeError('invalid Mach-O slice '+file)
   endian,wide=MAGIC[magic];vals=struct.unpack(endian+'IIIIII',f.read(24));cpu,subtype,kind,ncmds,sizeofcmds,flags=vals
   if wide:f.read(4)
   arch={0x0100000c:'arm64',0x01000007:'x86_64'}.get(cpu)
   if not arch:raise RuntimeError('unhandled Mach-O cpu '+str(cpu)+' '+file)
   platform=None; cmds=f.read(sizeofcmds);at=0
   for _ in range(ncmds):
    cmd,cmdsize=struct.unpack_from(endian+'II',cmds,at)
    if cmdsize<8 or at+cmdsize>len(cmds):raise RuntimeError('invalid load-command size '+file)
    if cmd==0x32:platform=struct.unpack_from(endian+'I',cmds,at+8)[0]
    elif cmd in [0x24,0x25,0x2f,0x30]:platform={0x24:1,0x25:2,0x2f:3,0x30:4}[cmd]
    at+=cmdsize
   if at!=sizeofcmds:raise RuntimeError('load-command inventory drift '+file)
   rows.append(dict(arch=arch,cpuSubtype=subtype,filetype=kind,filetypeName={2:'MH_EXECUTE',6:'MH_DYLIB',8:'MH_BUNDLE'}.get(kind,'OTHER'),platform=platform,sliceOffset=offset,sliceSize=size,loadCommands=ncmds))
 header_cache[file]=rows;return rows
def metadata(file,arch):
 key=(file,arch)
 if key in meta_cache:return meta_cache[key]
 budget();h=next((r for r in headers(file) if r['arch']==arch),None)
 if h is None:raise RuntimeError('DISCOVERY_ARCH_NOT_PRESENT')
 with open(file,'rb') as f:
  f.seek(h['sliceOffset']);magic=f.read(4).hex();endian,wide=MAGIC[magic];vals=struct.unpack(endian+'IIIIII',f.read(24));ncmds,sizeofcmds=vals[3],vals[4]
  if wide:f.read(4)
  data=f.read(sizeofcmds)
 loads=[];rpaths=[];at=0
 commands={0xc:'LC_LOAD_DYLIB',0x80000018:'LC_LOAD_WEAK_DYLIB',0x8000001f:'LC_REEXPORT_DYLIB',0x80000023:'LC_LOAD_UPWARD_DYLIB',0x20:'LC_LAZY_LOAD_DYLIB'}
 for _ in range(ncmds):
  command,size=struct.unpack_from(endian+'II',data,at)
  if size<8 or at+size>len(data):raise RuntimeError('DISCOVERY_INVALID_LOAD_COMMAND')
  if command==0x8000001c or command in commands:
   offset=struct.unpack_from(endian+'I',data,at+8)[0]
   if offset<12 or offset>=size:raise RuntimeError('DISCOVERY_INVALID_STRING_OFFSET')
   value=data[at+offset:at+size].split(b'\0',1)[0].decode('utf8')
   if command==0x8000001c:rpaths.append(value)
   else:loads.append(dict(command=commands[command],name=value))
  at+=size
 if at!=sizeofcmds:raise RuntimeError('DISCOVERY_COMMAND_INVENTORY')
 # 本串仅表示真实binary load-command字节，不造otool stdout；发现库存永非final graph。
 text=data.hex();meta_cache[key]=(text,loads,rpaths);return meta_cache[key]
def expand(p,loader,main):
 for prefix,base in [('@loader_path',os.path.dirname(loader)),('@executable_path',os.path.dirname(main) if main else None)]:
  if p==prefix or p.startswith(prefix+'/'):
   if base is None:raise RuntimeError('MAIN_EXECUTABLE_CONTEXT_UNKNOWN:'+p)
   return os.path.normpath(base+p[len(prefix):])
 if p.startswith('@'):raise RuntimeError('unresolved token '+p+' from '+loader)
 if not os.path.isabs(p):raise RuntimeError('relative dylib '+p)
 return os.path.normpath(p)
rootsDoc=json.loads(pathlib.Path(C['inputRoots']).read_text());assert sha(pathlib.Path(C['inputRoots']).read_bytes())==C['inputRootsSha256'];roots=set(rootsDoc['requiredRoots']);initialRoots=set(roots);roots.add(os.path.realpath(OTOOL));roots.add(C['gitConsumer']['realExecutable']);roots.update(C['gitConsumer']['localCloneAndObjectHelpers'])
# 全部fullChrome/headlessShell实现的Mach-O由PRE_METADATA_INPUT与4字节根库存明确列入。
contexts=set();edges=[];systemEdges=[];unresolved=[];raw=[];roles=[]
def walk(file,arch,main,inherited=(),active=True,chain=()):
 budget();file=remember(file);available=[r['arch'] for r in headers(file)]
 if arch not in available:
  unresolved.append(dict(loader=file,arch=arch,mainExecutable=main,reason='DEPENDENCY_ARCH_SLICE_MISSING',activeRuntimeContext=active));return
 text,loads,rpaths=metadata(file,arch);local=[]
 for p in rpaths:
  try:local.append(expand(p,file,main))
  except RuntimeError as e:unresolved.append(dict(loader=file,arch=arch,mainExecutable=main,rpath=p,reason=str(e),activeRuntimeContext=active))
 stack=tuple(local)+tuple(x for x in inherited if x not in local);key=(file,arch,main,stack,active)
 if key in contexts:return
 contexts.add(key);raw.append(dict(file=file,arch=arch,mainExecutable=main,activeRuntimeContext=active,dependencyChain=list(chain),loadCommandSha256=sha(text.encode()),rpaths=rpaths,loads=loads,semanticLoadCommandSha256=sha(json.dumps(dict(loads=loads,rpaths=rpaths),sort_keys=True,separators=(',',':')).encode()),expandedRpathStack=list(stack)))
 for dep in loads:
  name=dep['name'];attempts=[]
  try:
   if name.startswith('@rpath/'):
    attempts=[os.path.normpath(p+'/'+name[len('@rpath/'):]) for p in stack];found=[p for p in attempts if os.path.exists(p) or system(p)]
    if not found:raise RuntimeError('UNRESOLVED_RPATH')
    target=found[0]
   else:target=expand(name,file,main)
   edge=dict(loader=file,arch=arch,mainExecutable=main,activeRuntimeContext=active,**dep,resolvedRequestedPath=target,rpathAttempts=attempts)
   if system(target):edge['hostSystemBoundary']=True;systemEdges.append(edge);continue
   if not os.path.exists(target):raise RuntimeError('MISSING_NON_SYSTEM_DYLIB')
   resolved=remember(target);edge['realpath']=resolved;edges.append(edge);walk(resolved,arch,main,stack,active,chain+(file,))
  except RuntimeError as e:unresolved.append(dict(loader=file,arch=arch,mainExecutable=main,activeRuntimeContext=active,**dep,rpathAttempts=attempts,reason=str(e),weakOrLazy=dep['command'] in ['LC_LOAD_WEAK_DYLIB','LC_LAZY_LOAD_DYLIB']))
remember(C['gitConsumer']['which'])
for logical in C['gitConsumer']['logicalLocalCloneHelperPaths']:remember(logical)
# Determine role from real Mach-O filetype, not executable permission or filename alone.
for root in sorted(roots):
 remember(root)
 for h in headers(root):
  metadata(root,h['arch']);role='standalone-executable' if h['filetype']==2 else 'node-addon' if root.endswith('.node') else 'library-metadata-only'
  active=h['arch']=='arm64' and h['platform'] in [None,1,6];main=root if role=='standalone-executable' else NODE if role=='node-addon' else None
  roles.append(dict(file=root,**h,role=role,mainExecutable=main,activeRuntimeContext=active,requiredInputRoot=root in initialRoots))
# Executables always use themselves as @executable_path, including Chrome helpers and each PG tool.
for role in roles:
 if role['role']=='standalone-executable':walk(role['file'],role['arch'],role['mainExecutable'],(),role['activeRuntimeContext'])
# Node addons inherit only actual Node main LC_RPATH. Non-host slices are archive metadata, not loadability claims.
_,_,nodePaths=metadata(NODE,'arm64');nodeStack=tuple(expand(p,NODE,NODE) for p in nodePaths)
for role in roles:
 if role['role']=='node-addon':walk(role['file'],role['arch'],NODE,nodeStack,role['activeRuntimeContext'])
# Remaining libraries receive no guessed executable context. Reached libraries already have concrete dependency-chain contexts.
reached={(r['file'],r['arch']) for r in raw}
for role in roles:
 if role['role']=='library-metadata-only' and (role['file'],role['arch']) not in reached:
  implementation=next((p for p in C['browserRoots'] if role['file'].startswith(p+os.sep)),None)
  if implementation:
   # Bundled graphics dylibs can be dlopened by Chromium child processes. Enumerate all real same-arch browser executable contexts; do not invent one actual caller.
   hosts=[r for r in roles if r['role']=='standalone-executable' and r['file'].startswith(implementation+os.sep) and r['arch']==role['arch']]
   role['possibleMainExecutableContexts']=[r['file'] for r in hosts];role['actualDlopenCallerObserved']=False
   for host in hosts:
    _,_,hostPaths=metadata(host['file'],host['arch']);hostStack=tuple(expand(v,host['file'],host['file']) for v in hostPaths)
    walk(role['file'],role['arch'],host['file'],hostStack,role['activeRuntimeContext'])
  else:walk(role['file'],role['arch'],None,(),role['activeRuntimeContext'])
# Full bytes/link and previous producer inputs remain unchanged throughout the observation.
for r in list(allfiles.values()):
 if file_row(r['file'])!=r:raise RuntimeError('DURING_READ_FILE_DRIFT:'+r['file'])
for r in list(alllinks.values()):
 if r not in links(r['file']):raise RuntimeError('DURING_READ_LINK_DRIFT:'+r['file'])
for r in [C['originalBuilderProducer'],C['originalBuilderClosure']]:
 if sha(pathlib.Path(r['file']).read_bytes())!=r['sha256']:raise RuntimeError('ORIGINAL_BUILDER_INPUT_DRIFT')
strong=[e for e in unresolved if not e.get('weakOrLazy')];activeStrong=[e for e in strong if e['activeRuntimeContext']]
out=dict(schemaVersion=2,task='T-1246-final-joint',at=datetime.datetime.now(datetime.timezone.utc).isoformat(),fixedNode=NODE,producer=file_row(str(pathlib.Path(__file__).resolve())),metadataTool=file_row(os.path.realpath(OTOOL)),inputPrepare=file_row(str(INPUT)),rootInventory=file_row(C['inputRoots']),rootMachOFiles=sorted(roots),sourceRequiredMachORoots=sorted(initialRoots),additionalBrowserMachORoots=sorted(r for r in roots-initialRoots if r.startswith(C['browserRoot']+os.sep)),additionalMetadataAndGitRoots=sorted(r for r in roots-initialRoots if not r.startswith(C['browserRoot']+os.sep)),gitConsumer=C['gitConsumer'],rootRoles=roles,nonSystemFiles=sorted(allfiles.values(),key=lambda r:r['file']),symlinkChain=sorted(alllinks.values(),key=lambda r:r['file']),edges=edges,loadCommandMetadata=raw,rawCommands=rawCommands,unresolved=unresolved,systemHostBoundary=dict(reason='macOS system libraries/frameworks may reside in dyld shared cache; host OS boundary, not claimed byte-sealed',edges=systemEdges),closureCompleteness=dict(status='partial-unresolved' if strong else 'pair-inventory-only-not-approved-otool-closure',strongUnresolved=len(strong),activeStrongUnresolved=len(activeStrong),optionalUnresolved=len(unresolved)-len(strong),actualDyldLoadOrRuntimeClaimed=False,nonHostSlicesMetadataOnly=True),oldBuilderInputsUnchanged=True,noCandidateCodeExecution=True,noNetwork=True,notFinalBuiltSeal=True,elapsedSeconds=time.monotonic()-born)
out['discoveryInputConfig']=C;out['metadataMethod']='binary-header-pair-discovery-only-no-otool';out['rawCommands']=[];out['actualOtoolClaimed']=False;
budget();output=P/'DISCOVERED_PAIR_INVENTORY.json';output.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(dict(roots=len(roots),files=len(allfiles),links=len(alllinks),edges=len(edges),systemEdges=len(systemEdges),unresolved=len(unresolved),activeStrongUnresolved=len(activeStrong),manifestSha256=sha(output.read_bytes()),metadataOnly=True)))

# 输出仅供下一actual otool producer完整serial budget；无inspected executable运行。
