import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, copyFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = path.join(root, 'reference-editors/noterelay');
const out = path.join(root, 'frontend/public/reference-editors/noterelay/native');
const sources = path.join(root, 'frontend/public/reference-editors/sources/noterelay');
const manifestPath = path.join(root, 'reference-editors/manifest.json');
const sha = value => createHash('sha256').update(value).digest('hex');

if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')).noterelay;
  for (const [name, expected] of Object.entries(manifest.bundleFiles)) {
    if (sha(await readFile(path.join(out, name))) !== expected) throw new Error(`静态文件摘要不一致：${name}`);
  }
  if (sha(await readFile(path.join(sources, 'source.zip'))) !== manifest.sourceArchiveSha256) {
    throw new Error('源码归档摘要不一致');
  }
  const schema = await readFile(path.join(root, 'contract/src/resources/noterelay-layout.ts'));
  if (!schema.equals(await readFile(path.join(vendor, 'web/noterelay-layout.ts')))) {
    throw new Error('网页合同复制件与共享合同不一致');
  }
  console.log('NoteRelay 静态包、源码归档与共享合同摘要核验通过。');
} else {
  await mkdir(out, {recursive: true});
  for (const legacy of ['index.html','noterelay.js','noterelay.css','host.css','build-meta.json']) await rm(path.join(out, '..', legacy), {force:true});
  await mkdir(sources, {recursive: true});
  // 归档可独立重建；共享合同仍只有 contract 的维护源。
  await copyFile(path.join(root, 'contract/src/resources/noterelay-layout.ts'), path.join(vendor, 'web/noterelay-layout.ts'));
  const bundle = await build({
    entryPoints: [path.join(vendor, 'web/native.ts')],
    outfile: path.join(out, 'native.js'), bundle: true, format: 'esm',
    target: 'es2022', minify: true, metafile: true,
    nodePaths: [path.join(root, 'frontend/node_modules'), path.join(root, 'contract/node_modules')],
    alias: {obsidian: path.join(vendor, 'web/obsidian.ts')}, legalComments: 'eof',
  });
  await writeFile(path.join(out,'native.css'), (await readFile(path.join(vendor,'styles.css'),'utf8')) + '\n' + (await readFile(path.join(vendor,'web/native.css'),'utf8')));
  await writeFile(path.join(out, 'build-meta.json'), JSON.stringify(bundle.metafile, null, 2) + '\n');
  for (const [src, dst] of [
    
    ['LICENSE', 'LICENSE'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ]) await copyFile(path.join(vendor, src), path.join(out, dst));

  const files = {};
  async function walk(dir, prefix = '') {
    const entries = (await readdir(dir, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const rel = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else files[rel] = new Uint8Array(await readFile(path.join(dir, entry.name)));
    }
  }
  await walk(vendor);
  const archive = zipSync(files, {level: 6, mtime: new Date('2026-10-03T00:00:00Z')});
  await writeFile(path.join(sources, 'source.zip'), archive);
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(path.join(vendor, name), path.join(sources, name));

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.noterelay = {
    version: '0.1.8',
    upstreamSnapshotSha256: 'a91b976a2fe25453dafb22d9b407ee6a5508e889da5083fe2901b395f28f5667',
    sourceArchiveSha256: sha(archive), bundleFiles: {},
  };
  for (const name of (await readdir(out)).sort()) manifest.noterelay.bundleFiles[name] = sha(await readFile(path.join(out, name)));
  manifest.noterelay.native = {deliveryMode:'native',sourceArchive:'sources/noterelay/source.zip',sourceArchiveSha256:sha(archive),bundleFiles:manifest.noterelay.bundleFiles};
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('NoteRelay 原渲染器、样式与可独立重建源码归档已构建。');
}
