const {openPromise} = require('yauzl');
const yazl = require('yazl');
const {createReadStream,createWriteStream} = require('node:fs');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pipeline} = require('node:stream/promises');

const root = path.resolve(__dirname,'..');
const version = require('electron/package.json').version;
const native = path.resolve(process.env.ELISSION_NATIVE_DIR || path.join(root,'windows','bin','Release','net48'));
const destination = path.resolve(process.env.ELISSION_RELEASE_DIR || path.join(root,'release'));

async function addDirectory(zip, directory, archivePath) {
  const entries = await fs.readdir(directory,{withFileTypes:true});
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const target = archivePath + '/' + entry.name;
    const source = path.join(directory,entry.name);
    if (entry.isDirectory()) await addDirectory(zip,source,target);
    else if (entry.isFile()) zip.addFile(source,target);
  }
}

async function unpack(filename,destination,expected) {
  const checksum = createHash('sha256');
  for await (const chunk of createReadStream(filename)) checksum.update(chunk);
  if (checksum.digest('hex') !== expected) throw Error('Package checksum mismatch: ' + path.basename(filename));
  const archive = await openPromise(filename,{strictFileNames:true});
  try {
    for await (const entry of archive.eachEntry()) {
      const target = path.resolve(destination,entry.fileName);
      if (!target.startsWith(destination + path.sep)) throw Error('Invalid Electron archive path.');
      if (entry.fileName.endsWith('/')) await fs.mkdir(target,{recursive:true});
      else {
        await fs.mkdir(path.dirname(target),{recursive:true});
        await pipeline(await archive.openReadStreamPromise(entry),createWriteStream(target,{flags:'wx'}));
      }
    }
  } finally {
    archive.close();
  }
}

async function pack() {
  const {downloadArtifact} = await import('@electron/get');
  const archive = process.env.ELISSION_ELECTRON_ZIP || await downloadArtifact({
    version,artifactName:'electron',platform:'win32',arch:'x64'
  });
  const stage = await fs.mkdtemp(path.join(os.tmpdir(),'elission-win-'));
  const bundle = path.join(stage,'ELISSION');
  const filename = path.join(destination,'ELISSION-Windows-x64.zip');
  try {
    await fs.mkdir(bundle);
    await unpack(path.resolve(archive),bundle,'20155c8b8aa5b1f575f3757bdf21490e0bac2f19a65a26ce9ba99bcf9f2c69bd');
    await fs.rename(path.join(bundle,'electron.exe'),path.join(bundle,'ELISSION.exe'));
    const application = path.join(bundle,'resources','app');
    await fs.mkdir(application,{recursive:true});
    await fs.rm(path.join(bundle,'resources','default_app.asar'),{force:true});
    for (const name of ['dist','src','assets','package.json']) {
      await fs.cp(path.join(root,name),path.join(application,name),{recursive:true});
    }
    const dependencies = path.join(application,'node_modules');
    await fs.mkdir(dependencies);
    for (const name of ['ws','parse5','entities']) {
      await fs.cp(path.join(root,'node_modules',name),path.join(dependencies,name),{recursive:true});
    }
    await fs.cp(path.join(root,'browser'),path.join(bundle,'BrowserExtension'),{recursive:true});
    await fs.mkdir(path.join(application,'windows'));
    for (const name of [
      'Elission.Windows.exe','Elission.Windows.exe.config','Vosk.dll','NAudio.Core.dll','NAudio.WinMM.dll',
      'Microsoft.Win32.Registry.dll','System.Security.AccessControl.dll','System.Security.Principal.Windows.dll',
      'libvosk.dll','libstdc++-6.dll','libwinpthread-1.dll','libgcc_s_seh-1.dll'
    ]) await fs.copyFile(path.join(native,name),path.join(application,'windows',name));
    let speechArchive = process.env.ELISSION_VOSK_MODEL_ZIP;
    if (!speechArchive) {
      speechArchive = path.join(stage,'speech.zip');
      const response = await fetch('https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',{
        redirect:'error',signal:AbortSignal.timeout(120000)
      });
      if (!response.ok || !response.body) throw Error('Could not download the offline English speech model.');
      await pipeline(response.body,createWriteStream(speechArchive));
    }
    const speechStage = path.join(stage,'speech');
    await fs.mkdir(speechStage);
    await unpack(path.resolve(speechArchive),speechStage,'30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498');
    await fs.rename(path.join(speechStage,'vosk-model-small-en-us-0.15'),path.join(application,'windows','speech-en'));
    await fs.copyFile(path.join(root,'README.md'),path.join(bundle,'README.md'));
    await fs.cp(path.join(root,'docs'),path.join(bundle,'docs'),{recursive:true});
    await fs.copyFile(path.join(root,'node_modules','three','LICENSE'),path.join(bundle,'Three.js-LICENSE.txt'));
    await fs.mkdir(destination,{recursive:true});
    const zip = new yazl.ZipFile();
    await addDirectory(zip,bundle,'ELISSION');
    const output = pipeline(zip.outputStream,createWriteStream(filename + '.partial'));
    zip.end();
    await output;
    await fs.rename(filename + '.partial',filename);
    console.log(filename);
  } finally {
    await fs.rm(stage,{recursive:true,force:true});
    await fs.rm(filename + '.partial',{force:true});
  }
}
pack().catch(error => { console.error(error.message); process.exitCode = 1; });
